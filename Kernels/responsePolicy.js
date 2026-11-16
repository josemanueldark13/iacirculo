/**
 * AXIAL KERNEL
 * Response Policy
 *
 * Clasifica la forma de respuesta solicitada.
 * No determina la veracidad del contenido ni reemplaza al analizador semántico.
 */

function normalize(value) {
    return String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9ñ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const POLICIES = [
    {
        type: "opinion",
        terms: [
            "que opinas", "que pensas", "opinion",
            "te parece", "consideras", "cual es tu postura"
        ]
    },
    {
        type: "analisis",
        terms: [
            "por que", "importancia", "significado", "impacto",
            "influencia", "contexto", "relacion", "analiza",
            "explica", "desarrolla", "compara", "causas"
        ]
    },
    {
        type: "sintesis",
        terms: [
            "resumi", "resumen", "sintesis", "en pocas palabras",
            "brevemente", "puntos principales"
        ]
    },
    {
        type: "hecho",
        terms: [
            "cuando", "quien", "donde", "que decreto",
            "que ley", "que ano", "cual", "cuanto",
            "fecha", "numero de ley"
        ]
    }
];

function determine(question) {
    const text = normalize(question);

    if (!text) return "hecho";

    for (const policy of POLICIES) {
        if (policy.terms.some(term => {
            const normalizedTerm = normalize(term);
            return (` ${text} `).includes(` ${normalizedTerm} `);
        })) {
            return policy.type;
        }
    }

    return "hecho";
}

module.exports = {
    determine,
    normalize
};
