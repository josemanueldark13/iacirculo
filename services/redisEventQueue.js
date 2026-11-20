'use strict';

const crypto = require('node:crypto');
const { randomUUID } = require('node:crypto');
const { isRedisConfigured, getAxialKeyPrefix } = require('../config/redis');
const { createRedisStreamQueue } = require('./redisStreamQueue');

const streamQueue = createRedisStreamQueue();
const consumerId = 'messenger-worker-' + randomUUID();
const MIN_IDLE_MS = Number(process.env.AXIAL_STREAM_MIN_IDLE_MS || 60000);

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

async function enqueue(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
        throw new TypeError('El evento Messenger debe ser un objeto.');
    }

    const eventId = makeEventId(event);
    const result = await streamQueue.enqueueEvent({
        eventId,
        payload: event,
        occurredAt: eventOccurredAt(event)
    });

    return {
        id: result.streamId,
        streamId: result.streamId,
        eventId,
        event: result.event,
        inserted: result.inserted,
        duplicate: result.duplicate
    };
}

function toJob(entry) {
    const fields = entry.fields || {};
    let event;

    try {
        event = JSON.parse(fields.payload);
    } catch (error) {
        throw new Error('Payload Redis inválido para el evento ' + entry.id + ': ' + error.message);
    }

    if (!event || typeof event !== 'object' || Array.isArray(event)) {
        throw new Error('Payload Redis no representa un evento válido: ' + entry.id);
    }

    const eventId = String(fields.event_id || event.eventId || '');
    if (!eventId) throw new Error('El evento Redis no tiene event_id: ' + entry.id);

    return {
        id: entry.id,
        streamId: entry.id,
        eventId,
        attempts: Number(fields.attempts || 0),
        event
    };
}

async function claim() {
    const stale = await streamQueue.claimStaleMessages(consumerId, {
        count: 1,
        minIdleMs: MIN_IDLE_MS
    });
    const entries = stale.length
        ? stale
        : await streamQueue.readNewMessages(consumerId, 1);

    if (!entries.length) return null;

    const entry = entries[0];
    try {
        return { payload: entry.id, job: toJob(entry) };
    } catch (error) {
        const eventId = String(entry.fields?.event_id || '');
        if (eventId) {
            await streamQueue.recordFailure({
                streamId: entry.id,
                eventId,
                payload: { malformedPayload: String(entry.fields?.payload || '').slice(0, 2000) },
                error
            });
        } else {
            await streamQueue.acknowledge(entry.id, 'invalid:' + entry.id);
        }
        throw error;
    }
}

async function acknowledge(payload, job) {
    const eventId = job?.eventId || job?.event?.eventId;
    return streamQueue.acknowledge(String(payload), String(eventId || ''));
}

async function retry(payload, job, error) {
    const eventId = job?.eventId || job?.event?.eventId;
    const event = job?.event;
    const outcome = await streamQueue.recordFailure({
        streamId: String(payload),
        eventId,
        payload: event,
        error
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
    const redis = require('../config/redis').getRedis();
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

module.exports = {
    enqueue,
    isConfigured: isRedisConfigured,
    claim,
    acknowledge,
    retry,
    lengths,
    keys: streamQueue.settings,
    getAxialKeyPrefix,
    makeEventId,
    consumerId
};
