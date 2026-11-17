"use strict";

const curatedCatalog = require("./fuentesWebSeleccionadas.json");
const ragRouter = require("../Kernels/ragRouter");
const hybridRetriever = require("./hybridRetriever");
const pdfTextExtractor = require("./pdfTextExtractor");

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_HTML_BYTES = 1_500_000;
const MIN_TEXT_LENGTH = 180;
const cache = new Map();

function decodeEntities(value) {
    return String(value ?? "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&#x27;/gi, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function extractHtml(html) {
    return decodeEntities(String(html ?? "")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<(br|\/p|\/div|\/section|\/article|\/h[1-6]|\/li|\/tr|\/blockquote)[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/[\t\r ]+/g, " ")
        .replace(/\n\s+/g, "\n")
        .replace(/\n{3,}/g, "\n\n"))
        .trim();
}

function sourceAllowed(url) {
    return curatedCatalog.sources.some(source => source.selection_status === "active" && source.url === url);
}

async function readBufferLimited(response, maxBytes) {
    const reader = response.body?.getReader?.();
    if (!reader) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > maxBytes) throw new Error("SOURCE_TOO_LARGE");
        return buffer;
    }
    const chunks = [];
    let totalBytes = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error("SOURCE_TOO_LARGE");
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, totalBytes);
}

async function readTextLimited(response, maxBytes) {
    const reader = response.body?.getReader?.();
    if (!reader) {
        const text = await response.text();
        if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("SOURCE_TOO_LARGE");
        return text;
    }

    const decoder = new TextDecoder("utf-8");
    let totalBytes = 0;
    let output = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error("SOURCE_TOO_LARGE");
        }
        output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
}

function cached(url) {
    const item = cache.get(url);
    if (!item) return null;
    if (Date.now() - item.timestamp > CACHE_TTL_MS) {
        cache.delete(url);
        return null;
    }
    return item.value;
}

function storeCache(url, value) {
    cache.set(url, { timestamp: Date.now(), value });
    if (cache.size > 60) cache.delete(cache.keys().next().value);
}

async function fetchSelectedSource(source, options = {}) {
    if (!source || !sourceAllowed(source.url)) {
        return { ok: false, source: source || null, status: "not_allowlisted", error: "SOURCE_NOT_ALLOWLISTED" };
    }

    const cachedResult = cached(source.url);
    if (cachedResult) return { ...cachedResult, cached: true };

    let parsed;
    try {
        parsed = new URL(source.url);
    } catch {
        return { ok: false, source, status: "invalid_url", error: "INVALID_URL" };
    }
    if (parsed.protocol !== "https:") {
        return { ok: false, source, status: "blocked_protocol", error: "HTTPS_REQUIRED" };
    }

    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") {
        return { ok: false, source, status: "fetch_unavailable", error: "FETCH_UNAVAILABLE" };
    }

    try {
        const timeoutMs = Math.max(1500, Math.min(Number(options.timeoutMs) || 6500, 10000));
        const response = await fetchImpl(source.url, {
            method: "GET",
            redirect: "manual",
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
                "Accept": "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9",
                "User-Agent": "CirculoIA-RAG/1.0 (+https://iacirculo.vercel.app/)"
            }
        });

        if (response.status >= 300 && response.status < 400) {
            return { ok: false, source, status: "redirect_blocked", error: "REDIRECT_NOT_ALLOWED" };
        }
        if (!response.ok) {
            return { ok: false, source, status: "http_error", error: "HTTP_" + response.status };
        }

        const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
        if (contentType.includes("application/pdf") || /\.pdf(?:$|[?#])/i.test(source.url)) {
            const pdfBuffer = await readBufferLimited(response, options.maxBytes || MAX_HTML_BYTES);
            const extracted = pdfTextExtractor.extractPdfText(pdfBuffer, { maxBytes: options.maxBytes || MAX_HTML_BYTES });
            if (!extracted.ok) {
                return { ok: false, source, status: extracted.status, error: extracted.error, extraction: extracted.diagnostics || null };
            }
            const result = {
                ok: true, source, status: "retrieved", content: extracted.text.slice(0, 120000),
                content_length: extracted.text.length, document_type: "pdf",
                extraction: extracted.diagnostics, retrieved_at: new Date().toISOString(), cached: false
            };
            storeCache(source.url, result);
            return result;
        }
        if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml") && !contentType.includes("text/plain")) {
            return { ok: false, source, status: "unsupported_content_type", error: "UNSUPPORTED_CONTENT_TYPE" };
        }

        const html = await readTextLimited(response, options.maxBytes || MAX_HTML_BYTES);
        const content = contentType.includes("text/plain") ? html.trim() : extractHtml(html);
        if (content.length < MIN_TEXT_LENGTH) {
            return { ok: false, source, status: "insufficient_text", error: "INSUFFICIENT_EXTRACTED_TEXT" };
        }

        const result = {
            ok: true,
            source,
            status: "retrieved",
            content: content.slice(0, 120000),
            content_length: content.length,
            retrieved_at: new Date().toISOString(),
            cached: false
        };
        storeCache(source.url, result);
        return result;
    } catch (error) {
        const reason = error?.name === "TimeoutError" || error?.name === "AbortError"
            ? "FETCH_TIMEOUT"
            : error?.message === "SOURCE_TOO_LARGE" ? "SOURCE_TOO_LARGE" : "FETCH_FAILED";
        return { ok: false, source, status: "fetch_error", error: reason };
    }
}

async function searchSelected(query, options = {}) {
    const selected = ragRouter.selectCuratedSources(query, options.maxSources || 4);
    if (!selected.length) {
        return {
            level: "N3",
            query: String(query ?? ""),
            configured: true,
            total_sources_selected: 0,
            total_sources_retrieved: 0,
            insufficient: true,
            results: [],
            errors: []
        };
    }

    const originalRecords = curatedCatalog.sources.filter(record => selected.some(item => item.id === record.id));
    const fetched = await Promise.all(originalRecords.map(record => fetchSelectedSource(record, options)));
    const retrieved = fetched.filter(item => item.ok);
    const documents = retrieved.map(item => ({
        id: item.source.id,
        title: item.source.title,
        authors: item.source.organization,
        keywords: (item.source.topics || []).join(" "),
        subjects: (item.source.topics || []).join(" "),
        category: item.source.source_type,
        abstract: item.source.purpose,
        content: item.content,
        url: item.source.url,
        trust_level: item.source.trust_level,
        retrieved_at: item.retrieved_at
    }));

    const index = hybridRetriever.buildIndex(documents, {
        maxTokens: 220,
        overlap: 35,
        fieldWeights: {
            title: 4.2, authors: 1.5, keywords: 2.2, subjects: 2.1,
            category: 1.1, publication: 0.5, abstract: 1.2, content: 1
        }
    });
    const recovered = hybridRetriever.search(index, query, { limit: options.limit || 5 });
    const results = recovered.results.map(hit => ({
        id: hit.document.id,
        title: hit.document.title,
        organization: hit.document.authors,
        url: hit.document.url,
        snippet: (hit.document.content || "").slice(0, 900),
        trust_level: hit.document.trust_level,
        retrieved_at: hit.document.retrieved_at,
        relevance: {
            score: hit.score,
            matchedTerms: hit.matchedTerms,
            coverage: hit.coverage,
            engine: recovered.engine
        }
    }));

    const insufficient = results.length === 0 || results[0].relevance.coverage < (options.minimumCoverage || 0.15);
    return {
        level: "N3",
        query: String(query ?? ""),
        configured: true,
        total_sources_selected: selected.length,
        total_sources_retrieved: retrieved.length,
        insufficient,
        results,
        selected_sources: selected,
        retrieval_errors: fetched.filter(item => !item.ok).map(item => ({
            source_id: item.source?.id || null,
            title: item.source?.title || null,
            status: item.status,
            reason: item.error
        }))
    };
}

module.exports = {
    searchSelected,
    fetchSelectedSource,
    extractHtml,
    sourceAllowed,
    clearCache: () => cache.clear()
};
