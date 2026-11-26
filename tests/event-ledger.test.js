'use strict';

const assert = require('node:assert/strict');
const { STATUSES, makeCorrelationId, normalizeError } = require('../services/eventLedger');

const previousSecret = process.env.TELEMETRY_HASH_SECRET;
process.env.TELEMETRY_HASH_SECRET = 'test-secret-with-at-least-32-characters';

const first = makeCorrelationId('synthetic-user-01', 'evt-001');
const second = makeCorrelationId('synthetic-user-01', 'evt-002');
assert.equal(first, second, 'same synthetic sender should share a conversation correlation');
assert.match(first, /^corr_[a-f0-9]{32}$/);
assert.ok(!first.includes('synthetic-user-01'));

delete process.env.TELEMETRY_HASH_SECRET;
const noSecret = makeCorrelationId('synthetic-user-01', 'evt-001');
assert.match(noSecret, /^corr_evt_[a-f0-9]{24}$/);

const normalized = normalizeError(Object.assign(
    new Error('private text must not persist'),
    { code: 'ETIMEDOUT' }
));
assert.equal(normalized.code, 'UPSTASH_TIMEOUT');
assert.equal(Object.hasOwn(normalized, 'message'), false);
assert.deepEqual(normalizeError(Object.assign(new Error('do not store'), { statusCode: 401 })), {
    code: 'SECURITY_ERROR',
    category: 'SECURITY'
});
assert.equal(STATUSES.COMPLETED, 'COMPLETED');

if (previousSecret === undefined) delete process.env.TELEMETRY_HASH_SECRET;
else process.env.TELEMETRY_HASH_SECRET = previousSecret;

console.log('EVENT LEDGER CONTRACT: PASS (statuses, HMAC correlation and privacy-safe normalized errors)');
