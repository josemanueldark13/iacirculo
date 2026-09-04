const express = require("express");
const cors = require("cors");
const path = require("path");
const chatRoutes = require("./routes/chat");

const app = express();

app.use(cors());
app.use(express.json());

// Frontend institucional servido por el mismo deployment.
app.use(express.static(path.join(__dirname, "public")));

// API del Kernel AXIAL / CÍRCULO IA.
app.use("/api/chat", chatRoutes);

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
