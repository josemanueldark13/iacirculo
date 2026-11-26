'use strict';

const crypto = require('node:crypto');
const { randomUUID } = require('node:crypto');
const redisConfig = require('../config/redis');
const { createRedisStreamQueue } = require('./redisStreamQueue');
const { makeCorrelationId } = require('./eventLedger');

function makeEventId(event) {
    const messageId = event?.message?.mid || event?.postback?.mid;
    const identity = messageId ? String(messageId) : JSON.stringify(event);
    const digest = crypto.createHash('sha256').update(identity).digest('hex');
    return 'messenger:' + digest;
}

function eventOccurredAt(event) {
    const timestamp = Number(event?.timestamp);
    if (Number.isFinite(timestamp) && timestamp > 0) {
        const parsed = new Date(timestamp);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
}

function toJob(entry) {
    const fields = entry.fields || {};
    const rawPayload = String(fields.payload || '');
    let event;
    let malformed = false;

    try {
        event = JSON.parse(rawPayload);
    } catch {
        malformed = true;
        event = { __axialMalformed: true, malformedPayload: rawPayload.slice(0, 2000) };
    }

    if (!event || typeof event !== 'object' || Array.isArray(event)) {
        malformed = true;
        event = { __axialMalformed: true, malformedPayload: rawPayload.slice(0, 2000) };
    }

    const eventId = String(fields.event_id || event.eventId || ('invalid:' + entry.id));
    if (!fields.event_id && !event.eventId) malformed = true;

    return {
        id: entry.id,
        streamId: entry.id,
        eventId,
        attempts: Number(fields.attempts || 0),
        correlationId: event.correlationId || fields.correlation_id || eventId,
        malformed,
        event
    };
}

function createMessengerQueueAdapter(options = {}) {
    const streamQueue = options.streamQueue || createRedisStreamQueue();
    const consumerId = options.consumerId || ('messenger-worker-' + randomUUID());
    const minIdleMs = options.minIdleMs ?? Number(process.env.AXIAL_STREAM_MIN_IDLE_MS || 60000);
    const isConfigured = options.isConfigured || redisConfig.isRedisConfigured;
    const getRedis = options.getRedis || redisConfig.getRedis;

    async function enqueue(event) {
        if (!event || typeof event !== 'object' || Array.isArray(event)) {
            throw new TypeError('El evento Messenger debe ser un objeto.');
        }

        const eventId = makeEventId(event);
        const correlationId = makeCorrelationId(
            event?.sender?.id || event?.postback?.sender?.id || null,
            eventId
        );
        const result = await streamQueue.enqueueEvent({
            eventId,
            payload: event,
            occurredAt: eventOccurredAt(event),
            correlationId
        });

        return {
            id: result.streamId,
            streamId: result.streamId,
            eventId,
            event: result.event,
            correlationId: result.event?.correlationId || correlationId,
            inserted: result.inserted,
            duplicate: result.duplicate
        };
    }

    async function claim() {
        const stale = await streamQueue.claimStaleMessages(consumerId, {
            count: 1,
            minIdleMs
        });
        const entries = stale.length
            ? stale
            : await streamQueue.readNewMessages(consumerId, 1);

        if (!entries.length) return null;
        const entry = entries[0];
        const job = toJob(entry);
        return { payload: entry.id, job };
    }

    async function acknowledge(payload, job, details = {}) {
        const eventId = job?.eventId || job?.event?.eventId;
        return streamQueue.acknowledge(String(payload), String(eventId || ''), {
            correlationId: job?.correlationId || job?.event?.correlationId || eventId,
            workerId: consumerId,
            attempt: (job?.attempts || 0) + 1,
            eventType: job?.event?.eventType || 'message.received',
            causationId: job?.event?.causationId || '',
            processingMs: details.processingMs
        });
    }

    async function retry(payload, job, error, details = {}) {
        const eventId = job?.eventId || job?.event?.eventId;
        const outcome = await streamQueue.recordFailure({
            streamId: String(payload),
            eventId,
            payload: job?.event,
            error,
            correlationId: job?.correlationId || job?.event?.correlationId || eventId,
            workerId: consumerId,
            processingMs: details.processingMs
        });

        return {
            deadLetter: outcome.deadLettered,
            attempts: outcome.attempts,
            nextRetryAt: outcome.nextRetryAt,
            deadLetterId: outcome.deadLetterId
        };
    }

    async function lengths() {
        await streamQueue.ensureConsumerGroup();
        const redis = getRedis();
        const [groups, dead, streamEntries, retryScheduled] = await Promise.all([
            redis.xinfo(streamQueue.settings.streamKey, { type: 'GROUPS' }),
            redis.xlen(streamQueue.settings.deadLetterStreamKey),
            redis.xlen(streamQueue.settings.streamKey),
            redis.zcard(streamQueue.settings.retryScheduleKey)
        ]);

        const group = Array.isArray(groups)
            ? groups.find(item => String(item.name) === streamQueue.settings.consumerGroup)
            : null;

        return {
            pending: Number(group?.lag || 0),
            processing: Number(group?.pending || 0),
            dead: Number(dead || 0),
            retryScheduled: Number(retryScheduled || 0),
            streamEntries: Number(streamEntries || 0)
        };
    }

    return {
        enqueue,
        isConfigured,
        claim,
        acknowledge,
        retry,
        lengths,
        keys: streamQueue.settings,
        getAxialKeyPrefix: redisConfig.getAxialKeyPrefix,
        makeEventId,
        consumerId
    };
}

const adapter = createMessengerQueueAdapter();

module.exports = {
    ...adapter,
    createMessengerQueueAdapter,
    makeEventId,
    eventOccurredAt,
    toJob
};
