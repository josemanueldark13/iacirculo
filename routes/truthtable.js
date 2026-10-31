'use strict';

const express = require("express");
const router = express.Router();
const logicEngine = require("../Kernels/axial-truthtable/logic-engine");

router.post("/validate", (req, res) => {
    try {
        const body = req.body || {};
        const result = logicEngine.analizarArgumento({
            premisas: body.premisas,
            conclusion: body.conclusion
        });

        const tablePreviewLimit = 24;
        const table = result.tablaVerdad;

        return res.json({
            ok: true,
            formalizacion: result.formalizacion,
            diagnostico: result.diagnostico,
            solidezMaterial: result.solidezMaterial,
            tablaVista: table.slice(0, tablePreviewLimit),
            tablaVerdadTotal: table.length,
            vistaParcial: table.length > tablePreviewLimit
        });
    } catch (error) {
        const clientError =
            error instanceof TypeError ||
            error instanceof RangeError ||
            error.code === "AXIAL_LOGIC_SYNTAX_ERROR";

        return res.status(clientError ? 400 : 500).json({
            ok: false,
            error: clientError
                ? error.message
                : "No se pudo completar el análisis lógico.",
            code: error.code || "AXIAL_TRUTHTABLE_ERROR"
        });
    }
});

module.exports = router;
