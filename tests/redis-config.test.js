'use strict';

const assert = require('node:assert/strict');
const redisConfig = require('../config/redis');

const KEYS = [
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN'
];

const ORIGINAL = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));
const ORIGINAL_AXIAL_ENV = process.env.AXIAL_ENV;

function clearCredentials() {
    for (const key of KEYS) delete process.env[key];
}

function restoreEnvironment() {
    for (const key of KEYS) {
        if (ORIGINAL[key] === undefined) delete process.env[key];
        else process.env[key] = ORIGINAL[key];
    }
    if (ORIGINAL_AXIAL_ENV === undefined) delete process.env.AXIAL_ENV;
    else process.env.AXIAL_ENV = ORIGINAL_AXIAL_ENV;
}

function setPair(urlKey, tokenKey, url, token) {
    process.env[urlKey] = url;
    process.env[tokenKey] = token;
}

async function main() {
    try {
        clearCredentials();
        assert.equal(redisConfig.isRedisConfigured(), false);
        assert.throws(
            () => redisConfig.getRedisConfig(),
            /Faltan credenciales Redis/
        );

        setPair(
            'KV_REST_API_URL',
            'KV_REST_API_TOKEN',
            'https://preview-redis.upstash.io',
            'preview-token'
        );
        assert.equal(redisConfig.isRedisConfigured(), true);
        assert.deepEqual(redisConfig.getRedisConfig(), {
            url: 'https://preview-redis.upstash.io',
            token: 'preview-token'
        });

        setPair(
            'UPSTASH_REDIS_REST_URL',
            'UPSTASH_REDIS_REST_TOKEN',
            'https://canonical-redis.upstash.io',
            'canonical-token'
        );
        assert.deepEqual(redisConfig.getRedisConfig(), {
            url: 'https://canonical-redis.upstash.io',
            token: 'canonical-token'
        });

        delete process.env.UPSTASH_REDIS_REST_URL;
        assert.deepEqual(redisConfig.getRedisConfig(), {
            url: 'https://preview-redis.upstash.io',
            token: 'canonical-token'
        });

        delete process.env.UPSTASH_REDIS_REST_TOKEN;
        assert.deepEqual(redisConfig.getRedisConfig(), {
            url: 'https://preview-redis.upstash.io',
            token: 'preview-token'
        });

        process.env.AXIAL_ENV = 'preview';
        assert.equal(redisConfig.getAxialEnvironment(), 'preview');
        assert.equal(redisConfig.getAxialKeyPrefix(), 'axial:{preview}');

        console.log('OK: Redis config accepts KV_REST_API_* and UPSTASH_REDIS_REST_* with canonical precedence.');
    } finally {
        restoreEnvironment();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
