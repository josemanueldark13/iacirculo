const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");
const reviewInboxStore = require("../Kernels/reviewInboxStore");

function envFirst(...names) {
 for (const name of names) {
  const value = process.env[name]?.trim();
  if (value) return value;
 }
 return null;
}
function appSecretProof(token) {
 const secret = envFirst("FACEBOOK_APP_SECRET","META_APP_SECRET");
 if (!secret) return null;
 return crypto.createHmac("sha256",secret).update(token).digest("hex");
}

async function graphRequest(path,options = {},useProof = false) {
 const token = envFirst("FACEBOOK_PAGE_ACCESS_TOKEN","META_PAGE_ACCESS_TOKEN");
 if (!token) throw new Error("Falta FACEBOOK_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN");
 const version = envFirst("META_GRAPH_VERSION") || "v23.0";
 const proof = useProof ? appSecretProof(token) : null;
 if (useProof && !proof) throw new Error("FACEBOOK_APP_SECRET no está configurado.");
 const separator = path.includes("?") ? "&" : "?";
 const url = proof
  ? `https://graph.facebook.com/${version}${path}${separator}appsecret_proof=${encodeURIComponent(proof)}`
  : `https://graph.facebook.com/${version}${path}`;
 const response = await fetch(url,{
  ...options,
  headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`,...(options.headers || {})}
 });
 const bodyText = await response.text();
 let body;
 try { body = JSON.parse(bodyText); } catch { body = {raw:bodyText}; }
 if (!response.ok) {
  const message = body?.error?.message || bodyText || "Respuesta desconocida de Graph API";
  throw new Error(`Graph API ${response.status}: ${message}`);
 }
 return body;
}

router.get("/status",(req,res) => {
 res.json({
  ok:true,
  servicio:"CÍRCULO IA — Facebook Messenger",
  verify_token_configurado:Boolean(envFirst("FACEBOOK_VERIFY_TOKEN","META_VERIFY_TOKEN")),
  page_access_token_configurado:Boolean(envFirst("FACEBOOK_PAGE_ACCESS_TOKEN","META_PAGE_ACCESS_TOKEN")),
  app_secret_configurado:Boolean(envFirst("FACEBOOK_APP_SECRET","META_APP_SECRET")),
  verificacion_firma_obligatoria:true,
  bandeja_kv_configurada:reviewInboxStore.isConfigured(),
  token_operador_configurado:Boolean(envFirst("REVIEW_API_TOKEN")),
  dispatch_enabled:envFirst("DISPATCH_ENABLED") === "true",
  site_url:envFirst("CIRCULO_SITE_URL") || "https://iacirculo.vercel.app/"
 });
});

router.get("/diagnose",async(req,res) => {
 const result = {
  ok:false,graph_api:"unknown",page_token_valid:false,page_id:null,page_name:null,
  subscription_query:"not_run",messages_subscribed:null,subscribed_apps_count:null,
  appsecret_proof_valid:null,appsecret_proof_error:null,
  graph_version:envFirst("META_GRAPH_VERSION") || "v23.0"
 };
 try {
  const page = await graphRequest("/me?fields=id,name");
  result.graph_api = "ok";
  result.page_token_valid = true;
  result.page_id = page.id || null;
  result.page_name = page.name || null;
 } catch(error) {
  result.graph_api = "error";
  result.page_token_error = error.message;
  return res.status(502).json(result);
 }
 try {
  const subscriptions = await graphRequest("/me/subscribed_apps");
  const apps = Array.isArray(subscriptions?.data) ? subscriptions.data : [];
  result.subscription_query = "ok";
  result.subscribed_apps_count = apps.length;
  result.messages_subscribed = apps.some(app =>
   Array.isArray(app.subscribed_fields) && app.subscribed_fields.includes("messages")
  );
 } catch(error) {
  result.subscription_query = "error";
  result.subscription_error = error.message;
 }
 try {
  await graphRequest("/me?fields=id",{},true);
  result.appsecret_proof_valid = true;
 } catch(error) {
  result.appsecret_proof_valid = false;
  result.appsecret_proof_error = error.message;
 }
 result.ok = result.page_token_valid && result.subscription_query === "ok";
 return res.status(result.ok ? 200 : 502).json(result);
});

router.get("/",(req,res) => {
 const mode = req.query["hub.mode"];
 const token = req.query["hub.verify_token"];
 const challenge = req.query["hub.challenge"];
 const expected = envFirst("FACEBOOK_VERIFY_TOKEN","META_VERIFY_TOKEN");
 if (mode === "subscribe" && expected && token === expected && challenge) {
  return res.status(200).send(challenge);
 }
 return res.sendStatus(403);
});

function buildResponse(question,decision) {
 if (decision.estado === "requiere_reformulacion") {
  const suggestion = Array.isArray(decision.sugerencias) ? decision.sugerencias[0] : null;
  return suggestion
   ? `Necesito precisar la consulta. Podés reformularla así: ${suggestion}`
   : "Necesito que reformules la consulta para poder orientarte correctamente.";
 }
 if (decision.estado === "fuera_de_dominio") {
  return "La consulta está fuera del ámbito institucional de CÍRCULO IA. El equipo puede orientarte sobre el canal adecuado.";
 }
 if (decision.agente === "atencion_humana") {
  return decision.prioridad === "critica"
   ? "Recibimos tu mensaje prioritario. Será derivado para revisión humana."
   : "Recibimos tu reclamo. Será revisado por el equipo del Círculo.";
 }
 if (decision.agente === "orientacion") {
  return "Voy a ayudarte con orientación y datos de contacto del Círculo de Legisladores. ¿Qué dato necesitás?";
 }
 if (decision.agente === "operativo") {
  return "Voy a ayudarte con información operativa del Círculo. ¿Qué necesitás saber?";
 }
 if (decision.agente === "contacto") {
  return "Recibimos tu solicitud de contacto para que pueda ser atendida por el equipo del Círculo.";
 }
 if (decision.agente === "formativo") {
  return "Puedo ayudarte a aprender sobre el Círculo, la historia parlamentaria y la participación ciudadana. ¿Sobre qué tema querés aprender?";
 }
 if (decision.requiere_fuente_externa) {
  const siteUrl = envFirst("CIRCULO_SITE_URL") || "https://iacirculo.vercel.app/";
  return `Esta consulta requiere una fuente externa para darte una respuesta precisa. Podés continuar en el portal: ${siteUrl}`;
 }
 return circuloIA.responder(question);
}

router.post("/",async(req,res) => {
 // Segunda barrera: solo aceptar requests validadas por el parser raw de server.js.
 if (req.metaSignatureVerified !== true) {
  console.warn("[Messenger] Request no validada por el middleware HMAC.");
  return res.sendStatus(401);
 }
 if (!reviewInboxStore.isConfigured()) {
  console.error("[Messenger] Almacenamiento de revisión no configurado; evento no aceptado.");
  return res.status(503).json({ok:false,error:"Bandeja de revisión no disponible."});
 }
 if (req.body?.object !== "page") return res.sendStatus(404);

 const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
 const events = entries.flatMap(entry => Array.isArray(entry.messaging) ? entry.messaging : []);
 console.log("[Messenger] Webhook recibido:",{
  entries:entries.length,
  events:events.length,
  text_events:events.filter(event => Boolean(event.message?.text) && !event.message?.is_echo).length
 });

 try {
  for (const event of events) {
   const senderId = event.sender?.id;
   const question = event.message?.text;
   if (!senderId || !question || event.message?.is_echo) continue;

   const decision = kernel.process(question);
   const eventKey = event.message?.mid ||
    `${senderId}:${event.timestamp || "no-ts"}:${question}`;

   await reviewInboxStore.createPending({
    senderId,
    messageText:question,
    proposedResponse:buildResponse(question,decision),
    semanticAnalysis:decision.analisis_semantico,
    kernelDecision:decision,
    priority:decision.prioridad || "normal"
   },eventKey);
  }
  // Meta recibe 200 solo después de persistir cada caso. No se envía
  // ninguna respuesta desde el webhook: toda salida exige aprobación.
  return res.sendStatus(200);
 } catch(error) {
  console.error("[Messenger] No se pudo guardar el evento para revisión:",error.code || "QUEUE_ERROR");
  return res.status(503).json({ok:false,error:"No se pudo registrar el mensaje para revisión."});
 }
});

module.exports = router;
