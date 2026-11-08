const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const store = require("../Kernels/reviewInboxStore");
const messengerSender = require("../Kernels/messengerSender");

function constantTimeEqual(left, right) {
    const a = Buffer.from(String(left || ""), "utf8");
    const b = Buffer.from(String(right || ""), "utf8");
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function requireOperator(req, res, next) {
    const expected = process.env.REVIEW_API_TOKEN?.trim();
    if (!expected) {
        return res.status(503).json({
            ok: false,
            error: "La bandeja no está habilitada: falta REVIEW_API_TOKEN."
        });
    }

    const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!constantTimeEqual(supplied, expected)) {
        return res.status(401).json({ ok: false, error: "No autorizado." });
    }

    if (!store.isConfigured()) {
        return res.status(503).json({
            ok: false,
            error: "La bandeja no está habilitada: falta conectar el almacenamiento KV."
        });
    }

    next();
}

router.use(requireOperator);

function publicItem(item) {
    if (!item) return null;
    const { senderId, ...safe } = item;
    return safe;
}

router.get("/", async (req, res) => {
    try {
        const items = await store.listItems(req.query.limit);
        const status = String(req.query.status || "").trim();
        const filtered = status ? items.filter(item => item.status === status) : items;
        return res.json({ ok: true, items: filtered.map(publicItem) });
    } catch (error) {
        console.error("[ReviewInbox] Error leyendo la bandeja:", error.code || "STORE_ERROR");
        return res.status(503).json({ ok: false, error: "No se pudo consultar la bandeja." });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const item = await store.getItem(req.params.id);
        if (!item) return res.status(404).json({ ok: false, error: "Caso inexistente o vencido." });
        return res.json({ ok: true, item: publicItem(item) });
    } catch {
        return res.status(503).json({ ok: false, error: "No se pudo consultar el caso." });
    }
});

router.post("/:id/approve", async (req, res) => {
    if (!messengerSender.isConfigured()) {
        return res.status(503).json({
            ok: false,
            error: "No se puede aprobar: falta el token de la Página de Facebook."
        });
    }

    let item;
    try {
        const current = await store.getItem(req.params.id);
        if (!current) return res.status(404).json({ ok: false, error: "Caso inexistente o vencido." });
        const proposedResponse = typeof req.body?.proposedResponse === "string"
            ? req.body.proposedResponse.trim()
            : current.proposedResponse;
        if (!proposedResponse || proposedResponse.length > 2000) {
            return res.status(400).json({ ok: false, error: "El borrador debe contener entre 1 y 2000 caracteres." });
        }
        item = await store.transition(
            req.params.id,
            ["pending", "send_failed"],
            {
                status: "sending",
                proposedResponse,
                approvedAt: new Date().toISOString(),
                approvedBy: "operator"
            }
        );
    } catch (error) {
        const status = error.code === "REVIEW_CONFLICT" || error.code === "REVIEW_INVALID_STATE" ? 409 : 503;
        return res.status(status).json({ ok: false, error: error.message });
    }

    if (!item) return res.status(404).json({ ok: false, error: "Caso inexistente o vencido." });

    try {
        const sent = await messengerSender.sendApprovedMessage(item.senderId, item.proposedResponse);
        const updated = await store.transition(
            item.id,
            ["sending"],
            {
                status: "sent",
                sentAt: new Date().toISOString(),
                messageId: sent.messageId
            }
        );
        return res.json({ ok: true, item: publicItem(updated) });
    } catch (error) {
        try {
            await store.transition(
                item.id,
                ["sending"],
                {
                    status: "send_failed",
                    sendFailedAt: new Date().toISOString(),
                    sendErrorCode: error.code || "SEND_FAILED"
                }
            );
        } catch {
            // Keep the case recoverable through the stored "sending" state and its lock expiry.
        }
        return res.status(502).json({
            ok: false,
            error: "El envío falló o no pudo confirmarse. Revisá el caso antes de volver a aprobarlo."
        });
    }
});

router.post("/:id/reject", async (req, res) => {
    try {
        const item = await store.transition(
            req.params.id,
            ["pending"],
            { status: "rejected", rejectedAt: new Date().toISOString(), rejectedBy: "operator" }
        );
        if (!item) return res.status(404).json({ ok: false, error: "Caso inexistente o vencido." });
        return res.json({ ok: true, item: publicItem(item) });
    } catch (error) {
        const status = error.code === "REVIEW_CONFLICT" || error.code === "REVIEW_INVALID_STATE" ? 409 : 503;
        return res.status(status).json({ ok: false, error: error.message });
    }
});

router.post("/:id/archive", async (req, res) => {
    try {
        const item = await store.transition(
            req.params.id,
            ["pending", "rejected", "send_failed", "sent"],
            { status: "archived", archivedAt: new Date().toISOString(), archivedBy: "operator" }
        );
        if (!item) return res.status(404).json({ ok: false, error: "Caso inexistente o vencido." });
        return res.json({ ok: true, item: publicItem(item) });
    } catch (error) {
        const status = error.code === "REVIEW_CONFLICT" || error.code === "REVIEW_INVALID_STATE" ? 409 : 503;
        return res.status(status).json({ ok: false, error: error.message });
    }
});

module.exports = router;
