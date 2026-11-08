"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");

const ENV_KEYS = [
    "FACEBOOK_APP_SECRET", "META_APP_SECRET",
    "KV_REST_API_URL", "KV_REST_API_TOKEN",
    "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
    "REVIEW_API_TOKEN", "DISPATCH_ENABLED",
    "FACEBOOK_PAGE_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN",
    "META_GRAPH_VERSION"
];
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
const originalFetch = global.fetch;
const redis = new Map();
const sortedSets = new Map();
let graphDispatchCount = 0;

function redisResponse(result) {
    return { ok: true, status: 200, json: async () => ({ result }) };
}
function orderedMembers(key, descending = false) {
    const entries = [...(sortedSets.get(key) || new Map()).entries()];
    entries.sort((a, b) => descending ? b[1] - a[1] : a[1] - b[1]);
    return entries;
}
async function simulatedFetch(url, options = {}) {
    const target = String(url);
    if (target.startsWith("https://graph.facebook.com/")) {
        graphDispatchCount += 1;
        await new Promise(resolve => setTimeout(resolve, 40));
        return {
            ok: true,
            status: 200,
            json: async () => ({
                recipient_id: "concurrency_user_01",
                message_id: "simulated-outbound-" + graphDispatchCount
            })
        };
    }
    if (target !== process.env.KV_REST_API_URL) {
        throw new Error("Destino externo no permitido en la prueba: " + target);
    }

    const args = JSON.parse(options.body || "[]");
    const operation = String(args[0] || "").toUpperCase();
    switch (operation) {
        case "SET": {
            const key = args[1];
            if (args.includes("NX") && redis.has(key)) return redisResponse(null);
            redis.set(key, args[2]);
            return redisResponse("OK");
        }
        case "GET":
            return redisResponse(redis.has(args[1]) ? redis.get(args[1]) : null);
        case "DEL":
            return redisResponse(redis.delete(args[1]) ? 1 : 0);
        case "ZADD": {
            const key = args[1];
            if (!sortedSets.has(key)) sortedSets.set(key, new Map());
            const set = sortedSets.get(key);
            const existed = set.has(args[3]);
            set.set(args[3], Number(args[2]));
            return redisResponse(existed ? 0 : 1);
        }
        case "ZCARD":
            return redisResponse((sortedSets.get(args[1]) || new Map()).size);
        case "ZREVRANGE": {
            const members = orderedMembers(args[1], true).map(([member]) => member);
            return redisResponse(members.slice(Number(args[2]), Number(args[3]) + 1));
        }
        case "ZREM": {
            const set = sortedSets.get(args[1]) || new Map();
            let removed = 0;
            for (const member of args.slice(2)) if (set.delete(member)) removed += 1;
            return redisResponse(removed);
        }
        case "ZREMRANGEBYRANK": {
            const set = sortedSets.get(args[1]) || new Map();
            const members = orderedMembers(args[1]).slice(Number(args[2]), Number(args[3]) + 1);
            let removed = 0;
            for (const [member] of members) if (set.delete(member)) removed += 1;
            return redisResponse(removed);
        }
        case "EVAL": {
            const lockKey = args[3];
            const lockOwner = args[4];
            if (redis.get(lockKey) === lockOwner) {
                redis.delete(lockKey);
                return redisResponse(1);
            }
            return redisResponse(0);
        }
        default:
            throw new Error("Comando Redis no implementado en el mock: " + operation);
    }
}
function sign(payload, secret) {
    return "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
}
function request(server, method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const address = server.address();
        const payload = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
        const requestHeaders = { ...headers };
        if (payload && !requestHeaders["content-type"]) requestHeaders["content-type"] = "application/json";
        if (payload) requestHeaders["content-length"] = Buffer.byteLength(payload);
        const req = http.request({
            hostname: "127.0.0.1", port: address.port, method, path, headers: requestHeaders
        }, res => {
            let raw = "";
            res.setEncoding("utf8");
            res.on("data", chunk => { raw += chunk; });
            res.on("end", () => {
                let parsed = raw;
                try { parsed = JSON.parse(raw); } catch { /* Keep plain response. */ }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on("error", reject);
        req.end(payload);
    });
}
function restoreEnvironment() {
    for (const key of ENV_KEYS) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
    }
}

async function main() {
    process.env.FACEBOOK_APP_SECRET = "concurrency-test-secret";
    delete process.env.META_APP_SECRET;
    process.env.KV_REST_API_URL = "https://redis-concurrency.invalid";
    process.env.KV_REST_API_TOKEN = "concurrency-test-token";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.REVIEW_API_TOKEN = "concurrency-operator-token";
    process.env.DISPATCH_ENABLED = "false";
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    delete process.env.META_PAGE_ACCESS_TOKEN;
    process.env.META_GRAPH_VERSION = "v23.0";
    global.fetch = simulatedFetch;

    const app = require("../server");
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const operatorHeaders = {
        authorization: "Bearer " + process.env.REVIEW_API_TOKEN,
        "content-type": "application/json"
    };
    const rawPayload = JSON.stringify({
        object: "page",
        entry: [{
            id: "concurrency_test_page",
            time: Date.now(),
            messaging: [{
                sender: { id: "concurrency_user_01" },
                recipient: { id: "concurrency_test_page" },
                timestamp: Date.now(),
                message: {
                    mid: "concurrency-identical-mid-001",
                    text: "Necesito hacer un reclamo por una demora en la atención"
                }
            }]
        }]
    });

    try {
        // CONC-01: identical signed webhook deliveries race for the same dedupe key.
        const webhookRequests = Array.from({ length: 5 }, () =>
            request(server, "POST", "/api/webhook/facebook", rawPayload, {
                "content-type": "application/json",
                "x-hub-signature-256": sign(rawPayload, process.env.FACEBOOK_APP_SECRET)
            })
        );
        const webhookResults = await Promise.all(webhookRequests);
        assert.deepEqual(webhookResults.map(result => result.status), [200, 200, 200, 200, 200]);

        const listed = await request(server, "GET", "/api/review?limit=10", undefined, operatorHeaders);
        assert.equal(listed.status, 200);
        assert.equal(listed.body.items.length, 1, "Los cinco reintentos deben producir un único caso");
        const item = listed.body.items[0];
        assert.equal(item.messageText, "Necesito hacer un reclamo por una demora en la atención");
        assert.equal(item.status, "pending");
        console.log("PASS | CONC-01: cinco webhooks idénticos producen un único ítem");

        // CONC-02: two operator approvals race; only one may reach Graph API.
        process.env.DISPATCH_ENABLED = "true";
        process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "test-page-token-not-real";
        const approvals = await Promise.all([
            request(server, "POST", "/api/review/" + item.id + "/approve",
                { proposedResponse: "Tu reclamo fue recibido y será revisado." }, operatorHeaders),
            request(server, "POST", "/api/review/" + item.id + "/approve",
                { proposedResponse: "Tu reclamo fue recibido y será revisado." }, operatorHeaders)
        ]);
        assert.equal(approvals.filter(result => result.status === 200).length, 1,
            "Exactamente una aprobación debe completar el despacho");
        assert.equal(approvals.filter(result => result.status === 409).length, 1,
            "La aprobación concurrente debe recibir conflicto de estado/lock");
        assert.equal(graphDispatchCount, 1, "Graph API debe recibir exactamente un despacho");

        const afterApproval = await request(server, "GET", "/api/review/" + item.id, undefined, operatorHeaders);
        assert.equal(afterApproval.status, 200);
        assert.equal(afterApproval.body.item.status, "sent");
        console.log("PASS | CONC-02: doble aprobación concurrente genera un único despacho");
        console.log("CONCURRENCIA MESSENGER: PASS");
    } finally {
        await new Promise(resolve => server.close(resolve));
        global.fetch = originalFetch;
        restoreEnvironment();
    }
}

main().catch(error => {
    console.error("CONCURRENCIA MESSENGER: FAIL");
    console.error(error);
    restoreEnvironment();
    global.fetch = originalFetch;
    process.exitCode = 1;
});
