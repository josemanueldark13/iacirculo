const express = require("express");
const router = express.Router();

const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");
const bibliography = require("../knowledge/bibliografia");

router.post("/", (req, res) => {
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

    if (decision.modulos_rag?.includes("bibliografico")) {
        const respuestaBibliografica = bibliography.formatResults(decision.recuperacion_bibliografica, {
            limit: 5,
            abstractLength: 520
        });
        const respuestaOficial = decision.modulos_rag.includes("oficial")
            ? circuloIA.responder(pregunta)
            : null;
        const respuesta = respuestaOficial
            ? respuestaOficial + "\n\nContexto bibliográfico complementario:\n" + respuestaBibliografica
            : respuestaBibliografica;
        return res.json({
            agente: "CÍRCULO IA",
            estado: "respuesta_bibliografica",
            respuesta,
            bibliografia: decision.recuperacion_bibliografica,
            fuentes_web_seleccionadas: decision.plan_rag?.selected_sources || [],
            decision
        });
    }

    if (decision.plan_rag?.open_web?.enabled) {
        return res.json({
            agente: "CÍRCULO IA",
            estado: "busqueda_web_abierta_pendiente",
            respuesta: "N4 está habilitado para esta consulta, pero el adaptador de búsqueda abierta todavía no está conectado. No voy a presentar resultados web que no se hayan recuperado.",
            fuentes_n3: decision.plan_rag.selected_sources || [],
            decision
        });
    }

    if (decision.plan_rag?.modules?.includes("web_seleccionada")) {
        const fuentes = decision.plan_rag.selected_sources || [];
        return res.json({
            agente: "CÍRCULO IA",
            estado: fuentes.length ? "fuentes_web_seleccionadas" : "sin_fuentes_n3_coincidentes",
            respuesta: fuentes.length
                ? "Estas son las páginas de la lista seleccionada que coinciden temáticamente. La recuperación automática del contenido todavía requiere el adaptador N3."
                : "La lista de páginas seleccionadas N3 no contiene por ahora una fuente coincidente para esta consulta. N4 permanece como último recurso y no se activa hasta confirmar la insuficiencia de N3.",
            fuentes,
            decision
        });
    }

    if (decision.requiere_fuente_externa) {
        return res.json({
            agente: "CÍRCULO IA",
            estado: "requiere_fuente_externa",
            respuesta: "La consulta requiere información externa. No se encontraron todavía fuentes seleccionadas suficientes para resolverla.",
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
