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

// Para Meta usamos raw-body: comprobamos HMAC antes de ejecutar JSON.parse.
// El resto de la API usa el parser JSON habitual.
app.use((req,res,next) => {
 const metaPaths = ["/api/webhook/facebook","/webhook/messenger"];
 const isMetaWebhook = req.method === "POST" && metaPaths.includes(req.path);
 if (!isMetaWebhook) {
  return express.json({limit:"1mb"})(req,res,next);
 }

 return express.raw({type:"application/json",limit:"1mb"})(req,res,error => {
  if (error) {
   return res.status(error.status || 400).json({ok:false,error:"No se pudo recibir el payload."});
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  req.rawBody = Buffer.from(rawBody);

  const appSecret = (process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || "").trim();
  if (!appSecret) {
   return res.status(503).json({ok:false,error:"Webhook sin configuración de seguridad."});
  }

  if (!verifyMetaSignature(rawBody,req.get("x-hub-signature-256"),appSecret)) {
   return res.status(401).json({ok:false,error:"Firma de Meta ausente o inválida."});
  }

  req.metaSignatureVerified = true;
  try {
   req.body = JSON.parse(rawBody.toString("utf8"));
  } catch {
   return res.status(400).json({ok:false,error:"JSON inválido."});
  }
  return next();
 });
});

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
