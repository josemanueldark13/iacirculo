'use strict';

const { Redis } = require('@upstash/redis');

const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

if (!url || !token) {
    throw new Error(
        'Faltan UPSTASH_REDIS_REST_URL y/o UPSTASH_REDIS_REST_TOKEN.'
    );
}

const redisClient = new Redis({
    url,
    token,
    enableTelemetry: false
});

module.exports = redisClient;
