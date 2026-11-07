const assert = require("node:assert/strict");
const { analyze } = require("../Kernels/messageAnalyzer");
const { route } = require("../Kernels/messagingRouter");

const cases = [
  ["Hola, buenas tardes", "saludo"],
  ["Muchas gracias por la información", "agradecimiento"],
  ["¿Dónde queda el Círculo de Legisladores?", "consulta_institucional"],
  ["Necesito comunicarme con ustedes", "contacto"],
  ["Tengo un reclamo, nadie me respondió", "reclamo"],
  ["Es urgente, necesito una respuesta hoy", "urgente"],
  ["Quiero hablar con una persona real", "solicitud_humano"],
  ["Me hicieron una estafa", "denuncia_sensible"],
  ["Invertí en cripto y duplicá tu dinero", "oferta_spam"]
];

for (const [message, expected] of cases) {
  const result = analyze(message);
  assert.equal(result.intent, expected, message);
}

const urgent = analyze("Es una emergencia, necesito ayuda ahora mismo");
assert.equal(route(urgent, "SUPERVISION").action, "ESCALATE");
assert.equal(route(urgent, "SUPERVISION").requires_human, true);
assert.equal(route(urgent, "MANUAL").auto_reply, false);

const spam = analyze("Oferta de inversión garantizada, gana dinero");
assert.equal(route(spam, "AUTO").action, "IGNORE");

const followUp = analyze("¿Y eso?", { hasPreviousMessage: true, previousDomain: "institucional" });
assert.equal(followUp.intent, "continuacion");
assert.equal(followUp.is_follow_up, true);

const ambiguous = analyze("Necesito hacer una consulta");
assert.equal(route(ambiguous, "SUPERVISION").action, "CLARIFY");

console.log("MESSAGING SEMANTIC TESTS: PASS");
