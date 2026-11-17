"use strict";

const catalog = require("./bibliografia.json");
const hybridRetriever = require("./hybridRetriever");
const pdfTextExtractor = require("./pdfTextExtractor");

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map();

function eligibleRecords() {
    return catalog.records.filter(record =>
        record.record_status === "active" &&
        record.access === "acceso_abierto" &&
        typeof record.url === "string" &&
        /^https:\/\//i.test(record.url) &&
        /\.pdf(?:$|[?#])/i.test(record.url)
    );
}

async function readPdfBuffer(response, maxBytes) {
    const declaredLength = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("PDF_TOO_LARGE");
    const reader = response.body?.getReader?.();
    if (!reader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > maxBytes) throw new Error("PDF_TOO_LARGE");
        return buffer;
    }
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error("PDF_TOO_LARGE");
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
}

async function fetchPdf(record, options = {}) {
    const cached = cache.get(record.id);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return { ...cached.value, cached: true };
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") return { ok: false, status: "fetch_unavailable", error: "FETCH_UNAVAILABLE" };
    try {
        const response = await fetchImpl(record.url, {
            method: "GET",
            redirect: "manual",
            signal: AbortSignal.timeout(Math.max(1000, Math.min(Number(options.timeoutMs) || 2800, 5000))),
            headers: { Accept: "application/pdf", "User-Agent": "CirculoIA-RAG/1.0 (+https://iacirculo.vercel.app/)" }
        });
        if (response.status >= 300 && response.status < 400) return { ok: false, status: "redirect_blocked", error: "REDIRECT_NOT_ALLOWED" };
        if (!response.ok) return { ok: false, status: "http_error", error: "HTTP_" + response.status };
        const type = String(response.headers?.get?.("content-type") || "").toLowerCase();
        if (!type.includes("application/pdf") && !/\.pdf(?:$|[?#])/i.test(record.url)) {
            return { ok: false, status: "unsupported_content_type", error: "PDF_CONTENT_TYPE_REQUIRED" };
        }
        const bytes = await readPdfBuffer(response, options.maxBytes || MAX_PDF_BYTES);
        const extracted = pdfTextExtractor.extractPdfText(bytes, { maxBytes: options.maxBytes || MAX_PDF_BYTES });
        if (!extracted.ok) return { ok: false, status: extracted.status, error: extracted.error, extraction: extracted.diagnostics };
        const value = { ok: true, record, text: extracted.text, characters: extracted.characters, extraction: extracted.diagnostics };
        cache.set(record.id, { timestamp: Date.now(), value });
        return { ...value, cached: false };
    } catch (error) {
        const reason = error?.name === "TimeoutError" || error?.name === "AbortError" ? "FETCH_TIMEOUT"
            : error?.message === "PDF_TOO_LARGE" ? "PDF_TOO_LARGE" : "FETCH_FAILED";
        return { ok: false, status: reason === "PDF_TOO_LARGE" ? "too_large" : "fetch_error", error: reason };
    }
}

async function search(query, options = {}) {
    const records = eligibleRecords();
    const rankedMetadata = hybridRetriever.search(hybridRetriever.buildIndex(records.map(record => ({
        id: record.id, title: record.title, authors: (record.authors || []).join(" "),
        keywords: (record.keywords || []).join(" "), subjects: (record.subjects || []).join(" "),
        abstract: record.abstract || "", content: record.abstract || ""
    }))), query, { limit: Math.max(1, Math.min(Number(options.maxSources) || 2, 4)) });
    const selectedIds = new Set(rankedMetadata.results.map(hit => hit.document.id));
    const selected = records.filter(record => selectedIds.has(record.id));
    const fetched = await Promise.all(selected.map(async record => ({ ...await fetchPdf(record, options), record })));
    const documents = fetched.filter(item => item.ok).map(item => ({
        id: item.record.id, title: item.record.title,
        authors: (item.record.authors || []).join(", "),
        keywords: (item.record.keywords || []).join(" "),
        subjects: (item.record.subjects || []).join(" "),
        abstract: item.record.abstract || "", content: item.text,
        url: item.record.url, metadata_status: item.record.metadata_status
    }));
    const index = hybridRetriever.buildIndex(documents, { maxTokens: 220, overlap: 35 });
    const recovered = hybridRetriever.search(index, query, { limit: options.limit || 4 });
    return {
        level: "N2_FULLTEXT", query: String(query ?? ""),
        selected: selected.length, retrieved: fetched.filter(item => item.ok).length,
        results: recovered.results.map(hit => ({
            id: hit.document.id, title: hit.document.title, url: hit.document.url,
            snippet: String(hit.document.content || "").slice(0, 1000),
            relevance: { score: hit.score, matchedTerms: hit.matchedTerms, coverage: hit.coverage }
        })),
        errors: fetched.filter(item => !item.ok).map(item => ({
            id: item.record.id, title: item.record.title,
            status: item.status, reason: item.error
        }))
    };
}

module.exports = { search, eligibleRecords, fetchPdf, clearCache: () => cache.clear() };
