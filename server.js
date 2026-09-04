const express = require("express");
const cors = require("cors");
const path = require("path");
const chatRoutes = require("./routes/chat");
const kernel = require("./Kernels/kernel");
const circuloIA = require("./knowledge/agents/circuloIA");

const app = express();

app.use(cors());
app.use(express.json());

// Frontend institucional servido por el mismo deployment.
app.use(express.static(path.join(__dirname, "public")));

// API del Kernel AXIAL / CÍRCULO IA.
app.use("/api/chat", chatRoutes);

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
            agente: circuloIA.nombre,
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
