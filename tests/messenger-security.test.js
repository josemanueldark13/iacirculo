"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { verifyMetaSignature } = require("../services/messengerSecurity");
const { createMessengerStateStore } = require("../services/messengerStateStore");

function signed(payload, secret) {
    return "sha256=" + crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("hex");
}

async function run() {
    const secret = "test-app-secret";
    const body = Buffer.from('{"object":"page","entry":[]}');
    const validSignature = signed(body, secret);

    assert.equal(verifyMetaSignature(body, validSignature, secret), true);
    console.log("PASS verifica una firma Meta válida");

    assert.equal(verifyMetaSignature(body, validSignature, null), false);
    console.log("PASS falla de forma cerrada si falta el secreto");

    assert.equal(verifyMetaSignature(body, null, secret), false);
    console.log("PASS rechaza una firma ausente");

    assert.equal(verifyMetaSignature(body, "sha256=bad", secret), false);
    console.log("PASS rechaza una firma malformada");

    assert.equal(
        verifyMetaSignature(Buffer.from('{"object":"user"}'), validSignature, secret),
        false
    );
    console.log("PASS rechaza un cuerpo alterado");

    assert.throws(
        () => createMessengerStateStore({ url: "", token: "" }),
        /Faltan UPSTASH/
    );
    console.log("PASS exige URL y token del almacén persistente");

    assert.throws(
        () => createMessengerStateStore({
            url: "http://redis.example.test",
            token: "test-token",
            fetchImpl: async () => ({})
        }),
        /HTTPS/
    );
    console.log("PASS exige HTTPS para Redis REST");

    const calls = [];
    const fakeFetch = async (url, options) => {
        calls.push({ url, options, command: JSON.parse(options.body) });
        const command = calls[calls.length - 1].command;
        let result = "OK";

        if (command[0] === "GET") {
            result = JSON.stringify({ previousQuestion: "¿Dónde queda el Círculo?" });
        } else if (command[0] === "EVAL") {
            result = 1;
        }

        return {
            ok: true,
            status: 200,
            json: async () => ({ result })
        };
    };

    const store = createMessengerStateStore({
        url: "https://redis.example.test",
        token: "test-token",
        fetchImpl: fakeFetch
    });

    const reservation = await store.reserveEvent("mid-test-001");
    assert.equal(typeof reservation, "string");
    assert.equal(calls.at(-1).command[0], "SET");
    assert.equal(calls.at(-1).command[3], "NX");
    console.log("PASS reserva un identificador de evento con SET NX");

    await store.markEventSent("mid-test-001", reservation);
    assert.equal(calls.at(-1).command[0], "EVAL");
    console.log("PASS confirma el evento solo si conserva la reserva");

    await store.releaseEvent("mid-test-002", "reservation-token");
    assert.equal(calls.at(-1).command[0], "EVAL");
    console.log("PASS libera reservas de forma condicionada al propietario");

    const lock = await store.acquireConversationLock("sender-001");
    assert.equal(typeof lock, "string");
    assert.equal(calls.at(-1).command[0], "SET");
    assert.equal(calls.at(-1).command[3], "NX");
    console.log("PASS adquiere un bloqueo exclusivo por conversación");

    await store.releaseConversationLock("sender-001", lock);
    assert.equal(calls.at(-1).command[0], "EVAL");
    console.log("PASS libera el bloqueo de conversación de forma segura");

    const context = await store.loadConversation("sender-001");
    assert.equal(context.previousQuestion, "¿Dónde queda el Círculo?");
    console.log("PASS recupera el contexto conversacional persistido");

    await store.saveConversation("sender-001", {
        previousQuestion: "¿Quién preside?"
    });
    assert.equal(calls.at(-1).command[0], "SET");
    assert.equal(calls.at(-1).command[4], "EX");
    console.log("PASS persiste la última pregunta con vencimiento");

    const duplicateStore = createMessengerStateStore({
        url: "https://redis.example.test",
        token: "test-token",
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            json: async () => ({ result: null })
        })
    });
    assert.equal(await duplicateStore.reserveEvent("mid-duplicate"), null);
    console.log("PASS identifica un evento ya reservado como duplicado");

    console.log("\nMESSENGER SECURITY/STORE: PASS");
}

run().catch(error => {
    console.error("MESSENGER SECURITY/STORE: FAIL");
    console.error(error);
    process.exitCode = 1;
});
