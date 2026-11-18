'use strict';

const crypto = require('node:crypto');
const { getRedis: defaultGetRedis } = require('../config/redis');

const DEFAULTS = Object.freeze({
    streamKey: 'axial:messenger:inbound:v1',
    deadLetterStreamKey: 'axial:messenger:dlq:v1',
    consumerGroup: 'axial-workers-v1',
    dedupePrefix: 'axial:messenger:dedupe:v1',
    dedupeTtlSeconds: 60 * 60 * 24 * 14,
    retryHashKey: 'axial:messenger:retry-counts:v1',
    retryMetaHashKey: 'axial:messenger:retry-meta:v1',
    maxAttempts: 5,
    baseDelayMs: 5000,
    maxDelayMs: 5 * 60 * 1000
});

const ENQUEUE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then
    return {0, existing}
end

local streamId = redis.call(
    'XADD', KEYS[2], '*',
    'event_id', ARGV[1],
    'payload', ARGV[2],
    'occurred_at', ARGV[3]
)

redis.call('SET', KEYS[1], streamId, 'EX', tonumber(ARGV[4]))
return {1, streamId}
`;

const ACK_SCRIPT = `
local acknowledged = redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
redis.call('HDEL', KEYS[2], ARGV[2])
redis.call('HDEL', KEYS[3], ARGV[2])
return acknowledged
`;

const FAILURE_SCRIPT = `
local attempts = redis.call('HINCRBY', KEYS[3], ARGV[2], 1)
local maxAttempts = tonumber(ARGV[5])

if attempts >= maxAttempts then
    local deadLetterId = redis.call(
        'XADD', KEYS[2], '*',
        'original_stream_id', ARGV[2],
        'event_id', ARGV[3],
        'payload', ARGV[4],
        'attempts', tostring(attempts),
        'error', ARGV[6],
        'failed_at', ARGV[7]
    )

    redis.call('XACK', KEYS[1], ARGV[1], ARGV[2])
    redis.call('HDEL', KEYS[3], ARGV[2])
    redis.call('HDEL', KEYS[4], ARGV[2])

    return {attempts, deadLetterId, 1}
end

local delay = tonumber(ARGV[8]) * math.pow(2, attempts - 1)
local maxDelay = tonumber(ARGV[9])
if delay > maxDelay then
    delay = maxDelay
end

local nextRetryAt = tonumber(ARGV[7]) + delay
local metadata = cjson.encode({
    attempts = attempts,
    nextRetryAt = nextRetryAt,
    lastError = ARGV[6]
})

redis.call('HSET', KEYS[4], ARGV[2], metadata)
return {attempts, tostring(nextRetryAt), 0}
`;

function fieldsToObject(fields) {
    if (!Array.isArray(fields)) {
        return fields && typeof fields === 'object' ? { ...fields } : {};
    }

    const result = {};
    for (let index = 0; index + 1 < fields.length; index += 2) {
        result[String(fields[index])] = fields[index + 1];
    }
    return result;
}

function parseStreamEntries(response) {
    if (!Array.isArray(response)) return [];

    return response.flatMap(block => {
        if (!Array.isArray(block) || !Array.isArray(block[1])) return [];

        return block[1].map(entry => {
            if (!Array.isArray(entry) || entry.length < 2) return null;
            return {
                stream: block[0],
                id: String(entry[0]),
                fields: fieldsToObject(entry[1])
            };
        }).filter(Boolean);
    });
}

function calculateBackoff(attempt, baseDelayMs = DEFAULTS.baseDelayMs, maxDelayMs = DEFAULTS.maxDelayMs) {
    if (!Number.isInteger(attempt) || attempt < 1) {
        throw new Error('attempt debe ser un entero mayor o igual a 1.');
    }
    if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
        throw new Error('baseDelayMs debe ser un número mayor o igual a cero.');
    }
    if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
        throw new Error('maxDelayMs debe ser un número mayor o igual a cero.');
    }

    return Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs);
}

function parseRetryMetadata(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function createRedisStreamQueue(options = {}) {
    const getRedis = options.getRedis || defaultGetRedis;
    const settings = { ...DEFAULTS, ...(options.config || {}) };

    function redis() {
        return getRedis();
    }

    function dedupeKey(eventId) {
        const digest = crypto.createHash('sha256').update(eventId).digest('hex');
        return `${settings.dedupePrefix}:${digest}`;
    }

    async function ensureConsumerGroup() {
        try {
            return await redis().xgroup(settings.streamKey, {
                type: 'CREATE',
                group: settings.consumerGroup,
                id: '0-0',
                MKSTREAM: true
            });
        } catch (error) {
            if (/BUSYGROUP/i.test(String(error?.message || error))) {
                return 'OK';
            }
            throw error;
        }
    }

    async function enqueueEvent({ eventId, payload, occurredAt = new Date().toISOString() }) {
        if (typeof eventId !== 'string' || !eventId.trim()) {
            throw new Error('eventId es obligatorio para la idempotencia.');
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('payload debe ser un objeto.');
        }

        const serializedPayload = JSON.stringify(payload);
        if (typeof serializedPayload !== 'string') {
            throw new Error('No se pudo serializar el evento.');
        }

        const result = await redis().eval(
            ENQUEUE_SCRIPT,
            [dedupeKey(eventId), settings.streamKey],
            [eventId, serializedPayload, occurredAt, settings.dedupeTtlSeconds]
        );

        const inserted = Number(result?.[0]) === 1;
        return {
            inserted,
            duplicate: !inserted,
            streamId: result?.[1] ? String(result[1]) : null
        };
    }

    async function readNewMessages(consumer, count = 10) {
        if (typeof consumer !== 'string' || !consumer.trim()) {
            throw new Error('consumer es obligatorio.');
        }
        if (!Number.isInteger(count) || count < 1 || count > 100) {
            throw new Error('count debe ser un entero entre 1 y 100.');
        }

        await ensureConsumerGroup();
        const response = await redis().xreadgroup(
            settings.consumerGroup,
            consumer,
            settings.streamKey,
            '>',
            { count }
        );

        return parseStreamEntries(response);
    }

    async function claimStaleMessages(consumer, options = {}) {
        if (typeof consumer !== 'string' || !consumer.trim()) {
            throw new Error('consumer es obligatorio.');
        }

        const minIdleMs = options.minIdleMs ?? 60000;
        const count = options.count ?? 10;
        const start = options.start || '0-0';

        if (!Number.isInteger(minIdleMs) || minIdleMs < 0) {
            throw new Error('minIdleMs debe ser un entero mayor o igual a cero.');
        }
        if (!Number.isInteger(count) || count < 1 || count > 100) {
            throw new Error('count debe ser un entero entre 1 y 100.');
        }

        await ensureConsumerGroup();
        const response = await redis().xautoclaim(
            settings.streamKey,
            settings.consumerGroup,
            consumer,
            minIdleMs,
            start,
            { count }
        );

        const entries = Array.isArray(response) ? response[1] : [];
        return parseStreamEntries([[settings.streamKey, entries]]);
    }

    async function getRetryState(streamId) {
        const value = await redis().hget(settings.retryMetaHashKey, streamId);
        return parseRetryMetadata(value);
    }

    async function isRetryDue(streamId, now = Date.now()) {
        const metadata = await getRetryState(streamId);
        return !metadata || Number(metadata.nextRetryAt) <= now;
    }

    async function acknowledge(streamId) {
        if (typeof streamId !== 'string' || !streamId.trim()) {
            throw new Error('streamId es obligatorio.');
        }

        return redis().eval(
            ACK_SCRIPT,
            [settings.streamKey, settings.retryHashKey, settings.retryMetaHashKey],
            [settings.consumerGroup, streamId]
        );
    }

    async function recordFailure({ streamId, eventId, payload, error }) {
        if (!streamId || !eventId || !payload) {
            throw new Error('streamId, eventId y payload son obligatorios para registrar el fallo.');
        }

        const now = Date.now();
        const message = String(error?.message || error || 'Error desconocido').slice(0, 1000);
        const serializedPayload = JSON.stringify(payload);

        const result = await redis().eval(
            FAILURE_SCRIPT,
            [
                settings.streamKey,
                settings.deadLetterStreamKey,
                settings.retryHashKey,
                settings.retryMetaHashKey
            ],
            [
                settings.consumerGroup,
                streamId,
                eventId,
                serializedPayload,
                settings.maxAttempts,
                message,
                now,
                settings.baseDelayMs,
                settings.maxDelayMs
            ]
        );

        const attempts = Number(result?.[0] || 0);
        const deadLettered = Number(result?.[2]) === 1;

        return {
            attempts,
            deadLettered,
            deadLetterId: deadLettered && result?.[1] ? String(result[1]) : null,
            nextRetryAt: deadLettered ? null : Number(result?.[1] || 0)
        };
    }

    return {
        settings,
        ensureConsumerGroup,
        enqueueEvent,
        readNewMessages,
        claimStaleMessages,
        getRetryState,
        isRetryDue,
        acknowledge,
        recordFailure
    };
}

module.exports = {
    DEFAULTS,
    createRedisStreamQueue,
    fieldsToObject,
    parseStreamEntries,
    calculateBackoff,
    parseRetryMetadata
};
