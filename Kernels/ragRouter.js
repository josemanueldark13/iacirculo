/**
 * AXIAL KERNEL
 * RAG Router
 *
 * Decide quÃ© mÃ³dulo o mÃ³dulos del RAG
 * deben consultarse.
 *
 * MÃ³dulo 1: documentaciÃ³n oficial
 * MÃ³dulo 2: bibliografÃ­a
 * MÃ³dulo 3: material web
 */

function route(question, analysis = {}) {

    const text = question.toLowerCase();

    const modules = [];

    // MÃ“DULO 1 â€” DOCUMENTACIÃ“N OFICIAL
    const officialTerms = [
        "decreto",
        "ley",
        "resoluciÃ³n",
        "acta",
        "estatuto",
        "autoridad",
        "presidente",
        "fundaciÃ³n",
        "creaciÃ³n",
        "reconocimiento",
        "sede"
    ];

    // MÃ“DULO 2 â€” BIBLIOGRAFÃA
    const bibliographyTerms = [
        "historia",
        "contexto histÃ³rico",
        "historiografÃ­a",
        "investigaciÃ³n",
        "libro",
        "bibliografÃ­a",
        "estudio",
        "autor",
        "anÃ¡lisis"
    ];

    // MÃ“DULO 3 â€” WEB
    const webTerms = [
        "sitio",
        "web",
        "pÃ¡gina",
        "publicaciÃ³n",
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

    // Si no pudo determinar un mÃ³dulo concreto,
    // consulta primero el nÃºcleo oficial.
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
};
