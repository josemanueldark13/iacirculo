/**
 * Kernel AXIAL principal. Devuelve el análisis semántico completo
 * para auditoría y derivación al circuito de revisión humana.
 */
const semanticAnalyzer = require("./semanticAnalyzer");
const domainRouter = require("./domainRouter");
const reformulator = require("./reformulator");
const ragRouter = require("./ragRouter");
const responsePolicy = require("./responsePolicy");
const intentRouter = require("./intentRouter");

function process(question) {
 const analysis = semanticAnalyzer.analyze(question);
 const domainDecision = domainRouter.route(analysis);
 const intent = intentRouter.classify(question);
 const base = {
  pregunta:question, intencion:intent.tipo, agente:intent.agente,
  prioridad:intent.prioridad || "normal",
  confianza_intencion:intent.confianza,
  requiere_revision_humana:Boolean(intent.requiere_humano),
  confianza:analysis.confidence, conceptos_detectados:analysis.concepts,
  analisis_semantico:analysis
 };
 if (domainDecision.estado === "requiere_reformulacion") {
  return {...base,estado:"requiere_reformulacion",sugerencias:reformulator.suggest(question)};
 }
 if (domainDecision.estado === "fuera_de_dominio") {
  return {...base,estado:"fuera_de_dominio",accion:"flujo_externo"};
 }
 const ragDecision = ragRouter.route(question,analysis);
 return {
  ...base, estado:"aceptada", dominio:"institucional",
  modulos_rag:ragDecision.modules, modulo_prioritario:ragDecision.priority,
  tipo_respuesta:responsePolicy.determine(question),
  requiere_fuente_externa:Boolean(ragDecision.requiere_fuente_externa),
  internet:Boolean(ragDecision.requiere_fuente_externa)
 };
}
module.exports = { process };
