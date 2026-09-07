const express = require("express");
const cors = require("cors");
const path = require("path");
const chatRoutes = require("./routes/chat");
const messengerRoutes = require("./routes/messenger");
const kernel = require("./Kernels/kernel");
const circuloIA = require("./knowledge/agents/circuloIA");

const app = express();

app.use(cors());

// Conservamos el cuerpo original para verificar X-Hub-Signature-256 de Meta.
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = Buffer.from(buf);
    }
}));

// Frontend institucional servido por el mismo deployment.
app.use(express.static(path.join(__dirname, "public")));

// API del Kernel AXIAL / CÍRCULO IA.
app.use("/api/chat", chatRoutes);

// Webhook de Facebook Messenger.
app.use("/webhook/messenger", messengerRoutes);

// Healthcheck funcional: verifica que Kernel + agente + corpus cargan en runtime.
app.get("/api/health", (req, res) => {
    try {
        const pregunta = "¿Quién es el presidente del Círculo de Legisladores?";
        const decision = kernel.process(pregunta);
        const respuesta = circuloIA.responder(pregunta);

        res.json({
            ok: true,
            servicio: "CÍRCULO IA",
            kernel: decision.estado,
            dominio: decision.dominio || null,
            intencion: decision.intencion || null,
            agente: decision.agente || circuloIA.nombre,
            prueba: pregunta,
            respuesta: respuesta
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            servicio: "CÍRCULO IA",
            error: error.message
        });
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Servidor CÍRCULO IA activo en puerto ${PORT}`);
    });
}

module.exports = app;
