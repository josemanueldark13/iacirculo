"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");

const ENV_KEYS = [
    "FACEBOOK_APP_SECRET",
    "META_APP_SECRET",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "REVIEW_API_TOKEN",
    "DISPATCH_ENABLED",
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "META_PAGE_ACCESS_TOKEN"
];
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
const originalFetch = global.fetch;

const redis = new Map();
const sortedSets = new Map();
const externalRequests = [];

function response(result) {
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
        externalRequests.push({ url: target, options });
        throw new Error("La prueba prohíbe conexiones con Facebook Graph API.");
    }

    if (target !== process.env.KV_REST_API_URL) {
        throw new Error("Destino externo no permitido en la simulación.");
    }

    const command = JSON.parse(options.body || "[]");
    const operation = String(command[0] || "").toUpperCase();

    switch (operation) {
        case "SET": {
            const key = command[1];
            if (command.includes("NX") && redis.has(key)) return response(null);
            redis.set(key, command[2]);
            return response("OK");
        }
        case "GET":
            return response(redis.has(command[1]) ? redis.get(command[1]) : null);
        case "DEL":
            return response(redis.delete(command[1]) ? 1 : 0);
        case "ZADD": {
            const key = command[1];
            if (!sortedSets.has(key)) sortedSets.set(key, new Map());
            const set = sortedSets.get(key);
            const existed = set.has(command[3]);
            set.set(command[3], Number(command[2]));
            return response(existed ? 0 : 1);
        }
        case "ZCARD":
            return response((sortedSets.get(command[1]) || new Map()).size);
        case "ZREVRANGE": {
            const members = orderedMembers(command[1], true).map(([member]) => member);
            return response(members.slice(Number(command[2]), Number(command[3]) + 1));
        }
        case "ZREM": {
            const set = sortedSets.get(command[1]) || new Map();
            let removed = 0;
            for (const member of command.slice(2)) {
                if (set.delete(member)) removed += 1;
            }
            return response(removed);
        }
        case "ZREMRANGEBYRANK": {
            const set = sortedSets.get(command[1]) || new Map();
            const members = orderedMembers(command[1]).slice(Number(command[2]), Number(command[3]) + 1);
            let removed = 0;
            for (const [member] of members) {
                if (set.delete(member)) removed += 1;
            }
            return response(removed);
        }
        case "EVAL": {
            const key = command[3];
            const owner = command[4];
            if (redis.get(key) === owner) {
                redis.delete(key);
                return response(1);
            }
            return response(0);
        }
        default:
            throw new Error("Comando de Redis no previsto en la simulación: " + operation);
    }
}

function signature(rawBody, secret) {
    return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function send(server, method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const address = server.address();
        const payload = body === undefined
            ? ""
            : typeof body === "string" ? body : JSON.stringify(body);
        const requestHeaders = { ...headers };

        if (payload && !requestHeaders["content-type"]) {
            requestHeaders["content-type"] = "application/json";
        }
        if (payload) requestHeaders["content-length"] = Buffer.byteLength(payload);

        const request = http.request({
            hostname: "127.0.0.1",
            port: address.port,
            method,
            path,
            headers: requestHeaders
        }, result => {
            let text = "";
            result.setEncoding("utf8");
            result.on("data", chunk => { text += chunk; });
            result.on("end", () => {
                let parsed = text;
                try { parsed = JSON.parse(text); } catch { /* Preserve plain text. */ }
                resolve({ status: result.statusCode, body: parsed });
            });
        });

        request.on("error", reject);
        request.end(payload);
    });
}

async function main() {
    process.env.FACEBOOK_APP_SECRET = "preview-simulation-secret-only";
    delete process.env.META_APP_SECRET;
    process.env.KV_REST_API_URL = "https://redis-simulation.invalid";
    process.env.KV_REST_API_TOKEN = "simulation-token-only";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.REVIEW_API_TOKEN = "operator-simulation-token";
    process.env.DISPATCH_ENABLED = "false";
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    delete process.env.META_PAGE_ACCESS_TOKEN;
    global.fetch = simulatedFetch;

    const kernel = require("../Kernels/kernel");
    const urgentDecision = kernel.process(
        "Necesito asistencia urgente con un reclamo de servicio y la base de datos no responde"
    );
    assert.equal(urgentDecision.intencion, "urgencia");
    assert.equal(urgentDecision.prioridad, "critica");
    assert.equal(urgentDecision.agente, "atencion_humana");
    assert.equal(urgentDecision.confianza_intencion, 0.98);
    console.log("PASS | El Kernel clasifica urgencia crítica y expone confianza de intención");

    const complaintDecision = kernel.process("Quiero hacer un reclamo por un servicio");
    assert.equal(complaintDecision.intencion, "reclamo");
    assert.equal(complaintDecision.prioridad, "alta");
    assert.equal(complaintDecision.agente, "atencion_humana");
    console.log("PASS | El Kernel clasifica un reclamo ordinario con prioridad alta");

    const app = require("../server");
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

    const secret = process.env.FACEBOOK_APP_SECRET;
    const operatorHeaders = {
        authorization: "Bearer " + process.env.REVIEW_API_TOKEN,
        "content-type": "application/json"
    };
    const messageText =
        "Necesito asistencia urgente con un reclamo de servicio y la base de datos no responde";
    const rawPayload = JSON.stringify({
        object: "page",
        entry: [{
            id: "simulation_page",
            time: Date.now(),
            messaging: [{
                sender: { id: "simulation_user_01" },
                recipient: { id: "simulation_page" },
                timestamp: Date.now(),
                message: {
                    mid: "simulation-mid-0001",
                    text: messageText
                }
            }]
        }]
    });

    try {
        const missingSignature = await send(
            server,
            "POST",
            "/api/webhook/facebook",
            rawPayload,
            { "content-type": "application/json" }
        );
        assert.equal(missingSignature.status, 401);
        console.log("PASS | Firma ausente rechazada antes del procesamiento");

        const invalidSignature = await send(
            server,
            "POST",
            "/api/webhook/facebook",
            rawPayload,
            {
                "content-type": "application/json",
                "x-hub-signature-256": "sha256=" + "0".repeat(64)
            }
        );
        assert.equal(invalidSignature.status, 401);
        console.log("PASS | Firma HMAC incorrecta rechazada con HTTP 401");

        const malformedBody = "{not valid JSON";
        const malformedSigned = await send(
            server,
            "POST",
            "/api/webhook/facebook",
            malformedBody,
            {
                "content-type": "application/json",
                "x-hub-signature-256": signature(malformedBody, secret)
            }
        );
        assert.equal(malformedSigned.status, 400);
        console.log("PASS | JSON malformado se rechaza después de validar su firma");

        const accepted = await send(
            server,
            "POST",
            "/api/webhook/facebook",
            rawPayload,
            {
                "content-type": "application/json",
                "x-hub-signature-256": signature(rawPayload, secret)
            }
        );
        assert.equal(accepted.status, 200);
        console.log("PASS | El webhook acepta el payload con firma válida");

        const listed = await send(
            server,
            "GET",
            "/api/review?limit=10",
            undefined,
            operatorHeaders
        );
        assert.equal(listed.status, 200);
        assert.equal(listed.body.items.length, 1);
        const item = listed.body.items[0];

        assert.equal(item.status, "pending");
        assert.equal(item.priority, "critica");
        assert.equal(item.kernelDecision.intencion, "urgencia");
        assert.equal(item.kernelDecision.agente, "atencion_humana");
        assert.equal(item.kernelDecision.prioridad, "critica");
        assert.equal(item.kernelDecision.confianza_intencion, 0.98);
        assert.match(item.proposedResponse, /mensaje prioritario.*revisión humana/i);
        assert.equal(item.messageText, messageText);
        console.log("PASS | El caso queda persistido como pendiente en la bandeja");
        console.log("PASS | La urgencia conserva prioridad humana aunque el tema sea externo");

        const duplicate = await send(
            server,
            "POST",
            "/api/webhook/facebook",
            rawPayload,
            {
                "content-type": "application/json",
                "x-hub-signature-256": signature(rawPayload, secret)
            }
        );
        assert.equal(duplicate.status, 200);

        const afterDuplicate = await send(
            server,
            "GET",
            "/api/review?limit=10",
            undefined,
            operatorHeaders
        );
        assert.equal(afterDuplicate.body.items.length, 1);
        console.log("PASS | El mismo message.mid no crea un caso duplicado");

        const approval = await send(
            server,
            "POST",
            "/api/review/" + item.id + "/approve",
            { proposedResponse: item.proposedResponse },
            operatorHeaders
        );
        assert.equal(approval.status, 403);
        assert.equal(externalRequests.length, 0);
        console.log("PASS | La aprobación no despacha mensajes cuando DISPATCH_ENABLED=false");
        console.log("PASS | Ninguna conexión fue realizada a Facebook Graph API");
        console.log("SIMULACIÓN WEBHOOK END-TO-END: PASS");
    } finally {
        await new Promise(resolve => server.close(resolve));
        global.fetch = originalFetch;
        for (const key of ENV_KEYS) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    }
}

main().catch(error => {
    console.error("SIMULACIÓN WEBHOOK END-TO-END: FAIL");
    console.error(error);
    process.exitCode = 1;
});
