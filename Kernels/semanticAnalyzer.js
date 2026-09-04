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
    "memoria legislativa",
    "memoria institucional"
];

const INTENT_CONCEPTS = [
    "nombre completo",
    "dónde funciona",
    "donde funciona",
    "dirección institucional",
    "direccion institucional",
    "dirección",
    "direccion",
    "sede",
    "presidente",
    "vicepresidencia",
    "vicepresidente",
    "estructura de autoridades",
    "finalidad",
    "propósito",
    "proposito",
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

    const matches = [...new Set([...coreMatches, ...intentMatches])];

    let score = 0;

    if (coreMatches.includes("círculo ia")) {
        score = 0.80;
    } else if (
        coreMatches.includes("círculo de legisladores") ||
        coreMatches.includes("círculo de ex legisladores") ||
        coreMatches.includes("círculos de legisladores")
    ) {
        score = 0.65;
    } else if (coreMatches.length > 0) {
        // Un término institucional concreto ya establece un contexto suficiente.
        score = 0.55;
        score += Math.min(0.20, (coreMatches.length - 1) * 0.08);
    } else if (intentMatches.length > 0) {
        // Las intenciones reconocibles se aceptan como consultas del agente;
        // luego el RAG decide qué núcleo documental corresponde.
        score = Math.min(0.65, 0.52 + (intentMatches.length - 1) * 0.06);
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
