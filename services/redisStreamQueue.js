'use strict';

const crypto = require('node:crypto');
const { getRedis: defaultGetRedis, getAxialKeyPrefix } = require('../config/redis');
const { canonicalizeEvent } = require('./eventContract');
const { normalizeError } = require('./eventLedger');

const DEFAULTS = Object.freeze({
    streamKey: 'axial:messenger:inbound:v1',
    deadLetterStreamKey: 'axial:messenger:dlq:v1',
    consumerGroup: 'axial-workers-v1',
    consumerGroupStartId: '0-0',
    dedupePrefix: 'axial:messenger:dedupe:v1',
    dedupeTtlSeconds: 60 * 60 * 24 * 14,
    retryHashKey: 'axial:messenger:retry-counts:v1',
    retryMetaHashKey: 'axial:messenger:retry-meta:v1',
    retryScheduleKey: 'axial:messenger:retry-schedule:v1',
    retryPayloadHashKey: 'axial:messenger:retry-payloads:v1',
    ledgerStreamKey: 'axial:messenger:events:ledger:v1',
    completedHashKey: 'axial:messenger:completed:v1',
    failureDedupePrefix: 'axial:messenger:failure-dedupe:v1',
    dlqReplayStateHashKey: 'axial:messenger:dlq-replay-state:v1',
    maxAttempts: 5,
    baseDelayMs: 5000,
    maxDelayMs: 5 * 60 * 1000,
    minIdleMs: 60000
});

const ENQUEUE_SCRIPT = [
    'if redis.call("HEXISTS", KEYS[3], ARGV[1]) == 1 then',
    '  redis.call("XADD", KEYS[4], "*", "event_id", ARGV[1], "correlation_id", ARGV[5],',
    '    "stream_id", "completed", "event_type", "message.duplicate", "status", "DUPLICATE_SKIPPED",',
    '    "attempt", "0", "worker_id", "", "timestamp", ARGV[6], "processing_ms", "",',
    '    "error", "", "metadata", \'{"reason":"already_completed"}\')',
    '  return {0, "completed"}',
    'end',
    'local existing = redis.call("GET", KEYS[1])',
    'if existing then',
    '  redis.call("XADD", KEYS[4], "*", "event_id", ARGV[1], "correlation_id", ARGV[5],',
    '    "stream_id", existing, "event_type", "message.duplicate", "status", "DUPLICATE_SKIPPED",',
    '    "attempt", "0", "worker_id", "", "timestamp", ARGV[6], "processing_ms", "",',
    '    "error", "", "metadata", \'{"reason":"already_queued"}\')',
    '  return {0, existing}',
    'end',
    'local streamId = redis.call("XADD", KEYS[2], "*",',
    '  "event_id", ARGV[1], "payload", ARGV[2], "occurred_at", ARGV[3],',
    '  "attempts", "0", "correlation_id", ARGV[5], "event_type", ARGV[7],',
    '  "causation_id", ARGV[8])',
    'redis.call("SET", KEYS[1], streamId, "EX", tonumber(ARGV[4]))',
    'redis.call("XADD", KEYS[4], "*", "event_id", ARGV[1], "correlation_id", ARGV[5],',
    '  "causation_id", ARGV[8], "stream_id", streamId, "event_type", ARGV[7],',
    '  "status", "RECEIVED", "attempt", "0", "worker_id", "", "timestamp", ARGV[6],',
    '  "processing_ms", "", "error", "", "metadata", "{}")',
    'redis.call("XADD", KEYS[4], "*", "event_id", ARGV[1], "correlation_id", ARGV[5],',
    '  "causation_id", ARGV[8], "stream_id", streamId, "event_type", ARGV[7],',
    '  "status", "QUEUED", "attempt", "0", "worker_id", "", "timestamp", ARGV[6],',
    '  "processing_ms", "", "error", "", "metadata", "{}")',
    'return {1, streamId}'
].join(String.fromCharCode(10));

const PUBLISH_DUE_RETRIES_SCRIPT = [
    'local due = redis.call("ZRANGEBYSCORE", KEYS[1], "-inf", ARGV[1], "LIMIT", 0, ARGV[2])',
    'local published = {}',
    'for _, eventId in ipairs(due) do',
    '  local payload = redis.call("HGET", KEYS[2], eventId)',
    '  if payload then',
    '    local attempts = redis.call("HGET", KEYS[3], eventId) or "0"',
    '    local event = cjson.decode(payload)',
    '    local correlationId = tostring(event["correlationId"] or eventId)',
    '    local eventType = tostring(event["eventType"] or "message.received")',
    '    local streamId = redis.call("XADD", KEYS[4], "*", "event_id", eventId, "payload", payload,',
    '      "occurred_at", tostring(event["occurredAt"] or ARGV[3]), "attempts", attempts,',
    '      "correlation_id", correlationId, "event_type", eventType, "causation_id", tostring(event["causationId"] or ""))',
    '    redis.call("XADD", KEYS[5], "*", "event_id", eventId, "correlation_id", correlationId,',
    '      "stream_id", streamId, "event_type", eventType, "status", "QUEUED",',
    '      "attempt", attempts, "worker_id", "", "timestamp", ARGV[3], "processing_ms", "",',
    '      "error", "", "metadata", \'{"retry":true}\')',
    '    table.insert(published, streamId)',
    '  end',
    '  redis.call("ZREM", KEYS[1], eventId)',
    '  redis.call("HDEL", KEYS[2], eventId)',
    'end',
    'return published'
].join(String.fromCharCode(10));

const ACK_SCRIPT = [
    'local acknowledged = redis.call("XACK", KEYS[1], ARGV[1], ARGV[2])',
    'if acknowledged > 0 then',
    '  redis.call("XDEL", KEYS[1], ARGV[2])',
    '  redis.call("HSET", KEYS[7], ARGV[3], ARGV[6])',
    '  redis.call("XADD", KEYS[6], "*", "event_id", ARGV[3], "correlation_id", ARGV[4],',
    '    "causation_id", ARGV[10], "stream_id", ARGV[2], "event_type", ARGV[9],',
    '    "status", "COMPLETED", "attempt", ARGV[7], "worker_id", ARGV[5],',
    '    "timestamp", ARGV[6], "processing_ms", ARGV[8], "error", "", "metadata", "{}")',
    '  if ARGV[11] and ARGV[11] ~= "" then',
    '    redis.call("HSET", KEYS[8], ARGV[11], "RECOVERED")',
    '    redis.call("XADD", KEYS[6], "*", "event_id", ARGV[3], "correlation_id", ARGV[4],',
    '      "causation_id", ARGV[10], "stream_id", ARGV[2], "event_type", "dead_letter.replay",',
    '      "status", "RECOVERED", "attempt", ARGV[7], "worker_id", ARGV[5],',
    '      "timestamp", ARGV[6], "processing_ms", ARGV[8], "error", "",',
    '      "metadata", cjson.encode({ deadLetterId = ARGV[11] }))',
    '  end',
    'end',
    'redis.call("HDEL", KEYS[2], ARGV[3])',
    'redis.call("HDEL", KEYS[3], ARGV[3])',
    'redis.call("ZREM", KEYS[4], ARGV[3])',
    'redis.call("HDEL", KEYS[5], ARGV[3])',
    'return acknowledged'
].join(String.fromCharCode(10));

const FAILURE_SCRIPT = [
    'local cached = redis.call("GET", KEYS[9])',
    'if cached then return cjson.decode(cached) end',
    'local attempts = redis.call("HINCRBY", KEYS[3], ARGV[3], 1)',
    'local maxAttempts = tonumber(ARGV[9])',
    'local function ledger(status, metadata)',
    '  redis.call("XADD", KEYS[8], "*", "event_id", ARGV[3], "correlation_id", ARGV[11],',
    '    "causation_id", ARGV[15], "stream_id", ARGV[2], "event_type", ARGV[14],',
    '    "status", status, "attempt", tostring(attempts), "worker_id", ARGV[12],',
    '    "timestamp", ARGV[13], "processing_ms", ARGV[16], "error", ARGV[5], "metadata", metadata or "{}")',
    'end',
    'ledger("FAILED", "{}")',
    'if attempts >= maxAttempts then',
    '  local deadLetterId = redis.call("GET", KEYS[5])',
    '  if not deadLetterId then',
    '    deadLetterId = redis.call("XADD", KEYS[2], "*", "original_stream_id", ARGV[2],',
    '      "event_id", ARGV[3], "payload", ARGV[4], "attempts", tostring(attempts),',
    '      "error", ARGV[5], "failed_at", ARGV[13])',
    '    redis.call("SET", KEYS[5], deadLetterId, "EX", tonumber(ARGV[10]))',
    '  end',
    '  ledger("DLQ", \'{"deadLetter":true}\')',
    '  if ARGV[17] and ARGV[17] ~= "" then redis.call("HSET", KEYS[10], ARGV[17], "FAILED_AGAIN") end',
    '  redis.call("XACK", KEYS[1], ARGV[1], ARGV[2])',
    '  redis.call("XDEL", KEYS[1], ARGV[2])',
    '  redis.call("HDEL", KEYS[3], ARGV[3])',
    '  redis.call("HDEL", KEYS[4], ARGV[3])',
    '  redis.call("ZREM", KEYS[6], ARGV[3])',
    '  redis.call("HDEL", KEYS[7], ARGV[3])',
    '  local result = {attempts, deadLetterId, 1}',
    '  redis.call("SET", KEYS[9], cjson.encode(result), "EX", tonumber(ARGV[10]))',
    '  return result',
    'end',
    'local delay = tonumber(ARGV[7]) * math.pow(2, attempts - 1)',
    'local maxDelay = tonumber(ARGV[8])',
    'if delay > maxDelay then delay = maxDelay end',
    'local nextRetryAt = tonumber(ARGV[6]) + delay',
    'local metadata = cjson.encode({ attempts = attempts, nextRetryAt = nextRetryAt, lastError = ARGV[5] })',
    'redis.call("HSET", KEYS[4], ARGV[3], metadata)',
    'redis.call("HSET", KEYS[7], ARGV[3], ARGV[4])',
    'redis.call("ZADD", KEYS[6], nextRetryAt, ARGV[3])',
    'ledger("RETRY_SCHEDULED", cjson.encode({ retryAt = nextRetryAt }))',
    'redis.call("XACK", KEYS[1], ARGV[1], ARGV[2])',
    'redis.call("XDEL", KEYS[1], ARGV[2])',
    'local result = {attempts, tostring(nextRetryAt), 0}',
    'redis.call("SET", KEYS[9], cjson.encode(result), "EX", tonumber(ARGV[10]))',
    'return result'
].join(String.fromCharCode(10));

const FETCH_DLQ_ENTRY_SCRIPT = [
    'return redis.call("XRANGE", KEYS[1], ARGV[1], ARGV[1], "COUNT", 1)'
].join(String.fromCharCode(10));

const LIST_DLQ_SCRIPT = [
    'return redis.call("XREVRANGE", KEYS[1], "+", "-", "COUNT", ARGV[1])'
].join(String.fromCharCode(10));


const REPLAY_DEAD_LETTER_SCRIPT = [
    'local rows = redis.call("XRANGE", KEYS[1], ARGV[1], ARGV[1], "COUNT", 1)',
    'if #rows == 0 then return {"NOT_FOUND"} end',
    'local fields = rows[1][2]',
    'local function field(wanted)',
    '  for i = 1, #fields, 2 do if fields[i] == wanted then return fields[i + 1] end end',
    '  return ""',
    'end',
    'local eventId = field("event_id")',
    'local rawPayload = field("payload")',
    'if eventId == "" or rawPayload == "" then return {"INVALID_PAYLOAD"} end',
    'local prior = redis.call("HGET", KEYS[5], ARGV[1])',
    'if prior and prior ~= "FAILED_AGAIN" then',
    '  redis.call("XADD", KEYS[4], "*", "event_id", eventId,',
    '    "correlation_id", field("correlation_id"), "causation_id", "",',
    '    "stream_id", ARGV[1], "event_type", "dead_letter.replay",',
    '    "status", "DUPLICATE_SKIPPED", "attempt", field("attempts"),',
    '    "worker_id", ARGV[3], "timestamp", ARGV[4], "processing_ms", "",',
    '    "error", "", "metadata", \'{"reason":"replay_already_requested"}\')',
    '  return {"DUPLICATE_REPLAY", prior}',
    'end',
    'if redis.call("HEXISTS", KEYS[6], eventId) == 1 then',
    '  redis.call("HSET", KEYS[5], ARGV[1], "ALREADY_COMPLETED")',
    '  redis.call("XADD", KEYS[4], "*", "event_id", eventId,',
    '    "correlation_id", field("correlation_id"), "causation_id", "",',
    '    "stream_id", ARGV[1], "event_type", "dead_letter.replay",',
    '    "status", "DUPLICATE_SKIPPED", "attempt", field("attempts"),',
    '    "worker_id", ARGV[3], "timestamp", ARGV[4], "processing_ms", "",',
    '    "error", "", "metadata", \'{"reason":"already_completed"}\')',
    '  return {"ALREADY_COMPLETED", eventId}',
    'end',
    'local ok, event = pcall(cjson.decode, rawPayload)',
    'if not ok or type(event) ~= "table" then return {"INVALID_PAYLOAD"} end',
    'event["replayOf"] = ARGV[1]',
    'local payload = cjson.encode(event)',
    'local correlationId = tostring(event["correlationId"] or field("correlation_id") or eventId)',
    'local eventType = tostring(event["eventType"] or field("event_type") or "message.received")',
    'local causationId = tostring(event["causationId"] or "")',
    'local occurredAt = tostring(event["occurredAt"] or field("occurred_at") or ARGV[4])',
    'local newStreamId = redis.call("XADD", KEYS[2], "*",',
    '  "event_id", eventId, "payload", payload, "occurred_at", occurredAt,',
    '  "attempts", "0", "correlation_id", correlationId, "event_type", eventType,',
    '  "causation_id", causationId, "replay_of", ARGV[1])',
    'redis.call("SET", KEYS[3], newStreamId, "EX", tonumber(ARGV[2]))',
    'redis.call("HDEL", KEYS[7], eventId)',
    'redis.call("HDEL", KEYS[8], eventId)',
    'redis.call("ZREM", KEYS[9], eventId)',
    'redis.call("HDEL", KEYS[10], eventId)',
    'redis.call("HSET", KEYS[5], ARGV[1], "REPLAY_REQUESTED:" .. newStreamId)',
    'redis.call("XADD", KEYS[4], "*", "event_id", eventId, "correlation_id", correlationId,',
    '  "causation_id", causationId, "stream_id", newStreamId, "event_type", "dead_letter.replay",',
    '  "status", "REPLAY_REQUESTED", "attempt", "0", "worker_id", ARGV[3],',
    '  "timestamp", ARGV[4], "processing_ms", "", "error", "",',
    '  "metadata", cjson.encode({ deadLetterId = ARGV[1] }))',
    'redis.call("XADD", KEYS[4], "*", "event_id", eventId, "correlation_id", correlationId,',
    '  "causation_id", causationId, "stream_id", newStreamId, "event_type", eventType,',
    '  "status", "QUEUED", "attempt", "0", "worker_id", "", "timestamp", ARGV[4],',
    '  "processing_ms", "", "error", "", "metadata", \'{"replay":true}\')',
    'return {"REPLAY_QUEUED", newStreamId, eventId}'
].join(String.fromCharCode(10));


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
    const namespace = options.config?.namespace || getAxialKeyPrefix();
    const namespacedDefaults = {
        streamKey: namespace + ':messenger:events:inbound:v1',
        deadLetterStreamKey: namespace + ':messenger:events:dlq:v1',
        consumerGroup: namespace + ':messenger:workers:v1',
        dedupePrefix: namespace + ':messenger:dedupe:v1',
        retryHashKey: namespace + ':messenger:retry-counts:v1',
        retryMetaHashKey: namespace + ':messenger:retry-meta:v1',
        retryScheduleKey: namespace + ':messenger:retry-schedule:v1',
        retryPayloadHashKey: namespace + ':messenger:retry-payloads:v1',
        ledgerStreamKey: namespace + ':messenger:events:ledger:v1',
        completedHashKey: namespace + ':messenger:completed:v1',
        failureDedupePrefix: namespace + ':messenger:failure-dedupe:v1',
        dlqReplayStateHashKey: namespace + ':messenger:dlq-replay-state:v1',
        deadLetterDedupePrefix: namespace + ':messenger:dlq-dedupe:v1'
    };
    const settings = { ...DEFAULTS, ...namespacedDefaults, ...(options.config || {}) };
    delete settings.namespace;
    let groupReady = false;

    function redis() {
        return getRedis();
    }

    function dedupeKey(eventId) {
        const digest = crypto.createHash('sha256').update(eventId).digest('hex');
        return settings.dedupePrefix + ':' + digest;
    }

    async function ensureConsumerGroup() {
        if (groupReady) return 'OK';

        try {
            const result = await redis().xgroup(settings.streamKey, {
                type: 'CREATE',
                group: settings.consumerGroup,
                id: settings.consumerGroupStartId,
                options: { MKSTREAM: true }
            });
            groupReady = true;
            return result;
        } catch (error) {
            if (/BUSYGROUP/i.test(String(error?.message || error))) {
                groupReady = true;
                return 'OK';
            }
            throw error;
        }
    }

    async function appendLedger(entry) {
        return redis().xadd(settings.ledgerStreamKey, '*', {
            event_id: String(entry.eventId),
            correlation_id: String(entry.correlationId || entry.eventId),
            causation_id: String(entry.causationId || ''),
            stream_id: String(entry.streamId || ''),
            event_type: String(entry.eventType || 'message.received'),
            status: String(entry.status),
            attempt: String(Number(entry.attempt || 0)),
            worker_id: String(entry.workerId || ''),
            timestamp: entry.timestamp || new Date().toISOString(),
            processing_ms: String(Number(entry.processingMs || 0)),
            error: entry.error ? JSON.stringify(entry.error) : '',
            metadata: JSON.stringify(entry.metadata || {})
        });
    }

    async function enqueueEvent({ eventId, payload, occurredAt = new Date().toISOString(), correlationId = eventId }) {
        if (typeof eventId !== 'string' || !eventId.trim()) {
            throw new Error('eventId es obligatorio para la idempotencia.');
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('payload debe ser un objeto.');
        }

        const canonicalEvent = canonicalizeEvent({ eventId, payload, occurredAt, correlationId });
        const serializedPayload = JSON.stringify(canonicalEvent);
        if (typeof serializedPayload !== 'string') {
            throw new Error('No se pudo serializar el evento.');
        }

        const result = await redis().eval(
            ENQUEUE_SCRIPT,
            [dedupeKey(eventId), settings.streamKey, settings.completedHashKey, settings.ledgerStreamKey],
            [eventId, serializedPayload, occurredAt, settings.dedupeTtlSeconds,
                canonicalEvent.correlationId, new Date().toISOString(),
                canonicalEvent.eventType || 'message.received', canonicalEvent.causationId || '']
        );

        const inserted = Number(result?.[0]) === 1;
        return {
            inserted,
            duplicate: !inserted,
            streamId: result?.[1] ? String(result[1]) : null,
            event: canonicalEvent
        };
    }

    async function publishDueRetries(options = {}) {
        const now = Number.isFinite(options.now) ? options.now : Date.now();
        const count = options.count ?? 25;
        if (!Number.isInteger(count) || count < 1 || count > 100) {
            throw new Error('count debe ser un entero entre 1 y 100.');
        }

        const result = await redis().eval(
            PUBLISH_DUE_RETRIES_SCRIPT,
            [
                settings.retryScheduleKey,
                settings.retryPayloadHashKey,
                settings.retryHashKey,
                settings.streamKey,
                settings.ledgerStreamKey
            ],
            [now, count, new Date(now).toISOString()]
        );

        return Array.isArray(result) ? result.map(String) : [];
    }

    async function readNewMessages(consumer, count = 10) {
        if (typeof consumer !== 'string' || !consumer.trim()) {
            throw new Error('consumer es obligatorio.');
        }
        if (!Number.isInteger(count) || count < 1 || count > 100) {
            throw new Error('count debe ser un entero entre 1 y 100.');
        }

        await ensureConsumerGroup();
        await publishDueRetries({ count });
        const response = await redis().xreadgroup(
            settings.consumerGroup,
            consumer,
            settings.streamKey,
            '>',
            { count }
        );

        const rawEntries = parseStreamEntries(response);
        const accepted = [];
        for (const entry of rawEntries) {
            const fields = entry.fields || {};
            const eventId = String(fields.event_id || '');
            if (!eventId) continue;
            const completedAt = await redis().hget(settings.completedHashKey, eventId);
            if (completedAt) {
                await redis().xack(settings.streamKey, settings.consumerGroup, entry.id);
                await redis().xdel(settings.streamKey, entry.id);
                await appendLedger({
                    eventId, correlationId: fields.correlation_id || eventId,
                    causationId: fields.causation_id || '', streamId: entry.id,
                    eventType: 'message.duplicate', status: 'DUPLICATE_SKIPPED',
                    attempt: Number(fields.attempts || 0), workerId: consumer,
                    metadata: { reason: 'completed_marker' }
                });
                continue;
            }
            await appendLedger({
                eventId, correlationId: fields.correlation_id || eventId,
                causationId: fields.causation_id || '', streamId: entry.id,
                eventType: fields.event_type || 'message.received', status: 'PROCESSING',
                attempt: Number(fields.attempts || 0) + 1, workerId: consumer
            });
            accepted.push(entry);
        }
        return accepted;
    }

    async function claimStaleMessages(consumer, options = {}) {
        if (typeof consumer !== 'string' || !consumer.trim()) {
            throw new Error('consumer es obligatorio.');
        }

        const minIdleMs = options.minIdleMs ?? settings.minIdleMs;
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
        const rawEntries = parseStreamEntries([[settings.streamKey, entries]]);
        const accepted = [];
        for (const entry of rawEntries) {
            const fields = entry.fields || {};
            const eventId = String(fields.event_id || '');
            if (!eventId) continue;
            const completedAt = await redis().hget(settings.completedHashKey, eventId);
            if (completedAt) {
                await redis().xack(settings.streamKey, settings.consumerGroup, entry.id);
                await redis().xdel(settings.streamKey, entry.id);
                await appendLedger({
                    eventId, correlationId: fields.correlation_id || eventId,
                    causationId: fields.causation_id || '', streamId: entry.id,
                    eventType: 'message.duplicate', status: 'DUPLICATE_SKIPPED',
                    attempt: Number(fields.attempts || 0), workerId: consumer,
                    metadata: { reason: 'completed_marker' }
                });
                continue;
            }
            await appendLedger({
                eventId, correlationId: fields.correlation_id || eventId,
                causationId: fields.causation_id || '', streamId: entry.id,
                eventType: fields.event_type || 'message.received', status: 'PROCESSING',
                attempt: Number(fields.attempts || 0) + 1, workerId: consumer,
                metadata: { reclaimed: true }
            });
            accepted.push(entry);
        }
        return accepted;
    }

    async function getRetryState(eventId) {
        const value = await redis().hget(settings.retryMetaHashKey, eventId);
        return parseRetryMetadata(value);
    }

    async function isRetryDue(eventId, now = Date.now()) {
        const metadata = await getRetryState(eventId);
        if (!metadata) return true;

        const nextRetryAt = Number(metadata.nextRetryAt);
        return !Number.isFinite(nextRetryAt) || nextRetryAt <= now;
    }

    async function acknowledge(streamId, eventId, details = {}) {
        if (typeof streamId !== 'string' || !streamId.trim()) {
            throw new Error('streamId es obligatorio.');
        }
        if (typeof eventId !== 'string' || !eventId.trim()) {
            throw new Error('eventId es obligatorio para limpiar el estado del evento.');
        }

        return redis().eval(
            ACK_SCRIPT,
            [
                settings.streamKey,
                settings.retryHashKey,
                settings.retryMetaHashKey,
                settings.retryScheduleKey,
                settings.retryPayloadHashKey,
                settings.ledgerStreamKey,
                settings.completedHashKey,
                settings.dlqReplayStateHashKey
            ],
            [settings.consumerGroup, streamId, eventId,
                details.correlationId || eventId, details.workerId || 'unknown',
                details.timestamp || new Date().toISOString(),
                Number.isInteger(details.attempt) && details.attempt > 0 ? details.attempt : 1,
                Number.isFinite(details.processingMs) && details.processingMs >= 0 ? Math.round(details.processingMs) : 0,
                details.eventType || 'message.received', details.causationId || '',
                details.replayOf || '']
        );
    }

    async function recordFailure({
        streamId, eventId, payload, error, now = Date.now(),
        correlationId, workerId = 'unknown', processingMs = 0
    }) {
        if (!streamId || !eventId || !payload) {
            throw new Error('streamId, eventId y payload son obligatorios para registrar el fallo.');
        }
        const safeError = JSON.stringify(normalizeError(error));
        const serializedPayload = JSON.stringify(payload);
        const timestamp = new Date(now).toISOString();
        const failureKey = settings.failureDedupePrefix + ':' +
            crypto.createHash('sha256').update(eventId + ':' + streamId).digest('hex');
        const result = await redis().eval(
            FAILURE_SCRIPT,
            [
                settings.streamKey, settings.deadLetterStreamKey, settings.retryHashKey,
                settings.retryMetaHashKey,
                settings.deadLetterDedupePrefix + ':' + crypto.createHash('sha256').update(eventId).digest('hex'),
                settings.retryScheduleKey, settings.retryPayloadHashKey, settings.ledgerStreamKey,
                failureKey, settings.dlqReplayStateHashKey
            ],
            [
                settings.consumerGroup, streamId, eventId, serializedPayload, safeError, now,
                settings.baseDelayMs, settings.maxDelayMs, settings.maxAttempts, settings.dedupeTtlSeconds,
                correlationId || payload.correlationId || eventId, workerId, timestamp,
                payload.eventType || 'message.received', payload.causationId || '',
                Number.isFinite(processingMs) && processingMs >= 0 ? Math.round(processingMs) : 0,
                payload.replayOf || ''
            ]
        );

        const attempts = Number(result?.[0] || 0);
        const deadLettered = Number(result?.[2]) === 1;
        return {
            attempts, deadLettered,
            deadLetterId: deadLettered && result?.[1] ? String(result[1]) : null,
            nextRetryAt: deadLettered ? null : Number(result?.[1] || 0)
        };
    }



    async function listDeadLetters(limit = 50) {
        const count = Number(limit);
        if (!Number.isInteger(count) || count < 1 || count > 100) {
            throw new Error('limit debe ser un entero entre 1 y 100.');
        }
        const rows = await redis().eval(
            LIST_DLQ_SCRIPT,
            [settings.deadLetterStreamKey],
            [count]
        );
        const entries = parseStreamEntries([[settings.deadLetterStreamKey, Array.isArray(rows) ? rows : []]]);
        return Promise.all(entries.map(async entry => {
            const fields = entry.fields || {};
            let error = null;
            try {
                const parsed = JSON.parse(String(fields.error || ''));
                error = {
                    code: typeof parsed.code === 'string' ? parsed.code : 'UNKNOWN_ERROR',
                    category: typeof parsed.category === 'string' ? parsed.category : 'INTERNAL'
                };
            } catch {
                error = fields.error ? { code: 'LEGACY_UNNORMALIZED', category: 'INTERNAL' } : null;
            }
            return {
                deadLetterId: entry.id,
                eventId: String(fields.event_id || ''),
                attempts: Number(fields.attempts || 0),
                failedAt: String(fields.failed_at || ''),
                error,
                replayState: await redis().hget(settings.dlqReplayStateHashKey, entry.id) || null
            };
        }));
    }

    async function replayDeadLetter(deadLetterId, options = {}) {
        if (typeof deadLetterId !== 'string' || !deadLetterId.trim()) {
            throw new Error('deadLetterId es obligatorio para solicitar un replay.');
        }
        const rows = await redis().eval(
            FETCH_DLQ_ENTRY_SCRIPT,
            [settings.deadLetterStreamKey],
            [deadLetterId]
        );
        const entries = parseStreamEntries([[settings.deadLetterStreamKey, Array.isArray(rows) ? rows : []]]);
        if (!entries.length) return { status: 'NOT_FOUND', deadLetterId };

        const eventId = String(entries[0].fields.event_id || '');
        if (!eventId) return { status: 'INVALID_PAYLOAD', deadLetterId };
        const result = await redis().eval(
            REPLAY_DEAD_LETTER_SCRIPT,
            [
                settings.deadLetterStreamKey, settings.streamKey, dedupeKey(eventId),
                settings.ledgerStreamKey, settings.dlqReplayStateHashKey, settings.completedHashKey,
                settings.retryHashKey, settings.retryMetaHashKey, settings.retryScheduleKey,
                settings.retryPayloadHashKey
            ],
            [deadLetterId, settings.dedupeTtlSeconds, options.workerId || 'manual', options.timestamp || new Date().toISOString()]
        );

        const status = String(result?.[0] || 'UNKNOWN');
        const detail = result?.[1] ? String(result[1]) : null;
        return {
            status,
            streamId: status === 'REPLAY_QUEUED' ? detail : null,
            detail,
            eventId: result?.[2] ? String(result[2]) : eventId,
            deadLetterId
        };
    }

    async function replayDeadLetters(deadLetterIds, options = {}) {
        if (!Array.isArray(deadLetterIds) || deadLetterIds.length < 1 || deadLetterIds.length > 100) {
            throw new Error('deadLetterIds debe contener entre 1 y 100 IDs.');
        }
        const uniqueIds = [...new Set(deadLetterIds.map(String))];
        const results = await Promise.all(uniqueIds.map(id => replayDeadLetter(id, options)));
        return {
            requested: uniqueIds.length,
            queued: results.filter(item => item.status === 'REPLAY_QUEUED').length,
            skipped: results.filter(item => ['DUPLICATE_REPLAY', 'ALREADY_COMPLETED'].includes(item.status)).length,
            missing: results.filter(item => item.status === 'NOT_FOUND').length,
            invalid: results.filter(item => item.status === 'INVALID_PAYLOAD').length,
            results
        };
    }

    async function getDeadLetterReplayState(deadLetterId) {
        if (typeof deadLetterId !== 'string' || !deadLetterId.trim()) {
            throw new Error('deadLetterId es obligatorio.');
        }
        const state = await redis().hget(settings.dlqReplayStateHashKey, deadLetterId);
        return state ? String(state) : null;
    }

    return {
        settings,
        ensureConsumerGroup,
        enqueueEvent,
        publishDueRetries,
        readNewMessages,
        claimStaleMessages,
        getRetryState,
        isRetryDue,
        acknowledge,
        recordFailure,
        appendLedger,
        replayDeadLetter,
        replayDeadLetters,
        listDeadLetters,
        getDeadLetterReplayState
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
