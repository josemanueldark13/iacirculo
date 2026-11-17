'use strict';

const { randomUUID } = require('crypto');

const PREFIX = 'axial:inbox:v1';
const INDEX_KEY = `${PREFIX}:conversations`;
const MODE_KEY = `${PREFIX}:settings:mode`;
const MODES = Object.freeze(['AUTO', 'GUARDAMETA', 'MANUAL']);

function redis() {
    // Lazy loading keeps the rest of CÍRCULO IA available if Redis is not configured.
    return require('../config/redis');
}

function conversationKey(id) {
    return `${PREFIX}:conversation:${id}`;
}

function messagesKey(id) {
    return `${PREFIX}:messages:${id}`;
}

function validId(id) {
    return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
}

async function getMode() {
    const configured = await redis().get(MODE_KEY);
    return MODES.includes(configured) ? configured : 'AUTO';
}

async function setMode(mode) {
    if (!MODES.includes(mode)) throw new Error('Modo inválido.');
    await redis().set(MODE_KEY, mode);
    return mode;
}

async function createConversation({ conversationId, text, source = 'web', analysis, mode, draft, response, status }) {
    const id = validId(conversationId) ? conversationId : randomUUID();
    const db = redis();
    const key = conversationKey(id);
    const existing = await db.get(key);
    const now = new Date().toISOString();

    const conversation = existing || {
        id,
        source,
        status: 'open',
        mode,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
        messageCount: 0,
        analysis: null,
        draft: null
    };

    conversation.source = source;
    conversation.mode = mode;
    conversation.status = status || conversation.status;
    conversation.updatedAt = now;
    conversation.lastMessageAt = now;
    conversation.messageCount += 1;
    conversation.analysis = analysis || conversation.analysis;
    conversation.draft = draft || null;

    const inbound = {
        id: randomUUID(),
        conversationId: id,
        role: 'user',
        content: text,
        source,
        createdAt: now
    };

    await db.set(key, JSON.stringify(conversation));
    await db.lpush(messagesKey(id), JSON.stringify(inbound));

    if (response) {
        const outbound = {
            id: randomUUID(),
            conversationId: id,
            role: 'assistant',
            content: response,
            source: 'axial',
            createdAt: new Date().toISOString()
        };
        await db.lpush(messagesKey(id), JSON.stringify(outbound));
        conversation.messageCount += 1;
        conversation.updatedAt = outbound.createdAt;
        conversation.lastMessageAt = outbound.createdAt;
        await db.set(key, JSON.stringify(conversation));
    }

    await db.zadd(INDEX_KEY, { score: Date.now(), member: id });
    return conversation;
}

async function getConversation(id) {
    if (!validId(id)) return null;
    const raw = await redis().get(conversationKey(id));
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function getMessages(id) {
    if (!validId(id)) return [];
    const rows = await redis().lrange(messagesKey(id), 0, -1);
    return rows.map(row => typeof row === 'string' ? JSON.parse(row) : row).reverse();
}

async function listConversations(limit = 50) {
    const db = redis();
    const ids = await db.zrevrange(INDEX_KEY, 0, Math.max(0, limit - 1));
    const rows = await Promise.all(ids.map(id => getConversation(id)));
    return rows.filter(Boolean);
}

async function updateConversation(id, patch) {
    const conversation = await getConversation(id);
    if (!conversation) return null;
    Object.assign(conversation, patch, { updatedAt: new Date().toISOString() });
    await redis().set(conversationKey(id), JSON.stringify(conversation));
    return conversation;
}

async function addMessage(id, { role, content, source = 'operator' }) {
    const conversation = await getConversation(id);
    if (!conversation) return null;
    const message = {
        id: randomUUID(),
        conversationId: id,
        role,
        content,
        source,
        createdAt: new Date().toISOString()
    };
    await redis().lpush(messagesKey(id), JSON.stringify(message));
    conversation.messageCount += 1;
    conversation.updatedAt = message.createdAt;
    conversation.lastMessageAt = message.createdAt;
    await redis().set(conversationKey(id), JSON.stringify(conversation));
    await redis().zadd(INDEX_KEY, { score: Date.now(), member: id });
    return message;
}

async function rateLimit(key, max = 8, windowSeconds = 60) {
    const db = redis();
    const count = await db.incr(`${PREFIX}:rate:${key}`);
    if (count === 1) await db.expire(`${PREFIX}:rate:${key}`, windowSeconds);
    return count <= max;
}

module.exports = {
    MODES,
    getMode,
    setMode,
    createConversation,
    getConversation,
    getMessages,
    listConversations,
    updateConversation,
    addMessage,
    rateLimit
};
