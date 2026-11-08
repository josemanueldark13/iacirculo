"use strict";

const assert = require("node:assert/strict");
const semanticAnalyzer = require("../Kernels/semanticAnalyzer");
const kernel = require("../Kernels/kernel");

let passed = 0;
const tests = [];

function test(name, callback) {
    tests.push({ name, callback });
}

test("conserva la clasificación institucional de una consulta positiva", () => {
    const result = semanticAnalyzer.analyze("¿Quiénes son las autoridades del Círculo de Legisladores?");
    assert.equal(result.domain, "institucional");
    assert.ok(result.confidence >= 0.5);
    assert.equal(result.intentSuppressed, false);
});

test("detecta una negativa simple sin inventar una consulta institucional", () => {
    const result = semanticAnalyzer.analyze("No quiero esto");
    assert.equal(result.polarity, "negative");
    assert.equal(result.intentSuppressed, true);
    assert.equal(result.domain, "indeterminado");
    assert.equal(result.confidence, 0);
});

test("la negación suprime la intención aunque aparezcan conceptos institucionales", () => {
    const result = semanticAnalyzer.analyze(
        "No quiero información sobre las autoridades del Círculo de Legisladores"
    );
    assert.equal(result.polarity, "negative");
    assert.equal(result.intentSuppressed, true);
    assert.equal(result.domain, "indeterminado");
    assert.ok(result.concepts.includes("autoridades"));
});

test("una cláusula afirmativa posterior a pero conserva su intención", () => {
    const result = semanticAnalyzer.analyze(
        "No quiero información sobre autoridades, pero sí quiero conocer la historia institucional"
    );
    assert.equal(result.intentSuppressed, false);
    assert.equal(result.domain, "institucional");
    assert.equal(result.polarity, "negative");
});

test("salvo que se registra como excepción y delimita el alcance de la negación", () => {
    const result = semanticAnalyzer.analyze(
        "No quiero información sobre autoridades, salvo que hayan cambiado"
    );
    assert.equal(result.polarity, "conditional");
    assert.equal(result.intentSuppressed, true);
    assert.equal(result.negations.length, 1);
    assert.equal(result.negations[0].exception, "salvo que");
    assert.ok(result.negations[0].scopeEnd < result.negations[0].exceptionStart);
});

test("una excepción no niega por sí sola una pregunta positiva", () => {
    const result = semanticAnalyzer.analyze(
        "¿Quiénes son las autoridades, salvo que hayan cambiado?"
    );
    assert.equal(result.polarity, "conditional");
    assert.equal(result.intentSuppressed, false);
    assert.equal(result.domain, "institucional");
});

test("resuelve una referencia breve usando la pregunta anterior", () => {
    const result = semanticAnalyzer.analyze("¿Y cuándo fue?", {
        previousQuestion: "¿Cómo se creó el Círculo de Legisladores?"
    });
    assert.equal(result.contextResolution.resolved, true);
    assert.equal(result.contextResolution.source, "previousQuestion");
    assert.ok(result.contextResolution.antecedents.includes("creación del círculo"));
    assert.equal(result.domain, "institucional");
});

test("no inventa un antecedente cuando no hay contexto", () => {
    const result = semanticAnalyzer.analyze("¿Y cuándo fue?");
    assert.equal(result.contextResolution.resolved, false);
    assert.equal(result.domain, "indeterminado");
});

test("el Kernel acepta contexto opcional sin cambiar la llamada anterior", () => {
    const withoutContext = kernel.process("¿Y cuándo fue?");
    const withContext = kernel.process("¿Y cuándo fue?", {
        previousQuestion: "¿Cómo se creó el Círculo de Legisladores?"
    });
    assert.equal(withoutContext.estado, "fuera_de_dominio");
    assert.equal(withContext.estado, "aceptada");
    assert.equal(withContext.resolucion_contexto.resuelto, undefined);
    assert.equal(withContext.resolucion_contexto.resolved, true);
});

for (const { name, callback } of tests) {
    try {
        callback();
        passed += 1;
        console.log("PASS " + name);
    } catch (error) {
        console.error("FAIL " + name);
        console.error(error);
        process.exitCode = 1;
    }
}

if (process.exitCode !== 1) {
    console.log("\nSEMANTIC ANALYZER: " + passed + "/" + tests.length + " pruebas aprobadas.");
}
