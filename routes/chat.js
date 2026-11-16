const express = require("express");
const router = express.Router();

const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");
const ragComposer = require("../knowledge/ragComposer");

router.post("/", async (req, res) => {
    const pregunta = req.body.message;

    if (!pregunta) {
        return res.status(400).json({
            agente: "CÍRCULO IA",
            error: "No se recibió ninguna pregunta."
        });
    }

    const decision = kernel.process(pregunta);

    if (decision.estado === "requiere_atencion_humana") {
        return res.json({
            agente: "atencion_humana",
            estado: decision.estado,
            respuesta: "Esta solicitud requiere atención de una persona del equipo. No voy a responderla automáticamente por este canal.",
            decision
        });
    }

    if (decision.respuesta_conversacional?.content) {
        return res.json({
            agente: "CÍRCULO IA",
            estado: decision.estado,
            respuesta: decision.respuesta_conversacional.content,
            decision
        });
    }

    if (decision.estado === "requiere_reformulacion") {
        return res.json({
            agente: "CÍRCULO IA",
            estado: decision.estado,
            respuesta: "Necesito que reformules la consulta.",
            sugerencias: decision.sugerencias,
            decision
        });
    }

    if (decision.estado === "fuera_de_dominio") {
        return res.json({
            agente: "CÍRCULO IA",
            estado: decision.estado,
            respuesta: "La consulta está fuera del dominio institucional de CÍRCULO IA.",
            decision
        });
    }

    if (decision.plan_rag?.modules?.some(level =>
        ["bibliografico", "web_seleccionada", "web_abierta"].includes(level)
    )) {
        const composed = await ragComposer.compose(pregunta, decision, {
            bibliographyLimit: 5,
            abstractLength: 520,
            maxSources: 3,
            webLimit: 4,
            openWebLimit: 5
        });
        const state = composed.statuses.N4 === "retrieved"
            ? "respuesta_web_abierta"
            : composed.statuses.N3 === "retrieved" || composed.statuses.N3 === "partial"
                ? "respuesta_web_seleccionada"
                : decision.modulos_rag?.includes("bibliografico")
                    ? "respuesta_bibliografica"
                    : "consulta_rag_externo";
        return res.json({
            agente: "CÍRCULO IA",
            estado: state,
            respuesta: composed.answer,
            evidencia: composed.evidence,
            niveles_consultados: composed.used_levels,
            estados_nucleos: composed.statuses,
            decision
        });
    }

    const respuesta = circuloIA.responder(pregunta);

    return res.json({
        agente: "CÍRCULO IA",
        estado: decision.estado,
        respuesta,
        decision
    });
});

module.exports = router;
