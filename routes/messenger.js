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

async function graphRequest(path, options = {}, useProof = false) {
    const token = envFirst("FACEBOOK_PAGE_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN");
    if (!token) throw new Error("Falta FACEBOOK_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN");

    const version = envFirst("META_GRAPH_VERSION") || "v23.0";
    const proof = useProof ? appSecretProof(token) : null;
    const separator = path.includes("?") ? "&" : "?";
    const url = proof
        ? `https://graph.facebook.com/${version}${path}${separator}appsecret_proof=${encodeURIComponent(proof)}`
        : `https://graph.facebook.com/${version}${path}`;
    
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
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
        throw new Error(`Graph API ${response.status}: ${message}`);
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
        `https://graph.facebook.com/${version}/me/messages`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
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

        throw new Error(`Messenger Send API ${response.status}: ${detail}`);
    }

    console.log("[Messenger] Respuesta enviada correctamente.");
}

router.post("/", async (req, res) => {
    if (!verifySignature(req)) {
        console.warn("[Messenger] Firma X-Hub-Signature-256 inválida o ausente.");
        return res.sendStatus(403);
    }

    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    const events = entries.flatMap(entry =>
        Array.isArray(entry.messaging) ? entry.messaging : []
    );

    console.log("[Messenger] Webhook recibido:", {
        object: req.body?.object || null,
        entries: entries.length,
        events: events.length,
        text_events: events.filter(event => Boolean(event.message?.text) && !event.message?.is_echo).length
    });

    try {
        if (req.body?.object !== "page") {
            return res.sendStatus(200);
        }

        const jobs = [];

        for (const event of events) {
            const senderId = event.sender?.id;
            const pregunta = event.message?.text;

            if (!senderId || !pregunta || event.message?.is_echo) continue;

            const decision = kernel.process(pregunta);
            const respuesta = buildResponse(pregunta, decision);

            jobs.push(
                sendMessage(senderId, respuesta).catch(error => {
                    console.error("[Messenger] Error al enviar respuesta:", error.message);
                })
            );
        }

        await Promise.all(jobs);
        return res.sendStatus(200);
    } catch (error) {
        console.error("[Messenger] Error procesando webhook:", error);
        return res.sendStatus(200);
    }
});

module.exports = router;
