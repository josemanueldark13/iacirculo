/**
 * AXIAL KERNEL - RAG Router
 * Decide qué módulo o módulos del RAG deben consultarse.
 * Módulo 1: documentación oficial
 * Módulo 2: bibliografía
 * Módulo 3: material web
 */

function normalizar(texto) {
    return (texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function route(question, analysis = {}) {
    const text = normalizar(question);
    const modules = [];

    const officialTerms = [
        "decreto", "ley", "resolucion", "acta", "estatuto", "autoridad",
        "presidente", "vicepresidente", "fundacion", "creacion", "reconocimiento",
        "sede", "direccion", "domicilio", "nombre completo", "fuente oficial", "fuentes oficiales"
    ];

    const bibliographyTerms = [
        "historia", "contexto historico", "historiografia", "investigacion",
        "libro", "bibliografia", "estudio", "autor", "analisis", "fuentes adicionales"
    ];

    const webTerms = [
        "sitio", "web", "pagina", "noticia", "actualidad", "actual", "internet",
        "otras instituciones", "otros lugares", "otros circulos", "otros paises",
        "argentina", "fuentes externas", "informacion externa", "consultar fuentes",
        "fuentes adicionales", "donde podria consultar", "fuentes adicionales sobre",
        "contextualizar", "contexto externo"
    ];

    if (officialTerms.some(term => text.includes(term))) modules.push("oficial");
    if (bibliographyTerms.some(term => text.includes(term))) modules.push("bibliografico");
    if (webTerms.some(term => text.includes(term))) modules.push("web");

    if (modules.length === 0) modules.push("oficial");

    return {
        modules,
        priority: modules[0],
        requiere_web: modules.includes("web")
    };
}

module.exports = {
    route
};
