/**
 * AXIAL MESSAGING — Decision Router
 * Convierte el análisis semántico en una política de atención.
 */

const MODES = ["AUTO", "SUPERVISION", "MANUAL"];

function route(analysis, configuredMode = process.env.MESSENGER_MODE || "SUPERVISION") {
  const mode = MODES.includes(String(configuredMode).toUpperCase())
    ? String(configuredMode).toUpperCase()
    : "SUPERVISION";

  const intent = analysis?.intent || "consulta_ambigua";
  const critical = analysis?.priority === "critica";
  const humanRequired = Boolean(analysis?.requires_human);

  if (intent === "oferta_spam") {
    return {
      mode,
      action: "IGNORE",
      priority: "baja",
      auto_reply: false,
      requires_human: false,
      reason: "contenido_promocional_no_solicitado"
    };
  }

  if (mode === "MANUAL") {
    return {
      mode,
      action: "HUMAN_REVIEW",
      priority: critical ? "critica" : humanRequired ? "alta" : "normal",
      auto_reply: false,
      requires_human: true,
      reason: "modo_manual"
    };
  }

  if (critical || humanRequired) {
    return {
      mode,
      action: "ESCALATE",
      priority: critical ? "critica" : "alta",
      auto_reply: mode === "SUPERVISION",
      requires_human: true,
      reason: critical ? "prioridad_critica" : "intervencion_humana_requerida"
    };
  }

  if (analysis?.confidence < 0.55 || intent === "consulta_ambigua") {
    return {
      mode,
      action: "CLARIFY",
      priority: "normal",
      auto_reply: true,
      requires_human: false,
      reason: "intencion_ambigua"
    };
  }

  return {
    mode,
    action: "AUTO_REPLY",
    priority: analysis?.priority || "normal",
    auto_reply: true,
    requires_human: false,
    reason: "intencion_reconocida"
  };
}

module.exports = { route, MODES };
