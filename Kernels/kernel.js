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

    // 1. Analizar la pregunta
    const analysis = semanticAnalyzer.analyze(question);

    // 2. Determinar el dominio
    const domainDecision = domainRouter.route(analysis);

    // 3. Si es ambigua, pedir reformulación
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

    // 4. Si está fuera del dominio
    if (domainDecision.estado === "fuera_de_dominio") {

        return {
            estado: "fuera_de_dominio",
            pregunta: question,
            confianza: analysis.confidence,
            accion: "flujo_externo"
        };
    }

    // 5. Determinar módulos del RAG
    const ragDecision = ragRouter.route(
        question,
        analysis
    );

    // 6. Determinar tipo de respuesta
    const responseType = responsePolicy.determine(
        question
    );

    // 7. Devolver la decisión completa del Kernel
    return {
        estado: "aceptada",
        dominio: "institucional",

        confianza: analysis.confidence,

        conceptos_detectados:
            analysis.concepts,

        modulos_rag:
            ragDecision.modules,

        modulo_prioritario:
            ragDecision.priority,

        tipo_respuesta:
            responseType,

        internet: false
    };
}

module.exports = {
    process
};