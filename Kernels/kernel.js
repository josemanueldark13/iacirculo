/**
 * Kernel AXIAL principal de CÍRCULO IA.
 * Separa análisis institucional, análisis conversacional y política operativa de Messenger.
 */
const semanticAnalyzer = require("./semanticAnalyzer");
const messageAnalyzer = require("./messageAnalyzer");
const messagingRouter = require("./messagingRouter");
const domainRouter = require("./domainRouter");
const reformulator = require("./reformulator");
const ragRouter = require("./ragRouter");
const responsePolicy = require("./responsePolicy");
const intentRouter = require("./intentRouter");

function process(question, context = {}) {
    const analysis = semanticAnalyzer.analyze(question);
    const messageAnalysis = messageAnalyzer.analyze(question, context);
    const messagingDecision = messagingRouter.route(messageAnalysis, context.mode);
    const domainDecision = domainRouter.route(analysis);
    const intent = intentRouter.classify(question);

    const humanRequired = messageAnalysis.requires_human;
    const agent = humanRequired ? "atencion_humana" : intent.agente;
    const intentType = humanRequired ? messageAnalysis.intent : intent.tipo;
    const priority = messageAnalysis.priority || "normal";
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
