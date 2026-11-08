const crypto = require("crypto");
const http = require("http");
const {verifyMetaSignature} = require("../Kernels/metaWebhookSecurity");
const semanticAnalyzer = require("../Kernels/semanticAnalyzer");
const intentRouter = require("../Kernels/intentRouter");
const messengerSender = require("../Kernels/messengerSender");

const body = Buffer.from(JSON.stringify({object:"page",entry:[]}));
const secret = "test-secret-only";
const validSignature = "sha256=" + crypto.createHmac("sha256",secret).update(body).digest("hex");
const alteredSignature = validSignature.slice(0,-1) + (validSignature.endsWith("0") ? "1" : "0");

function assert(label,passed) {
 console.log((passed ? "PASS" : "FAIL") + " | " + label);
 if (!passed) throw new Error(label);
}

function post(server,bodyText,signature) {
 return new Promise((resolve,reject) => {
  const address = server.address();
  const headers = {"content-type":"application/json","content-length":Buffer.byteLength(bodyText)};
  if (signature) headers["x-hub-signature-256"] = signature;
  const request = http.request({
   hostname:"127.0.0.1",port:address.port,path:"/api/webhook/facebook",
   method:"POST",headers
  },response => {
   let data = "";
   response.setEncoding("utf8");
   response.on("data",chunk => { data += chunk; });
   response.on("end",() => resolve({status:response.statusCode,body:data}));
  });
  request.on("error",reject);
  request.end(bodyText);
 });
}

async function main() {
 const checks = [
  ["acepta firma válida",verifyMetaSignature(body,validSignature,secret) === true],
  ["rechaza firma alterada",verifyMetaSignature(body,alteredSignature,secret) === false],
  ["rechaza firma ausente",verifyMetaSignature(body,"",secret) === false],
  ["rechaza secreto ausente",verifyMetaSignature(body,validSignature,"") === false],
  ["rechaza cuerpo sin buffer original",verifyMetaSignature(body.toString("utf8"),validSignature,secret) === false],
  ["no confunde prefijos de palabra",!semanticAnalyzer.analyze("leyenda institucional").concepts.includes("ley")],
  ["prioriza reclamos",intentRouter.classify("Quiero hacer un reclamo por un trámite").prioridad === "alta"],
  ["prioriza urgencias",intentRouter.classify("Tengo una emergencia y necesito ayuda").prioridad === "critica"],
  ["insulto aislado no escala prioridad",intentRouter.classify("Sos un inútil").prioridad === "normal"]
 ];
 checks.forEach(([label,passed]) => assert(label,passed));

 const originalSecret = process.env.FACEBOOK_APP_SECRET;
 const originalDispatch = process.env.DISPATCH_ENABLED;
 const originalKvUrl = process.env.KV_REST_API_URL;
 const originalKvToken = process.env.KV_REST_API_TOKEN;
 process.env.FACEBOOK_APP_SECRET = secret;
 process.env.DISPATCH_ENABLED = "false";
 delete process.env.KV_REST_API_URL;
 delete process.env.KV_REST_API_TOKEN;

 assert("despacho apagado por defecto cuando el flag es false",messengerSender.dispatchEnabled() === false);

 const app = require("../server");
 const server = http.createServer(app);
 await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
 try {
  const malformed = "{not valid JSON";
  const noSignature = await post(server,malformed,null);
  assert("HTTP 401 para firma ausente antes de JSON.parse",noSignature.status === 401);

  const invalidSignature = await post(server,malformed,alteredSignature);
  assert("HTTP 401 para firma inválida antes de JSON.parse",invalidSignature.status === 401);

  const malformedSigned = await post(server,malformed,"sha256=" + crypto.createHmac("sha256",secret).update(malformed).digest("hex"));
  assert("HTTP 400 solo después de validar firma y detectar JSON inválido",malformedSigned.status === 400);

  const validPayload = JSON.stringify({object:"page",entry:[]});
  const validPayloadSignature = "sha256=" + crypto.createHmac("sha256",secret).update(validPayload).digest("hex");
  const validRequest = await post(server,validPayload,validPayloadSignature);
  assert("firma válida pasa seguridad y alcanza la comprobación de KV (503 sin KV)",validRequest.status === 503);
 } finally {
  await new Promise(resolve => server.close(resolve));
  if (originalSecret === undefined) delete process.env.FACEBOOK_APP_SECRET;
  else process.env.FACEBOOK_APP_SECRET = originalSecret;
  if (originalDispatch === undefined) delete process.env.DISPATCH_ENABLED;
  else process.env.DISPATCH_ENABLED = originalDispatch;
  if (originalKvUrl === undefined) delete process.env.KV_REST_API_URL;
  else process.env.KV_REST_API_URL = originalKvUrl;
  if (originalKvToken === undefined) delete process.env.KV_REST_API_TOKEN;
  else process.env.KV_REST_API_TOKEN = originalKvToken;
 }

 console.log("SEGURIDAD WEBHOOK + PRIORIDAD: PASS");
}

main().catch(error => {
 console.error("SEGURIDAD WEBHOOK + PRIORIDAD: FAIL",error.message);
 process.exit(1);
});
