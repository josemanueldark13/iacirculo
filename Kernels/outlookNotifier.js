"use strict";

let cachedToken = null;
let tokenExpiresAt = 0;

function env(name) {
    return String(process.env[name] || "").trim();
}
function isConfigured() {
    return Boolean(env("MS_TENANT_ID") && env("MS_CLIENT_ID") && env("MS_CLIENT_SECRET")
        && env("OUTLOOK_NOTIFICATION_FROM"));
}
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}
async function getAccessToken() {
    if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
    const tenant = encodeURIComponent(env("MS_TENANT_ID"));
    const body = new URLSearchParams({
        client_id: env("MS_CLIENT_ID"),
        client_secret: env("MS_CLIENT_SECRET"),
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials"
    });
    const response = await fetch("https://login.microsoftonline.com/" + tenant + "/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(12000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
        const error = new Error("No se pudo autenticar el servicio de notificaciones de Outlook.");
        error.code = "OUTLOOK_AUTH_FAILED";
        throw error;
    }
    cachedToken = payload.access_token;
    tokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
    return cachedToken;
}
async function notifyPendingCase(item) {
    if (!isConfigured()) return { sent: false, skipped: true, reason: "not_configured" };
    const recipient = env("OUTLOOK_NOTIFICATION_TO") || "circulodelegis@outlook.com";
    const token = await getAccessToken();
    const subject = "[CÍRCULO IA] Nuevo caso " + String(item.priority || "normal").toUpperCase();
    const preview = String(item.messageText || "").slice(0, 240);
    const html = [
        "<h2>Nuevo mensaje pendiente de revisión</h2>",
        "<p><b>Prioridad:</b> " + escapeHtml(item.priority) + "</p>",
        "<p><b>Intención:</b> " + escapeHtml(item.semanticAnalysis?.intent || item.kernelDecision?.intencion || "sin clasificar") + "</p>",
        "<p><b>Mensaje:</b> " + escapeHtml(preview) + "</p>",
        "<p><b>ID del caso:</b> " + escapeHtml(item.id) + "</p>",
        "<p>Ingresá a la bandeja institucional para revisar, aprobar, rechazar o archivar el caso.</p>"
    ].join("");
    const response = await fetch("https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(env("OUTLOOK_NOTIFICATION_FROM")) + "/sendMail", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
            message: {
                subject,
                body: { contentType: "HTML", content: html },
                toRecipients: [{ emailAddress: { address: recipient } }]
            },
            saveToSentItems: true
        }),
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
        const error = new Error("Microsoft Graph no pudo enviar la notificación.");
        error.code = "OUTLOOK_SEND_FAILED";
        throw error;
    }
    return { sent: true, recipient };
}
module.exports = { isConfigured, notifyPendingCase };
