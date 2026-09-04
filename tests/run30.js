const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");
const fs = require("fs");

const preguntas = require("./test30-data");
const resultados = preguntas.map((pregunta, i) => {
    const decision = kernel.process(pregunta);
    const respuesta = decision.estado === "aceptada" && !decision.requiere_fuente_externa
        ? circuloIA.responder(pregunta)
        : null;

    return {
        n: i + 1,
        pregunta,
        estado: decision.estado,
        confianza: decision.confianza,
        modulos_rag: decision.modulos_rag || [],
        modulo_prioritario: decision.modulo_prioritario || null,
        requiere_fuente_externa: decision.requiere_fuente_externa || false,
        respuesta
    };
});

fs.writeFileSync("tests/test30-results.json", JSON.stringify(resultados, null, 2));
console.table(resultados.map(r => ({
    n: r.n,
    estado: r.estado,
    modulo: r.modulo_prioritario,
    externa: r.requiere_fuente_externa
})));
console.log("Resultados guardados en tests/test30-results.json");
