const express = require("express");
const router = express.Router();

const circuloIA = require("../agents/circuloIA");

router.post("/", (req, res) => {

    const pregunta = req.body.message;

    const respuesta = circuloIA.responder(pregunta);

    res.json({
        agente: "CÍRCULO IA",
        respuesta: respuesta
    });

});

module.exports = router;