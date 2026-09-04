/**
 * AXIAL KERNEL
 * RAG Router
 *
 * Selecciona el núcleo documental más adecuado.
 * Módulo 1: documentación oficial
 * Módulo 2: bibliografía
 * Módulo 3: material web / fuente externa
 */

function normalize(text) {
    return String(text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function route(question, analysis = {}) {
    const text = normalize(question);
    const modules = [];

    const officialTerms = [
        "decreto", "ley", "resolucion", "acta", "estatuto",
        "autoridad", "autoridades", "presidente", "vicepresidente",
        "fundacion", "creacion", "reconocimiento", "sede", "direccion",
        "nombre completo"
    ];

    const bibliographyTerms = [
        "historia", "contexto historico", "historiografia", "investigacion",
        "libro", "bibliografia", "estudio", "autor", "analisis",
        "documentacion historica", "historia legislativa", "investigador"
    ];

    // Solo expresiones que implican explícitamente información externa.
    const externalTerms = [
        "otras instituciones", "otras instituciones similares",
        "instituciones similares de argentina", "otros lugares del pais",
        "otros lugares del país", "otros lugares",
        "otros circulos", "otros circulos de legisladores",
        "en otros lugares", "en otros lugares del pais",
        "externa", "externo", "fuentes externas", "fuentes adicionales",
        "consulta un investigador", "donde podria consultar",
        "donde podria consultar un investigador",
        "verificarse en fuentes oficiales", "fuentes oficiales antes",
        "antes de considerarla definitiva", "internet", "sitio web",
        "noticia", "actualidad", "informacion adicional"
    ];

    if (officialTerms.some(term => text.includes(term))) {
        modules.push("oficial");
    }

    if (bibliographyTerms.some(term => text.includes(term))) {
        modules.push("bibliografico");
    }

    const requiereFuenteExterna = externalTerms.some(term => text.includes(term));

    if (requiereFuenteExterna) {
        modules.push("web");
    }

    // Las consultas institucionales se apoyan por defecto en la documentación oficial.
    if (modules.length === 0 || (analysis.domain === "institucional" && !requiereFuenteExterna)) {
        if (!modules.includes("oficial")) {
            modules.unshift("oficial");
        }
    }

    return {
        modules: [...new Set(modules)],
        priority: requiereFuenteExterna ? "web" : (modules[0] || "oficial"),
        requiere_fuente_externa: requiereFuenteExterna
    };
}

module.exports = {
    route
};
