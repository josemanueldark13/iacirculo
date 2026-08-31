/**
 * AXIAL KERNEL
 * Semantic Analyzer
 *
 * Determina si una consulta pertenece al dominio
 * institucional de CÍRCULO IA.
 */

const DOMAIN_CONCEPTS = [
    "círculo ia",
    "círculo de legisladores",
    "círculo de ex legisladores",
    "legisladores",
    "ex legisladores",
    "legislatura",
    "tucumán",
    "institución",
    "historia institucional",
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
    "fecha de creación"
];

const STRONG_CONCEPTS = [
    "círculo ia",
    "círculo de legisladores",
    "círculo de ex legisladores"
];

function normalize(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function analyze(question) {

    const normalized = normalize(question);

    const matches = DOMAIN_CONCEPTS.filter(concept =>
        normalized.includes(normalize(concept))
    );

    let score = 0;

    // Conceptos institucionales centrales
    if (matches.includes("círculo ia")) {
        score = 0.70;
    } else if (
        matches.includes("círculo de legisladores") ||
        matches.includes("círculo de ex legisladores")
    ) {
        score = 0.60;
    } else if (matches.length > 0) {
        score = Math.min(1, matches.length * 0.18);
    }

    // Conceptos adicionales aumentan la confianza
    if (score > 0 && matches.length > 1) {
        score += Math.min(0.20, (matches.length - 1) * 0.08);
    }

    score = Math.min(1, score);

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
        confidence: Number(score.toFixed(2)),
        concepts: matches
    };
}

module.exports = {
    analyze
};
