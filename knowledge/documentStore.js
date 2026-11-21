"use strict";

const crypto = require("node:crypto");
const META_PREFIX = "circulo:documents:meta:";
const INDEX_KEY = "circulo:documents:index";

function config() {
    const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/+$/, "");
    const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
    const blobToken = (process.env.BLOB_READ_WRITE_TOKEN || "").trim();
    return { url, token, blobToken };
}
function isConfigured() {
    const value = config();
    return Boolean(value.url && value.token && value.blobToken);
}
async function command(args) {
    const { url, token } = config();
    if (!url || !token) {
        const error = new Error("Falta configurar el almacenamiento KV documental.");
        error.code = "DOCUMENT_STORE_NOT_CONFIGURED";
        throw error;
    }
    const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(args)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
        const error = new Error("Falló una operación del repositorio documental.");
        error.code = "DOCUMENT_STORE_ERROR";
        throw error;
    }
    return payload.result;
}
function blobSdk() {
    if (!config().blobToken) {
        const error = new Error("Falta BLOB_READ_WRITE_TOKEN.");
        error.code = "DOCUMENT_BLOB_NOT_CONFIGURED";
        throw error;
    }
    return require("@vercel/blob");
}
async function putPdf(id, buffer) {
    const { put } = blobSdk();
    return put("n1-pending/" + id + ".pdf", buffer, {
        access: "private",
        addRandomSuffix: true,
        contentType: "application/pdf",
        token: config().blobToken
    });
}
async function getPdf(pathname) {
    const { get } = blobSdk();
    const result = await get(pathname, { access: "private", token: config().blobToken });
    if (!result || result.statusCode !== 200 || !result.stream) {
        const error = new Error("No se pudo recuperar el PDF privado.");
        error.code = "DOCUMENT_BLOB_NOT_FOUND";
        throw error;
    }
    return Buffer.from(await new Response(result.stream).arrayBuffer());
}

async function putExtractedText(id, value) {
    const { put } = blobSdk();
    return put("n1-approved-text/" + id + ".txt", Buffer.from(String(value || ""), "utf8"), {
        access: "private",
        addRandomSuffix: true,
        contentType: "text/plain; charset=utf-8",
        token: config().blobToken
    });
}
async function getExtractedText(pathname) {
    const { get } = blobSdk();
    const result = await get(pathname, { access: "private", token: config().blobToken });
    if (!result || result.statusCode !== 200 || !result.stream) {
        const error = new Error("No se pudo recuperar el texto extraído.");
        error.code = "DOCUMENT_TEXT_NOT_FOUND";
        throw error;
    }
    return await new Response(result.stream).text();
}

async function saveMetadata(record) {
    await command(["SET", META_PREFIX + record.id, JSON.stringify(record)]);
    await command(["ZADD", INDEX_KEY, String(Date.parse(record.createdAt) || Date.now()), record.id]);
    return record;
}
async function getMetadata(id) {
    const raw = await command(["GET", META_PREFIX + id]);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch {
        const error = new Error("Metadatos documentales dañados.");
        error.code = "DOCUMENT_METADATA_INVALID";
        throw error;
    }
}
async function listMetadata(limit = 100) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 200));
    const ids = await command(["ZREVRANGE", INDEX_KEY, "0", String(safeLimit - 1)]);
    if (!Array.isArray(ids) || !ids.length) return [];
    const records = await Promise.all(ids.map(getMetadata));
    return records.filter(Boolean);
}
async function updateMetadata(id, changes) {
    const current = await getMetadata(id);
    if (!current) return null;
    return saveMetadata({ ...current, ...changes, updatedAt: new Date().toISOString() });
}

async function transitionMetadata(id, expectedStatus, changes) {
    const script = [
        "local raw = redis.call('GET', KEYS[1])",
        "if not raw then return nil end",
        "local item = cjson.decode(raw)",
        "if item.status ~= ARGV[1] then return cjson.encode({__conflict=true,currentStatus=item.status}) end",
        "local changes = cjson.decode(ARGV[2])",
        "for key,value in pairs(changes) do item[key] = value end",
        "item.updatedAt = ARGV[3]",
        "local encoded = cjson.encode(item)",
        "redis.call('SET', KEYS[1], encoded)",
        "return encoded"
    ].join("\\n");
    const raw = await command([
        "EVAL", script, "1", META_PREFIX + id,
        String(expectedStatus), JSON.stringify(changes || {}), new Date().toISOString()
    ]);
    if (!raw) return null;
    const record = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (record.__conflict) {
        const error = new Error("El estado del documento cambió durante la operación.");
        error.code = "DOCUMENT_STATUS_CONFLICT";
        error.currentStatus = record.currentStatus;
        throw error;
    }
    return record;
}

function createId() {
    return "doc-" + crypto.randomUUID();
}
module.exports = { isConfigured, putPdf, getPdf, putExtractedText, getExtractedText, saveMetadata, getMetadata, listMetadata, updateMetadata, transitionMetadata, createId };
