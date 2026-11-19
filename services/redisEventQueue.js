'use strict';

/**
 * Guerrilla Axial Pipeline — transporte de eventos Messenger.
 *
 * Upstash Redis se usa mediante HTTP, compatible con funciones serverless
 * de Vercel. No abrir conexiones TCP persistentes desde una función efímera.
 *
 * Flujo FIFO:
 *   LPUSH pending -> RPOPLPUSH pending/processing -> LREM processing
 *
 * El worker confirma (ACK) únicamente después de completar el envío.
 */
const { Redis } = require('@upstash/redis');
const { randomUUID } = require('crypto');

function getRedis() { return Redis.fromEnv(); }
const PREFIX = process.env.AXIAL_QUEUE_PREFIX || 'axial:messenger';
const PENDING = `${PREFIX}:pending`;
const PROCESSING = `${PREFIX}:processing`;
const DEAD = `${PREFIX}:dead`;

function serializeEvent(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
        throw new TypeError('El evento debe ser un objeto.');
    }

    return JSON.stringify({
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        attempts: 0,
        event
    });
}

async function enqueue(event) {
    const payload = serializeEvent(event);
    await getRedis().lpush(PENDING, payload);
    return JSON.parse(payload);
}

/**
 * Reclama el evento más antiguo y lo mueve atómicamente a processing.
 * Devuelve null cuando la cola está vacía.
 */
async function claim() {
    const payload = await getRedis().rpoplpush(PENDING, PROCESSING);
    if (!payload) return null;

    try {
        return { payload, job: JSON.parse(payload) };
    } catch (error) {
        await getRedis().lrem(PROCESSING, 1, payload);
        await getRedis().lpush(DEAD, payload);
        throw new Error(`Evento inválido movido a dead-letter: ${error.message}`);
    }
}

async function acknowledge(payload) {
    return getRedis().lrem(PROCESSING, 1, payload);
}

async function retry(payload, job, maxAttempts = 5) {
    const nextJob = { ...job, attempts: Number(job.attempts || 0) + 1 };
    const nextPayload = JSON.stringify(nextJob);

    await getRedis().lrem(PROCESSING, 1, payload);
    if (nextJob.attempts >= maxAttempts) {
        await getRedis().lpush(DEAD, nextPayload);
        return { deadLetter: true, attempts: nextJob.attempts };
    }

    await getRedis().lpush(PENDING, nextPayload);
    return { deadLetter: false, attempts: nextJob.attempts };
}

async function lengths() {
    const [pending, processing, dead] = await Promise.all([
        getRedis().llen(PENDING),
        getRedis().llen(PROCESSING),
        getRedis().llen(DEAD)
    ]);
    return { pending, processing, dead };
}

module.exports = {
    enqueue,
    claim,
    acknowledge,
    retry,
    lengths,
    keys: { PENDING, PROCESSING, DEAD }
};
