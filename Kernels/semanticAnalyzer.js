/**
 * AXIAL KERNEL
 * Semantic Analyzer
 *
 * Determina si una consulta pertenece al dominio
 * institucional de CÍRCULO IA.
 */

const CORE_CONCEPTS = [
    "círculo ia",
    "círculo de legisladores",
    "círculo de ex legisladores",
    "círculos de legisladores",
    "legisladores",
    "ex legisladores",
    "legislatura",
    "tucumán",
    "institución",
    "historia",
    "historia institucional",
    "historia legislativa",
    "autoridades",
    "biblioteca",
    "publicaciones",
    "actividades",
    "patrimonio",
    "decreto",
    "ley",
    "resolución",
    "acta",
    "estatuto",
    "creación del círculo",
    "creado",
    "fundación",
    "fecha de creación",
    "misión",
    "ubicación",
    "contacto",
    "memoria legislativa",
    "memoria institucional"
];

const INTENT_CONCEPTS = [
    "nombre completo",
    "cómo se llama",
    "como se llama",
    "dónde funciona",
    "donde funciona",
    "dónde queda",
    "donde queda",
    "dónde está ubicado",
    "donde esta ubicado",
    "dónde está ubicada",
    "donde esta ubicada",
    "dirección institucional",
    "direccion institucional",
    "dirección",
    "direccion",
    "sede",
    "ubicación",
    "ubicacion",
    "contacto",
    "quién dirige",
    "quien dirige",
    "quién preside",
    "quien preside",
    "presidente",
    "vicepresidencia",
    "vicepresidente",
    "estructura de autoridades",
    "quiénes son las autoridades",
    "quienes son las autoridades",
    "finalidad",
    "para qué existe",
    "para que existe",
    "qué hace",
    "que hace",
    "propósito",
    "proposito",
    "misión",
    "mision",
    "motivo de la creación",
    "motivo de la creacion",
    "función",
    "funcion",
    "materiales",
    "documentación histórica",
    "documentacion historica",
    "patrimonio documental",
    "preservación",
    "preservacion",
    "conservación",
    "conservacion",
    "investigadores",
    "fuentes adicionales",
    "fuentes oficiales",
    "continuidad institucional",
    "qué decreto",
    "que decreto",
    "de qué fecha",
    "de que fecha"
];

// Expresiones naturales que deben resolverse al mismo concepto canónico.
const CONCEPT_ALIASES = {
    "como se creo el circulo de legisladores": "creación del círculo",
    "como se creo el circulo": "creación del círculo",
    "como fue creado el circulo": "creación del círculo",
    "como se fundo el circulo": "fundación",
    "cual es la historia del circulo": "historia institucional",
    "cual es la historia del circulo de legisladores": "historia institucional",
    "donde esta el circulo": "dónde queda",
    "donde esta ubicado": "ubicación",
    "donde esta ubicada": "ubicación",
    "donde esta ubicado el circulo": "ubicación",
    "donde esta ubicada la institucion": "ubicación",
    "en que direccion funciona el circulo": "dirección",
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
    return String(text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function analyze(question) {
    const normalized = normalize(question);

    const coreMatches = CORE_CONCEPTS.filter(concept =>
        normalized.includes(normalize(concept))
    );

    const intentMatches = INTENT_CONCEPTS.filter(concept =>
        normalized.includes(normalize(concept))
    );

    const aliasMatches = Object.entries(CONCEPT_ALIASES)
        .filter(([alias]) => normalized.includes(alias))
        .map(([, canonical]) => canonical);

    const matches = [...new Set([...coreMatches, ...intentMatches, ...aliasMatches])];
    const effectiveCoreMatches = [...new Set([...coreMatches, ...aliasMatches])];

    let score = 0;

    if (effectiveCoreMatches.includes("círculo ia")) {
        score = 0.80;
    } else if (
        effectiveCoreMatches.includes("círculo de legisladores") ||
        effectiveCoreMatches.includes("círculo de ex legisladores") ||
        effectiveCoreMatches.includes("círculos de legisladores")
    ) {
        score = 0.65;
    } else if (effectiveCoreMatches.length > 0) {
        score = 0.55;
        score += Math.min(0.20, (effectiveCoreMatches.length - 1) * 0.08);
    } else if (intentMatches.length > 0) {
        score = Math.min(0.65, 0.52 + (intentMatches.length - 1) * 0.06);
    }

    // Consultas institucionales de la interfaz: cuando la intención
    // es inequívoca, no deben caer en "fuera de dominio" aunque
    // el usuario omita el nombre completo de la institución.
    const uiInstitutionalIntents = [
        "historia institucional",
        "ubicación",
        "misión",
        "actividades",
        "ley"
    ];

    if (uiInstitutionalIntents.some(intent => effectiveCoreMatches.includes(intent))) {
        score = Math.max(score, 0.60);
    }

    if (
        normalized.includes("historia legislativa") &&
        normalized.includes("tucuman")
    ) {
        score = Math.max(score, 0.62);
    }

    if (
        normalized.includes("investigador") &&
        (normalized.includes("historia") || normalized.includes("fuentes"))
    ) {
        score = Math.max(score, 0.52);
    }

    score = Math.min(1, Number(score.toFixed(2)));

    let domain;

    if (score >= 0.50) {
        domain = "institucional";
    } else if (score >= 0.30) {
        domain = "ambiguo";
    } else {
        domain = "indeterminado";
    }

    return {
        question,
        domain,
        confidence: score,
        concepts: matches
    };
}

module.exports = {
    analyze
};
