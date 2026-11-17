/**
 * AXIAL KERNEL
 * Kernel principal de CÍRCULO IA
 *
 * Coordina:
 * 1. análisis semántico
 * 2. dominio
 * 3. intención y agente
 * 4. reformulación
 * 5. selección de módulos RAG
 * 6. política de respuesta
 */

const semanticAnalyzer = require("./semanticAnalyzer");
const domainRouter = require("./domainRouter");
const reformulator = require("./reformulator");
const ragRouter = require("./ragRouter");
const responsePolicy = require("./responsePolicy");
const intentRouter = require("./intentRouter");
const actionRouter = require("./actionRouter");

function process(input) {
    const structured = input && typeof input === "object" && !Array.isArray(input);
    let question = structured ? String(input.pregunta || "").trim() : String(input || "").trim();
    const type = structured ? input.type : "text";
    const senderId = structured ? input.senderId || null : null;

    if (!question) {
        return {
            estado: "entrada_vacia",
            pregunta: "",
            intencion: "desconocida",
            agente: "institucional"
        };
    }

    // Los payloads deterministas se resuelven antes del análisis semántico.
    // Solo la pregunta canónica registrada puede continuar hacia el pipeline RAG.
    let directAction = null;
    const isActionPayload = type === "postback" ||
        (type === "quick_reply" && /^ACTION_[A-Z0-9_]+$/.test(question));

    if (isActionPayload) {
        directAction = actionRouter.routeAction(question, type);

        if (!directAction || !directAction.recognized) {
            return {
                estado: "accion_no_reconocida",
                pregunta: question,
                payload: question,
                tipo_evento: type,
                intencion: "accion_desconocida",
                agente: "institucional",
                senderId
            };
        }

        // Las acciones de menú/ayuda responden directamente, sin NLP ni RAG.
        if (directAction.responseMessage) {
            return {
                estado: "aceptada",
                dominio: "institucional",
                pregunta: question,
                payload: directAction.payload,
                tipo_evento: directAction.tipo_evento,
                accion_directa: true,
                responseMessage: directAction.responseMessage,
                intencion: directAction.tipo,
                agente: "institucional",
                senderId
            };
        }

        // Las acciones documentales sustituyen el payload por una pregunta
        // canónica y continúan por el pipeline institucional/RAG.
        question = directAction.pregunta;
        // No se ejecuta el NLP sobre el payload: el análisis se aplica
        // exclusivamente a la pregunta institucional registrada.
    }

    // Compatibilidad: las llamadas históricas kernel.process("texto")
    // y los mensajes de texto/quick reply siguen el flujo semántico original.

    const analysis = semanticAnalyzer.analyze(question);
    const domainDecision = domainRouter.route(analysis);
    const intent = intentRouter.classify(question);

    if (domainDecision.estado === "requiere_reformulacion") {
        const suggestions = reformulator.suggest(question);

        return {
            estado: "requiere_reformulacion",
            pregunta: question,
            intencion: intent.tipo,
            agente: intent.agente,
            confianza: analysis.confidence,
            conceptos_detectados: analysis.concepts,
            sugerencias: suggestions
        };
    }

    if (domainDecision.estado === "fuera_de_dominio") {
        return {
            estado: "fuera_de_dominio",
            pregunta: question,
            intencion: intent.tipo,
            agente: intent.agente,
            confianza: analysis.confidence,
            accion: "flujo_externo"
        };
    }

    const ragDecision = ragRouter.route(question, analysis);
    const responseType = responsePolicy.determine(question);

    return {
        estado: "aceptada",
        ...(directAction ? {
            accion_directa: true,
            payload: directAction.payload,
            tipo_evento: directAction.tipo_evento
        } : {}),
        dominio: "institucional",
        intencion: intent.tipo,
        agente: intent.agente,
        confianza: analysis.confidence,
        conceptos_detectados: analysis.concepts,
        modulos_rag: ragDecision.modules,
        modulo_prioritario: ragDecision.priority,
        tipo_respuesta: responseType,
        requiere_fuente_externa: Boolean(ragDecision.requiere_fuente_externa),
        internet: Boolean(ragDecision.requiere_fuente_externa)
    };
}

module.exports = {
    process
};
