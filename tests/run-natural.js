const kernel = require("../Kernels/kernel");
const cases = require("./test-natural-data");
let failures = 0;
for (const item of cases) {
 const result = kernel.process(item.q);
 const analysis = result.analisis_semantico;
 const ok = result.estado === "aceptada" &&
  result.dominio === item.intent &&
  result.conceptos_detectados.includes(item.concept) &&
  analysis?.version === "2.0.0" && analysis?.domain === item.intent &&
  Array.isArray(analysis?.signals?.core) && typeof analysis?.requiresReview === "boolean";
 console.log((ok ? "PASS" : "FAIL") + " | " + item.q + " | " + result.estado + " | " + result.dominio);
 if (!ok) failures++;
}
const complaint = kernel.process("Quiero hacer un reclamo por una demora");
if (complaint.prioridad !== "alta" || complaint.agente !== "atencion_humana") {
 console.error("FAIL | Los reclamos deben quedar priorizados para revisión humana.");
 failures++;
} else console.log("PASS | Reclamos priorizados para revisión humana");
if (failures) { console.error("LENGUAJE NATURAL: FAIL (" + failures + ")"); process.exit(1); }
console.log("LENGUAJE NATURAL: PASS (" + cases.length + "/" + cases.length + " + prioridad)");
