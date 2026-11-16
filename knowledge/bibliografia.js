"use strict";

const catalog = require("./bibliografia.json");

const STOP_WORDS = new Set([
    "que", "cual", "quien", "quienes", "como", "donde", "cuando", "para",
    "por", "con", "sin", "sobre", "entre", "desde", "hacia", "del", "las",
    "los", "una", "uno", "unos", "unas", "este", "esta", "estos", "estas",
    "tiene", "tienen", "hay", "fue", "son", "era", "eran", "sus", "mas",
    "muy", "obra", "obras", "libro", "libros", "tema", "temas", "historia"
]);

function normalize(value = "") {
    return String(value ?? "").toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ").trim();
}

function tokens(value) {
    return normalize(value).split(" ")
        .filter(token => token.length > 2 && !STOP_WORDS.has(token));
}

function asText(values) {
    return Array.isArray(values) ? values.join(" ") : String(values ?? "");
}

function citation(record) {
    const authors = record.authors?.length ? record.authors.join(", ") : "Autoría institucional";
    const year = record.year || "s. f.";
    const publication = record.publication ? ". " + record.publication : "";
    const publisher = record.publisher ? ". " + record.publisher : "";
    const doi = record.doi ? ". https://doi.org/" + record.doi : "";
    return authors + " (" + year + "). " + record.title + publication + publisher + doi;
}

function scoreRecord(record, queryTokens, normalizedQuery) {
    const fields = [
        { value: record.title, weight: 6 },
        { value: asText(record.authors), weight: 4.5 },
        { value: asText(record.keywords), weight: 3.5 },
        { value: asText(record.subjects), weight: 3 },
        { value: record.publication, weight: 2 },
        { value: record.abstract, weight: 1.5 }
    ];
    const normalizedTitle = normalize(record.title);
    let score = 0;
    const matchedTerms = [];

    if (normalizedQuery.length > 5 && normalizedTitle.includes(normalizedQuery)) score += 10;

    for (const token of queryTokens) {
        let bestWeight = 0;
        for (const field of fields) {
            const normalizedField = normalize(field.value);
            if (normalizedField && (" " + normalizedField + " ").includes(" " + token + " ")) {
                bestWeight = Math.max(bestWeight, field.weight);
            }
        }
        if (bestWeight > 0) {
            score += bestWeight;
            matchedTerms.push(token);
        }
    }

    const coverage = queryTokens.length ? matchedTerms.length / queryTokens.length : 0;
    if (coverage >= 0.75) score += 2;
    else if (coverage >= 0.5) score += 1;

    return { score: Number(score.toFixed(2)), matchedTerms, coverage: Number(coverage.toFixed(2)) };
}

function search(query, limit = 5, options = {}) {
    const normalizedQuery = normalize(query);
    const queryTokens = [...new Set(tokens(query))];
    if (!normalizedQuery || queryTokens.length === 0) {
        return { catalogVersion: catalog.version, query: String(query ?? ""), total: 0, results: [] };
    }

    const results = catalog.records
        .filter(record => record.record_status === "active")
        .filter(record => !options.recordType || record.record_type === options.recordType)
        .map(record => {
            const relevance = scoreRecord(record, queryTokens, normalizedQuery);
            return { record, relevance };
        })
        .filter(item => item.relevance.score > 0)
        .sort((a, b) => b.relevance.score - a.relevance.score
            || (b.relevance.coverage - a.relevance.coverage)
            || String(a.record.title).localeCompare(String(b.record.title), "es"))
        .slice(0, Math.max(1, Math.min(Number(limit) || 5, 10)))
        .map(({ record, relevance }) => ({
            id: record.id,
            title: record.title,
            authors: record.authors,
            year: record.year,
            publication: record.publication || null,
            publisher: record.publisher || null,
            doi: record.doi || null,
            url: record.url || null,
            subjects: record.subjects || [],
            abstract: record.abstract || "",
            citation: citation(record),
            metadata_status: record.metadata_status,
            verification_note: record.verification_note || record.year_note || null,
            relevance
        }));

    return {
        catalogVersion: catalog.version,
        query: String(query ?? ""),
        total: results.length,
        results
    };
}

function getCatalogInfo() {
    const records = catalog.records.filter(record => record.record_status === "active");
    return {
        version: catalog.version,
        level: catalog.level,
        total: records.length,
        verified: records.filter(record => record.metadata_status === "verificado_en_ficha_editorial"
            || record.metadata_status === "verificado_en_fuente_institucional").length,
        secondaryCitations: records.filter(record => record.metadata_status === "referencia_citada_en_bibliografia_academica").length
    };
}


function formatResults(searchResult, options = {}) {
    const results = Array.isArray(searchResult?.results) ? searchResult.results : [];
    if (!results.length) {
        return "No encontré registros bibliográficos coincidentes en el catálogo N2. La consulta queda identificada para ampliar el corpus.";
    }

    const limit = Math.max(1, Math.min(Number(options.limit) || 3, 5));
    const abstractLength = Math.max(100, Math.min(Number(options.abstractLength) || 320, 700));
    const lines = [
        "Encontré estas referencias en el núcleo bibliográfico N2:",
        ""
    ];

    results.slice(0, limit).forEach((item, index) => {
        lines.push((index + 1) + ". " + item.citation);
        if (item.abstract) lines.push("   Síntesis: " + item.abstract.slice(0, abstractLength) + (item.abstract.length > abstractLength ? "…" : ""));
        if (item.doi) lines.push("   DOI: https://doi.org/" + item.doi);
        else if (item.url) lines.push("   Consulta: " + item.url);
        if (item.verification_note) lines.push("   Nota de catálogo: " + item.verification_note);
        lines.push("   Metadatos: " + item.metadata_status);
        lines.push("");
    });

    lines.push("Estas referencias son bibliografía secundaria o fondos de consulta; no sustituyen documentos oficiales del núcleo N1.");
    return lines.join("\n").trim();
}

module.exports = { search, citation, normalize, getCatalogInfo, formatResults };
