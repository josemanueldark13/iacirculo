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

function process(question, context = {}) {
    const analysis = semanticAnalyzer.analyze(question, context);
    const semanticContext = {
        polaridad: analysis.polarity,
        intencion_suprimida: analysis.intentSuppressed,
        resolucion_contexto: analysis.contextResolution
    };
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
            sugerencias: suggestions,
            ...semanticContext
        };
    }

    if (domainDecision.estado === "fuera_de_dominio") {
        return {
            estado: "fuera_de_dominio",
            pregunta: question,
            intencion: intent.tipo,
            agente: intent.agente,
            confianza: analysis.confidence,
            accion: "flujo_externo",
            ...semanticContext
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
        internet: Boolean(ragDecision.requiere_fuente_externa),
        ...semanticContext
    };
}

module.exports = {
    process
};
