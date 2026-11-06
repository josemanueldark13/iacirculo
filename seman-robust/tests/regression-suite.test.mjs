import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRegressionCase,
  runSemanticRegression,
  semanticRegressionCases
} from "../semantic-regression-suite.mjs";

const frame = overrides => ({
  originalText: "texto",
  normalizedText: "texto",
  language: "es",
  languageConfidence: 0.99,
  intent: "affectionate_statement",
  intentConfidence: 0.9,
  domain: "social_interaction",
  domainConfidence: 0.9,
  paraphrase: "expresa cariño y cercanía",
  paraphraseNote: "lectura contextual",
  paraphraseConfidence: 0.9,
  entities: [],
  topics: [],
  sentiment: "positive",
  tone: "warm",
  register: "colloquial",
  ambiguity: { detected: false },
  context: {},
  responseMode: "DIRECT",
  modeReason: "intención clara",
  risk: "low",
  routing: {},
  signals: {},
  analyzerVersion: "0.3.1",
  ...overrides
});

test("SEM-005 no se aprueba si falta la señal tonal irónica", () => {
  const testCase = semanticRegressionCases.find(item => item.id === "SEM-005");
  const result = evaluateRegressionCase(testCase, frame({
    tone: "neutral",
    paraphrase: "recibió una noticia"
  }));
  assert.equal(result.passed, false);
  assert.ok(result.failures.some(item => item.startsWith("tone:")));
});

test("SEM-006 exige que la paráfrasis capture la crítica contextual", () => {
  const testCase = semanticRegressionCases.find(item => item.id === "SEM-006");
  const result = evaluateRegressionCase(testCase, frame({
    domain: "economy",
    tone: "critical",
    paraphrase: "comentario general"
  }));
  assert.equal(result.passed, false);
  assert.ok(result.failures.some(item => item.startsWith("paraphrase:")));
});

test("la ausencia de ambiguity no provoca una excepción", () => {
  const testCase = semanticRegressionCases.find(item => item.id === "SEM-004");
  const result = evaluateRegressionCase(testCase, frame({
    responseMode: "GUIDED",
    ambiguity: undefined
  }));
  assert.equal(result.passed, false);
  assert.ok(result.failures.some(item => item.includes("ambiguity.detected")));
});

test("la evidencia pragmática explícita satisface el control de discrepancia", () => {
  const testCase = semanticRegressionCases.find(item => item.id === "SEM-005");
  const result = evaluateRegressionCase(testCase, frame({
    tone: "sarcastic",
    paraphrase: "expresa una molestia por otra mala noticia",
    signals: { pragmaticMismatch: true }
  }));
  assert.equal(result.passed, true);
});

test("el runner de suite captura errores del analizador por caso", async () => {
  const report = await runSemanticRegression(async () => {
    throw new Error("fallo simulado");
  });
  assert.equal(report.total, 6);
  assert.equal(report.failedCount, 6);
  assert.equal(report.passed, false);
  assert.ok(report.results.every(item => item.failures[0].includes("fallo simulado")));
});
