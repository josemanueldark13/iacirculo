const crypto = require("crypto");
const {verifyMetaSignature} = require("../Kernels/metaWebhookSecurity");
const semanticAnalyzer = require("../Kernels/semanticAnalyzer");
const intentRouter = require("../Kernels/intentRouter");

const body = Buffer.from(JSON.stringify({object:"page",entry:[]}));
const secret = "test-secret-only";
const validSignature = "sha256=" + crypto.createHmac("sha256",secret).update(body).digest("hex");
const changedNibble = validSignature[7] === "0" ? "1" : "0";
const alteredSignature = validSignature.slice(0,7) + changedNibble + validSignature.slice(8);

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
let failures = 0;
for (const [label,passed] of checks) {
 console.log((passed ? "PASS" : "FAIL") + " | " + label);
 if (!passed) failures++;
}
if (failures) process.exit(1);
console.log("SEGURIDAD Y PRIORIDAD: PASS (" + checks.length + "/" + checks.length + ")");
