import test from "node:test";
import assert from "node:assert/strict";
import { validateSemanticFrame } from "../seman-validator.mjs";

const validFrame = () => ({
  originalText: "hola",
  normalizedText: "hola",
  language: "es",
  languageConfidence: 0.99,
  intent: "greeting",
  intentConfidence: 0.9,
  domain: "social_interaction",
  domainConfidence: 0.9,
  paraphrase: "saludo",
  paraphraseNote: "saludo directo",
  paraphraseConfidence: 0.9,
  entities: [],
  topics: [],
  sentiment: "neutral",
  tone: "friendly",
  register: "colloquial",
  ambiguity: { detected: false },
  context: {},
  responseMode: "DIRECT",
  modeReason: "intención clara",
  risk: "low",
  routing: {},
  signals: {},
  analyzerVersion: "0.3.1"
});

test("acepta un Semantic Frame 0.3.1 estructuralmente completo", () => {
  assert.equal(validateSemanticFrame(validFrame()).valid, true);
});

test("acumula errores cuando faltan campos y no lanza excepciones", () => {
  const result = validateSemanticFrame({ originalText: "hola" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 1);
});

test("rechaza confianzas fuera de rango y valores no finitos", () => {
  const frame = validFrame();
  frame.intentConfidence = 1.4;
  frame.domainConfidence = Number.NaN;
  const result = validateSemanticFrame(frame);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.path.endsWith(".intentConfidence")));
  assert.ok(result.errors.some(error => error.path.endsWith(".domainConfidence")));
});

test("resuelve wrappers admitidos", () => {
  const result = validateSemanticFrame({ result: { data: validFrame() } });
  assert.equal(result.valid, true);
  assert.equal(result.framePath, "$.result.data");
});
