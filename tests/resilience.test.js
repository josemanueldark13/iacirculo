'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Redis } = require('@upstash/redis');
const { createRedisStreamQueue } = require('../services/redisStreamQueue');

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const hasRedis = Boolean(redisUrl && redisToken);
const redis = hasRedis ? new Redis({ url: redisUrl, token: redisToken, enableTelemetry: false }) : null;

function createContext(options = {}) {
    if (!redis) throw new Error('Dedicated non-production Upstash credentials are required.');
    const namespace = `axial:{ci-${crypto.randomUUID()}}`;
    const queue = createRedisStreamQueue({
        getRedis: () => redis,
        config: { namespace, dedupeTtlSeconds: 3600, ...options }
    });
    const eventIds = new Set();

    return {
        queue,
        redis,
        event(eventId) {
            eventIds.add(eventId);
            return {
                eventId,
                correlationId: 'corr_ci_synthetic',
                eventType: 'message.received',
                senderId: 'synthetic-user',
                text: 'synthetic resilience test'
            };
        },
        async cleanup() {
            const markers = Array.from(eventIds, eventId => {
                const hash = crypto.createHash('sha256').update(eventId).digest('hex');
                return [
                    queue.settings.dedupePrefix + ':' + hash,
                    queue.settings.deadLetterDedupePrefix + ':' + hash,
                    queue.settings.failureDedupePrefix + ':' + hash
                ];
            }).flat();
            await redis.del(
                queue.settings.streamKey,
                queue.settings.deadLetterStreamKey,
                queue.settings.retryHashKey,
                queue.settings.retryMetaHashKey,
                queue.settings.retryScheduleKey,
                queue.settings.retryPayloadHashKey,
                queue.settings.ledgerStreamKey,
                queue.settings.completedHashKey,
                ...markers
            );
        }
    };
}

test('ID-001/002/010: 100 concurrent duplicates create exactly one stream entry', {
    skip: !hasRedis && 'requires non-production Upstash credentials'
}, async () => {
    const ctx = createContext();
    const eventId = 'evt-idempotency-' + Date.now();
    try {
        const event = ctx.event(eventId);
        const results = await Promise.all(Array.from({ length: 100 }, () =>
            ctx.queue.enqueueEvent({ eventId, payload: event })
        ));
        assert.equal(results.filter(item => item.inserted).length, 1);
        assert.equal(results.filter(item => item.duplicate).length, 99);
        assert.equal(await redis.xlen(ctx.queue.settings.streamKey), 1);
        assert.equal(await redis.xlen(ctx.queue.settings.ledgerStreamKey), 101);
    } finally {
        await ctx.cleanup();
    }
});

test('ID-003: webhook redelivery after ACK does not enqueue a second event', {
    skip: !hasRedis && 'requires non-production Upstash credentials'
}, async () => {
    const ctx = createContext();
    const eventId = 'evt-redelivery-' + Date.now();
    try {
        const event = ctx.event(eventId);
        await ctx.queue.enqueueEvent({ eventId, payload: event });
        const [entry] = await ctx.queue.readNewMessages('worker-ack-test', 1);
        assert.ok(entry);
        assert.equal(await ctx.queue.acknowledge(entry.id, eventId), 1);
        assert.equal(await redis.xlen(ctx.queue.settings.ledgerStreamKey), 4);
        assert.equal(await ctx.queue.acknowledge(entry.id, eventId), 0);
        assert.equal(await redis.xlen(ctx.queue.settings.ledgerStreamKey), 4, 'repeated ACK must not append another COMPLETED');

        const redelivery = await ctx.queue.enqueueEvent({ eventId, payload: event });
        assert.equal(redelivery.inserted, false);
        assert.equal(redelivery.duplicate, true);
        assert.equal(await redis.xlen(ctx.queue.settings.streamKey), 0);
        assert.equal(await redis.xlen(ctx.queue.settings.ledgerStreamKey), 5, 'redelivery must append DUPLICATE_SKIPPED');
    } finally {
        await ctx.cleanup();
    }
});

test('FR-001: event enqueued before Consumer Group creation is still consumed', {
    skip: !hasRedis && 'requires non-production Upstash credentials'
}, async () => {
    const ctx = createContext();
    const eventId = 'evt-first-entry-' + Date.now();
    try {
        await ctx.queue.enqueueEvent({ eventId, payload: ctx.event(eventId) });
        const entries = await ctx.queue.readNewMessages('worker-first-entry', 1);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].fields.event_id, eventId);
    } finally {
        await ctx.cleanup();
    }
});

test('FR-006: a pending entry is recoverable through XAUTOCLAIM', {
    skip: !hasRedis && 'requires non-production Upstash credentials'
}, async () => {
    const ctx = createContext();
    const eventId = 'evt-recovery-' + Date.now();
    try {
        await ctx.queue.enqueueEvent({ eventId, payload: ctx.event(eventId) });
        const [firstDelivery] = await ctx.queue.readNewMessages('worker-a', 1);
        assert.ok(firstDelivery);

        const [recovered] = await ctx.queue.claimStaleMessages('worker-b', {
            minIdleMs: 0,
            count: 1
        });
        assert.ok(recovered);
        assert.equal(recovered.id, firstDelivery.id);
    } finally {
        await ctx.cleanup();
    }
});

test('FR-007/008: retry is republished and max attempts move the event to DLQ', {
    skip: !hasRedis && 'requires non-production Upstash credentials'
}, async () => {
    const ctx = createContext({ maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 });
    const eventId = 'evt-dlq-' + Date.now();
    try {
        await ctx.queue.enqueueEvent({ eventId, payload: ctx.event(eventId) });
        let [delivery] = await ctx.queue.readNewMessages('worker-retry', 1);
        assert.ok(delivery);

        const firstFailure = await ctx.queue.recordFailure({
            streamId: delivery.id,
            eventId,
            payload: JSON.parse(delivery.fields.payload),
            error: Object.assign(new Error('synthetic timeout'), { code: 'ETIMEDOUT' })
        });
        assert.equal(firstFailure.deadLettered, false);

        const republished = await ctx.queue.publishDueRetries({
            now: Date.now() + 60000,
            count: 10
        });
        assert.equal(republished.length, 1);

        [delivery] = await ctx.queue.readNewMessages('worker-retry', 1);
        assert.ok(delivery);
        const finalFailure = await ctx.queue.recordFailure({
            streamId: delivery.id,
            eventId,
            payload: JSON.parse(delivery.fields.payload),
            error: Object.assign(new Error('synthetic timeout'), { code: 'ETIMEDOUT' })
        });
        assert.equal(finalFailure.deadLettered, true);
        assert.equal(await redis.xlen(ctx.queue.settings.deadLetterStreamKey), 1);
    } finally {
        await ctx.cleanup();
    }
});
