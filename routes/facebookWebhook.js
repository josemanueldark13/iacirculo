const express = require("express");
const router = express.Router();

const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");

const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const SITE_URL = process.env.CIRCULO_SITE_URL || "https://circulolegisladoresia.netlify.app/";

// Meta verifica que el endpoint pertenece a nuestra aplicación.
router.get("/", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

async function enviarMensaje(recipientId, text) {
    if (!PAGE_ACCESS_TOKEN) {
        console.warn("FACEBOOK_PAGE_ACCESS_TOKEN no está configurado; no se enviará respuesta a Facebook.");
        return;
    }

    const response = await fetch(
        `https://graph.facebook.com/v23.0/me/messages?access_token=${encodeURIComponent(PAGE_ACCESS_TOKEN)}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text }
            })
        }
    );

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Facebook Graph API: ${response.status} ${detail}`);
    }
}

function construirRespuesta(pregunta) {
    const decision = kernel.process(pregunta);

    if (decision.estado === "requiere_reformulacion") {
        return "Necesito que reformules la consulta. Por ejemplo: ¿Quién es el presidente del Círculo?";
    }

    if (decision.estado === "fuera_de_dominio") {
        return "La consulta está fuera del dominio institucional de CÍRCULO IA.";
    }

    if (decision.requiere_fuente_externa) {
        return `Esta consulta requiere información externa al corpus institucional. Podés continuar en el portal de CÍRCULO IA: ${SITE_URL}`;
    }

    return circuloIA.responder(pregunta);
}

// Recibe mensajes/eventos enviados por Meta Messenger.
router.post("/", async (req, res) => {
    if (req.body?.object !== "page") {
        return res.sendStatus(404);
    }

    // Respondemos rápido a Meta y procesamos los mensajes recibidos.
    res.sendStatus(200);

    try {
        for (const entry of req.body.entry || []) {
            for (const event of entry.messaging || []) {
                const senderId = event.sender?.id;
                const message = event.message?.text;

                if (!senderId || !message || event.message?.is_echo) {
                    continue;
                }

                const respuesta = construirRespuesta(message);
                await enviarMensaje(senderId, respuesta);
            }
        }
    } catch (error) {
        console.error("Error procesando webhook de Facebook:", error);
    }
});

module.exports = router;
