const express = require("express");
const cors = require("cors");
const chatRoutes = require("./routes/chat");

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    next();
});

app.use("/api/chat", chatRoutes);

app.get("/", (req, res) => {
    res.send("CÍRCULO IA Backend funcionando");
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Servidor CÍRCULO IA activo en puerto ${PORT}`);
    });
}

module.exports = app;
