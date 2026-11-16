"use strict";

/**
 * Recuperador híbrido local AXIAL.
 * BM25 por campos con ponderación, coincidencia de frase y cobertura temática.
 * Incluye segmentación por fragmentos para documentos extensos.
 */

const DEFAULT_STOP_WORDS = new Set([
    "que", "cual", "quien", "quienes", "como", "donde", "cuando", "para",
    "por", "con", "sin", "sobre", "entre", "desde", "hacia", "del", "las",
    "los", "una", "uno", "unos", "unas", "este", "esta", "estos", "estas",
    "tiene", "tienen", "hay", "fue", "son", "era", "eran", "sus", "mas",
    "muy", "desde", "hasta", "tambien", "porque", "donde", "cuyo", "cuya"
]);

const DEFAULT_FIELD_WEIGHTS = {
    title: 4.2,
    authors: 2.8,
    keywords: 2.4,
    subjects: 2.1,
    category: 1.6,
    publication: 1.2,
    abstract: 1.0,
    content: 0.85
};

function normalize(value = "") {
    return String(value ?? "").toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ").trim();
}

function stem(token) {
    if (token.length > 7 && token.endsWith("ciones")) return token.slice(0, -6) + "cion";
    if (token.length > 6 && token.endsWith("mente")) return token.slice(0, -5);
    if (token.length > 6 && token.endsWith("es")) return token.slice(0, -2);
    if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
    return token;
}

function tokenize(value, options = {}) {
    const stopWords = options.stopWords || DEFAULT_STOP_WORDS;
    return normalize(value).split(" ")
        .filter(token => token.length > 2 && !stopWords.has(token))
        .map(stem);
}

function asText(value) {
    if (Array.isArray(value)) return value.join(" ");
    if (value && typeof value === "object") return Object.values(value).join(" ");
    return String(value ?? "");
}

function splitChunks(text, options = {}) {
    const maxTokens = Math.max(80, Math.min(Number(options.maxTokens) || 220, 600));
    const overlap = Math.max(0, Math.min(Number(options.overlap) || 35, Math.floor(maxTokens / 3)));
    const words = String(text ?? "").split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    if (words.length <= maxTokens) return [String(text).trim()];

    const chunks = [];
    let start = 0;
    while (start < words.length) {
        const end = Math.min(start + maxTokens, words.length);
        chunks.push(words.slice(start, end).join(" "));
        if (end === words.length) break;
        start = end - overlap;
    }
    return chunks;
}

function buildIndex(documents, options = {}) {
    const sourceDocuments = Array.isArray(documents) ? documents : [];
    const maxTokens = options.maxTokens || 220;
    const overlap = options.overlap ?? 35;
    const fieldWeights = { ...DEFAULT_FIELD_WEIGHTS, ...(options.fieldWeights || {}) };
    const fields = Object.keys(fieldWeights);
    const indexed = [];

    for (const source of sourceDocuments) {
        const content = asText(source.content || source.text || source.abstract || "");
        const chunks = splitChunks(content, { maxTokens, overlap });
        const selectedChunks = chunks.length ? chunks : [""];
        selectedChunks.forEach((chunk, chunkIndex) => {
            const doc = { ...source, content: chunk };
            const fieldTokens = {};
            for (const field of fields) {
                fieldTokens[field] = tokenize(doc[field]);
            }
            indexed.push({
                source,
                doc,
                chunkIndex,
                chunkCount: selectedChunks.length,
                fieldTokens,
                fieldLengths: Object.fromEntries(fields.map(field => [field, fieldTokens[field].length]))
            });
        });
    }

    const avgLengths = {};
    const documentFrequency = {};
    for (const field of fields) {
        const total = indexed.reduce((sum, item) => sum + item.fieldLengths[field], 0);
        avgLengths[field] = indexed.length ? total / indexed.length : 0;
        const df = new Map();
        for (const item of indexed) {
            for (const token of new Set(item.fieldTokens[field])) df.set(token, (df.get(token) || 0) + 1);
        }
        documentFrequency[field] = Object.fromEntries(df);
    }

    return {
        documents: indexed,
        fields,
        fieldWeights,
        avgLengths,
        documentFrequency,
        totalDocuments: indexed.length,
        parameters: { k1: 1.2, b: 0.75 }
    };
}

function bm25(tf, documentLength, averageLength, totalDocuments, documentFrequency) {
    if (!tf || !totalDocuments) return 0;
    const df = documentFrequency || 0;
    const idf = Math.log(1 + (totalDocuments - df + 0.5) / (df + 0.5));
    const k1 = 1.2;
    const b = 0.75;
    const lengthNorm = averageLength > 0 ? (1 - b + b * (documentLength / averageLength)) : 1;
    return idf * ((tf * (k1 + 1)) / (tf + k1 * lengthNorm));
}

function search(index, query, options = {}) {
    const queryTokens = [...new Set(tokenize(query, options))];
    if (!queryTokens.length || !index?.documents?.length) {
        return { query: String(query ?? ""), total: 0, results: [], engine: "BM25-fields-v1" };
    }

    const limit = Math.max(1, Math.min(Number(options.limit) || 5, 20));
    const normalizedQuery = normalize(query);
    const scored = [];

    for (const item of index.documents) {
        let score = 0;
        const matched = new Set();
        for (const field of index.fields) {
            const terms = item.fieldTokens[field];
            if (!terms.length) continue;
            const freq = new Map();
            for (const term of terms) freq.set(term, (freq.get(term) || 0) + 1);
            for (const token of queryTokens) {
                const tf = freq.get(token) || 0;
                if (!tf) continue;
                matched.add(token);
                score += index.fieldWeights[field] * bm25(
                    tf,
                    item.fieldLengths[field],
                    index.avgLengths[field],
                    index.totalDocuments,
                    index.documentFrequency[field][token] || 0
                );
            }
        }

        const title = normalize(item.doc.title);
        if (title && normalizedQuery.length > 5 && title.includes(normalizedQuery)) score += 8;
        const coverage = matched.size / queryTokens.length;
        score += coverage * 2.5;
        if (score > 0) {
            scored.push({
                document: item.doc,
                source: item.source,
                score: Number(score.toFixed(4)),
                matchedTerms: [...matched],
                coverage: Number(coverage.toFixed(3)),
                chunk: { index: item.chunkIndex, count: item.chunkCount }
            });
        }
    }

    const results = scored.sort((a, b) => b.score - a.score
        || b.coverage - a.coverage
        || String(a.document.title || "").localeCompare(String(b.document.title || ""), "es"))
        .slice(0, limit);

    return {
        query: String(query ?? ""),
        total: results.length,
        engine: "BM25-fields-v1",
        results
    };
}

module.exports = { normalize, tokenize, stem, splitChunks, buildIndex, search, DEFAULT_FIELD_WEIGHTS };
