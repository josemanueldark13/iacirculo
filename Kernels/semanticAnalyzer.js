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

// Señales de reclamo: se evalúan independientemente del tono del mensaje.
const COMPLAINT_TERMS = [
    "reclamo", "reclamos", "reclamar", "reclamación", "reclamaciones",
    "queja", "quejas", "denuncia", "denuncias", "denunciar",
    "me estafaron", "me cobraron de más", "cobro indebido", "cobro incorrecto", "cobro duplicado",
    "mala atención", "mal servicio", "falta de atención",
    "necesito una solución", "quiero una solución", "solicito una solución",
    "tengo un problema", "problema con", "no me atendieron", "no nos atendieron",
    "me dejaron sin respuesta", "sin respuesta", "no recibo respuesta", "no recibimos respuesta"
];

// Solo se registran insultos directos. Las críticas o acusaciones no se consideran insulto por sí mismas.
const INSULT_TERMS = [
    "inútil", "inútiles", "idiota", "idiotas", "imbécil", "imbéciles",
    "estúpido", "estúpida", "estúpidos", "estúpidas",
    "tarado", "tarada", "tarados", "taradas",
    "pelotudo", "pelotuda", "pelotudos", "pelotudas",
    "boludo", "boluda", "boludos", "boludas",
    "forro", "forra", "forros", "forras", "hijo de puta", "hijos de puta", "hdp"
];

function normalize(text) {
    return String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
}

function findPhraseMatches(normalizedText, terms) {
    const paddedText = " " + normalizedText + " ";
    return terms.filter(term => paddedText.includes(" " + normalize(term) + " "));
}

function detectComplaintPatterns(normalizedText) {
    const matches = [];

    if (/\b(no me|no nos|nadie)\s+(respondio|respondieron|responde|responden|atiende|atienden|atendio|atendieron|soluciona|solucionan|soluciono|solucionaron|resuelve|resuelven|resolvio|resolvieron)\b/.test(normalizedText)) {
        matches.push("falta de respuesta o solución");
    }

    if (/\b(llevo|llevamos|hace)\s+(ya\s+)?\d+\s+(dias?|semanas?|meses?)\b/.test(normalizedText) &&
        /\b(espero|esperando|aguardo|sin respuesta|respuesta|solucion)\b/.test(normalizedText)) {
        matches.push("demora sin respuesta");
    }

    if (/\b(nunca|todavia|aun)\s+(me\s+)?(respondieron|responden|atendieron|solucionaron)\b/.test(normalizedText)) {
        matches.push("atención o respuesta pendiente");
    }

    return matches;
}

function isInformationalComplaintQuestion(normalizedText) {
    return /^(que es|que significa|definicion de)\s+(un|una|el|la)?\s*(reclamo|queja|denuncia)\b/.test(normalizedText);
}

function analyze(question) {
    const normalized = normalize(question);
    const coreMatches = CORE_CONCEPTS.filter(concept => normalized.includes(normalize(concept)));
    const intentMatches = INTENT_CONCEPTS.filter(concept => normalized.includes(normalize(concept)));
    const aliasMatches = Object.entries(CONCEPT_ALIASES).filter(([alias]) => normalized.includes(alias)).map(([, canonical]) => canonical);
    const complaintTermMatches = findPhraseMatches(normalized, COMPLAINT_TERMS);
    const complaintPatternMatches = detectComplaintPatterns(normalized);
    const insultMatches = findPhraseMatches(normalized, INSULT_TERMS);
    const informationalComplaintQuestion = isInformationalComplaintQuestion(normalized);

    const containsComplaint = !informationalComplaintQuestion &&
        (complaintTermMatches.length > 0 || complaintPatternMatches.length > 0);
    const containsInsult = insultMatches.length > 0;

    // La intención de reclamar prevalece sobre el tono ofensivo.
    const classification = containsComplaint ? "reclamo" : containsInsult ? "insulto" : "consulta";
    const priority = containsComplaint ? "alta" : containsInsult ? "baja" : "normal";
    const priorityScore = containsComplaint ? 90 : containsInsult ? 20 : 50;

    const matches = [...new Set([...coreMatches, ...intentMatches, ...aliasMatches])];
    if (containsComplaint) matches.push("reclamo ciudadano");

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

    // El reclamo se reconoce como asunto de atención institucional aunque incluya insultos.
    if (containsComplaint) score = Math.max(score, 0.72);

    score = Math.min(1, Number(score.toFixed(2)));
    const domain = score >= 0.50 ? "institucional" : score >= 0.30 ? "ambiguo" : "indeterminado";

    return {
        question,
        domain,
        confidence: score,
        concepts: [...new Set(matches)],
        classification,
        priority,
        priorityScore,
        containsComplaint,
        containsInsult,
        requiresHumanReview: containsComplaint,
        complaintSignals: [...complaintTermMatches, ...complaintPatternMatches],
        insultSignals: insultMatches
    };
}

module.exports = { analyze };
