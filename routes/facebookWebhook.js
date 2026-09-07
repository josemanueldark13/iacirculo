const express = require("express");
const router = express.Router();

const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");

const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN?.trim();
const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
const SITE_URL = process.env.CIRCULO_SITE_URL || "https://iacirculo.vercel.app/";

// Meta verifica que el endpoint pertenece a nuestra aplicación.
router.get("/", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (!VERIFY_TOKEN) {
        console.error("FACEBOOK_VERIFY_TOKEN no está configurado en Vercel.");
        return res.status(500).json({
            ok: false,
            error: "FACEBOOK_VERIFY_TOKEN no configurado"
        });
    }

    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
        return res.status(200).send(challenge);
    }

    return res.status(403).send("Forbidden");
});

// Diagnóstico seguro: informa si las variables existen sin exponer sus valores.
router.get("/status", (req, res) => {
    res.json({
        ok: true,
        servicio: "CÍRCULO IA — Facebook Webhook",
        verify_token_configurado: Boolean(VERIFY_TOKEN),
        page_access_token_configurado: Boolean(PAGE_ACCESS_TOKEN),
        site_url: SITE_URL
    });
});

async function enviarMensaje(recipientId, text) {
    if (!PAGE_ACCESS_TOKEN) {
        throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN no está configurado en Vercel.");
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

        // Confirmamos a Meta solo después de procesar el evento.
        return res.sendStatus(200);
    } catch (error) {
        console.error("Error procesando webhook de Facebook:", error);
        return res.status(500).json({
            ok: false,
            error: "Error procesando webhook de Facebook"
        });
    }
});

module.exports = router;
