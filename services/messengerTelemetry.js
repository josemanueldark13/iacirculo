'use strict';

const crypto = require('crypto');

let redisClient = null;

try {
    redisClient = require('../config/redis');
} catch (error) {
    // La telemetría es opcional: nunca debe impedir que cargue el servicio de mensajería.
    console.warn('[TELEMETRY] Redis no disponible; métricas en modo pasivo.', {
        reason: error.message
    });
}

/**
 * Genera un seudónimo no reversible mediante HMAC.
 * Sin secreto dedicado, no se almacena ningún identificador derivado del destinatario.
 */
function anonymizeId(recipientId) {
    const secret = process.env.TELEMETRY_HASH_SECRET;

    if (
        typeof recipientId !== 'string' ||
        !recipientId ||
        typeof secret !== 'string' ||
        secret.length < 32
    ) {
        return null;
    }

    return crypto
        .createHmac('sha256', secret)
        .update(recipientId)
        .digest('hex')
        .slice(0, 16);
}

/**
 * Registra telemetría auxiliar sin bloquear al emisor.
 * Solo contabiliza HTTP 429 y HTTP 5xx, que son los estados reintentables.
 */
function recordRateLimitTelemetry(statusCode, recipientId, attempt, maxRetries) {
    if (
        !redisClient ||
        !(statusCode === 429 || (statusCode >= 500 && statusCode <= 599))
    ) {
        return;
    }

    const anonUser = anonymizeId(recipientId);

    void (async () => {
        const alertData = JSON.stringify({
            timestamp: Date.now(),
            anonUser,
            statusCode,
            attempt,
            maxRetries
        });

        const pipeline = redisClient.multi();

        pipeline.incr('metrics:messenger:retries_total');
        pipeline.hIncrBy(
            'metrics:messenger:status_breakdown',
            `HTTP_${statusCode}`,
            1
        );
        pipeline.lPush('alerts:messenger:rate_limits', alertData);
        pipeline.lTrim('alerts:messenger:rate_limits', 0, 99);

        await pipeline.exec();
    })().catch(error => {
        // El fallo de Redis queda aislado: no se propaga al envío de Messenger.
        console.warn('[TELEMETRY WARN] No se pudieron registrar métricas en Redis.', {
            reason: error.message
        });
    });
}

module.exports = {
    recordRateLimitTelemetry,
    anonymizeId
};
