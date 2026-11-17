'use strict';

const { recordRateLimitTelemetry } = require('./messengerTelemetry');

const PAGE_ACCESS_TOKEN = () =>
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
    null;

const GRAPH_VERSION = () => {
    const configured = process.env.META_GRAPH_VERSION?.trim() || 'v23.0';
    if (!/^v\d+\.\d+$/.test(configured)) {
        throw new Error('META_GRAPH_VERSION tiene un formato inválido.');
    }
    return configured;
};

const sleep = (milliseconds) =>
    new Promise(resolve => setTimeout(resolve, milliseconds));

function retryAfterMs(response) {
    const value = response.headers?.get?.('retry-after');
    if (!value) return null;

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
    }

    const date = Date.parse(value);
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function backoffDelay(attempt, initialDelayMs, retryAfter = null) {
    const exponential = initialDelayMs * (2 ** (attempt - 1));
    const jitter = Math.random() * Math.min(500, exponential * 0.5);
    const calculated = exponential + jitter;
    const requested = retryAfter === null ? calculated : Math.max(calculated, retryAfter);
    return Math.min(requested, 10000);
}

/**
 * Envía texto u objetos compatibles con Messenger Send API.
 * maxRetries representa el número total de intentos, incluido el primero.
 * Reintenta errores de red, HTTP 429 y HTTP 5xx; los demás errores son definitivos.
 */
async function sendMessage(recipientId, messageContent, maxRetries = 3, initialDelayMs = 1000) {
    const token = PAGE_ACCESS_TOKEN();

    if (!token) throw new Error('Falta FACEBOOK_PAGE_ACCESS_TOKEN.');
    if (typeof recipientId !== 'string' || !recipientId.trim()) {
        throw new Error('No se especificó un recipientId válido.');
    }
    if (!Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 5) {
        throw new Error('maxRetries debe ser un entero entre 1 y 5.');
    }
    if (!Number.isFinite(initialDelayMs) || initialDelayMs < 0) {
        throw new Error('initialDelayMs debe ser un número mayor o igual a cero.');
    }

    const message = typeof messageContent === 'string'
        ? { text: messageContent }
        : messageContent;

    if (!message || typeof message !== 'object' || Array.isArray(message) ||
        Object.keys(message).length === 0) {
        throw new Error('messageContent debe ser texto o un objeto de mensaje válido.');
    }

    const url = `https://graph.facebook.com/${GRAPH_VERSION()}/me/messages`;
    const requestBody = JSON.stringify({
        recipient: { id: recipientId.trim() },
        messaging_type: 'RESPONSE',
        message
    });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let response;

        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: requestBody
            });
        } catch (error) {
            if (attempt === maxRetries) {
                throw new Error(`Falló la conexión con Messenger Send API tras ${attempt} intento(s): ${error.message}`);
            }

            const delay = backoffDelay(attempt, initialDelayMs);
            console.warn('[MESSENGER SEND] Fallo de red; se reintentará.', {
                attempt,
                maxRetries,
                delay_ms: Math.round(delay)
            });
            await sleep(delay);
            continue;
        }

        const responseText = await response.text();
        let data = {};
        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch {
            data = { message: responseText };
        }

        if (response.ok) {
            console.log('[MESSENGER SEND] Mensaje enviado.', {
                recipient_present: true,
                attempt,
                message_id: data.message_id || null
            });
            return true;
        }

        const retryable = response.status === 429 ||
            (response.status >= 500 && response.status <= 599);

        if (!retryable || attempt === maxRetries) {
            const detail = data?.error?.message || data?.message || `HTTP ${response.status}`;
            throw new Error(`Messenger Send API rechazó el envío (HTTP ${response.status}): ${detail}`);
        }

        // Telemetría auxiliar: nunca bloquea el envío ni altera el ciclo de reintentos.
        recordRateLimitTelemetry(response.status, recipientId, attempt, maxRetries);

        const delay = backoffDelay(attempt, initialDelayMs, retryAfterMs(response));
        console.warn('[MESSENGER SEND] Error temporal de Meta; se reintentará.', {
            status: response.status,
            attempt,
            maxRetries,
            delay_ms: Math.round(delay)
        });
        await sleep(delay);
    }

    throw new Error('No se pudo completar el envío a Messenger.');
}

module.exports = { sendMessage };
