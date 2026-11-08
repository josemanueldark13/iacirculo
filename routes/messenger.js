const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");
const { verifyMetaSignature } = require("../services/messengerSecurity");
const { createMessengerStateStore } = require("../services/messengerStateStore");

function envFirst(...names) {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) return value;
    }
    return null;
}

function appSecretProof(token) {
    const appSecret = envFirst("FACEBOOK_APP_SECRET", "META_APP_SECRET");
    if (!appSecret) return null;

    return crypto
        .createHmac("sha256", appSecret)
        .update(token)
        .digest("hex");
}

function verifySignature(req) {
    const appSecret = envFirst("FACEBOOK_APP_SECRET", "META_APP_SECRET");
    return verifyMetaSignature(
        req.rawBody,
        req.get("x-hub-signature-256"),
        appSecret
    );
}

function idempotencyStoreConfigured() {
    return Boolean(
        envFirst("UPSTASH_REDIS_REST_URL")
        && envFirst("UPSTASH_REDIS_REST_TOKEN")
    );
}

async function graphRequest(path, options = {}, useProof = false) {
    const token = envFirst("FACEBOOK_PAGE_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN");
    if (!token) throw new Error("Falta FACEBOOK_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN");

    const version = envFirst("META_GRAPH_VERSION") || "v23.0";
    const proof = useProof ? appSecretProof(token) : null;
    const separator = path.includes("?") ? "&" : "?";
    const url = proof
        ? "https://graph.facebook.com/" + version + path + separator + "appsecret_proof=" + encodeURIComponent(proof)
        : "https://graph.facebook.com/" + version + path;

    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
            ...(options.headers || {})
        }
    });

    const bodyText = await response.text();

    let body;
    try {
        body = JSON.parse(bodyText);
    } catch {
        body = { raw: bodyText };
    }

    if (!response.ok) {
        const message = body?.error?.message || bodyText || "Respuesta desconocida de Graph API";
        throw new Error("Graph API " + response.status + ": " + message);
    }

    return body;
}

router.get("/status", (req, res) => {
    res.json({
        ok: true,
        servicio: "CÍRCULO IA — Facebook Messenger",
        verify_token_configurado: Boolean(envFirst("FACEBOOK_VERIFY_TOKEN", "META_VERIFY_TOKEN")),
        page_access_token_configurado: Boolean(envFirst("FACEBOOK_PAGE_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN")),
        app_secret_configurado: Boolean(envFirst("FACEBOOK_APP_SECRET", "META_APP_SECRET")),
        idempotency_store_configurado: idempotencyStoreConfigured(),
        conversation_state_store_configurado: idempotencyStoreConfigured(),
        site_url: envFirst("CIRCULO_SITE_URL") || "https://iacirculo.vercel.app/"
    });
});

// Diagnóstico real de Graph API + suscripción de la Página.
// No expone tokens ni app secret.
router.get("/diagnose", async (req, res) => {
    const result = {
        ok: false,
        graph_api: "unknown",
        page_token_valid: false,
        page_id: null,
        page_name: null,
        subscription_query: "not_run",
        messages_subscribed: null,
        subscribed_apps_count: null,
        appsecret_proof_valid: null,
        appsecret_proof_error: null,
        graph_version: envFirst("META_GRAPH_VERSION") || "v23.0"
    };

    try {
        const page = await graphRequest("/me?fields=id,name");
        result.graph_api = "ok";
        result.page_token_valid = true;
        result.page_id = page.id || null;
        result.page_name = page.name || null;
    } catch (error) {
        result.graph_api = "error";
        result.page_token_error = error.message;
        return res.status(502).json(result);
    }

    try {
        const subscriptions = await graphRequest("/me/subscribed_apps");
        const apps = Array.isArray(subscriptions?.data) ? subscriptions.data : [];

        result.subscription_query = "ok";
        result.subscribed_apps_count = apps.length;
        result.messages_subscribed = apps.some(app =>
            Array.isArray(app.subscribed_fields) &&
            app.subscribed_fields.includes("messages")
        );
    } catch (error) {
        result.subscription_query = "error";
        result.subscription_error = error.message;
    }

    try {
        await graphRequest("/me?fields=id", {}, true);
        result.appsecret_proof_valid = true;
    } catch (error) {
        result.appsecret_proof_valid = false;
        result.appsecret_proof_error = error.message;
    }

    result.ok = result.page_token_valid && result.subscription_query === "ok";
    return res.status(result.ok ? 200 : 502).json(result);
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
    if (decision.estado === "fuera_de_dominio") {
        return "Ese tema queda fuera del ámbito institucional del Círculo. Puedo ayudarte con información sobre la institución, su historia y sus actividades.";
    }

    if (decision.estado === "requiere_reformulacion") {
        const suggestions = Array.isArray(decision.sugerencias)
            ? decision.sugerencias.slice(0, 3).join("; ")
            : "";
        return suggestions
            ? "No terminé de interpretar la consulta. ¿Podés reformularla? Algunas opciones: " + suggestions
            : "No terminé de interpretar la consulta. ¿Podés formularla de otra manera?";
    }

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
        return "Necesito consultar una fuente externa para darte una respuesta precisa sobre ese tema. Podés continuar en el portal: " + siteUrl;
    }

    return circuloIA.responder(pregunta);
}

async function sendMessage(recipientId, text) {
    const token = envFirst("FACEBOOK_PAGE_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN");
    if (!token) throw new Error("Falta FACEBOOK_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN");

    const version = envFirst("META_GRAPH_VERSION") || "v23.0";
    const response = await fetch(
        "https://graph.facebook.com/" + version + "/me/messages",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + token
            },
            body: JSON.stringify({
                recipient: { id: recipientId },
                messaging_type: "RESPONSE",
                message: { text }
            })
        }
    );

    const body = await response.text();

    if (!response.ok) {
        let detail = body;
        try {
            const parsed = JSON.parse(body);
            detail = parsed?.error?.message || body;
        } catch {
            // Conservamos la respuesta textual de Graph API.
        }

        throw new Error("Messenger Send API " + response.status + ": " + detail);
    }

    console.log("[Messenger] Respuesta enviada correctamente.");
}

router.post("/", async (req, res) => {
    if (!verifySignature(req)) {
        console.warn("[Messenger] Firma X-Hub-Signature-256 inválida, ausente o sin secreto configurado.");
        return res.sendStatus(403);
    }

    if (req.body?.object !== "page") {
        return res.sendStatus(200);
    }

    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    const events = entries.flatMap(entry =>
        Array.isArray(entry.messaging) ? entry.messaging : []
    );

    const messageEvents = events.filter(event =>
        Boolean(event.sender?.id)
        && typeof event.message?.text === "string"
        && event.message.text.trim().length > 0
        && !event.message?.is_echo
    );

    console.log("[Messenger] Webhook recibido:", {
        object: req.body?.object || null,
        entries: entries.length,
        events: events.length,
        text_events: messageEvents.length
    });

    if (messageEvents.length === 0) {
        return res.sendStatus(200);
    }

    if (!idempotencyStoreConfigured()) {
        console.error("[Messenger] Webhook detenido: falta configurar el almacén persistente de idempotencia.");
        return res.status(503).json({
            ok: false,
            error: "El procesamiento de mensajes requiere el almacén persistente de eventos."
        });
    }

    let stateStore;
    try {
        stateStore = createMessengerStateStore();
    } catch (error) {
        console.error("[Messenger] No se pudo iniciar el almacén persistente:", error.message);
        return res.status(503).json({
            ok: false,
            error: "El almacén persistente de Messenger no está disponible."
        });
    }

    try {
        for (const event of messageEvents) {
            const senderId = event.sender.id;
            const pregunta = event.message.text.trim();
            const eventId = event.message.mid;

            if (typeof eventId !== "string" || !eventId.trim()) {
                throw new Error("El evento entrante no contiene un identificador message.mid.");
            }

            const reservation = await stateStore.reserveEvent(eventId);
            if (!reservation) {
                console.log("[Messenger] Evento duplicado omitido.");
                continue;
            }

            let conversationLock = null;
            let messageDelivered = false;

            try {
                conversationLock = await stateStore.acquireConversationLock(senderId);
                if (!conversationLock) {
                    throw new Error("La conversación ya está siendo procesada; se solicitará un reintento.");
                }

                const context = await stateStore.loadConversation(senderId);
                const decision = kernel.process(pregunta, context);
                const respuesta = buildResponse(pregunta, decision);

                await sendMessage(senderId, respuesta);
                messageDelivered = true;

                // Primero se confirma el envío para que un reintento de Meta
                // no vuelva a disparar la misma respuesta.
                await stateStore.markEventSent(eventId, reservation);

                try {
                    await stateStore.saveConversation(senderId, {
                        previousQuestion: pregunta
                    });
                } catch (stateError) {
                    // La respuesta ya fue enviada y el evento quedó deduplicado.
                    // Se registra el fallo sin provocar un segundo envío automático.
                    console.error("[Messenger] No se pudo guardar el contexto conversacional:", stateError.message);
                }
            } catch (error) {
                if (!messageDelivered) {
                    try {
                        await stateStore.releaseEvent(eventId, reservation);
                    } catch (releaseError) {
                        console.error("[Messenger] No se pudo liberar la reserva del evento:", releaseError.message);
                    }
                }
                throw error;
            } finally {
                if (conversationLock) {
                    try {
                        await stateStore.releaseConversationLock(senderId, conversationLock);
                    } catch (lockError) {
                        console.error("[Messenger] No se pudo liberar el bloqueo conversacional:", lockError.message);
                    }
                }
            }
        }

        return res.sendStatus(200);
    } catch (error) {
        console.error("[Messenger] Fallo al procesar webhook:", error.message);
        return res.status(503).json({
            ok: false,
            error: "No se pudo completar el procesamiento. Meta puede reintentar el evento."
        });
    }
});

module.exports = router;
