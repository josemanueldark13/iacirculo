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
            decision: decision
        });
    }

    if (decision.estado === "fuera_de_dominio") {

        return res.json({
            agente: "CÍRCULO IA",
            estado: decision.estado,
            respuesta: "La consulta está fuera del dominio institucional de CÍRCULO IA.",
            decision: decision
        });
    }

    const respuesta = circuloIA.responder(pregunta);

    res.json({
        agente: "CÍRCULO IA",
        estado: decision.estado,
        respuesta: respuesta,
        decision: decision
    });

});

module.exports = router;