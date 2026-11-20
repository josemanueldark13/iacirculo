'use strict';

const STATES = Object.freeze({
    RECEIVED: 'received',
    PROCESSING: 'processing',
    RETRYING: 'retrying',
    COMPLETED: 'completed',
    FAILED: 'failed',
    DEAD_LETTERED: 'dead_lettered'
});

function canonicalizeEvent({ eventId, payload, occurredAt = new Date().toISOString(), correlationId = eventId }) {
    if (typeof eventId !== 'string' || !eventId.trim()) {
        throw new Error('eventId es obligatorio.');
    }
    if (typeof correlationId !== 'string' || !correlationId.trim()) {
        throw new Error('correlationId es obligatorio.');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('payload debe ser un objeto.');
    }
    if (typeof occurredAt !== 'string' || !occurredAt.trim() || Number.isNaN(Date.parse(occurredAt))) {
        throw new Error('occurredAt debe ser una fecha ISO válida.');
    }

    return {
        ...payload,
        eventId,
        correlationId,
        state: STATES.RECEIVED,
        direction: 'inbound',
        stage: 'persisted',
        occurredAt
    };
}

module.exports = { STATES, canonicalizeEvent };
