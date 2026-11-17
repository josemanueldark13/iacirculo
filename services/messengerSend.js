'use strict';

const PAGE_ACCESS_TOKEN = () =>
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
    null;

const GRAPH_VERSION = () => {
    const configured = process.env.META_GRAPH_VERSION?.trim() || 'v23.0';
    if (!/^v\\d+\\.\\d+$/.test(configured)) {
        throw new Error('META_GRAPH_VERSION tiene un formato inválido.');
    }
    return configured;
};

/**
 * Envía texto plano o un objeto message compatible con Messenger Send API.
 * Devuelve true al confirmar el envío y lanza un error seguro ante fallos HTTP/red.
 */
async function sendMessage(recipientId, messageContent) {
    const token = PAGE_ACCESS_TOKEN();

    if (!token) {
        throw new Error('Falta FACEBOOK_PAGE_ACCESS_TOKEN.');
    }
    if (typeof recipientId !== 'string' || !recipientId.trim()) {
        throw new Error('No se especificó un recipientId válido.');
    }

    const message = typeof messageContent === 'string'
        ? { text: messageContent }
        : messageContent;

    if (!message || typeof message !== 'object' || Array.isArray(message) ||
        Object.keys(message).length === 0) {
        throw new Error('messageContent debe ser texto o un objeto de mensaje válido.');
    }

    const version = GRAPH_VERSION();
    const url = `https://graph.facebook.com/${version}/me/messages`;

    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                recipient: { id: recipientId.trim() },
                messaging_type: 'RESPONSE',
                message
            })
        });
    } catch (error) {
        throw new Error(`No se pudo conectar con Messenger Send API: ${error.message}`);
    }

    const responseText = await response.text();
    let data = {};
    try {
        data = responseText ? JSON.parse(responseText) : {};
    } catch {
        data = { message: responseText };
    }

    if (!response.ok) {
        const detail = data?.error?.message || data?.message || `HTTP ${response.status}`;
        throw new Error(`Messenger Send API rechazó el envío: ${detail}`);
    }

    console.log('[MESSENGER SEND] Mensaje enviado.', {
        recipient_present: true,
        message_id: data.message_id || null
    });

    return true;
}

module.exports = { sendMessage };
