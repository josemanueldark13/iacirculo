/**
 * Structural validator for Semantic Frame 0.3.1.
 * Deliberately avoids inventing nested schemas not yet confirmed by the engine.
 */

export const REQUIRED_FIELDS = [
  "originalText", "normalizedText", "language", "languageConfidence",
  "intent", "intentConfidence", "domain", "domainConfidence",
  "paraphrase", "paraphraseNote", "paraphraseConfidence",
  "entities", "topics", "sentiment", "tone", "register", "ambiguity",
  "context", "responseMode", "modeReason", "risk", "routing", "signals",
  "analyzerVersion"
];

const CONFIDENCE_FIELDS = ["languageConfidence", "intentConfidence", "domainConfidence", "paraphraseConfidence"];
const STRING_FIELDS = [
  "originalText", "normalizedText", "language", "intent", "domain",
  "paraphrase", "paraphraseNote", "sentiment", "tone", "register",
  "responseMode", "modeReason", "analyzerVersion"
];
const OBJECT_FIELDS = ["ambiguity", "context", "routing", "signals"];
const ARRAY_FIELDS = ["entities", "topics"];

export function resolveSemanticFrame(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { frame: null, path: "$", error: "La respuesta no es un objeto" };
  }
  const candidates = [
    ["$", payload],
    ["$.result", payload.result],
    ["$.data", payload.data],
    ["$.result.data", payload.result?.data],
    ["$.data.result", payload.data?.result]
  ];
  for (const [path, value] of candidates) {
    if (value && typeof value === "object" && !Array.isArray(value) &&
        ("originalText" in value || "analyzerVersion" in value)) {
      return { frame: value, path, error: null };
    }
  }
  return { frame: null, path: "$", error: "No se encontró Semantic Frame en los wrappers admitidos" };
}

export function validateSemanticFrame(payload) {
  const resolved = resolveSemanticFrame(payload);
  const errors = [];
  if (!resolved.frame) {
    return { valid: false, framePath: resolved.path, errors: [resolved.error] };
  }

  const frame = resolved.frame;
  for (const field of REQUIRED_FIELDS) {
    if (!(field in frame)) errors.push({ path: `${resolved.path}.${field}`, code: "required", message: "Campo obligatorio ausente" });
  }
  for (const field of STRING_FIELDS) {
    if (field in frame && (typeof frame[field] !== "string" || frame[field].trim() === "")) {
      errors.push({ path: `${resolved.path}.${field}`, code: "type_or_empty", message: "Se esperaba un string no vacío" });
    }
  }
  for (const field of CONFIDENCE_FIELDS) {
    if (field in frame && (!Number.isFinite(frame[field]) || frame[field] < 0 || frame[field] > 1)) {
      errors.push({ path: `${resolved.path}.${field}`, code: "confidence_range", message: "La confianza debe ser un número finito entre 0 y 1" });
    }
  }
  for (const field of OBJECT_FIELDS) {
    if (field in frame && (!frame[field] || typeof frame[field] !== "object" || Array.isArray(frame[field]))) {
      errors.push({ path: `${resolved.path}.${field}`, code: "object_type", message: "Se esperaba un objeto" });
    }
  }
  for (const field of ARRAY_FIELDS) {
    if (field in frame && !Array.isArray(frame[field])) {
      errors.push({ path: `${resolved.path}.${field}`, code: "array_type", message: "Se esperaba un array" });
    }
  }

  const allowed = new Set(REQUIRED_FIELDS);
  for (const field of Object.keys(frame)) {
    if (!allowed.has(field)) {
      errors.push({ path: `${resolved.path}.${field}`, code: "unknown_field", message: "Campo no contemplado por Semantic Frame 0.3.1" });
    }
  }

  return { valid: errors.length === 0, framePath: resolved.path, errors };
}
