'use strict';

const crypto = require('node:crypto');
const { getRedis, getAxialKeyPrefix } = require('../config/redis');
const { createRedisStreamQueue } = require('../services/redisStreamQueue');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

/**
 * Executes a real Upstash smoke test using a unique, isolated key namespace.
 * It never reads, claims, or writes to the production Messenger queue.
 */
async function runRedisSmokeTest() {
    const redis = getRedis();
    const nonce = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const namespace = `${getAxialKeyPrefix()}:smoke:${nonce}`;
    const kvKey = `${namespace}:kv`;
    const eventIds = [`smoke-ack:${nonce}`, `smoke-retry:${nonce}`];
    const dedupeKeys = eventIds.map(id =>
        `${namespace}:messenger:dedupe:v1:${crypto.createHash('sha256').update(id).digest('hex')}`
    );
    const queue = createRedisStreamQueue({
        getRedis: () => redis,
        config: {
            namespace,
            dedupeTtlSeconds: 120,
            baseDelayMs: 1000,
            maxDelayMs: 1000,
            minIdleMs: 0
        }
    });

    const cleanupKeys = [
        kvKey,
        queue.settings.streamKey,
        queue.settings.deadLetterStreamKey,
        queue.settings.retryHashKey,
        queue.settings.retryMetaHashKey,
        queue.settings.retryScheduleKey,
        queue.settings.retryPayloadHashKey,
        ...dedupeKeys
    ];
    const checks = [];

    try {
        const pong = await redis.ping();
        assert(String(pong).toUpperCase() === 'PONG', 'PING no devolvió PONG.');
        checks.push('PING');

        const value = `axial-preview-${nonce}`;
        await redis.set(kvKey, value, { ex: 120 });
        const readValue = await redis.get(kvKey);
        assert(readValue === value, 'SET/GET devolvió un valor distinto.');
        checks.push('SET/GET');

        await queue.ensureConsumerGroup();
        const first = await queue.enqueueEvent({
            eventId: eventIds[0],
            payload: { senderId: 'smoke-test', text: 'isolated ACK probe', diagnostic: true }
        });
        assert(first.inserted && first.streamId, 'No se insertó el evento de prueba.');

        const read = await queue.readNewMessages(`smoke-a-${nonce}`, 1);
        assert(read.length === 1 && read[0].fields.event_id === eventIds[0], 'XREADGROUP no recuperó el evento.');

        const reclaimed = await queue.claimStaleMessages(`smoke-b-${nonce}`, {
            minIdleMs: 0,
            count: 1
        });
        assert(reclaimed.length === 1 && reclaimed[0].id === read[0].id, 'XAUTOCLAIM no recuperó el evento pendiente.');

        const ack = await queue.acknowledge(reclaimed[0].id, eventIds[0]);
        assert(Number(ack) === 1, 'XACK no confirmó el evento.');

        const duplicate = await queue.enqueueEvent({
            eventId: eventIds[0],
            payload: { senderId: 'smoke-test', text: 'duplicate should be suppressed', diagnostic: true }
        });
        assert(duplicate.duplicate && duplicate.streamId === first.streamId, 'La deduplicación no reconoció el evento repetido.');
        checks.push('STREAM / CONSUMER GROUP / XAUTOCLAIM / XACK / DEDUPE');

        const second = await queue.enqueueEvent({
            eventId: eventIds[1],
            payload: { senderId: 'smoke-test', text: 'isolated retry probe', diagnostic: true }
        });
        assert(second.inserted && second.streamId, 'No se insertó el evento de reintento.');

        const pending = await queue.readNewMessages(`smoke-retry-a-${nonce}`, 1);
        assert(pending.length === 1 && pending[0].fields.event_id === eventIds[1], 'No se leyó el evento destinado a reintento.');

        const failedAt = Date.now();
        const failure = await queue.recordFailure({
            streamId: pending[0].id,
            eventId: eventIds[1],
            payload: { senderId: 'smoke-test', text: 'isolated retry probe', diagnostic: true },
            error: new Error('intentional smoke-test retry'),
            now: failedAt
        });
        assert(failure.attempts === 1 && !failure.deadLettered && failure.nextRetryAt, 'No se programó el reintento.');

        const republished = await queue.publishDueRetries({
            now: failure.nextRetryAt + 1,
            count: 5
        });
        assert(republished.length === 1, 'El reintento vencido no volvió al Stream.');

        const retried = await queue.readNewMessages(`smoke-retry-b-${nonce}`, 1);
        assert(retried.length === 1 && retried[0].fields.event_id === eventIds[1], 'No se pudo consumir el evento reintentado.');

        const retryAck = await queue.acknowledge(retried[0].id, eventIds[1]);
        assert(Number(retryAck) === 1, 'No se confirmó el evento reintentado.');
        checks.push('RETRY SCHEDULE / REPUBLISH / ACK');

        return {
            ok: true,
            environment: getAxialKeyPrefix(),
            checks,
            isolatedNamespace: namespace
        };
    } finally {
        await redis.del(...cleanupKeys);
    }
}

module.exports = { runRedisSmokeTest };
