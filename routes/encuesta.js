const express = require("express");
const router = express.Router();

const OPCIONES = new Set([
    "Historia institucional",
    "Legisladores y protagonistas",
    "Documentos y archivos",
    "Videos",
    "Actualidad y actividades",
    "Bibliografía e investigaciones",
    "Otro"
]);

router.post("/", async (req, res) => {
    const { interes, sugerencia } = req.body || {};

    if (!OPCIONES.has(interes)) {
        return res.status(400).json({ ok: false, error: "Seleccione una opción válida." });
    }

    const texto = String(sugerencia || "").trim().slice(0, 1000);
    const payload = {
        encuesta: "Mapa de necesidades de la comunidad",
        interes,
        sugerencia: texto,
        fecha: new Date().toISOString(),
        origen: "CÍRCULO IA"
    };

    const webhook = process.env.ENCUESTA_WEBHOOK_URL;

    if (!webhook) {
        return res.status(503).json({
            ok: false,
            error: "La encuesta está preparada, pero el canal de recepción todavía no fue configurado."
        });
    }

    try {
        const response = await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Webhook respondió ${response.status}`);
        }

        return res.json({ ok: true, mensaje: "Gracias por participar. Tu respuesta fue recibida." });
    } catch (error) {
        console.error("Error encuesta:", error.message);
        return res.status(502).json({
            ok: false,
            error: "No fue posible registrar la respuesta. Intente nuevamente."
        });
    }
});

module.exports = router;
