const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");

function envFirst(...names) {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) return value;
    }
    return null;
}

function verifySignature(req) {
    const appSecret = envFirst("FACEBOOK_APP_SECRET", "META_APP_SECRET");
    if (!appSecret) return true;

    const signature = req.get("x-hub-signature-256");
    if (!signature || !req.rawBody) return false;

    const expected = "sha256=" + crypto
        .createHmac("sha256", appSecret)
        .update(req.rawBody)
        .digest("hex");

    const received = Buffer.from(signature, "utf8");
    const calculated = Buffer.from(expected, "utf8");

    return received.length === calculated.length &&
        crypto.timingSafeEqual(received, calculated);
}

router.get("/status", (req, res) => {
    res.json({
        ok: true,
        servicio: "CÍRCULO IA — Facebook Messenger",
        verify_token_configurado: Boolean(envFirst("FACEBOOK_VERIFY_TOKEN", "META_VERIFY_TOKEN")),
        page_access_token_configurado: Boolean(envFirst("FACEBOOK_PAGE_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN")),
        app_secret_configurado: Boolean(envFirst("FACEBOOK_APP_SECRET", "META_APP_SECRET")),
        site_url: envFirst("CIRCULO_SITE_URL") || "https://iacirculo.vercel.app/"
    });
});

router.get("/", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const expectedToken = envFirst("FACEBOOK_VERIFY_TOKEN", "META_VERIFY_TOKEN");

    if (mode === "subscribe" && expectedToken && token === expectedToken && challenge) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

function buildResponse(pregunta, decision) {
    if (decision.agente === "orientacion") {
        return "Voy a ayudarte con orientación y datos de contacto del Círculo de Legisladores. ¿Qué dato necesitás?";
    }

    if (decision.agente === "operativo") {
        return "Voy a ayudarte con información operativa del Círculo. ¿Qué necesitás saber?";
    }

    if (decision.agente === "contacto") {
        return "Claro. Podés dejar tu mensaje para el Círculo y será recibido para su atención.";
    }

    if (decision.agente === "formativo") {
        return "Puedo ayudarte a aprender sobre el Círculo, la historia parlamentaria y la participación ciudadana. ¿Sobre qué tema querés aprender?";
    }

    if (decision.requiere_fuente_externa) {
        const siteUrl = envFirst("CIRCULO_SITE_URL") || "https://iacirculo.vercel.app/";
        return `Necesito consultar una fuente externa para darte una respuesta precisa sobre ese tema. Podés continuar en el portal: ${siteUrl}`;
    }

    return circuloIA.responder(pregunta);
}

async function sendMessage(recipientId, text) {
    const token = envFirst("FACEBOOK_PAGE_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN");
    if (!token) throw new Error("Falta FACEBOOK_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN");

    const version = envFirst("META_GRAPH_VERSION") || "v23.0";
    const response = await fetch(
        `https://graph.facebook.com/${version}/me/messages?access_token=${encodeURIComponent(token)}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                recipient: { id: recipientId },
                messaging_type: "RESPONSE",
                message: { text }
            })
        }
    );

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Messenger Send API: ${response.status} ${body}`);
    }
}

router.post("/", async (req, res) => {
    if (!verifySignature(req)) return res.sendStatus(403);

    // Meta espera una confirmación rápida del webhook.
    res.sendStatus(200);

    try {
        if (req.body?.object !== "page") return;

        for (const entry of req.body.entry || []) {
            for (const event of entry.messaging || []) {
                const senderId = event.sender?.id;
                const pregunta = event.message?.text;

                if (!senderId || !pregunta || event.message?.is_echo) continue;

                const decision = kernel.process(pregunta);
                const respuesta = buildResponse(pregunta, decision);
                await sendMessage(senderId, respuesta);
            }
        }
    } catch (error) {
        console.error("Error en Webhook Messenger:", error);
    }
});

module.exports = router;
