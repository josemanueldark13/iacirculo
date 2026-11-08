"use strict";

const crypto = require("node:crypto");

const EVENT_TTL_SECONDS = 24 * 60 * 60;
const SENT_TTL_SECONDS = 7 * 24 * 60 * 60;
const CONVERSATION_TTL_SECONDS = 30 * 24 * 60 * 60;
const CONVERSATION_LOCK_TTL_SECONDS = 120;

const MARK_SENT_SCRIPT = [
    'if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end',
    'redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])',
    "return 1"
].join("; ");

const DELETE_IF_OWNER_SCRIPT = [
    'if redis.call("GET", KEYS[1]) == ARGV[1] then',
    '  return redis.call("DEL", KEYS[1])',
    "end",
    "return 0"
].join("; ");

function digest(value) {
    return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function createMessengerStateStore(options = {}) {
    const urlValue = Object.prototype.hasOwnProperty.call(options, "url")
        ? options.url
        : process.env.UPSTASH_REDIS_REST_URL;
    const tokenValue = Object.prototype.hasOwnProperty.call(options, "token")
        ? options.token
        : process.env.UPSTASH_REDIS_REST_TOKEN;
    const url = String(urlValue || "").trim().replace(/\/+$/, "");
    const token = String(tokenValue || "").trim();
    const fetchImpl = options.fetchImpl || globalThis.fetch;

    if (!url || !token) {
        throw new Error("Faltan UPSTASH_REDIS_REST_URL y/o UPSTASH_REDIS_REST_TOKEN.");
    }
    if (typeof fetchImpl !== "function") {
        throw new Error("No hay una implementación fetch disponible para el almacén de Messenger.");
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error("UPSTASH_REDIS_REST_URL no es una URL válida.");
    }
    if (parsedUrl.protocol !== "https:") {
        throw new Error("UPSTASH_REDIS_REST_URL debe utilizar HTTPS.");
    }

    async function command(parts) {
        const response = await fetchImpl(url, {
            method: "POST",
            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(parts)
        });

        let payload;
        try {
            payload = await response.json();
        } catch {
            throw new Error("El almacén de Messenger devolvió una respuesta no JSON.");
        }

        if (!response.ok || payload?.error) {
            const reason = payload?.error || ("HTTP " + response.status);
            throw new Error("Error del almacén persistente de Messenger: " + reason);
        }

        return payload?.result;
    }

    function eventKey(eventId) {
        return "circulo:messenger:event:" + digest(eventId);
    }

    function conversationKey(senderId) {
        return "circulo:messenger:conversation:" + digest(senderId);
    }

    function lockKey(senderId) {
        return "circulo:messenger:conversation-lock:" + digest(senderId);
    }

    async function reserveEvent(eventId) {
        const reservation = crypto.randomUUID();
        const result = await command([
            "SET",
            eventKey(eventId),
            reservation,
            "NX",
            "EX",
            EVENT_TTL_SECONDS
        ]);
        return result === "OK" ? reservation : null;
    }

    async function markEventSent(eventId, reservation) {
        const result = await command([
            "EVAL",
            MARK_SENT_SCRIPT,
            "1",
            eventKey(eventId),
            reservation,
            "sent",
            SENT_TTL_SECONDS
        ]);
        if (Number(result) !== 1) {
            throw new Error("No se pudo confirmar la reserva del evento como enviado.");
        }
    }

    async function releaseEvent(eventId, reservation) {
        await command([
            "EVAL",
            DELETE_IF_OWNER_SCRIPT,
            "1",
            eventKey(eventId),
            reservation
        ]);
    }

    async function acquireConversationLock(senderId) {
        const owner = crypto.randomUUID();
        const result = await command([
            "SET",
            lockKey(senderId),
            owner,
            "NX",
            "EX",
            CONVERSATION_LOCK_TTL_SECONDS
        ]);
        return result === "OK" ? owner : null;
    }

    async function releaseConversationLock(senderId, owner) {
        await command([
            "EVAL",
            DELETE_IF_OWNER_SCRIPT,
            "1",
            lockKey(senderId),
            owner
        ]);
    }

    async function loadConversation(senderId) {
        const result = await command(["GET", conversationKey(senderId)]);
        if (result === null || result === undefined) return {};

        let state;
        try {
            state = JSON.parse(result);
        } catch {
            throw new Error("El estado persistido de la conversación no tiene formato JSON válido.");
        }

        if (!state || typeof state !== "object" || Array.isArray(state)) {
            throw new Error("El estado persistido de la conversación tiene una estructura inválida.");
        }

        return {
            previousQuestion: typeof state.previousQuestion === "string"
                ? state.previousQuestion
                : ""
        };
    }

    async function saveConversation(senderId, state) {
        const value = JSON.stringify({
            previousQuestion: String(state?.previousQuestion || ""),
            updatedAt: new Date().toISOString()
        });

        await command([
            "SET",
            conversationKey(senderId),
            value,
            "EX",
            CONVERSATION_TTL_SECONDS
        ]);
    }

    return {
        reserveEvent,
        markEventSent,
        releaseEvent,
        acquireConversationLock,
        releaseConversationLock,
        loadConversation,
        saveConversation
    };
}

module.exports = { createMessengerStateStore };
