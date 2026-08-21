/**
 * AXIAL KERNEL
 * RAG Router
 *
 * Decide qué módulo o módulos del RAG
 * deben consultarse.
 *
 * Módulo 1: documentación oficial
 * Módulo 2: bibliografía
 * Módulo 3: material web
 */

function route(question, analysis = {}) {

    const text = question.toLowerCase();

    const modules = [];

    // MÓDULO 1 — DOCUMENTACIÓN OFICIAL
    const officialTerms = [
        "decreto",
        "ley",
        "resolución",
        "acta",
        "estatuto",
        "autoridad",
        "presidente",
        "fundación",
        "creación",
        "reconocimiento",
        "sede"
    ];

    // MÓDULO 2 — BIBLIOGRAFÍA
    const bibliographyTerms = [
        "historia",
        "contexto histórico",
        "historiografía",
        "investigación",
        "libro",
        "bibliografía",
        "estudio",
        "autor",
        "análisis"
    ];

    // MÓDULO 3 — WEB
    const webTerms = [
        "sitio",
        "web",
        "página",
        "publicación",
        "noticia",
        "actualidad",
        "actual",
        "internet"
    ];

    if (officialTerms.some(term => text.includes(term))) {
        modules.push("oficial");
    }

    if (bibliographyTerms.some(term => text.includes(term))) {
        modules.push("bibliografico");
    }

    if (webTerms.some(term => text.includes(term))) {
        modules.push("web");
    }

    // Si no pudo determinar un módulo concreto,
    // consulta primero el núcleo oficial.
    if (modules.length === 0) {
        modules.push("oficial");
    }

    return {
        modules,
        priority: modules[0]
    };
}

module.exports = {
    route
};v