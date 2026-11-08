"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const router = require("../routes/messenger");

const app = express();
app.use(express.json({
    verify: (req, res, buffer) => {
        req.rawBody = Buffer.from(buffer);
    }
}));
app.use("/test-messenger", router);

const server = app.listen(0);
const originalEnv = {};

const ENV_KEYS = [
    "FACEBOOK_APP_SECRET",
    "META_APP_SECRET",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN"
];

function signature(body, secret) {
    return "sha256=" + crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");
}

async function post(baseUrl, payload, secret) {
    const body = JSON.stringify(payload);
    return fetch(baseUrl + "/test-messenger", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Hub-Signature-256": signature(body, secret)
        },
        body
    });
}

async function run() {
    if (!server.listening) {
        await new Promise(resolve => server.once("listening", resolve));
    }

    for (const key of ENV_KEYS) {
        originalEnv[key] = process.env[key];
        delete process.env[key];
    }

    const address = server.address();
    const baseUrl = "http://127.0.0.1:" + address.port;
    const messagePayload = {
        object: "page",
        entry: [{
            messaging: [{
                sender: { id: "sender-test" },
                message: { mid: "mid-test", text: "¿Dónde queda el Círculo?" }
            }]
        }]
    };

    const noSecret = await post(baseUrl, messagePayload, "not-configured-secret");
    assert.equal(noSecret.status, 403);
    console.log("PASS webhook rechaza eventos cuando falta FACEBOOK_APP_SECRET");

    process.env.FACEBOOK_APP_SECRET = "configured-test-secret";

    const invalidSignature = await fetch(baseUrl + "/test-messenger", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Hub-Signature-256": "sha256=invalid"
        },
        body: JSON.stringify(messagePayload)
    });
    assert.equal(invalidSignature.status, 403);
    console.log("PASS webhook rechaza firmas inválidas");

    const noPersistentStore = await post(baseUrl, messagePayload, process.env.FACEBOOK_APP_SECRET);
    assert.equal(noPersistentStore.status, 503);
    console.log("PASS webhook no procesa mensajes si falta el almacén persistente");

    const deliveryPayload = {
        object: "page",
        entry: [{
            messaging: [{
                sender: { id: "sender-test" },
                delivery: { mids: ["mid-already-delivered"], watermark: Date.now() }
            }]
        }]
    };
    const delivery = await post(baseUrl, deliveryPayload, process.env.FACEBOOK_APP_SECRET);
    assert.equal(delivery.status, 200);
    console.log("PASS webhook confirma eventos de entrega sin tratarlos como mensajes");

    const status = await fetch(baseUrl + "/test-messenger/status");
    const statusBody = await status.json();
    assert.equal(statusBody.idempotency_store_configurado, false);
    console.log("PASS diagnóstico informa si el almacén persistente está configurado");

    console.log("\nMESSENGER WEBHOOK: PASS");
}

run()
    .catch(error => {
        console.error("MESSENGER WEBHOOK: FAIL");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        for (const key of ENV_KEYS) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
        server.close();
    });
