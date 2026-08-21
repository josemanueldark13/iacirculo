/**
 * AXIAL KERNEL
 * Response Policy
 *
 * Determina qué tipo de respuesta corresponde
 * según la naturaleza de la pregunta.
 */

function determine(question) {

    const text = question.toLowerCase();

    // HECHOS DOCUMENTALES
    const factTerms = [
        "cuándo",
        "cuando",
        "quién",
        "quien",
        "dónde",
        "donde",
        "qué decreto",
        "que decreto",
        "qué ley",
        "que ley",
        "qué año",
        "que año",
        "cuál",
        "cual"
    ];

    // ANÁLISIS
    const analysisTerms = [
        "por qué",
        "por que",
        "importancia",
        "significado",
        "impacto",
        "influencia",
        "contexto",
        "relación",
        "analizá",
        "analiza",
        "explicá",
        "explica"
    ];

    // OPINIÓN
    const opinionTerms = [
        "qué opinás",
        "que opinas",
        "qué pensás",
        "que pensas",
        "opinión",
        "opinion",
        "te parece",
        "considerás",
        "consideras"
    ];

    // SÍNTESIS
    const synthesisTerms = [
        "resumí",
        "resumi",
        "resumen",
        "síntesis",
        "sintesis",
        "en pocas palabras",
        "brevemente"
    ];

    if (opinionTerms.some(term => text.includes(term))) {
        return "opinion";
    }

    if (analysisTerms.some(term => text.includes(term))) {
        return "analisis";
    }

    if (synthesisTerms.some(term => text.includes(term))) {
        return "sintesis";
    }

    if (factTerms.some(term => text.includes(term))) {
        return "hecho";
    }

    // Por defecto
    return "hecho";
}

module.exports = {
    determine
};