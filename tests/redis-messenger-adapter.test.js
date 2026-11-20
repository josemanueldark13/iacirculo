'use strict';

const assert = require('node:assert/strict');
const {
    createMessengerQueueAdapter,
    makeEventId,
    toJob
} = require('../services/redisEventQueue');

async function main() {
    const event = {
        sender: { id: 'sender-private-value' },
        recipient: { id: 'page-id' },
        timestamp: 1763400000000,
        message: { mid: 'mid.abc123', text: 'Hola' }
    };

    assert.equal(makeEventId(event), makeEventId(event));
    assert.match(makeEventId(event), /^messenger:[a-f0-9]{64}$/);
    assert.ok(!makeEventId(event).includes('sender-private-value'));

    const calls = [];
    const streamQueue = {
        settings: {
            streamKey: 'axial:test:inbound',
            deadLetterStreamKey: 'axial:test:dlq',
            consumerGroup: 'axial:test:workers',
            retryScheduleKey: 'axial:test:retry-schedule'
        },
        async enqueueEvent(args) {
            calls.push(['enqueueEvent', args]);
            return {
                inserted: true,
                duplicate: false,
                streamId: '1763400000000-0',
                event: { ...args.payload, eventId: args.eventId }
            };
        },
        async claimStaleMessages(consumer, options) {
            calls.push(['claimStaleMessages', consumer, options]);
            return [];
        },
        async readNewMessages(consumer, count) {
            calls.push(['readNewMessages', consumer, count]);
            return [{
                id: '1763400000000-0',
                fields: {
                    event_id: 'messenger:test-event',
                    payload: JSON.stringify(event),
                    attempts: '1'
                }
            }];
        },
        async acknowledge(streamId, eventId) {
            calls.push(['acknowledge', streamId, eventId]);
            return 1;
        },
        async recordFailure(args) {
            calls.push(['recordFailure', args]);
            return {
                attempts: 2,
                deadLettered: false,
                nextRetryAt: 1763400005000,
                deadLetterId: null
            };
        },
        async ensureConsumerGroup() {
            calls.push(['ensureConsumerGroup']);
            return 'OK';
        }
    };

    const redisCalls = [];
    const adapter = createMessengerQueueAdapter({
        streamQueue,
        consumerId: 'worker-test',
        minIdleMs: 1000,
        isConfigured: () => true,
        getRedis: () => ({
            async xinfo(key, options) {
                redisCalls.push(['xinfo', key, options]);
                return [{ name: 'axial:test:workers', lag: 3, pending: 2 }];
            },
            async xlen(key) {
                redisCalls.push(['xlen', key]);
                return key === 'axial:test:dlq' ? 4 : 7;
            },
            async zcard(key) {
                redisCalls.push(['zcard', key]);
                return 1;
            }
        })
    });

    const enqueued = await adapter.enqueue(event);
    assert.equal(enqueued.inserted, true);
    assert.equal(enqueued.eventId, makeEventId(event));
    assert.equal(calls.find(call => call[0] === 'enqueueEvent')[1].occurredAt, new Date(event.timestamp).toISOString());

    const claimed = await adapter.claim();
    assert.equal(claimed.payload, '1763400000000-0');
    assert.equal(claimed.job.event.message.mid, 'mid.abc123');
    assert.equal(claimed.job.attempts, 1);
    assert.equal(calls.find(call => call[0] === 'claimStaleMessages')[2].minIdleMs, 1000);

    await adapter.acknowledge(claimed.payload, claimed.job);
    assert.deepEqual(calls.find(call => call[0] === 'acknowledge').slice(1), [
        '1763400000000-0',
        'messenger:test-event'
    ]);

    const retried = await adapter.retry(claimed.payload, claimed.job, new Error('temporary'));
    assert.equal(retried.deadLetter, false);
    assert.equal(retried.attempts, 2);
    assert.equal(calls.find(call => call[0] === 'recordFailure')[1].eventId, 'messenger:test-event');

    const lengths = await adapter.lengths();
    assert.deepEqual(lengths, {
        pending: 3,
        processing: 2,
        dead: 4,
        retryScheduled: 1,
        streamEntries: 7
    });

    const malformed = toJob({
        id: '9-0',
        fields: { event_id: 'bad-event', payload: '{broken' }
    });
    assert.equal(malformed.malformed, true);
    assert.equal(malformed.event.__axialMalformed, true);
    assert.equal(adapter.isConfigured(), true);

    console.log('REDIS MESSENGER ADAPTER: PASS (event id, enqueue, claim, ACK, retry, queue metrics, malformed payload)');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
