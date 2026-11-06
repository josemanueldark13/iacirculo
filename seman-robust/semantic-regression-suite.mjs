/**
 * Semantic regression cases for Semantic Frame 0.3.1.
 * These cases describe expected behavior; they do not implement the analyzer.
 */

export const semanticRegressionCases = [
  {
    id: "SEM-001",
    input: { text: "te amo chango culiado" },
    expect: {
      intentAnyOf: ["affectionate_statement", "social_affection", "affectionate_interaction"],
      domainAnyOf: ["social_interaction", "conversation"],
      paraphraseConceptsAnyOf: ["cariño", "afecto", "confianza", "cercanía"],
      avoidFalseAmbiguity: true
    }
  },
  {
    id: "SEM-002",
    input: { text: "la IA analiza el código" },
    expect: {
      domainAnyOf: ["technology", "software", "computing"],
      minDomainConfidence: 0.85
    }
  },
  {
    id: "SEM-003",
    input: { text: "qué boludo soy" },
    expect: {
      registerConceptsAnyOf: ["colloquial", "informal", "coloquial"],
      paraphraseConceptsAnyOf: ["autocrítica", "broma", "ironía", "descalificación propia"]
    }
  },
  {
    id: "SEM-004",
    input: { text: "arreglá eso" },
    expect: {
      responseMode: "GUIDED",
      ambiguityExpected: true
    }
  },
  {
    id: "SEM-005",
    input: {
      text: "claro, justo lo que necesitaba hoy",
      conversationContext: [
        { role: "user", content: "Se me rompió la computadora antes de entregar el trabajo." },
        { role: "user", content: "Y ahora recibí otra mala noticia." }
      ]
    },
    expect: {
      toneConceptsAnyOf: ["ironic", "sarcastic", "irónico", "sarcástico"],
      paraphraseConceptsAnyOf: ["inoportuno", "molestia", "contrario", "mala noticia", "ironía"],
      pragmaticMismatchExpected: true
    }
  },
  {
    id: "SEM-006",
    input: {
      text: "otro aumento más que nos deja en la gloria",
      conversationContext: [
        { role: "user", content: "El gobierno anunció otro aumento de precios y eso perjudica nuestro presupuesto." }
      ]
    },
    expect: {
      domainAnyOf: ["economy", "social", "politics", "social_interaction"],
      toneConceptsAnyOf: ["ironic", "sarcastic", "critical", "irónico", "sarcástico", "crítico"],
      paraphraseConceptsAnyOf: ["precios", "perjuicio", "crítica", "sátira", "ironía", "presupuesto"],
      pragmaticMismatchExpected: true
    }
  }
];

export function includesAny(value, candidates) {
  if (typeof value !== "string") return false;
  const normalized = value.toLocaleLowerCase();
  return candidates.some(candidate => normalized.includes(candidate.toLocaleLowerCase()));
}

export function safeString(value) {
  return typeof value === "string" ? value : "";
}

export function evaluateRegressionCase(testCase, frame) {
  const failures = [];
  const expected = testCase.expect ?? {};
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
    return { id: testCase.id, passed: false, failures: ["Semantic Frame ausente o inválido"] };
  }

  if (expected.intentAnyOf && !expected.intentAnyOf.includes(frame.intent)) {
    failures.push(`intent: esperado uno de ${expected.intentAnyOf.join(", ")}; recibido ${String(frame.intent)}`);
  }
  if (expected.domainAnyOf && !expected.domainAnyOf.includes(frame.domain)) {
    failures.push(`domain: esperado uno de ${expected.domainAnyOf.join(", ")}; recibido ${String(frame.domain)}`);
  }
  if (Number.isFinite(expected.minDomainConfidence) &&
      !(Number.isFinite(frame.domainConfidence) && frame.domainConfidence >= expected.minDomainConfidence)) {
    failures.push(`domainConfidence: se esperaba >= ${expected.minDomainConfidence}`);
  }
  if (expected.responseMode && frame.responseMode !== expected.responseMode) {
    failures.push(`responseMode: esperado ${expected.responseMode}; recibido ${String(frame.responseMode)}`);
  }
  if (expected.registerConceptsAnyOf &&
      !includesAny(safeString(frame.register), expected.registerConceptsAnyOf)) {
    failures.push("register: falta una señal de registro coloquial/informal");
  }
  if (expected.toneConceptsAnyOf &&
      !includesAny(safeString(frame.tone), expected.toneConceptsAnyOf)) {
    failures.push("tone: falta una señal tonal esperada");
  }
  if (expected.paraphraseConceptsAnyOf &&
      !includesAny(safeString(frame.paraphrase), expected.paraphraseConceptsAnyOf)) {
    failures.push("paraphrase: falta una paráfrasis que capture la intención esperada");
  }
  if (expected.ambiguityExpected === true) {
    if (!frame.ambiguity || typeof frame.ambiguity !== "object" || frame.ambiguity.detected !== true) {
      failures.push("ambiguity.detected: se esperaba true");
    }
  }
  if (expected.avoidFalseAmbiguity === true &&
      frame.ambiguity && typeof frame.ambiguity === "object" &&
      frame.ambiguity.detected === true) {
    failures.push("ambiguity.detected: no se esperaba ambigüedad falsa");
  }
  if (expected.pragmaticMismatchExpected === true) {
    const signals = frame.signals && typeof frame.signals === "object" ? frame.signals : {};
    const ambiguity = frame.ambiguity && typeof frame.ambiguity === "object" ? frame.ambiguity : {};
    const pragmatic = signals.pragmaticMismatch ?? signals.literalIntendedMismatch ??
      frame.pragmaticMismatch ?? ambiguity.pragmaticMismatch;
    if (pragmatic !== true && !includesAny(safeString(frame.paraphrase), ["ironía", "irónico", "sarcástico", "sarcasmo"])) {
      failures.push("pragmatics: no hay evidencia de discrepancia pragmática ni explicación irónica en paraphrase");
    }
  }

  return { id: testCase.id, passed: failures.length === 0, failures };
}

export async function runSemanticRegression(analyzer) {
  if (typeof analyzer !== "function") throw new TypeError("analyzer debe ser una función");
  const results = [];
  for (const testCase of semanticRegressionCases) {
    try {
      const frame = await analyzer(testCase.input);
      results.push(evaluateRegressionCase(testCase, frame));
    } catch (error) {
      results.push({
        id: testCase.id,
        passed: false,
        failures: [`error de ejecución: ${error instanceof Error ? error.message : String(error)}`]
      });
    }
  }
  return {
    passed: results.every(result => result.passed),
    total: results.length,
    passedCount: results.filter(result => result.passed).length,
    failedCount: results.filter(result => !result.passed).length,
    results
  };
}
