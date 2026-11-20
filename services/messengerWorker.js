'use strict';

const express = require('express');
const kernel = require('../Kernels/kernel');
const messengerSend = require('./messengerSend');
const queue = require('./redisEventQueue');
const {
    buildResponse,
    parseAndNormalizeEvent
} = require('../routes/messenger');

const router = express.Router();
const MAX_BATCH = 10;

function authorized(req) {
    const secret = process.env.CRON_SECRET?.trim() ||
        process.env.AXIAL_WORKER_SECRET?.trim();
    if (!secret) return false;
    const header = req.get('authorization') || '';
    const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
    const a = Buffer.from(secret);
    const b = Buffer.from(supplied);
    return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

/**
 * Consume eventos de Guerrilla Axial Pipelines, pasarlos por Kernel Axial,
 * enviar la respuesta y confirmar el trabajo solo después del envío.
 * El transporte es Redis Streams con Consumer Groups.
 */
async function processBatch(requestedBatch = MAX_BATCH) {
    const batchSize = Math.max(1, Math.min(MAX_BATCH, Number(requestedBatch) || MAX_BATCH));
    const summary = { claimed: 0, processed: 0, ignored: 0, retried: 0, deadLetter: 0 };

    for (let i = 0; i < batchSize; i++) {
        const claimed = await queue.claim();
        if (!claimed) break;
        summary.claimed++;

        const { payload, job } = claimed;
        try {
            const normalized = parseAndNormalizeEvent(job.event);
            if (!normalized) {
                await queue.acknowledge(payload, job);
                summary.ignored++;
                continue;
            }

            const { senderId, type, pregunta } = normalized;
            let respuesta;

            if (type === 'attachment') {
                respuesta = 'Recibí el archivo o la imagen. Contame qué necesitás consultar sobre ese material y te ayudo.';
            } else {
                const decision = kernel.process({ pregunta, type, senderId });
                respuesta = decision?.estado === 'accion_no_reconocida'
                    ? 'Ese botón no está disponible en este momento. Podés escribir tu consulta y te ayudo.'
                    : buildResponse(decision?.pregunta || pregunta, decision);
            }

            await messengerSend.sendMessage(senderId, respuesta);
            await queue.acknowledge(payload, job);
            summary.processed++;
        } catch (error) {
            const outcome = await queue.retry(payload, job, error);
            if (outcome.deadLetter) summary.deadLetter++;
            else summary.retried++;
            console.error('[AXIAL WORKER] Falló un evento:', {
                job_id: job.id,
                attempts: outcome.attempts,
                next_retry_at: outcome.nextRetryAt || null,
                error: error.message
            });
        }
    }

    summary.queue = await queue.lengths();
    return summary;
}

router.get('/', async (req, res) => {
    if (!authorized(req)) return res.sendStatus(401);
    try {
        const summary = await processBatch();
        return res.status(200).json({ ok: true, ...summary });
    } catch (error) {
        console.error('[AXIAL WORKER] Error de infraestructura:', error.message);
        return res.status(503).json({ ok: false, error: 'Worker temporalmente no disponible.' });
    }
});

module.exports = router;
module.exports.processBatch = processBatch;
