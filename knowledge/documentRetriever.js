"use strict";

const source = require("./documentos.json");
const hybridRetriever = require("./hybridRetriever");

const records = (Array.isArray(source.documentos) ? source.documentos : []).map((record, index) => ({
    id: record.id || "n1-doc-" + String(index + 1).padStart(3, "0"),
    title: record.titulo || "Documento institucional sin título",
    category: record.categoria || "Sin categoría",
    subjects: record.categoria || "",
    keywords: record.etiquetas || record.palabras_clave || "",
    abstract: record.resumen || "",
    content: record.contenido || "",
    source_level: "N1",
    source_type: "documentacion_institucional"
}));

const index = hybridRetriever.buildIndex(records, {
    maxTokens: 180,
    overlap: 25,
    fieldWeights: {
        title: 5.0,
        authors: 0.5,
        keywords: 2.4,
        subjects: 2.6,
        category: 2.5,
        publication: 0.5,
        abstract: 1.8,
        content: 1.2
    }
});

function search(query, limit = 5) {
    const recovered = hybridRetriever.search(index, query, { limit: Math.min(10, Math.max(1, Number(limit) || 5)) });
    const seen = new Set();
    const results = [];
    for (const hit of recovered.results) {
        if (seen.has(hit.document.id)) continue;
        seen.add(hit.document.id);
        results.push({
            id: hit.document.id,
            title: hit.document.title,
            category: hit.document.category,
            content: hit.document.content,
            source_level: "N1",
            source_type: "documentacion_institucional",
            relevance: {
                score: hit.score,
                matchedTerms: hit.matchedTerms,
                coverage: hit.coverage,
                engine: recovered.engine
            }
        });
    }
    return {
        level: "N1",
        query: String(query ?? ""),
        total: results.length,
        engine: recovered.engine,
        results
    };
}

function formatResults(result, options = {}) {
    const results = Array.isArray(result?.results) ? result.results : [];
    const limit = Math.max(1, Math.min(Number(options.limit) || 3, 5));
    return results.slice(0, limit).map((item, index) =>
        (index + 1) + ". " + item.title + " [" + item.category + "]\n" + item.content
    ).join("\n\n");
}

module.exports = { search, formatResults, get count() { return records.length; } };
