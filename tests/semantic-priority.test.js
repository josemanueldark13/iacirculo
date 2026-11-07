const assert = require("node:assert/strict");
const semanticAnalyzer = require("../Kernels/semanticAnalyzer");
const kernel = require("../Kernels/kernel");

const cases = [
    {
        name: "reclamo explícito",
        text: "Quiero presentar un reclamo porque nadie me responde.",
        expectedClassification: "reclamo",
        expectedPriority: "alta",
        expectedComplaint: true,
        expectedInsult: false
    },
    {
        name: "insulto sin reclamo",
        text: "Son unos idiotas e inútiles.",
        expectedClassification: "insulto",
        expectedPriority: "baja",
        expectedComplaint: false,
        expectedInsult: true
    },
    {
        name: "reclamo e insulto en el mismo mensaje",
        text: "Son unos inútiles, hace tres semanas que espero respuesta por mi reclamo.",
        expectedClassification: "reclamo",
        expectedPriority: "alta",
        expectedComplaint: true,
        expectedInsult: true
    },
    {
        name: "demora y falta de respuesta sin insultos",
        text: "Hace 20 días que espero y nadie me responde.",
        expectedClassification: "reclamo",
        expectedPriority: "alta",
        expectedComplaint: true,
        expectedInsult: false
    },
    {
        name: "mención informativa de la palabra reclamo",
        text: "¿Qué es un reclamo?",
        expectedClassification: "consulta",
        expectedPriority: "normal",
        expectedComplaint: false,
        expectedInsult: false
    },
    {
        name: "nadie me responde",
        text: "Nadie me responde desde hace varias semanas.",
        expectedClassification: "reclamo",
        expectedPriority: "alta",
        expectedComplaint: true,
        expectedInsult: false
    },
    {
        name: "espera prolongada sin usar la palabra reclamo",
        text: "Llevo tres semanas esperando una respuesta.",
        expectedClassification: "reclamo",
        expectedPriority: "alta",
        expectedComplaint: true,
        expectedInsult: false
    },
    {
        name: "acción de reclamar expresamente negada",
        text: "No quiero presentar un reclamo, solo estoy consultando.",
        expectedClassification: "consulta",
        expectedPriority: "normal",
        expectedComplaint: false,
        expectedInsult: false
    }
];

for (const item of cases) {
    const result = semanticAnalyzer.analyze(item.text);

    assert.equal(result.classification, item.expectedClassification, item.name + ": clasificación");
    assert.equal(result.priority, item.expectedPriority, item.name + ": prioridad");
    assert.equal(result.containsComplaint, item.expectedComplaint, item.name + ": señal de reclamo");
    assert.equal(result.containsInsult, item.expectedInsult, item.name + ": señal de insulto");

    console.log("PASS | " + item.name + " | " + result.classification + " | " + result.priority);
}

const mixed = kernel.process(cases[2].text);
assert.equal(mixed.estado, "aceptada", "El reclamo mixto debe pasar al flujo institucional");
assert.equal(mixed.intencion, "reclamo", "La intención prioritaria debe ser reclamo");
assert.equal(mixed.prioridad_atencion, "alta", "El Kernel debe conservar la prioridad alta");
assert.equal(mixed.contiene_reclamo, true, "El Kernel debe conservar la señal de reclamo");
assert.equal(mixed.contiene_insulto, true, "El Kernel debe conservar la señal de insulto");
assert.equal(mixed.requiere_revision_humana, true, "El reclamo debe quedar marcado para revisión humana");

const insultOnly = kernel.process(cases[1].text);
assert.equal(insultOnly.intencion, "insulto", "Un insulto aislado no debe convertirse en reclamo");
assert.equal(insultOnly.prioridad_atencion, "baja", "Un insulto aislado debe tener prioridad baja");

console.log("SEMANTIC PRIORITY: PASS (" + (cases.length + 2) + " assertions groups)");
