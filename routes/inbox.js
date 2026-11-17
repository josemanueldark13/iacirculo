'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const kernel = require('../Kernels/kernel');
const circuloIA = require('../knowledge/agents/circuloIA');
const store = require('../services/inboxStore');

const SITE_URL = process.env.CIRCULO_SITE_URL || 'https://iacirculo.vercel.app/';

function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requireAdmin(req, res, next) {
    const expected = process.env.INBOX_ADMIN_TOKEN;
    const supplied = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!expected) {
        return res.status(503).json({ ok: false, error: 'Panel administrativo no configurado: falta INBOX_ADMIN_TOKEN.' });
    }
    if (!safeEqual(supplied, expected)) {
        return res.status(401).json({ ok: false, error: 'No autorizado.' });
    }
    return next();
}

function analyzeMessage(text) {
    const decision = kernel.process(text);
    let answer;

    if (decision.estado === 'requiere_reformulacion') {
        const suggestions = Array.isArray(decision.sugerencias) ? decision.sugerencias : [];
        answer = 'No terminé de comprender la consulta. ¿Podés expresarla de otra manera?' +
            (suggestions.length ? ' Podés consultar sobre: ' + suggestions.join(', ') + '.' : '');
    } else if (decision.estado === 'fuera_de_dominio') {
        answer = 'Puedo ayudarte con información del Círculo de Legisladores de Tucumán: autoridades, historia, legislación, actividades, documentación y contacto.';
    } else if (decision.requiere_fuente_externa) {
        answer = 'Esta consulta requiere verificar información externa al corpus institucional. Podés continuar en el portal: ' + SITE_URL;
    } else {
        answer = circuloIA.responder(text);
    }

    return {
        decision: {
            estado: decision.estado,
            dominio: decision.dominio || null,
            intencion: decision.intencion || null,
            agente: decision.agente || null,
            confianza: decision.confianza ?? null,
            conceptos: decision.conceptos_detectados || []
        },
        answer
    };
}

function cleanText(value) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\u0000/g, '').slice(0, 4000);
}

// Public web inbox: this is an independent intake channel owned by CÍRCULO IA.
router.post('/messages', async (req, res) => {
    try {
        const text = cleanText(req.body?.message);
        if (!text) return res.status(400).json({ ok: false, error: 'Escribí una consulta para continuar.' });

        const ip = String(req.ip || 'unknown').replace(/[^a-zA-Z0-9:._-]/g, '').slice(0, 80);
        if (!await store.rateLimit(ip)) {
            return res.status(429).json({ ok: false, error: 'Alcanzaste el límite de consultas. Esperá un minuto e intentá nuevamente.' });
        }

        const mode = await store.getMode();
        const { decision, answer } = analyzeMessage(text);
        const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId : undefined;

        let response = null;
        let draft = null;
        let status = 'pending';

        if (mode === 'AUTO') {
            response = answer;
            status = 'answered';
        } else if (mode === 'GUARDAMETA') {
            draft = answer;
            status = 'awaiting_approval';
        } else {
            status = 'awaiting_operator';
        }

        const conversation = await store.createConversation({
            conversationId,
            text,
            source: 'web',
            analysis: decision,
            mode,
            draft,
            response,
            status
        });

        return res.status(201).json({
            ok: true,
            conversationId: conversation.id,
            mode,
            status,
            response: mode === 'AUTO' ? response : (
                mode === 'GUARDAMETA'
                    ? 'Recibimos tu consulta. La respuesta será revisada por un operador.'
                    : 'Recibimos tu consulta. Será atendida por un operador.'
            )
        });
    } catch (error) {
        console.error('[INBOX] Error recibiendo consulta:', error.message);
        return res.status(503).json({ ok: false, error: 'El servicio de mensajería no está disponible temporalmente.' });
    }
});

// The visitor can retrieve only the conversation identified by its unguessable UUID.
router.get('/messages/:id', async (req, res) => {
    try {
        const conversation = await store.getConversation(req.params.id);
        if (!conversation) return res.status(404).json({ ok: false, error: 'Conversación no encontrada.' });
        const messages = await store.getMessages(req.params.id);
        return res.json({ ok: true, conversationId: conversation.id, status: conversation.status, messages });
    } catch (error) {
        console.error('[INBOX] Error consultando conversación:', error.message);
        return res.status(503).json({ ok: false, error: 'No se pudo consultar la conversación.' });
    }
});

// All administrative operations are protected by an independent server-side token.
router.get('/admin/overview', requireAdmin, async (req, res) => {
    try {
        const [mode, conversations] = await Promise.all([store.getMode(), store.listConversations(100)]);
        const counts = conversations.reduce((acc, item) => {
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
        }, {});
        return res.json({ ok: true, mode, total: conversations.length, counts, conversations });
    } catch (error) {
        console.error('[INBOX] Error en panel:', error.message);
        return res.status(503).json({ ok: false, error: 'No se pudo cargar la bandeja.' });
    }
});

router.get('/admin/conversations/:id', requireAdmin, async (req, res) => {
    try {
        const conversation = await store.getConversation(req.params.id);
        if (!conversation) return res.status(404).json({ ok: false, error: 'Conversación no encontrada.' });
        return res.json({ ok: true, conversation, messages: await store.getMessages(req.params.id) });
    } catch (error) {
        console.error('[INBOX] Error abriendo conversación:', error.message);
        return res.status(503).json({ ok: false, error: 'No se pudo abrir la conversación.' });
    }
});

router.patch('/admin/mode', requireAdmin, async (req, res) => {
    try {
        const mode = await store.setMode(req.body?.mode);
        return res.json({ ok: true, mode });
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
    }
});

router.post('/admin/conversations/:id/reply', requireAdmin, async (req, res) => {
    try {
        const content = cleanText(req.body?.message);
        if (!content) return res.status(400).json({ ok: false, error: 'La respuesta no puede estar vacía.' });
        const message = await store.addMessage(req.params.id, { role: 'operator', content });
        if (!message) return res.status(404).json({ ok: false, error: 'Conversación no encontrada.' });
        await store.updateConversation(req.params.id, { status: 'answered', draft: null });
        return res.status(201).json({ ok: true, message });
    } catch (error) {
        console.error('[INBOX] Error guardando respuesta:', error.message);
        return res.status(503).json({ ok: false, error: 'No se pudo guardar la respuesta.' });
    }
});

router.post('/admin/conversations/:id/approve', requireAdmin, async (req, res) => {
    try {
        const conversation = await store.getConversation(req.params.id);
        if (!conversation) return res.status(404).json({ ok: false, error: 'Conversación no encontrada.' });
        if (!conversation.draft) return res.status(409).json({ ok: false, error: 'No hay una respuesta pendiente de aprobación.' });
        const message = await store.addMessage(req.params.id, { role: 'assistant', content: conversation.draft, source: 'approved-draft' });
        await store.updateConversation(req.params.id, { status: 'answered', draft: null });
        return res.status(200).json({ ok: true, message });
    } catch (error) {
        console.error('[INBOX] Error aprobando respuesta:', error.message);
        return res.status(503).json({ ok: false, error: 'No se pudo aprobar la respuesta.' });
    }
});

router.post('/admin/conversations/:id/close', requireAdmin, async (req, res) => {
    try {
        const conversation = await store.updateConversation(req.params.id, { status: 'closed', draft: null });
        if (!conversation) return res.status(404).json({ ok: false, error: 'Conversación no encontrada.' });
        return res.json({ ok: true, conversation });
    } catch (error) {
        return res.status(503).json({ ok: false, error: 'No se pudo cerrar la conversación.' });
    }
});

module.exports = router;
