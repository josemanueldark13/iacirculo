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
 * Despacha eventos dentro de la invocación del webhook.
 * Los reintentos vencidos también se publican al Stream antes de leer mensajes.
 */
async function dispatchQueued(eventCount) {
    const worker = require('./messengerWorker');
    const total = Math.max(0, Number(eventCount) || 0);
    const batches = [];
    let remaining = total;
    let attempts = 0;

    while (remaining > 0 && attempts < 10) {
        const result = await worker.processBatch(Math.min(10, remaining));
        batches.push(result);
        if (!result.claimed) break;
        remaining -= result.claimed;
        attempts++;
    }

    return {
        requested: total,
        batches,
        remainingUnclaimed: remaining
    };
}

module.exports = { status, dispatchQueued };
