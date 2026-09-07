const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");

function verifySignature(req) {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) return true; // obligatorio configurarlo en producción

    const signature = req.get("x-hub-signature-256");
    if (!signature || !req.rawBody) return false;

    const expected = "sha256=" + crypto
        .createHmac("sha256", appSecret)
        .update(req.rawBody)
        .digest("hex");

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
    );
}

router.get("/", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

async function sendMessage(recipientId, text) {
    const token = process.env.META_PAGE_ACCESS_TOKEN;
    if (!token) throw new Error("Falta META_PAGE_ACCESS_TOKEN");

    const version = process.env.META_GRAPH_VERSION || "v23.0";
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
        return "Necesito consultar una fuente externa para darte una respuesta precisa sobre ese tema.";
    }

    return circuloIA.responder(pregunta);
}

router.post("/", async (req, res) => {
    if (!verifySignature(req)) return res.sendStatus(403);

    // Facebook espera una confirmación rápida del webhook.
    res.sendStatus(200);

    try {
        const body = req.body;
        if (body.object !== "page") return;

        for (const entry of body.entry || []) {
            for (const event of entry.messaging || []) {
                const senderId = event.sender && event.sender.id;
                const pregunta = event.message && event.message.text;

                if (!senderId || !pregunta) continue;

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
