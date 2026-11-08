const express = require("express");
const cors = require("cors");
const path = require("path");
const chatRoutes = require("./routes/chat");
const truthTableRoutes = require("./routes/truthtable");
const messengerRoutes = require("./routes/messenger");
const reviewInboxRoutes = require("./routes/reviewInbox");
const kernel = require("./Kernels/kernel");
const circuloIA = require("./knowledge/agents/circuloIA");
const { verifyMetaSignature } = require("./Kernels/metaWebhookSecurity");

const app = express();
app.use(cors());

// Validamos la firma en la fase raw del parser, antes de JSON.parse y antes del router.
app.use(express.json({
 verify:(req,res,buf) => {
  req.rawBody = Buffer.from(buf);
  const metaPaths = ["/api/webhook/facebook","/webhook/messenger"];
  const isMetaWebhook = req.method === "POST" && metaPaths.includes(req.path);
  if (!isMetaWebhook) return;

  const appSecret = (process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || "").trim();
  if (!appSecret) {
   const error = new Error("FACEBOOK_APP_SECRET no está configurado.");
   error.status = 503;
   error.code = "META_APP_SECRET_MISSING";
   throw error;
  }
  const signature = req.get("x-hub-signature-256");
  if (!verifyMetaSignature(buf,signature,appSecret)) {
   const error = new Error("Firma X-Hub-Signature-256 ausente o inválida.");
   error.status = 401;
   error.code = "META_SIGNATURE_INVALID";
   throw error;
  }
  req.metaSignatureVerified = true;
 }
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
// Errores del parser: la verificación HMAC rechaza en bruto, sin ejecutar los routers.
app.use((error,req,res,next) => {
 if (res.headersSent) return next(error);
 if (error.code === "META_SIGNATURE_INVALID") {
  return res.status(401).json({ok:false,error:"Firma de Meta ausente o inválida."});
 }
 if (error.code === "META_APP_SECRET_MISSING") {
  return res.status(503).json({ok:false,error:"Webhook sin configuración de seguridad."});
 }
 if (error.type === "entity.parse.failed") {
  return res.status(400).json({ok:false,error:"JSON inválido."});
 }
 console.error("[HTTP] Error de solicitud:",error.code || "REQUEST_ERROR");
 return res.status(error.status || 500).json({ok:false,error:"No se pudo procesar la solicitud."});
});

module.exports = app;
