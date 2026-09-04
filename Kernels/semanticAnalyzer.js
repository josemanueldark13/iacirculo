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
    "círculos de legisladores",
    "círculos de ex legisladores",
    "círculo",
    "legisladores",
    "ex legisladores",
    "legislatura",
    "historia legislativa",
    "tucumán",
    "institución",
    "historia institucional",
    "autoridades",
    "presidente",
    "presidencia",
    "vicepresidente",
    "vicepresidencia",
    "secretario",
    "secretaría",
    "biblioteca",
    "publicaciones",
    "actividades",
    "patrimonio",
    "documentación histórica",
    "memoria legislativa",
    "memoria institucional",
    "decreto",
    "ley",
    "resolución",
    "acta",
    "estatuto",
    "creación del círculo",
    "creación",
    "creado",
    "fundación",
    "fecha de creación",
    "nombre completo",
    "sede",
    "dirección institucional",
    "domicilio"
];

const STRONG_CONCEPTS = [
    "círculo ia",
    "círculo de legisladores",
    "círculo de ex legisladores",
    "círculos de legisladores",
    "círculos de ex legisladores"
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

    // Identidad institucional explícita: máxima confianza.
    if (matches.some(match => STRONG_CONCEPTS.includes(match))) {
        score = 0.70;
    } else if (matches.length > 0) {
        // Cualquier concepto institucional específico es suficiente
        // para mantener la consulta dentro del dominio del agente.
        score = 0.50;
    }

    // Conceptos adicionales aumentan la confianza.
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
