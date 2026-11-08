const express = require("express");
const cors = require("cors");
const path = require("path");
const chatRoutes = require("./routes/chat");
const truthTableRoutes = require("./routes/truthtable");
const messengerRoutes = require("./routes/messenger");
const reviewInboxRoutes = require("./routes/reviewInbox");
const kernel = require("./Kernels/kernel");
const circuloIA = require("./knowledge/agents/circuloIA");

const app = express();
app.use(cors());

// Conservamos el cuerpo original para verificar X-Hub-Signature-256 de Meta.
app.use(express.json({
 verify:(req,res,buf) => { req.rawBody = Buffer.from(buf); }
}));

app.use(express.static(path.join(__dirname,"public")));
app.use("/api/chat",chatRoutes);
app.use("/api/truthtable",truthTableRoutes);
app.use("/api/review",reviewInboxRoutes);

// Webhook unificado de Facebook Messenger.
app.use("/webhook/messenger",messengerRoutes);
app.use("/api/webhook/facebook",messengerRoutes);

app.get("/api/health",(req,res) => {
 try {
  const question = "¿Quién es el presidente del Círculo de Legisladores?";
  const decision = kernel.process(question);
  const answer = circuloIA.responder(question);
  res.json({
   ok:true,servicio:"CÍRCULO IA",kernel:decision.estado,
   dominio:decision.dominio || null,intencion:decision.intencion || null,
   agente:decision.agente || circuloIA.nombre,prueba:question,respuesta:answer
  });
 } catch(error) {
  res.status(500).json({ok:false,servicio:"CÍRCULO IA",error:error.message});
 }
});

app.get("/",(req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
const PORT = process.env.PORT || 3000;
if (require.main === module) {
 app.listen(PORT,() => console.log(`Servidor CÍRCULO IA activo en puerto ${PORT}`));
}
module.exports = app;
