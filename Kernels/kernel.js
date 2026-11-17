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

const DIRECT_ACTIONS = {
    ACTION_QUERY_PATRIMONY: {
        tipo: "consulta_patrimonio",
        pregunta: "¿Qué patrimonio documental conserva el Círculo de Legisladores de Tucumán?"
    }
};

function process(input) {
    const structured = input && typeof input === "object" && !Array.isArray(input);
    const question = structured ? String(input.pregunta || "").trim() : String(input || "").trim();
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

    // Los postbacks son comandos: solo se ejecutan si coinciden con una
    // acción explícitamente registrada. Nunca se interpretan como lenguaje libre.
    // Los quick replies pueden contener texto humano o un código ACTION_.
    const isActionPayload = type === "postback" ||
        (type === "quick_reply" && Object.prototype.hasOwnProperty.call(DIRECT_ACTIONS, question));

    if (isActionPayload) {
        const action = DIRECT_ACTIONS[question];
        if (!action) {
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

        return {
            estado: "aceptada",
            dominio: "institucional",
            pregunta: action.pregunta,
            payload: question,
            tipo_evento: type,
            accion_directa: true,
            intencion: action.tipo,
            agente: "institucional",
            senderId
        };
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
