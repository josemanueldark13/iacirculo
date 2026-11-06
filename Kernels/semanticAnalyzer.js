const CORE_CONCEPTS = [
    "círculo ia", "círculo de legisladores", "círculo de ex legisladores", "círculos de legisladores",
    "legisladores", "ex legisladores", "legislatura", "tucumán", "institución", "historia",
    "historia institucional", "historia legislativa", "autoridades", "biblioteca", "publicaciones",
    "actividades", "patrimonio", "decreto", "ley", "resolución", "acta", "estatuto",
    "creación del círculo", "creado", "fundación", "fecha de creación", "misión", "ubicación",
    "contacto", "memoria legislativa", "memoria institucional"
];

const INTENT_CONCEPTS = [
    "nombre completo", "cómo se llama", "como se llama", "dónde funciona", "donde funciona", "dónde queda", "donde queda",
    "dónde está ubicado", "donde esta ubicado", "dónde está ubicada", "donde esta ubicada", "dirección institucional", "direccion institucional",
    "dirección", "direccion", "sede", "ubicación", "ubicacion", "contacto", "quién dirige", "quien dirige", "quién preside", "quien preside",
    "presidente", "vicepresidencia", "vicepresidente", "estructura de autoridades", "quiénes son las autoridades", "quienes son las autoridades",
    "quiénes somos", "quienes somos", "finalidad", "para qué existe", "para que existe", "qué hace", "que hace", "propósito", "proposito",
    "misión", "mision", "motivo de la creación", "motivo de la creacion", "función", "funcion", "cómo funciona", "como funciona",
    "actividades", "materiales", "documentación histórica", "documentacion historica", "patrimonio documental", "preservación", "preservacion",
    "conservación", "conservacion", "investigadores", "fuentes adicionales", "fuentes oficiales", "continuidad institucional", "qué decreto", "que decreto",
    "de qué fecha", "de que fecha"
];

const CONCEPT_ALIASES = {
    "como se creo el circulo de legisladores": "creación del círculo",
    "como se creo el circulo": "creación del círculo",
    "como fue creado el circulo": "creación del círculo",
    "como se fundo el circulo": "fundación",
    "cual es la historia del circulo": "historia institucional",
    "cual es la historia del circulo de legisladores": "historia institucional",
    "quienes somos": "quiénes somos",
    "quienes somos en el circulo": "quiénes somos",
    "como funciona circulo ia": "cómo funciona",
    "como funciona el circulo ia": "cómo funciona",
    "donde esta el circulo": "dónde queda",
    "donde esta ubicado": "ubicación",
    "donde esta ubicada": "ubicación",
    "donde esta ubicado el circulo": "ubicación",
    "donde esta ubicada la institucion": "ubicación",
    "cual es la direccion del circulo": "dirección",
    "cual es la finalidad del circulo": "finalidad",
    "cual es el proposito del circulo": "propósito",
    "cual es la mision": "misión",
    "cual es la mision del circulo": "misión",
    "que actividades realiza": "actividades",
    "que actividades realiza el circulo": "actividades",
    "que hace el circulo": "función",
    "que establece la ley 6333": "ley",
    "que dice la ley 6333": "ley",
    "quienes integran las autoridades": "quiénes son las autoridades",
    "que decreto reconoce al circulo": "qué decreto"
};

function normalize(text) {
    return String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
}

function analyze(question) {
    const normalized = normalize(question);
    const coreMatches = CORE_CONCEPTS.filter(concept => normalized.includes(normalize(concept)));
    const intentMatches = INTENT_CONCEPTS.filter(concept => normalized.includes(normalize(concept)));
    const aliasMatches = Object.entries(CONCEPT_ALIASES).filter(([alias]) => normalized.includes(alias)).map(([, canonical]) => canonical);
    const matches = [...new Set([...coreMatches, ...intentMatches, ...aliasMatches])];
    const effectiveCoreMatches = [...new Set([...coreMatches, ...aliasMatches])];
    let score = 0;

    if (effectiveCoreMatches.includes("círculo ia")) score = 0.80;
    else if (effectiveCoreMatches.includes("círculo de legisladores") || effectiveCoreMatches.includes("círculo de ex legisladores") || effectiveCoreMatches.includes("círculos de legisladores")) score = 0.65;
    else if (effectiveCoreMatches.length > 0) score = 0.55 + Math.min(0.20, (effectiveCoreMatches.length - 1) * 0.08);
    else if (intentMatches.length > 0) score = Math.min(0.65, 0.52 + (intentMatches.length - 1) * 0.06);

    const uiInstitutionalIntents = ["historia institucional", "ubicación", "misión", "actividades", "ley", "quiénes somos", "cómo funciona"];
    if (uiInstitutionalIntents.some(intent => effectiveCoreMatches.includes(intent))) score = Math.max(score, 0.60);
    if (normalized.includes("historia legislativa") && normalized.includes("tucuman")) score = Math.max(score, 0.62);
    if (normalized.includes("investigador") && (normalized.includes("historia") || normalized.includes("fuentes"))) score = Math.max(score, 0.52);

    score = Math.min(1, Number(score.toFixed(2)));
    const domain = score >= 0.50 ? "institucional" : score >= 0.30 ? "ambiguo" : "indeterminado";
    return { question, domain, confidence: score, concepts: matches };
}

// Capa pragmática compatible con Semantic Frame 0.3.1.
// La salida legacy de analyze() se conserva para no alterar el Kernel existente.
function analyzeFrame(input = {}) {
    const text = typeof input === "string" ? input : String(input.text ?? input.originalText ?? "");
    const context = Array.isArray(input.conversationContext) ? input.conversationContext : [];
    const normalized = normalize(text);
    const contextText = normalize(context.map(item => item && typeof item.content === "string" ? item.content : "").join(" "));
    const combined = [contextText, normalized].filter(Boolean).join(" ");
    const legacy = analyze(text);

    const affection = /\b(te amo|te quiero|chango|culiado|culia|querido|genio)\b/.test(normalized);
    const selfDeprecation = /\b(que boludo soy|que estupido soy|soy un idiota|que tonto soy)\b/.test(normalized);
    const ambiguousCommand = /\b(arregla eso|arregla esto|arregla|soluciona eso|hace eso|hace lo)\b/.test(normalized);
    const ironicCue = /\b(justo lo que necesitaba|en la gloria|que maravilla|que suerte|espectacular)\b/.test(normalized);
    const negativeContext = /\b(rompio|rompio|problema|mala noticia|perjudica|perjuicio|aumento|suba|subieron|precios|perdida|fallo|demora)\b/.test(combined);
    const pragmaticMismatch = ironicCue && negativeContext;
    const economic = /\b(aumento|precios|presupuesto|gobierno|inflacion|salario|sueldo|economia)\b/.test(combined);
    const technology = /\b(ia|codigo|programa|software|computadora|sistema|analizador|servidor)\b/.test(normalized);

    let intent = "general_statement";
    if (affection) intent = "affectionate_statement";
    else if (selfDeprecation) intent = "self_deprecating_statement";
    else if (ambiguousCommand) intent = "underspecified_instruction";
    else if (/\?$/.test(text.trim()) || /\b(que|quien|cuando|donde|como|cual)\b/.test(normalized)) intent = "information_request";
    else if (pragmaticMismatch) intent = "ironic_critical_statement";

    let domain = legacy.domain;
    let domainConfidence = legacy.confidence;
    if (economic) { domain = "economy"; domainConfidence = 0.88; }
    else if (technology) { domain = "technology"; domainConfidence = 0.90; }
    else if (affection || selfDeprecation) { domain = "social_interaction"; domainConfidence = 0.86; }
    else if (domain === "indeterminado" && ambiguousCommand) { domain = "general"; domainConfidence = 0.45; }

    const tone = pragmaticMismatch ? "ironic sarcastic critical" :
        affection ? "affectionate colloquial" :
        selfDeprecation ? "self-deprecating humorous colloquial" :
        ambiguousCommand ? "directive underspecified" : "neutral";
    const paraphrase = pragmaticMismatch
        ? (economic ? "ironía y crítica por el perjuicio de los aumentos de precios sobre el presupuesto" : "ironía ante una situación inoportuna y otra mala noticia")
        : affection ? "expresa cariño, afecto, confianza y cercanía en registro coloquial"
        : selfDeprecation ? "autocrítica coloquial posiblemente humorística o irónica"
        : ambiguousCommand ? "instrucción de reparación sin identificar qué elemento debe modificarse"
        : text.trim() || "entrada vacía";

    const ambiguityDetected = ambiguousCommand || (!text.trim());
    const confidence = value => Number(Math.max(0, Math.min(1, value)).toFixed(2));
    const frame = {
        originalText: text,
        normalizedText: normalized,
        language: "es",
        languageConfidence: 0.98,
        intent,
        intentConfidence: confidence(pragmaticMismatch ? 0.91 : affection || selfDeprecation ? 0.88 : ambiguousCommand ? 0.93 : 0.72),
        domain,
        domainConfidence: confidence(domainConfidence || 0.35),
        paraphrase,
        paraphraseNote: pragmaticMismatch ? "Interpretación pragmática basada en el contraste entre la expresión positiva literal y el contexto negativo." : "Paráfrasis orientativa basada en señales léxicas y contexto disponible.",
        paraphraseConfidence: confidence(pragmaticMismatch ? 0.86 : affection || selfDeprecation ? 0.84 : ambiguousCommand ? 0.82 : 0.65),
        entities: [],
        topics: economic ? ["economía", "precios", "presupuesto"] : technology ? ["tecnología", "software"] : affection ? ["interacción social", "afecto"] : [],
        sentiment: pragmaticMismatch || economic ? "negative" : affection ? "positive" : "neutral",
        tone,
        register: /\b(chango|culiado|boludo|boludo|culia)\b/.test(normalized) ? "colloquial informal argentino" : "neutral",
        ambiguity: { detected: ambiguityDetected, reason: ambiguousCommand ? "La referencia 'eso' no identifica el objeto de la acción." : ambiguityDetected ? "No hay texto suficiente para interpretar la entrada." : "No se detecta ambigüedad relevante." },
        context: { supplied: context.length > 0, turns: context.length, relevantContextDetected: negativeContext },
        responseMode: ambiguityDetected ? "GUIDED" : "DIRECT",
        modeReason: ambiguityDetected ? "Falta información para identificar el objeto de la instrucción." : pragmaticMismatch ? "La intención requiere interpretar ironía y contexto." : "La intención puede atenderse directamente.",
        risk: "low",
        routing: { domain, destination: ambiguityDetected ? "clarification" : "response" },
        signals: { pragmaticMismatch, literalIntendedMismatch: pragmaticMismatch, affectionateLanguage: affection, selfDeprecation, underspecifiedInstruction: ambiguousCommand },
        analyzerVersion: "0.3.1"
    };
    return frame;
}

module.exports = { analyze, analyzeFrame, normalize };
