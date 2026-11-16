"use strict";

/**
 * AXIAL N4 — búsqueda abierta con Brave Search API.
 * Requiere BRAVE_SEARCH_API_KEY solo en el servidor.
 * Las fuentes se etiquetan como externas y no verificadas institucionalmente.
 */

const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

function normalizeResult(item) {
    const url = String(item?.url || "").trim();
    if (!/^https:\/\//i.test(url)) return null;
    return {
        title: String(item.title || "Resultado sin título").slice(0, 260),
        url,
        snippet: String(item.description || item.extra_snippets?.[0] || "").slice(0, 1200),
        page_age: item.page_age || item.age || null,
        source_level: "N4",
        trust_level: "externa_no_verificada",
        verification_required: true
    };
}

function normalizePayload(payload, limit = 6) {
    const raw = Array.isArray(payload?.web?.results) ? payload.web.results : [];
    const seen = new Set();
    const results = [];
    for (const item of raw) {
        const normalized = normalizeResult(item);
        if (!normalized || seen.has(normalized.url)) continue;
        seen.add(normalized.url);
        results.push(normalized);
        if (results.length >= Math.max(1, Math.min(limit, 10))) break;
    }
    return results;
}

async function search(query, options = {}) {
    const apiKey = options.apiKey || process.env.BRAVE_SEARCH_API_KEY?.trim();
    if (!apiKey) {
        return {
            level: "N4",
            configured: false,
            status: "provider_not_configured",
            provider: "brave-search",
            query: String(query ?? ""),
            results: [],
            error: "BRAVE_SEARCH_API_KEY_MISSING"
        };
    }

    const cleanQuery = String(query ?? "").trim().slice(0, 600);
    if (!cleanQuery) {
        return { level: "N4", configured: true, status: "empty_query", provider: "brave-search", query: "", results: [] };
    }

    const country = String(options.country || process.env.BRAVE_SEARCH_COUNTRY || "AR").toUpperCase();
    const searchLang = String(options.searchLang || process.env.BRAVE_SEARCH_LANG || "es").toLowerCase();
    const limit = Math.max(1, Math.min(Number(options.limit) || 6, 10));
    const url = new URL(ENDPOINT);
    url.searchParams.set("q", cleanQuery);
    url.searchParams.set("country", country);
    url.searchParams.set("search_lang", searchLang);
    url.searchParams.set("count", String(limit));
    url.searchParams.set("safesearch", "moderate");
    url.searchParams.set("extra_snippets", "true");

    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") {
        return {
            level: "N4", configured: true, status: "fetch_unavailable",
            provider: "brave-search", query: cleanQuery, results: [], error: "FETCH_UNAVAILABLE"
        };
    }

    try {
        const response = await fetchImpl(url.toString(), {
            method: "GET",
            redirect: "error",
            signal: AbortSignal.timeout(Math.max(2000, Math.min(Number(options.timeoutMs) || 8000, 12000))),
            headers: {
                "Accept": "application/json",
                "X-Subscription-Token": apiKey
            }
        });

        if (!response.ok) {
            return {
                level: "N4",
                configured: true,
                status: response.status === 401 || response.status === 403 ? "provider_auth_error" : "provider_error",
                provider: "brave-search",
                query: cleanQuery,
                results: [],
                error: "BRAVE_HTTP_" + response.status
            };
        }

        const payload = await response.json();
        const results = normalizePayload(payload, limit);
        return {
            level: "N4",
            configured: true,
            status: results.length ? "retrieved" : "no_results",
            provider: "brave-search",
            query: cleanQuery,
            country,
            search_lang: searchLang,
            retrieved_at: new Date().toISOString(),
            results,
            source_policy: {
                externally_discovered: true,
                institutional_verification_required: true,
                citations_required: true
            }
        };
    } catch (error) {
        const reason = error?.name === "TimeoutError" || error?.name === "AbortError"
            ? "SEARCH_TIMEOUT" : "SEARCH_PROVIDER_UNAVAILABLE";
        return {
            level: "N4", configured: true, status: "provider_unavailable",
            provider: "brave-search", query: cleanQuery, results: [], error: reason
        };
    }
}

module.exports = { search, normalizePayload, normalizeResult, isConfigured: () => Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim()) };
