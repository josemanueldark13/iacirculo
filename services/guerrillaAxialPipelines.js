'use strict';

/**
 * Guerrilla Axial Pipelines — módulo de transporte/orquestación de eventos.
 * Kernel Axial sigue siendo el núcleo central; este módulo NO es un kernel.
 * Inicialmente delega en el worker existente, sin alterar el procesamiento.
 */
const queue = require('./redisEventQueue');

function status() {
    return {
        module: 'Guerrilla Axial Pipelines',
        kernel: 'Kernel Axial (único)',
        transport: 'Upstash Redis Lists',
        queue: queue.keys,
        redisConfigured: queue.isConfigured()
    };
}

module.exports = { status };
