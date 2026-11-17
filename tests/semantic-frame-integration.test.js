"use strict";

const assert = require("node:assert/strict");
const { analyzeFrame } = require("../Kernels/semanticFrame");
const kernel = require("../Kernels/kernel");

const affection = analyzeFrame({ text: "te amo chango culiado" });
assert.equal(affection.intent, "affectionate_statement");
assert.equal(affection.domain, "social_interaction");
assert.match(affection.paraphrase, /cariño|afecto|cercanía/);
assert.equal(affection.ambiguity.detected, false);

const technology = analyzeFrame({ text: "la IA analiza el código" });
assert.equal(technology.domain, "technology");
assert.ok(technology.domainConfidence >= 0.85);

const selfDeprecation = analyzeFrame({ text: "qué boludo soy" });
assert.equal(selfDeprecation.intent, "self_deprecating_statement");
assert.match(selfDeprecation.register, /colloquial/);
assert.match(selfDeprecation.paraphrase, /autocrítica/);

const guided = analyzeFrame({ text: "arreglá eso" });
assert.equal(guided.responseMode, "GUIDED");
assert.equal(guided.ambiguity.detected, true);

const ironic = analyzeFrame({
    text: "claro, justo lo que necesitaba hoy",
    conversationContext: [
        { role: "user", content: "Se me rompió la computadora antes de entregar el trabajo." },
        { role: "user", content: "Y ahora recibí otra mala noticia." }
    ]
});
assert.match(ironic.tone, /ironic|sarcastic/);
assert.equal(ironic.signals.pragmaticMismatch, true);

const economic = analyzeFrame({
    text: "otro aumento más que nos deja en la gloria",
    conversationContext: [
        { role: "user", content: "El gobierno anunció otro aumento de precios y eso perjudica nuestro presupuesto." }
    ]
});
assert.equal(economic.domain, "economy");
assert.match(economic.tone, /sarcastic|critical/);
assert.match(economic.paraphrase, /precios|perjuicio|presupuesto/);

const contextualDecision = kernel.process("arreglá eso", {
    mode: "AUTO",
    conversationContext: [{ role: "user", content: "El botón de publicar no funciona." }]
});
assert.equal(contextualDecision.semantic_frame.responseMode, "GUIDED");
assert.equal(contextualDecision.decision_mensajeria.action, "CLARIFY");

console.log("SEMANTIC FRAME 0.3.1: PASS");
