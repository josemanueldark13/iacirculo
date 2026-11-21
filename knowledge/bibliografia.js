"use strict";

const catalog = require("./bibliografia.json");
const hybridRetriever = require("./hybridRetriever");

function asText(value) {
    return Array.isArray(value) ? value.join(" ") : String(value ?? "");
}

function citation(record) {
    const authors = record.authors?.length ? record.authors.join(", ") : "Autoría institucional";
    const year = record.year || "s. f.";
    const publication = record.publication ? ". " + record.publication : "";
    const publisher = record.publisher ? ". " + record.publisher : "";
    const doi = record.doi ? ". https://doi.org/" + record.doi : "";
    const isbn = record.isbn ? ". ISBN " + record.isbn : "";
    return authors + " (" + year + "). " + record.title + publication + publisher + doi + isbn;
}

function makeSearchIndex(records) {
    const documents = records.map(record => ({
        id: record.id,
        title: record.title,
        authors: asText(record.authors),
        keywords: asText(record.keywords),
        subjects: asText(record.subjects),
        category: record.record_type,
        publication: record.publication,
        abstract: record.abstract,
        content: record.abstract || record.verification_note || ""
    }));
    return hybridRetriever.buildIndex(documents, {
        maxTokens: 220,
        overlap: 30,
        fieldWeights: {
            title: 5.0,
            authors: 3.2,
            keywords: 2.8,
            subjects: 2.6,
            category: 1.5,
            publication: 1.7,
            abstract: 1.4,
            content: 0.9
        }
    });
}

function activeRecords(options = {}) {
    return catalog.records.filter(record => record.record_status === "active")
        .filter(record => !options.recordType || record.record_type === options.recordType)
        .filter(record => {
            if (!options.subject) return true;
            const requestedTerms = [...new Set(hybridRetriever.tokenize(options.subject))];
            if (!requestedTerms.length) return true;
            const availableTerms = new Set(hybridRetriever.tokenize(asText(record.subjects)));
            return requestedTerms.every(term => availableTerms.has(term));
        });
}

function search(query, limit = 5, options = {}) {
    const records = activeRecords(options);
    const recordById = new Map(records.map(record => [record.id, record]));
    const index = makeSearchIndex(records);
    const recovered = hybridRetriever.search(index, query, { limit: Math.min(20, Math.max(limit * 4, limit)) });
    const seen = new Set();
    const results = [];

    for (const hit of recovered.results) {
        const id = hit.document.id;
        if (seen.has(id)) continue;
        seen.add(id);
        const record = recordById.get(id);
        if (!record) continue;
        results.push({
            id: record.id,
            title: record.title,
            authors: record.authors,
            year: record.year,
            publication: record.publication || null,
            publisher: record.publisher || null,
            isbn: record.isbn || null,
            doi: record.doi || null,
            url: record.url || null,
            subjects: record.subjects || [],
            abstract: record.abstract || "",
            citation: citation(record),
            metadata_status: record.metadata_status,
            source_metadata_url: record.source_metadata_url || null,
            verification_note: record.verification_note || record.year_note || null,
            relevance: {
                score: hit.score,
                matchedTerms: hit.matchedTerms,
                coverage: hit.coverage,
                engine: recovered.engine
            }
        });
        if (results.length >= Math.max(1, Math.min(Number(limit) || 5, 10))) break;
    }

    return {
        catalogVersion: catalog.version,
        query: String(query ?? ""),
        total: results.length,
        engine: recovered.engine,
        results
    };
}

function getCatalogInfo() {
    const records = catalog.records.filter(record => record.record_status === "active");
    const candidates = catalog.records.filter(record => record.record_status === "candidate");
    return {
        version: catalog.version,
        level: catalog.level,
        total: records.length,
        verified: records.filter(record => String(record.metadata_status || "").startsWith("verificado_")).length,
        secondaryCitations: records.filter(record => record.metadata_status === "referencia_citada_en_bibliografia_academica").length,
        candidates: candidates.length
    };
}

function formatResults(searchResult, options = {}) {
    const results = Array.isArray(searchResult?.results) ? searchResult.results : [];
    if (!results.length) {
        return "No encontré registros bibliográficos coincidentes en el catálogo N2. La consulta queda identificada para ampliar el corpus.";
    }

    const limit = Math.max(1, Math.min(Number(options.limit) || 3, 5));
    const abstractLength = Math.max(100, Math.min(Number(options.abstractLength) || 320, 700));
    const lines = ["Referencias recuperadas del núcleo bibliográfico N2:", ""];

    results.slice(0, limit).forEach((item, index) => {
        lines.push((index + 1) + ". " + item.citation);
        if (item.abstract) lines.push("   Síntesis: " + item.abstract.slice(0, abstractLength) + (item.abstract.length > abstractLength ? "…" : ""));
        if (item.doi) lines.push("   DOI: https://doi.org/" + item.doi);
        if (item.url) lines.push("   Consulta: " + item.url);
        if (item.verification_note) lines.push("   Nota de catálogo: " + item.verification_note);
        if (item.source_metadata_url) lines.push("   Fuente de metadatos: " + item.source_metadata_url);
        lines.push("   Estado de metadatos: " + item.metadata_status);
        lines.push("");
    });

    lines.push("N2 aporta bibliografía y fuentes historiográficas; no sustituye documentos oficiales del núcleo N1.");
    return lines.join("\n").trim();
}

module.exports = { search, citation, getCatalogInfo, formatResults, makeSearchIndex };
