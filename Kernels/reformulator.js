/**
 * AXIAL KERNEL
 * Reformulator
 *
 * Ayuda al usuario cuando el Kernel no comprende
 * suficientemente la consulta.
 *
 * V0.1:
 * utiliza conceptos conocidos del dominio.
 *
 * Más adelante:
 * embeddings + búsqueda semántica real.
 */

const DOMAIN_CONCEPTS = [
    "historia institucional",
    "creación del Círculo",
    "ex legisladores",
    "legisladores provinciales",
    "autoridades",
    "actividades",
    "biblioteca",
    "publicaciones",
    "patrimonio",
    "decretos",
    "leyes",
    "resoluciones",
    "actas",
    "estatuto"
];

function normalize(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function suggest(question, limit = 5) {

    const normalized = normalize(question);

    const suggestions = DOMAIN_CONCEPTS
        .map(concept => {

            const words = normalize(concept)
                .split(/\s+/);

            let score = 0;

            words.forEach(word => {
                if (normalized.includes(word)) {
                    score++;
                }
            });

            return {
                concept,
                score
            };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.concept);

    // Si no encontró coincidencias,
    // ofrecemos conceptos generales del dominio.
    if (suggestions.length === 0) {
        return DOMAIN_CONCEPTS.slice(0, limit);
    }

    return suggestions;
}

module.exports = {
    suggest
};