/**
 * AXIAL KERNEL
 * Semantic Analyzer
 *
 * Primera función:
 * determinar si una consulta pertenece al dominio
 * institucional de CÍRCULO IA.
 */

const DOMAIN_CONCEPTS = [
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

    if (matches.length > 0) {
        score = Math.min(1, matches.length * 0.18);
    }

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