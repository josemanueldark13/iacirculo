/**
 * Kernel AXIAL principal de CÍRCULO IA.
 * Separa análisis institucional, análisis conversacional y política operativa de Messenger.
 */
const semanticAnalyzer = require("./semanticAnalyzer");
const messageAnalyzer = require("./messageAnalyzer");
const semanticFrameAnalyzer = require("./semanticFrame");
const messagingRouter = require("./messagingRouter");
const domainRouter = require("./domainRouter");
const reformulator = require("./reformulator");
const ragRouter = require("./ragRouter");
const responsePolicy = require("./responsePolicy");
const intentRouter = require("./intentRouter");
const conversationBase = require("./conversationBase");

const PRIORITY_RANK = { baja: 1, normal: 2, alta: 3, critica: 4 };

function process(question, context = {}) {
    const analysis = semanticAnalyzer.analyze(question);
    const semanticFrame = semanticFrameAnalyzer.analyzeFrame({
        text: question,
        conversationContext: Array.isArray(context.conversationContext) ? context.conversationContext : []
    });
    const messageAnalysis = messageAnalyzer.analyze(question, {
        hasPreviousMessage: semanticFrame.context.supplied,
        previousDomain: semanticFrame.domain
    });
    const intent = intentRouter.classify(question);

    // La derivación humana es una política transversal: ningún modo puede
    // anular una solicitud explícita de contacto ni una derivación del analizador.
    const humanRequired = Boolean(messageAnalysis.requires_human || intent.requiere_humano);
    const priority = (PRIORITY_RANK[intent.prioridad] || 0) > (PRIORITY_RANK[messageAnalysis.priority] || 0)
        ? intent.prioridad
        : (messageAnalysis.priority || intent.prioridad || "normal");
    const routingAnalysis = {
        ...messageAnalysis,
        requires_human: humanRequired,
        priority
    };
    const messagingDecision = messagingRouter.route(routingAnalysis, context.mode, semanticFrame);
    const conversationalMatch = humanRequired ? null : conversationBase.match(question);
    const domainDecision = domainRouter.route(analysis);

    const agent = humanRequired ? "atencion_humana" : intent.agente;
    const intentType = humanRequired ? (messageAnalysis.intent === "contacto" ? "contacto" : messageAnalysis.intent) : intent.tipo;
    const base = {
        pregunta: question,
        intencion: intentType,
        agente: agent,
        prioridad: priority,
        confianza_intencion: messageAnalysis.confidence,
        requiere_revision_humana: humanRequired || messagingDecision.requires_human,
        confianza: analysis.confidence,
        conceptos_detectados: analysis.concepts,
        analisis_semantico: analysis,
        analisis_mensaje: messageAnalysis,
        semantic_frame: semanticFrame,
        decision_mensajeria: messagingDecision
    };

    if (humanRequired) {
        return { ...base, estado: "requiere_atencion_humana", accion: "derivar_a_revision" };
    }
    if (domainDecision.estado === "requiere_reformulacion") {
        return { ...base, estado: "requiere_reformulacion", sugerencias: reformulator.suggest(question) };
    }
    if (domainDecision.estado === "fuera_de_dominio") {
        return { ...base, estado: "fuera_de_dominio", accion: "flujo_externo" };
    }

    const ragDecision = ragRouter.route(question, analysis);
    return {
        ...base,
        estado: "aceptada",
        dominio: "institucional",
        modulos_rag: ragDecision.modules,
        modulo_prioritario: ragDecision.priority,
        tipo_respuesta: responsePolicy.determine(question),
        requiere_fuente_externa: Boolean(ragDecision.requiere_fuente_externa),
        internet: Boolean(ragDecision.requiere_fuente_externa)
    };
}

module.exports = { process };
