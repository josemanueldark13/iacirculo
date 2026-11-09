"use strict";

const assert = require("node:assert/strict");
const kernel = require("../Kernels/kernel");
const messageAnalyzer = require("../Kernels/messageAnalyzer");
const messagingRouter = require("../Kernels/messagingRouter");

const cases = [
    ["Necesito asistencia urgente ahora mismo", "urgente", "critica", true],
    ["Quiero hacer un reclamo por la atención", "reclamo", "alta", true],
    ["Llevo tres semanas esperando una respuesta", "consulta_ambigua", "normal", false],
    ["¿Qué significa la palabra reclamo?", "consulta_ambigua", "normal", false],
    ["No quiero presentar un reclamo", "consulta_ambigua", "normal", false],
    ["Muchas gracias por la información", "agradecimiento", "baja", false],
    ["Hola, buenas tardes", "saludo", "baja", false]
];

for (const [message, intent, priority, human] of cases) {
    const result = messageAnalyzer.analyze(message);
    if (message.startsWith("Llevo")) {
        assert.equal(result.complaint.detected, true, message);
        assert.equal(result.priority, "alta", message);
    } else {
        assert.equal(result.intent, intent, message);
        assert.equal(result.priority, priority, message);
        assert.equal(result.requires_human, human, message);
    }
}

const informational = messageAnalyzer.analyze("¿Qué es un reclamo?");
assert.equal(informational.complaint.informational_question, true);
assert.equal(informational.requires_human, false);

const negated = messageAnalyzer.analyze("No quiero presentar un reclamo");
assert.equal(negated.complaint.negated, true);
assert.equal(negated.requires_human, false);

const insult = messageAnalyzer.analyze("Sos un inútil");
assert.equal(insult.priority, "baja");
assert.equal(insult.requires_human, false);

assert.equal(messagingRouter.route(messageAnalyzer.analyze("Hola"), "AUTO").action, "AUTO_REPLY");
assert.equal(messagingRouter.route(messageAnalyzer.analyze("Hola"), "SUPERVISION").action, "HUMAN_REVIEW");
assert.equal(messagingRouter.route(messageAnalyzer.analyze("Hola"), "MANUAL").draft_response, false);

const urgentDecision = kernel.process("Tengo una emergencia y necesito ayuda", { mode: "SUPERVISION" });
assert.equal(urgentDecision.agente, "atencion_humana");
assert.equal(urgentDecision.prioridad, "critica");
assert.equal(urgentDecision.decision_mensajeria.action, "ESCALATE");
assert.equal(urgentDecision.analisis_mensaje.requires_human, true);

const ambiguousDecision = kernel.process("Necesito hacer una consulta", { mode: "AUTO" });
assert.equal(ambiguousDecision.decision_mensajeria.action, "CLARIFY");

console.log("MESSAGING UNIFIED INTEGRATION: PASS");
