const kernel = require("../Kernels/kernel");
const circuloIA = require("../knowledge/agents/circuloIA");
const fs = require("fs");

const preguntas = require("./test30-data");

if (preguntas.length !== 30) {
    throw new Error(`Regresión inválida: se esperaban 30 preguntas y hay ${preguntas.length}`);
}

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

const errores = [];

function assert(condition, mensaje) {
    if (!condition) errores.push(mensaje);
}

resultados.forEach((r) => {
    assert(r.estado === "aceptada", `P${r.n}: estado inesperado: ${r.estado}`);
});

[1, 2, 3].forEach((n) => {
    const r = resultados[n - 1];
    assert(!r.requiere_fuente_externa, `P${n}: creación/decreto no debería requerir fuente externa`);
    assert(r.modulo_prioritario === "nucleo1", `P${n}: debería priorizar nucleo1`);
    assert(typeof r.respuesta === "string" && r.respuesta.length > 0, `P${n}: respuesta institucional vacía`);
});

[5, 6, 7, 8, 9, 10].forEach((n) => {
    const r = resultados[n - 1];
    assert(!r.requiere_fuente_externa, `P${n}: identidad/sede/autoridades no debería requerir fuente externa`);
    assert(typeof r.respuesta === "string" && r.respuesta.length > 0, `P${n}: respuesta institucional vacía`);
});

[26, 27, 28, 29, 30].forEach((n) => {
    const r = resultados[n - 1];
    assert(r.requiere_fuente_externa, `P${n}: debería requerir fuente externa (Núcleo 3)`);
    assert(r.respuesta === null, `P${n}: no debe responder con RAG local cuando requiere fuente externa`);
});

fs.writeFileSync("tests/test30-results.json", JSON.stringify(resultados, null, 2));

console.table(resultados.map(r => ({
    n: r.n,
    estado: r.estado,
    modulo: r.modulo_prioritario,
    externa: r.requiere_fuente_externa
})));

if (errores.length > 0) {
    console.error("\nREGRESIÓN 30: FAIL");
    errores.forEach(e => console.error(`- ${e}`));
    process.exit(1);
}

console.log("\nREGRESIÓN 30: PASS");
console.log("30 preguntas ejecutadas; criterios críticos verificados.");
