"use strict";

const express = require("express");
const crypto = require("node:crypto");
const router = express.Router();
const store = require("../knowledge/documentStore");
const extractor = require("../knowledge/pdfTextExtractor");
const documentRetriever = require("../knowledge/documentRetriever");

function safeText(value, max) { return String(value || "").trim().slice(0, max); }
function constantTimeEqual(left, right) {
    const a = Buffer.from(String(left || ""), "utf8");
    const b = Buffer.from(String(right || ""), "utf8");
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
function requireAdmin(req, res, next) {
    const expected = process.env.REVIEW_API_TOKEN?.trim();
    const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!expected) return res.status(503).json({ ok: false, error: "Falta configurar REVIEW_API_TOKEN." });
    if (!constantTimeEqual(supplied, expected)) return res.status(401).json({ ok: false, error: "No autorizado." });
    if (!store.isConfigured()) return res.status(503).json({ ok: false, error: "Repositorio documental no configurado (KV y Blob privado)." });
    next();
}
router.use(requireAdmin);

router.get("/", async (req, res) => {
    try {
        const items = await store.listMetadata(req.query.limit);
        return res.json({ ok: true, items: items.map(({ pathname, checksum, ...item }) => ({ ...item, pdf_guardado: Boolean(pathname), checksum })) });
    } catch (error) {
        console.error("[Documents] Error listando documentos:", error.code || "STORE_ERROR");
        return res.status(503).json({ ok: false, error: "No se pudo consultar el repositorio documental." });
    }
});

router.post("/", async (req, res) => {
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buffer.length) return res.status(400).json({ ok: false, error: "El cuerpo debe contener el PDF." });
    if (buffer.length > 8 * 1024 * 1024) return res.status(413).json({ ok: false, error: "El PDF supera el límite de 8 MB." });
    if (!/^application\/pdf(?:\s*;|$)/i.test(req.get("content-type") || "")) {
        return res.status(415).json({ ok: false, error: "Content-Type debe ser application/pdf." });
    }
    const title = safeText(req.query.title, 240);
    if (!title) return res.status(400).json({ ok: false, error: "El título del documento es obligatorio." });
    const extracted = extractor.extractPdfText(buffer, { maxBytes: 8 * 1024 * 1024 });
    if (!extracted.ok) return res.status(422).json({ ok: false, error: "El PDF no contiene una capa de texto compatible.", diagnostico: extracted.error });
    const id = store.createId();
    const now = new Date().toISOString();
    const record = {
        id, status: "pending_review", level: "N1",
        title,
        category: safeText(req.query.category || "Documento institucional", 100),
        issuingBody: safeText(req.query.issuingBody, 180),
        documentDate: safeText(req.query.documentDate, 40),
        documentType: safeText(req.query.documentType, 100),
        keywords: safeText(req.query.keywords, 500),
        characters: extracted.characters,
        extraction: extracted.diagnostics,
        checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
        createdAt: now, updatedAt: now
    };
    try {
        const blob = await store.putPdf(id, buffer);
        record.pathname = blob.pathname;
        record.blobEtag = blob.etag || null;
        await store.saveMetadata(record);
        const { pathname, ...publicRecord } = record;
        return res.status(201).json({ ok: true, item: publicRecord });
    } catch (error) {
        console.error("[Documents] Error guardando PDF:", error.code || error.name || "UPLOAD_ERROR");
        return res.status(503).json({ ok: false, error: "No se pudo persistir el PDF. El documento no fue incorporado a N1." });
    }
});

router.post("/:id/approve", async (req, res) => {
    try {
        const current = await store.getMetadata(req.params.id);
        if (!current) return res.status(404).json({ ok: false, error: "Documento inexistente." });
        if (current.status !== "pending_review") return res.status(409).json({ ok: false, error: "Solo se pueden aprobar documentos pendientes de revisión." });
        const pdf = await store.getPdf(current.pathname);
        const extracted = extractor.extractPdfText(pdf, { maxBytes: 8 * 1024 * 1024 });
        if (!extracted.ok) return res.status(422).json({ ok: false, error: "No se pudo validar nuevamente el texto del PDF." });
        const ingested = documentRetriever.ingestPdf(pdf, {
            id: current.id, title: current.title, category: current.category,
            subjects: current.category, keywords: current.keywords,
            sourceName: current.issuingBody
        });
        if (!ingested.ok) return res.status(422).json({ ok: false, error: "No se pudo incorporar el documento al índice N1." });
        const approved = await store.updateMetadata(current.id, {
            status: "approved", approvedAt: new Date().toISOString(),
            approvedBy: "operator", extractedCharacters: extracted.characters
        });
        return res.json({ ok: true, item: { id: approved.id, title: approved.title, status: approved.status, indexedInThisInstance: true } });
    } catch (error) {
        console.error("[Documents] Error aprobando PDF:", error.code || error.name || "APPROVAL_ERROR");
        return res.status(503).json({ ok: false, error: "No se pudo aprobar el documento." });
    }
});

router.post("/:id/reject", async (req, res) => {
    try {
        const current = await store.getMetadata(req.params.id);
        if (!current) return res.status(404).json({ ok: false, error: "Documento inexistente." });
        if (current.status !== "pending_review") return res.status(409).json({ ok: false, error: "Solo se pueden rechazar documentos pendientes." });
        const updated = await store.updateMetadata(current.id, {
            status: "rejected", rejectedAt: new Date().toISOString(), rejectedBy: "operator"
        });
        return res.json({ ok: true, item: { id: updated.id, title: updated.title, status: updated.status } });
    } catch (error) {
        console.error("[Documents] Error rechazando PDF:", error.code || "REJECT_ERROR");
        return res.status(503).json({ ok: false, error: "No se pudo actualizar el estado del documento." });
    }
});

module.exports = router;
