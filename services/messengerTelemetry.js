'use strict';

const crypto = require('crypto');
const redisConfig = require('../config/redis');

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

function recordRateLimitTelemetry(statusCode, recipientId, attempt, maxRetries) {
    if (!(statusCode === 429 || (statusCode >= 500 && statusCode <= 599))) return;

    const anonUser = anonymizeId(recipientId);

    void (async () => {
        const redisClient = redisConfig.getRedis();
        const prefix = `${redisConfig.getAxialKeyPrefix()}:metrics:messenger`;
        const alertData = JSON.stringify({
            timestamp: Date.now(),
            anonUser,
            statusCode,
            attempt,
            maxRetries
        });

        const pipeline = redisClient.multi();
        pipeline.incr(`${prefix}:retries_total`);
        pipeline.hIncrBy(`${prefix}:status_breakdown`, `HTTP_${statusCode}`, 1);
        pipeline.lPush(`${prefix}:rate_limits`, alertData);
        pipeline.lTrim(`${prefix}:rate_limits`, 0, 99);
        await pipeline.exec();
    })().catch(error => {
        console.warn('[TELEMETRY WARN] No se pudieron registrar métricas en Redis.', {
            reason: error.message
        });
    });
}

module.exports = {
    recordRateLimitTelemetry,
    anonymizeId
};
