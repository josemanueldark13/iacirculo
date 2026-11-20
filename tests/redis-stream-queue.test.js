'use strict';

const assert = require('node:assert/strict');
const {
    createRedisStreamQueue,
    parseStreamEntries,
    calculateBackoff,
    parseRetryMetadata
} = require('../services/redisStreamQueue');

const streamKey = 'axial:messenger:inbound:v1';

function makeFakeRedis() {
    const calls = [];
    let enqueueResult = [1, '1763400000000-0'];
    let publishResult = [];

    return {
        calls,
        setEnqueueResult(value) {
            enqueueResult = value;
        },
        setPublishResult(value) {
            publishResult = value;
        },
        async xgroup(...args) {
            calls.push(['xgroup', ...args]);
            throw new Error('BUSYGROUP Consumer Group name already exists');
        },
        async eval(script, keys, args) {
            calls.push(['eval', script, keys, args]);
            if (keys.length === 2) return enqueueResult;
            if (keys.length === 4) return publishResult;
            if (keys.length === 5) return 1;
            if (keys.length === 7) return [2, String(Number(args[6]) + 5000), 0];
            throw new Error('Unexpected EVAL call with ' + keys.length + ' keys');
        },
        async xreadgroup(...args) {
            calls.push(['xreadgroup', ...args]);
            return [[streamKey, [[
                '1763400000000-0',
                ['event_id', 'evt-1', 'payload', '{"senderId":"123"}', 'occurred_at', '2026-11-18T13:00:00.000Z', 'attempts', '0']
            ]]]];
        },
        async xautoclaim(...args) {
            calls.push(['xautoclaim', ...args]);
            return ['0-0', [[
                '1763400000000-1',
                ['event_id', 'evt-2', 'payload', '{"senderId":"456"}', 'attempts', '1']
            ]], []];
        },
        async hget(key, field) {
            calls.push(['hget', key, field]);
            return JSON.stringify({
                attempts: 2,
                nextRetryAt: 4102444800000,
                lastError: 'temporary failure'
            });
        }
    };
}

async function main() {
    const parsed = parseStreamEntries([[
        streamKey,
        [['1-0', ['event_id', 'evt-1', 'payload', '{"ok":true}']]]
    ]]);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].id, '1-0');
    assert.equal(parsed[0].fields.event_id, 'evt-1');

    assert.deepEqual(parseStreamEntries(null), []);
    assert.equal(calculateBackoff(1, 1000, 5000), 1000);
    assert.equal(calculateBackoff(3, 1000, 5000), 4000);
    assert.equal(calculateBackoff(8, 1000, 5000), 5000);
    assert.equal(parseRetryMetadata('{"attempts":2}').attempts, 2);
    assert.equal(parseRetryMetadata('not-json'), null);

    const previousAxialEnv = process.env.AXIAL_ENV;
    process.env.AXIAL_ENV = 'development';
    const namespacedQueue = createRedisStreamQueue({
        getRedis: () => makeFakeRedis(),
        config: { namespace: 'axial:staging' }
    });
    assert.equal(namespacedQueue.settings.streamKey, 'axial:staging:messenger:events:inbound:v1');
    assert.equal(namespacedQueue.settings.deadLetterStreamKey, 'axial:staging:messenger:events:dlq:v1');
    assert.equal(namespacedQueue.settings.retryMetaHashKey, 'axial:staging:messenger:retry-meta:v1');
    assert.equal(namespacedQueue.settings.retryScheduleKey, 'axial:staging:messenger:retry-schedule:v1');
    assert.equal(namespacedQueue.settings.retryPayloadHashKey, 'axial:staging:messenger:retry-payloads:v1');

    const fake = makeFakeRedis();
    const queue = createRedisStreamQueue({
        getRedis: () => fake,
        config: { streamKey, maxAttempts: 5 }
    });

    assert.equal(await queue.ensureConsumerGroup(), 'OK');

    const inserted = await queue.enqueueEvent({
        eventId: 'evt-1',
        payload: { senderId: '123', pregunta: 'Hola' }
    });
    assert.equal(inserted.inserted, true);
    assert.equal(inserted.duplicate, false);
    assert.equal(inserted.streamId, '1763400000000-0');

    fake.setEnqueueResult([0, '1763400000000-0']);
    const duplicate = await queue.enqueueEvent({
        eventId: 'evt-1',
        payload: { senderId: '123', pregunta: 'Hola' }
    });
    assert.equal(duplicate.inserted, false);
    assert.equal(duplicate.duplicate, true);

    fake.setPublishResult(['1763400000000-9']);
    const due = await queue.publishDueRetries({ now: 1763400010000, count: 5 });
    assert.deepEqual(due, ['1763400000000-9']);
    const publishCall = fake.calls.find(call => call[0] === 'eval' && call[2].length === 4);
    assert.match(publishCall[1], /ZRANGEBYSCORE/);
    assert.match(publishCall[1], /XADD/);
    assert.match(publishCall[1], /ZREM/);

    const fresh = await queue.readNewMessages('worker-test', 5);
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].fields.event_id, 'evt-1');
    assert.ok(fake.calls.some(call => call[0] === 'eval' && call[2].length === 4), 'la lectura publica reintentos vencidos antes de consumir');

    const claimed = await queue.claimStaleMessages('worker-test', {
        minIdleMs: 60000,
        count: 5
    });
    assert.equal(claimed.length, 1, 'los mensajes abandonados se recuperan con XAUTOCLAIM');
    assert.equal(claimed[0].fields.event_id, 'evt-2');

    const retryState = await queue.getRetryState('evt-2');
    assert.equal(retryState.attempts, 2);
    assert.equal(await queue.isRetryDue('evt-2', Date.now()), false);
    assert.equal(await queue.isRetryDue('evt-2', retryState.nextRetryAt), true);

    const acked = await queue.acknowledge('1763400000000-0', 'evt-1');
    assert.equal(acked, 1);
    const ackCall = fake.calls.find(call => call[0] === 'eval' && call[2].length === 5);
    assert.equal(ackCall[3][2], 'evt-1');

    const beforeFailure = Date.now();
    const failure = await queue.recordFailure({
        streamId: '1763400000000-1',
        eventId: 'evt-2',
        payload: { senderId: '456' },
        error: new Error('temporary failure'),
        now: beforeFailure
    });
    assert.equal(failure.attempts, 2);
    assert.equal(failure.deadLettered, false);
    assert.equal(failure.nextRetryAt, beforeFailure + 5000);

    const failureCall = fake.calls.find(call => call[0] === 'eval' && call[2].length === 7);
    assert.match(failureCall[2][4], /^axial:development:messenger:dlq-dedupe:v1:/);
    assert.equal(failureCall[2][5], 'axial:messenger:retry-schedule:v1');
    assert.equal(failureCall[2][6], 'axial:messenger:retry-payloads:v1');
    assert.match(failureCall[1], /ZADD/);
    assert.match(failureCall[1], /XACK/);

    const groupCall = fake.calls.find(call => call[0] === 'xgroup');
    assert.equal(groupCall[1], streamKey);
    assert.equal(groupCall[2].type, 'CREATE');
    assert.equal(groupCall[2].MKSTREAM, true);

    if (previousAxialEnv === undefined) delete process.env.AXIAL_ENV;
    else process.env.AXIAL_ENV = previousAxialEnv;

    console.log('REDIS STREAM QUEUE: PASS (idempotencia, Consumer Groups, recuperación, backoff diferido, DLQ y ACK)');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
