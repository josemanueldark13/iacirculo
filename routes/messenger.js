const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");
const messengerSend = require("../services/messengerSend");

function envFirst(...names) {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) return value;
    }
    return null;
}

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function verifySignature(req) {
    const appSecret = envFirst("FACEBOOK_APP_SECRET", "META_APP_SECRET");

    // En producción no aceptamos eventos sin poder verificar su origen.
    if (!appSecret || !req.rawBody) return false;

    const signature = req.get("x-hub-signature-256");
    if (!signature) return false;

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

// Diagnóstico local de configuración. No consulta Graph API ni requiere
// pages_read_engagement. No certifica la validez del token ni la suscripción
// remota: esas condiciones se comprueban mediante pruebas funcionales autorizadas.
router.get("/diagnose", (req, res) => {
    const appSecretConfigured = Boolean(envFirst("FACEBOOK_APP_SECRET", "META_APP_SECRET"));
    const pageTokenConfigured = Boolean(envFirst("FACEBOOK_PAGE_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN"));
    const verifyTokenConfigured = Boolean(envFirst("FACEBOOK_VERIFY_TOKEN", "META_VERIFY_TOKEN"));

    const result = {
        ok: appSecretConfigured && pageTokenConfigured && verifyTokenConfigured,
        diagnostic_mode: "local",
        servicio: "CÍRCULO IA — Facebook Messenger",
        graph_api: "not_checked",
        page_token_configured: pageTokenConfigured,
        page_token_valid: null,
        app_secret_configured: appSecretConfigured,
        verify_token_configured: verifyTokenConfigured,
        webhook_signature_verification: appSecretConfigured ? "configured" : "missing_app_secret",
        subscription_query: "not_checked",
        messages_subscribed: null,
        appsecret_proof_valid: null,
        graph_version: envFirst("META_GRAPH_VERSION") || "v23.0",
        note: "Diagnóstico local: no verifica la validez del token ni la suscripción de la Página en Meta."
    };

    return res.status(result.ok ? 200 : 503).json(result);
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
    const q = normalizeText(pregunta);

    // La bienvenida configurada en Meta se conserva. Estas respuestas se usan
    // cuando la persona ya empezó a escribirle a la Página.
    const greetings = new Set([
        "hola", "holi", "buen dia", "buenos dias", "buenas tardes",
        "buenas noches", "buenas", "saludos", "que tal", "hey",
        "hello", "hola circulo ia", "hola circulo"
    ]);
    if (greetings.has(q)) {
        return "¡Hola! Soy CÍRCULO IA, el asistente del Círculo de Legisladores de Tucumán. Puedo orientarte sobre la institución, autoridades, historia, legislación, actividades y contacto. ¿Qué necesitás saber?";
    }

    const thanks = new Set(["gracias", "muchas gracias", "te agradezco", "perfecto gracias"]);
    if (thanks.has(q)) {
        return "¡De nada! Estoy para ayudarte con información del Círculo de Legisladores.";
    }

    const farewells = new Set(["chau", "adios", "hasta luego", "hasta pronto", "nos vemos"]);
    if (farewells.has(q)) {
        return "Hasta luego. Gracias por comunicarte con el Círculo de Legisladores.";
    }

    // Una solicitud para dejar un mensaje debe abrir el canal de atención,
    // no responder con una ficha documental genérica.
    if (decision?.agente === "contacto") {
        return "Claro. Contame brevemente tu consulta o el motivo de tu mensaje. Lo dejamos preparado para su atención por el Círculo de Legisladores.";
    }

    if (decision?.estado === "requiere_reformulacion") {
        const suggestions = Array.isArray(decision.sugerencias) ? decision.sugerencias : [];
        const topics = suggestions.length ? suggestions.join(", ") : "autoridades, historia, legislación, actividades o contacto";
        return "No terminé de comprender la consulta. ¿Podés expresarla de otra manera? También podés preguntar por: " + topics + ".";
    }

    if (decision?.requiere_fuente_externa) {
        const siteUrl = envFirst("CIRCULO_SITE_URL") || "https://iacirculo.vercel.app/";
        return "Esa consulta requiere verificar información en fuentes externas. Podés continuar en el portal de CÍRCULO IA: " + siteUrl;
    }

    // Si el Kernel no reconoce relación institucional, explicamos el alcance
    // de forma cordial. No se envía una respuesta genérica de otro agente.
    if (decision?.estado === "fuera_de_dominio" && decision?.agente === "institucional") {
        return "Puedo ayudarte con información del Círculo de Legisladores de Tucumán: autoridades, historia, Ley Provincial 6.333, actividades, documentación y contacto. ¿Tu consulta está relacionada con alguno de esos temas?";
    }

    // Para consultas reconocidas, priorizamos la respuesta documental concreta.
    // Así orientación/operativo/formativo no reemplazan datos por frases vacías.
    return circuloIA.responder(pregunta);
}

function parseAndNormalizeEvent(event) {
    if (!event || event.message?.is_echo) return null;

    const senderId = event.sender?.id;
    if (!senderId) return null;

    // Meta puede enviar el payload de un botón junto con el objeto message.
    // El payload de quick reply tiene prioridad sobre el texto visible.
    if (typeof event.message?.quick_reply?.payload === "string" &&
        event.message.quick_reply.payload.trim()) {
        return {
            senderId,
            type: "quick_reply",
            pregunta: event.message.quick_reply.payload.trim()
        };
    }

    if (typeof event.message?.text === "string" && event.message.text.trim()) {
        return {
            senderId,
            type: "text",
            pregunta: event.message.text.trim()
        };
    }

    if (Array.isArray(event.message?.attachments) && event.message.attachments.length) {
        return {
            senderId,
            type: "attachment",
            pregunta: event.message.attachments
        };
    }

    if (typeof event.postback?.payload === "string" && event.postback.payload.trim()) {
        return {
            senderId,
            type: "postback",
            pregunta: event.postback.payload.trim()
        };
    }

    return null;
}

router.post("/", async (req, res) => {
    if (!verifySignature(req)) {
        console.warn("[Messenger] Firma inválida o ausente; evento rechazado.");
        return res.sendStatus(403);
    }

    if (req.body?.object !== "page") {
        return res.sendStatus(404);
    }

    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    const events = entries.flatMap(entry =>
        Array.isArray(entry.messaging) ? entry.messaging : []
    );

    console.log("[Messenger] Webhook recibido:", {
        entries: entries.length,
        events: events.length,
        text_events: events.filter(event => Boolean(event.message?.text) && !event.message?.is_echo).length,
        attachment_events: events.filter(event => Boolean(event.message?.attachments?.length) && !event.message?.is_echo).length,
        postback_events: events.filter(event => Boolean(event.postback)).length
    });

    try {
        // Procesamiento secuencial para conservar el orden de los mensajes
        // dentro de un mismo evento de webhook.
        for (const event of events) {
            const normalized = parseAndNormalizeEvent(event);
            if (!normalized) continue;

            const { senderId, type, pregunta } = normalized;

            if (type === "attachment") {
                await messengerSend.sendMessage(
                    senderId,
                    "Recibí el archivo o la imagen. Contame qué necesitás consultar sobre ese material y te ayudo."
                );
                continue;
            }

            // El saludo inicial/Get Started de la Página sigue a cargo de la
            // configuración de bienvenida de Meta; no enviamos otro saludo
            // desde el webhook para evitar duplicarlo.
            const decision = kernel.process({
                pregunta,
                type,
                senderId
            });

            if (decision?.estado === "accion_no_reconocida") {
                await sendMessage(
                    senderId,
                    "Ese botón no está disponible en este momento. Podés escribir tu consulta y te ayudo."
                );
                continue;
            }

            const preguntaParaResponder = decision?.pregunta || pregunta;
            const respuesta = buildResponse(preguntaParaResponder, decision);

            await sendMessage(senderId, respuesta);
        }

        return res.sendStatus(200);
    } catch (error) {
        console.error("[Messenger] Error procesando o enviando respuesta:", error.message);
        // Un 5xx permite que Meta reintente la entrega del evento.
        return res.sendStatus(500);
    }
});

module.exports = router;
module.exports.buildResponse = buildResponse;
module.exports.parseAndNormalizeEvent = parseAndNormalizeEvent;
