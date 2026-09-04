const express = require("express");
const router = express.Router();

const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");

router.post("/", (req, res) => {
    const pregunta = req.body.message;

    if (!pregunta) {
        return res.status(400).json({
            agente: "CÍRCULO IA",
            error: "No se recibió ninguna pregunta."
        });
    }

    const decision = kernel.process(pregunta);

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

    // Núcleo 3 aún no ejecuta navegación web: no inventar ni responder
    // con el corpus local cuando el Kernel exige una fuente externa.
    if (decision.requiere_fuente_externa) {
        return res.json({
            agente: "CÍRCULO IA",
            estado: "requiere_fuente_externa",
            respuesta: "Esta consulta requiere una fuente externa para responder con precisión. El Núcleo 3 de consulta web aún no está habilitado en esta versión.",
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
