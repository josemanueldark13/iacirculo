'use strict';

/**
 * Resuelve payloads de interfaz conocidos a consultas canónicas.
 * El payload nunca se entrega al analizador semántico: solo la pregunta
 * institucional registrada puede continuar por el pipeline documental.
 */
const ACTIONS = Object.freeze({
    ACTION_QUERY_PATRIMONY: Object.freeze({
        tipo: "consulta_patrimonio",
        pregunta: "¿Qué patrimonio documental conserva el Círculo de Legisladores de Tucumán?"
    })
});

function routeAction(payload, type) {
    if (typeof payload !== "string") return null;

    const normalized = payload.trim();
    const isDeterministicEvent =
        type === "postback" ||
        (type === "quick_reply" && /^ACTION_[A-Z0-9_]+$/.test(normalized));

    if (!isDeterministicEvent) return null;

    const action = ACTIONS[normalized];
    if (!action) {
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
        tipo: action.tipo,
        pregunta: action.pregunta
    };
}

module.exports = {
    routeAction,
    ACTIONS
};
