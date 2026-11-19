'use strict';

const express = require('express');
const pipelineModule = require('../services/guerrillaAxialPipelines');
const kernel = require('../Kernels/kernel');

const router = express.Router();

/**
 * Health/status for Axial transport module.
 * Shows configuration state only; it does not mutate queues or process messages.
 */
router.get('/', async (req, res) => {
    try {
        const pipeline = pipelineModule.status();
        return res.status(pipeline.redisConfigured ? 200 : 503).json({
            ok: pipeline.redisConfigured,
            module: pipeline.module,
            kernel: pipeline.kernel,
            transport: pipeline.transport,
            queue: pipeline.queue,
            redisConfigured: pipeline.redisConfigured,
            kernelLoaded: typeof kernel.process === 'function'
        });
    } catch (error) {
        return res.status(503).json({ ok: false, module: 'Guerrilla Axial Pipelines', error: 'status_unavailable' });
    }
});

module.exports = router;
