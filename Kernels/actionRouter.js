'use strict';

/**
 * Registro de acciones deterministas de Messenger.
 * Las acciones de respuesta inmediata devuelven responseMessage.
 * Las acciones documentales devuelven una pregunta canónica para el RAG.
 */
const ACTIONS = Object.freeze({
    ACTION_QUERY_PATRIMONY: Object.freeze({
        tipo: "consulta_patrimonio",
        pregunta: "¿Qué patrimonio documental conserva el Círculo de Legisladores de Tucumán?"
    }),
    SHOW_MAIN_MENU: Object.freeze({
        responseMessage: "Menú principal de CÍRCULO IA:\n1. Consultar patrimonio\n2. Historia institucional\n3. Legislación y documentación\n4. Contacto"
    }),
    HELP_INFO: Object.freeze({
        responseMessage: "Este es el canal institucional automatizado del Círculo de Legisladores de Tucumán. Podés consultar patrimonio, historia, legislación, autoridades, actividades y vías de contacto."
    })
});

/**
 * Devuelve null cuando un quick reply contiene texto libre.
 * Un postback desconocido o un quick reply con prefijo ACTION_ se considera
 * comando determinista no registrado y no debe caer al analizador NLP.
 */
function routeAction(payload, type) {
    if (typeof payload !== "string") return null;

    const normalized = payload.trim();
    const knownAction = ACTIONS[normalized];
    const isExplicitActionCode = /^ACTION_[A-Z0-9_]+$/.test(normalized);

    if (type === "quick_reply" && !knownAction && !isExplicitActionCode) {
        return null;
    }
    if (type !== "postback" && type !== "quick_reply") {
        return null;
    }

    if (!knownAction) {
        return {
            recognized: false,
            payload: normalized,
            tipo_evento: type
        };
    }

    return {
        recognized: true,
        payload: normalized,
        tipo_evento: type,
        tipo: knownAction.tipo || "respuesta_estatica",
        pregunta: knownAction.pregunta || null,
        responseMessage: knownAction.responseMessage || null
    };
}

module.exports = {
    routeAction,
    ACTIONS
};
