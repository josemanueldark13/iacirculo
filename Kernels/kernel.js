/**
 * AXIAL KERNEL
 * Kernel principal de CÍRCULO IA
 *
 * Coordina:
 * 1. análisis semántico
 * 2. dominio
 * 3. reformulación
 * 4. selección de módulos RAG
 * 5. política de respuesta
 */

const semanticAnalyzer = require("./semanticAnalyzer");
const domainRouter = require("./domainRouter");
const reformulator = require("./reformulator");
const ragRouter = require("./ragRouter");
const responsePolicy = require("./responsePolicy");

function process(question) {
    const analysis = semanticAnalyzer.analyze(question);
    const domainDecision = domainRouter.route(analysis);

    if (domainDecision.estado === "requiere_reformulacion") {
        const suggestions = reformulator.suggest(question);

        return {
            estado: "requiere_reformulacion",
            pregunta: question,
            confianza: analysis.confidence,
            conceptos_detectados: analysis.concepts,
            sugerencias: suggestions
        };
    }

    if (domainDecision.estado === "fuera_de_dominio") {
        return {
            estado: "fuera_de_dominio",
            pregunta: question,
            confianza: analysis.confidence,
            accion: "flujo_externo"
        };
    }

    const ragDecision = ragRouter.route(question, analysis);
    const responseType = responsePolicy.determine(question);

    return {
        estado: "aceptada",
        dominio: "institucional",
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
