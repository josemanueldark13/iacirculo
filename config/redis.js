'use strict';

const { Redis } = require('@upstash/redis');

let client = null;

function getAxialEnvironment() {
    const raw = process.env.AXIAL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
    const env = String(raw).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!env) throw new Error('AXIAL_ENV no puede estar vacío.');
    return env;
}

function getAxialKeyPrefix() {
    return `axial:{${getAxialEnvironment()}}`;
}

function getRedisConfig() {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

    if (!url || !token) {
        const missing = [
            !url && 'UPSTASH_REDIS_REST_URL',
            !token && 'UPSTASH_REDIS_REST_TOKEN'
        ].filter(Boolean);

        throw new Error(`Faltan credenciales Redis: ${missing.join(', ')}.`);
    }

    return { url, token };
}

function isRedisConfigured() {
    return Boolean(
        process.env.UPSTASH_REDIS_REST_URL?.trim() &&
        process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
    );
}

function getRedis() {
    if (client) return client;

    const config = getRedisConfig();
    client = new Redis({
        ...config,
        enableTelemetry: false
    });

    return client;
}

function resetRedisClientForTests() {
    client = null;
}

module.exports = {
    getRedis,
    isRedisConfigured,
    resetRedisClientForTests,
    getAxialEnvironment,
    getAxialKeyPrefix
};
