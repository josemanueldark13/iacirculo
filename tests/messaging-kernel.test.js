'use strict';

const assert = require('node:assert/strict');
const { decide, createAuditRecord, ACTIONS } = require('../messaging/kernel');

const fixedTime = new Date('2026-11-07T19:00:00.000Z');

function run(text, expectedCategory, expectedAction) {
    const result = decide(text, { now: fixedTime, messageId: 'test-1' });
    assert.equal(result.category, expectedCategory, text);
    assert.equal(result.action, expectedAction, text);
    assert.equal(result.messageId, 'test-1');
    assert.equal(result.status, 'decision_created');
    return result;
}

run('¿Cuál es la historia del Círculo de Legisladores?', 'institutional_inquiry', ACTIONS.RESPOND_WITH_KNOWLEDGE);
run('Quiero presentar un reclamo por falta de respuesta', 'complaint', ACTIONS.ACKNOWLEDGE_AND_ESCALATE);
run('Necesito un puesto de trabajo', 'request', ACTIONS.HUMAN_REVIEW);
run('Sos un idiota', 'abuse', ACTIONS.ARCHIVE_NO_REPLY);
run('Compra ahora, oferta exclusiva, ingresá al link', 'propaganda', ACTIONS.ARCHIVE_NO_REPLY);
run('Hola', 'ambiguous', ACTIONS.REQUEST_CLARIFICATION);
run('Me amenazaron y estoy en peligro inmediato', 'complex', ACTIONS.HUMAN_REVIEW);
run('Son unos inútiles, ¿cuál es la dirección del Círculo?', 'institutional_inquiry', ACTIONS.RESPOND_WITH_KNOWLEDGE);

const decision = decide('¿Dónde queda el Círculo?', { now: fixedTime, messageId: 'audit-1' });
const audit = createAuditRecord('¿Dónde queda el Círculo?', decision, { outcome: 'not_sent' });
assert.equal(audit.messageId, 'audit-1');
assert.equal(audit.outcome, 'not_sent');
assert.equal(audit.messageExcerpt, '¿Dónde queda el Círculo?');
assert.equal(decide('', { now: fixedTime }).action, ACTIONS.HUMAN_REVIEW);

console.log('MESSAGING KERNEL: PASS (10 escenarios y auditoría).');
