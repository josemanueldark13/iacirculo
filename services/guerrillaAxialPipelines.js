'use strict';

/**
 * Guerrilla Axial Pipelines — transporte y orquestación de eventos.
 * Kernel Axial sigue siendo el único núcleo central.
 */
const queue = require('./redisEventQueue');

const MAX_BATCH = 10;
const MAX_INLINE_BATCHES = 10;
const MAX_INLINE_EVENTS = MAX_BATCH * MAX_INLINE_BATCHES;

function status() {
    return {
        module: 'Guerrilla Axial Pipelines',
        kernel: 'Kernel Axial (único)',
        transport: 'Upstash Redis Streams',
        queue: queue.keys,
        redisConfigured: queue.isConfigured(),
        dispatch: 'inline_after_enqueue_and_protected_worker_endpoint',
        worker: 'messengerWorker.processBatch',
        consumerGroup: queue.keys.consumerGroup,
        environmentPrefix: queue.getAxialKeyPrefix()
    };
}

/**
 * Despacha los eventos aceptados por el webhook en tandas acotadas.
 *
 * Los eventos duplicados también pueden despertar al Worker para publicar
 * reintentos vencidos; por eso el presupuesto se basa en eventos aceptados,
 * no solamente en los recién insertados.
 *
 * El límite inline evita invocaciones serverless sin cota. El resto permanece
 * durable en Redis Streams para el endpoint protegido/scheduler.
 */
async function dispatchQueued(eventCount) {
    const parsedCount = Number(eventCount);
    const requested = Number.isFinite(parsedCount)
        ? Math.max(0, Math.floor(parsedCount))
        : 0;

    const dispatchBudget = Math.min(requested, MAX_INLINE_EVENTS);
    const summary = {
        requested,
        dispatchBudget,
        claimed: 0,
        processed: 0,
        ignored: 0,
        retried: 0,
        deadLetter: 0,
        batches: [],
        queue: null,
        dispatchBudgetRemaining: dispatchBudget,
        inlineLimitReached: requested > dispatchBudget
    };

    if (dispatchBudget === 0) return summary;

    const worker = require('./messengerWorker');

    while (
        summary.claimed < dispatchBudget &&
        summary.batches.length < MAX_INLINE_BATCHES
    ) {
        const batchSize = Math.min(MAX_BATCH, dispatchBudget - summary.claimed);
        const result = await worker.processBatch(batchSize);
        const claimed = Math.min(
            batchSize,
            Math.max(0, Math.floor(Number(result?.claimed) || 0))
        );

        summary.batches.push(result);
        summary.claimed += claimed;
        summary.processed += Math.max(0, Number(result?.processed) || 0);
        summary.ignored += Math.max(0, Number(result?.ignored) || 0);
        summary.retried += Math.max(0, Number(result?.retried) || 0);
        summary.deadLetter += Math.max(0, Number(result?.deadLetter) || 0);

        if (result?.queue) summary.queue = result.queue;
        if (claimed === 0) break;
    }

    summary.dispatchBudgetRemaining = Math.max(0, dispatchBudget - summary.claimed);
    return summary;
}

module.exports = {
    status,
    dispatchQueued,
    MAX_BATCH,
    MAX_INLINE_BATCHES,
    MAX_INLINE_EVENTS
};
