const crypto = require("crypto");

const ITEM_PREFIX = "circulo:review:item:";
const INDEX_KEY = "circulo:review:index";
const DEDUPE_PREFIX = "circulo:review:dedupe:";
const LOCK_PREFIX = "circulo:review:lock:";
const RETENTION_SECONDS = 60 * 60 * 24 * 30;
const MAX_QUEUE_SIZE = 500;

function getConfig() {
    const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim();
    const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
    return { url: url.replace(/\/+$/, ""), token };
}

function isConfigured() {
    const { url, token } = getConfig();
    return Boolean(url && token);
}

async function command(args) {
    const { url, token } = getConfig();
    if (!url || !token) {
        const error = new Error("La bandeja requiere KV_REST_API_URL y KV_REST_API_TOKEN.");
        error.code = "REVIEW_STORE_NOT_CONFIGURED";
        throw error;
    }

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(args)
    });

    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new Error("El almacenamiento de revisión devolvió una respuesta inválida.");
    }

    if (!response.ok || payload?.error) {
        throw new Error("Falló una operación del almacenamiento de revisión.");
    }

    return payload?.result;
}

function safeText(value, maxLength) {
    return String(value ?? "").slice(0, maxLength);
}

function hashKey(value) {
    return crypto.createHash("sha256").update(String(value)).digest("hex");
}

async function createPending(input, eventKey) {
    const id = crypto.randomUUID();
    const dedupeKey = DEDUPE_PREFIX + hashKey(eventKey);
    const reservation = await command([
        "SET", dedupeKey, id, "NX", "EX", String(RETENTION_SECONDS)
    ]);

    if (reservation !== "OK") return { duplicate: true, item: null };

    const createdAt = new Date().toISOString();
    const item = {
        id,
        source: "facebook_messenger",
        status: "pending",
        priority: input.priority || "normal",
        senderId: safeText(input.senderId, 256),
        messageText: safeText(input.messageText, 4000),
        proposedResponse: safeText(input.proposedResponse, 4000),
        semanticAnalysis: input.semanticAnalysis || {},
        kernelDecision: input.kernelDecision || {},
        createdAt,
        updatedAt: createdAt
    };

    try {
        await command([
            "SET", ITEM_PREFIX + id, JSON.stringify(item), "EX", String(RETENTION_SECONDS)
        ]);
        await command(["ZADD", INDEX_KEY, String(Date.now()), id]);
        await command(["ZREMRANGEBYRANK", INDEX_KEY, "0", String(-MAX_QUEUE_SIZE - 1)]);
        return { duplicate: false, item };
    } catch (error) {
        try { await command(["DEL", dedupeKey]); } catch { /* Allow Meta's retry if possible. */ }
        throw error;
    }
}

async function getItem(id) {
    if (!/^[a-f0-9-]{36}$/i.test(String(id))) return null;
    const raw = await command(["GET", ITEM_PREFIX + id]);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        throw new Error("Un registro de la bandeja está dañado.");
    }
}

async function listItems(limit = 50) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
    const ids = await command(["ZREVRANGE", INDEX_KEY, "0", String(safeLimit - 1)]);
    if (!Array.isArray(ids) || ids.length === 0) return [];

    const items = await Promise.all(ids.map(getItem));
    const missing = ids.filter((id, index) => !items[index]);
    if (missing.length) {
        await command(["ZREM", INDEX_KEY, ...missing]);
    }
    return items.filter(Boolean);
}

async function transition(id, allowedStatuses, changes) {
    const lockKey = LOCK_PREFIX + id;
    const lockToken = crypto.randomUUID();
    const lockResult = await command([
        "SET", lockKey, lockToken, "NX", "EX", "20"
    ]);

    if (lockResult !== "OK") {
        const error = new Error("El caso está siendo procesado por otra acción.");
        error.code = "REVIEW_CONFLICT";
        throw error;
    }

    try {
        const current = await getItem(id);
        if (!current) return null;

        if (!allowedStatuses.includes(current.status)) {
            const error = new Error("El estado actual no permite esta acción.");
            error.code = "REVIEW_INVALID_STATE";
            throw error;
        }

        const updated = {
            ...current,
            ...changes,
            updatedAt: new Date().toISOString()
        };

        await command([
            "SET", ITEM_PREFIX + id, JSON.stringify(updated), "EX", String(RETENTION_SECONDS)
        ]);
        return updated;
    } finally {
        try {
            await command([
                "EVAL",
                "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
                "1",
                lockKey,
                lockToken
            ]);
        } catch {
            // The lock expires automatically after 20 seconds.
        }
    }
}

module.exports = {
    isConfigured,
    createPending,
    getItem,
    listItems,
    transition
};
