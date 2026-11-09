"use strict";

const MODES = ["AUTO", "SUPERVISION", "MANUAL"];

function resolveMode(value = process.env.MESSENGER_MODE || "SUPERVISION") {
    const mode = String(value).trim().toUpperCase();
    return MODES.includes(mode) ? mode : "SUPERVISION";
}

/**
 * AUTO: despacha únicamente respuestas de bajo riesgo y deja escalaciones en bandeja.
 * SUPERVISION: crea borradores para aprobación humana; no despacha automáticamente.
 * MANUAL: registra el mensaje sin proponer respuesta; toda decisión queda en manos humanas.
 */
function route(analysis, configuredMode) {
    const mode = resolveMode(configuredMode);
    const intent = analysis?.intent || "consulta_ambigua";
    const priority = analysis?.priority || "normal";

    if (intent === "oferta_spam") {
        return { mode, action: "IGNORE", priority: "baja", auto_reply: false, requires_human: false, create_case: false, reason: "spam_no_solicitado" };
    }

    if (mode === "MANUAL") {
        return { mode, action: "HUMAN_REVIEW", priority, auto_reply: false, requires_human: true, create_case: true, draft_response: false, reason: "modo_manual" };
    }

    if (analysis?.requires_human || priority === "critica" || priority === "alta") {
        return { mode, action: "ESCALATE", priority, auto_reply: false, requires_human: true, create_case: true, draft_response: true, reason: "requiere_atencion_humana" };
    }

    if (analysis?.confidence < 0.55 || intent === "consulta_ambigua" || intent === "mensaje_vacio") {
        return {
            mode, action: mode === "AUTO" ? "CLARIFY" : "HUMAN_REVIEW",
            priority: "normal", auto_reply: mode === "AUTO", requires_human: mode !== "AUTO",
            create_case: mode !== "AUTO", draft_response: true, reason: "intencion_ambigua"
        };
    }

    if (mode === "AUTO") {
        return { mode, action: "AUTO_REPLY", priority, auto_reply: true, requires_human: false, create_case: false, draft_response: true, reason: "intencion_reconocida" };
    }

    return { mode, action: "HUMAN_REVIEW", priority, auto_reply: false, requires_human: true, create_case: true, draft_response: true, reason: "aprobacion_requerida" };
}

module.exports = { route, MODES, resolveMode };
