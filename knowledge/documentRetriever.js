"use strict";

const source = require("./documentos.json");
const hybridRetriever = require("./hybridRetriever");
const pdfTextExtractor = require("./pdfTextExtractor");

let records = (Array.isArray(source.documentos) ? source.documentos : []).map((record, index) => ({
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

const indexOptions = {
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
};
let index = hybridRetriever.buildIndex(records, indexOptions);

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
            source_type: hit.document.source_type || "documentacion_institucional",
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

function ingestExtractedText(text, metadata = {}) {
    const title = String(metadata.title || "").trim();
    const category = String(metadata.category || "Documento institucional").trim();
    const content = String(text || "").slice(0, 1_200_000).trim();
    if (!title) return { ok: false, status: "metadata_required", error: "DOCUMENT_TITLE_REQUIRED" };
    if (content.length < 40) return { ok: false, status: "no_extractable_text", error: "PDF_TEXT_LAYER_NOT_FOUND" };
    const id = String(metadata.id || "n1-pdf-" + Date.now()).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
    const record = {
        id, title, category, subjects: String(metadata.subjects || category),
        keywords: String(metadata.keywords || ""),
        abstract: String(metadata.abstract || content.slice(0, 500)),
        content, source_level: "N1",
        source_type: "documentacion_institucional_pdf",
        source_name: String(metadata.sourceName || ""),
        ingested_at: new Date().toISOString(),
        extraction: metadata.extraction || { method: "persisted-pdf-text-v1" }
    };
    records = records.filter(item => item.id !== id).concat(record);
    index = hybridRetriever.buildIndex(records, indexOptions);
    return { ok: true, status: "ingested_in_memory", id, title, characters: content.length, count: records.length };
}

function ingestPdf(buffer, metadata = {}) {
    const extracted = pdfTextExtractor.extractPdfText(buffer, { maxBytes: metadata.maxBytes || 4 * 1024 * 1024 });
    if (!extracted.ok) return extracted;
    return ingestExtractedText(extracted.text, { ...metadata, extraction: extracted.diagnostics });
}

let persistentLoadPromise = null;
async function ensureLoaded() {
    if (persistentLoadPromise) return persistentLoadPromise;
    persistentLoadPromise = (async () => {
        const store = require("./documentStore");
        if (!store.isConfigured()) return { status: "storage_not_configured", loaded: 0 };
        const approved = (await store.listMetadata(200)).filter(item => item.status === "approved");
        let loaded = 0;
        for (const item of approved) {
            if (records.some(record => record.id === item.id)) continue;
            try {
                let text;
                let extraction;
                if (item.textPathname) {
                    text = await store.getExtractedText(item.textPathname);
                    extraction = { method: "persisted-pdf-text-v1" };
                } else {
                    const pdf = await store.getPdf(item.pathname);
                    const extracted = pdfTextExtractor.extractPdfText(pdf, { maxBytes: 4 * 1024 * 1024 });
                    if (!extracted.ok) continue;
                    text = extracted.text;
                    extraction = extracted.diagnostics;
                }
                const result = ingestExtractedText(text, {
                    id: item.id, title: item.title, category: item.category,
                    subjects: item.category, keywords: item.keywords,
                    sourceName: item.issuingBody, extraction
                });
                if (result.ok) loaded++;
            } catch (error) {
                console.error("[Documents] No se pudo reconstruir N1 para", item.id, error.code || "LOAD_ERROR");
            }
        }
        return { status: "loaded", loaded, approved: approved.length };
    })().catch(error => {
        persistentLoadPromise = null;
        console.error("[Documents] No se pudo reconstruir el índice N1 persistente:", error.code || "PERSISTENT_LOAD_ERROR");
        return { status: "load_failed", loaded: 0 };
    });
    return persistentLoadPromise;
}

function formatResults(result, options = {}) {
    const results = Array.isArray(result?.results) ? result.results : [];
    const limit = Math.max(1, Math.min(Number(options.limit) || 3, 5));
    return results.slice(0, limit).map((item, index) =>
        (index + 1) + ". " + item.title + " [" + item.category + "]\n" + item.content
    ).join("\n\n");
}

module.exports = { search, formatResults, ingestPdf, ingestExtractedText, ensureLoaded, get count() { return records.length; } };
