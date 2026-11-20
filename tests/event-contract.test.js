'use strict';

const assert = require('node:assert/strict');
const { canonicalizeEvent, STATES } = require('../services/eventContract');
const { getAxialKeyPrefix } = require('../config/redis');

const event = canonicalizeEvent({
    eventId: 'evt-001',
    correlationId: 'corr-001',
    occurredAt: '2026-11-20T00:00:00.000Z',
    payload: { source: 'messenger', senderId: 'test-user', text: 'hello' }
});

assert.equal(event.eventId, 'evt-001');
assert.equal(event.correlationId, 'corr-001');
assert.equal(event.state, STATES.RECEIVED);
assert.equal(event.direction, 'inbound');
assert.equal(event.stage, 'persisted');
assert.equal(event.senderId, 'test-user');
assert.throws(() => canonicalizeEvent({ eventId: '', payload: {} }), /eventId/);
assert.throws(() => canonicalizeEvent({ eventId: 'evt', payload: [] }), /payload/);
const previous = process.env.AXIAL_ENV;
process.env.AXIAL_ENV = 'testing';
assert.equal(getAxialKeyPrefix(), 'axial:testing');
if (previous === undefined) delete process.env.AXIAL_ENV;
else process.env.AXIAL_ENV = previous;
console.log('EVENT CONTRACT + ENV NAMESPACE: PASS');
