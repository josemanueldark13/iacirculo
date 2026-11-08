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

const NEGATIVE_REQUEST = /\bno\s+(?:quiero|necesito|busco|solicito|deseo|pido|requiero|me interesa)\b/;
const EXCEPTION_MARKERS = ["salvo que", "excepto si", "a menos que"];
const FOLLOW_UP = /^(?:y\s+)?(?:cuando|donde|quien|como|cual|cuanto|que)\b|^(?:y\s+)?(?:eso|esto|ese|esa|aquello|alli|ahi|lo anterior|la anterior)\b/;

function normalize(text) {
    return String(text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function extractMatches(normalized) {
    const coreMatches = CORE_CONCEPTS.filter(concept => normalized.includes(normalize(concept)));
    const intentMatches = INTENT_CONCEPTS.filter(concept => normalized.includes(normalize(concept)));
    const aliasMatches = Object.entries(CONCEPT_ALIASES)
        .filter(([alias]) => normalized.includes(alias))
        .map(([, canonical]) => canonical);

    return {
        coreMatches,
        intentMatches,
        aliasMatches,
        matches: [...new Set([...coreMatches, ...intentMatches, ...aliasMatches])],
        effectiveCoreMatches: [...new Set([...coreMatches, ...aliasMatches])]
    };
}

function previousConcepts(context) {
    const supplied = context?.previousAnalysis?.concepts
        || context?.previousAnalysis?.conceptos_detectados
        || context?.concepts;

    if (Array.isArray(supplied)) {
        return supplied.filter(value => typeof value === "string" && value.trim());
    }

    const previousQuestion = context?.previousQuestion || context?.lastQuestion;
    if (typeof previousQuestion !== "string" || !previousQuestion.trim()) return [];

    const extracted = extractMatches(normalize(previousQuestion));
    return [...new Set([...extracted.effectiveCoreMatches, ...extracted.intentMatches])];
}

function resolveReference(normalized, context) {
    if (!FOLLOW_UP.test(normalized)) {
        return { resolved: false, antecedents: [], source: null, expression: null };
    }

    const antecedents = previousConcepts(context);
    if (antecedents.length === 0) {
        return { resolved: false, antecedents: [], source: null, expression: normalized };
    }

    return {
        resolved: true,
        antecedents,
        source: context?.previousAnalysis ? "previousAnalysis" : "previousQuestion",
        expression: normalized
    };
}

function analyze(question, context = {}) {
    const normalized = normalize(question);
    const current = extractMatches(normalized);
    const referenceResolution = resolveReference(normalized, context);

    const negativeMatch = NEGATIVE_REQUEST.exec(normalized);
    const exception = EXCEPTION_MARKERS
        .map(marker => ({ marker, index: normalized.indexOf(marker) }))
        .filter(item => item.index >= 0)
        .sort((a, b) => a.index - b.index)[0] || null;

    const clauseBoundary = normalized.search(/\b(?:pero|sino|aunque)\b/);
    const hasPositiveContinuation = clauseBoundary >= 0
        && extractMatches(normalized.slice(clauseBoundary)).matches.length > 0;

    const intentSuppressed = Boolean(negativeMatch) && !hasPositiveContinuation;
    const polarity = negativeMatch
        ? (hasPositiveContinuation
            ? "mixed"
            : (exception && exception.index > negativeMatch.index ? "conditional" : "negative"))
        : (exception ? "conditional" : "positive");

    const scopeBoundaries = [
        exception && exception.index > (negativeMatch?.index ?? -1) ? exception.index : null,
        clauseBoundary >= 0 ? clauseBoundary : null
    ].filter(value => value !== null);
    const negationScopeEnd = scopeBoundaries.length > 0
        ? Math.min(...scopeBoundaries)
        : normalized.length;

    const negations = negativeMatch ? [{
        cue: "no",
        construction: normalized.slice(negativeMatch.index, negativeMatch.index + negativeMatch[0].length),
        scopeStart: negativeMatch.index + negativeMatch[0].length,
        scopeEnd: negationScopeEnd,
        exception: exception && exception.index > negativeMatch.index ? exception.marker : null,
        exceptionStart: exception && exception.index > negativeMatch.index ? exception.index : null
    }] : [];

    const contextMatches = referenceResolution.resolved ? referenceResolution.antecedents : [];
    const matches = [...new Set([...current.matches, ...contextMatches])];
    const effectiveCoreMatches = [...new Set([
        ...current.effectiveCoreMatches,
        ...(referenceResolution.resolved ? contextMatches : [])
    ])];

    let score = 0;

    if (effectiveCoreMatches.includes("círculo ia")) score = 0.80;
    else if (
        effectiveCoreMatches.includes("círculo de legisladores")
        || effectiveCoreMatches.includes("círculo de ex legisladores")
        || effectiveCoreMatches.includes("círculos de legisladores")
    ) score = 0.65;
    else if (effectiveCoreMatches.length > 0) {
        score = 0.55 + Math.min(0.20, (effectiveCoreMatches.length - 1) * 0.08);
    } else if (current.intentMatches.length > 0) {
        score = Math.min(0.65, 0.52 + (current.intentMatches.length - 1) * 0.06);
    }

    const uiInstitutionalIntents = [
        "historia institucional", "ubicación", "misión", "actividades",
        "ley", "quiénes somos", "cómo funciona"
    ];

    if (uiInstitutionalIntents.some(intent => effectiveCoreMatches.includes(intent))) {
        score = Math.max(score, 0.60);
    }
    if (normalized.includes("historia legislativa") && normalized.includes("tucuman")) {
        score = Math.max(score, 0.62);
    }
    if (normalized.includes("investigador") && (normalized.includes("historia") || normalized.includes("fuentes"))) {
        score = Math.max(score, 0.52);
    }

    // Una negativa explícita no debe convertirse en una consulta institucional
    // solo porque mencione autoridades, leyes, sedes u otros conceptos.
    if (intentSuppressed) score = 0;

    score = Math.min(1, Number(score.toFixed(2)));
    const domain = score >= 0.50
        ? "institucional"
        : score >= 0.30
            ? "ambiguo"
            : "indeterminado";

    return {
        question,
        domain,
        confidence: score,
        concepts: matches,
        polarity,
        intentSuppressed,
        negations,
        contextResolution: referenceResolution
    };
}

module.exports = { analyze, normalize };
