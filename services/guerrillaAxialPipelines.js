'use strict';

/**
 * Guerrilla Axial Pipelines — transporte y orquestación de eventos.
 * Kernel Axial sigue siendo el único núcleo central.
 */
const queue = require('./redisEventQueue');

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
 * Despacha hasta diez eventos por invocación, incluyendo reintentos vencidos.
 * El endpoint protegido permite vaciar el resto de la cola sin depender del webhook.
 */
async function dispatchQueued(eventCount) {
    const total = Math.max(0, Number(eventCount) || 0);
    if (total === 0) {
        return { requested: 0, processed: 0, batches: [], remainingUnclaimed: 0 };
    }

    const worker = require('./messengerWorker');
    const result = await worker.processBatch(10);

    return {
        requested: total,
        processed: result.processed,
        batches: [result],
        queue: result.queue
    };
}

module.exports = { status, dispatchQueued };
