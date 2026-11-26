'use strict';

const crypto = require('node:crypto');

const STATUSES = Object.freeze({
    RECEIVED: 'RECEIVED',
    QUEUED: 'QUEUED',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    RETRY_SCHEDULED: 'RETRY_SCHEDULED',
    DLQ: 'DLQ',
    REPLAY_REQUESTED: 'REPLAY_REQUESTED',
    RECOVERED: 'RECOVERED',
    REPLAY_FAILED: 'REPLAY_FAILED',
    DUPLICATE_SKIPPED: 'DUPLICATE_SKIPPED'
});

function makeCorrelationId(senderId, eventId) {
    const secret = process.env.TELEMETRY_HASH_SECRET;
    if (typeof senderId === 'string' && senderId && typeof secret === 'string' && secret.length >= 32) {
        return 'corr_' + crypto.createHmac('sha256', secret).update(senderId).digest('hex').slice(0, 32);
    }
    return 'corr_evt_' + crypto.createHash('sha256').update(String(eventId)).digest('hex').slice(0, 24);
}

function normalizeError(error) {
    const source = error && typeof error === 'object' ? error : {};
    const code = typeof source.code === 'string' ? source.code.toUpperCase() : '';
    const name = typeof source.name === 'string' ? source.name.toUpperCase() : '';
    const status = Number(source.statusCode || source.status || source.response?.status || 0);
    const signature = code + '_' + name;

    if (/UNAUTHORIZED|FORBIDDEN|SECURITY/.test(signature) || status === 401 || status === 403) {
        return { code: 'SECURITY_ERROR', category: 'SECURITY' };
    }
    if (source.name === 'ValidationError' || /VALIDATION|INVALID_ARGUMENT|BAD_REQUEST/.test(signature)) {
        return { code: 'VALIDATION_ERROR', category: 'VALIDATION' };
    }
    if (/CONFIG|MISSING_ENV|INVALID_ENV/.test(signature)) {
        return { code: 'CONFIGURATION_ERROR', category: 'CONFIGURATION' };
    }
    if (/TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN/.test(signature) || status === 429 || status >= 500) {
        return {
            code: /TIMEOUT|ETIMEDOUT/.test(signature) ? 'UPSTASH_TIMEOUT' :
                status === 429 ? 'EXTERNAL_API_RATE_LIMIT' : 'TRANSIENT_NETWORK_ERROR',
            category: 'TRANSIENT'
        };
    }
    if (status >= 400 || /GRAPH|META|HTTP|API/.test(signature)) {
        return { code: status ? 'EXTERNAL_API_HTTP_' + status : 'EXTERNAL_API_ERROR', category: 'EXTERNAL_API' };
    }
    return { code: 'INTERNAL_ERROR', category: 'INTERNAL' };
}

module.exports = { STATUSES, makeCorrelationId, normalizeError };
