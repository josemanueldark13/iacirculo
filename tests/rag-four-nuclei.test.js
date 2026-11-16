"use strict";

const assert = require("node:assert/strict");
const ragRouter = require("../Kernels/ragRouter");
const bibliography = require("../knowledge/bibliografia");
const kernel = require("../Kernels/kernel");

const architecture = ragRouter.getArchitecture();
assert.equal(architecture.id, "AXIAL-RAG-4N");
assert.deepEqual(architecture.nuclei.map(item => item.id), ["N1", "N2", "N3", "N4"]);
assert.equal(architecture.curatedSourceCount, 9);

// N1: una petición normativa debe conservar prioridad oficial.
const n1 = ragRouter.route("Necesito el texto oficial de la Ley Provincial 6333", {
    domain: "institucional",
    confidence: 0.9
});
assert.ok(n1.modules.includes("oficial"));
assert.ok(!n1.modules.includes("web_abierta"));

// N2: una consulta historiográfica debe activar el catálogo bibliográfico.
const n2 = ragRouter.route("Bibliografía e investigaciones sobre la historia política de Tucumán", {
    domain: "institucional",
    confidence: 0.8
});
assert.ok(n2.modules.includes("bibliografico"));
assert.ok(!n2.modules.includes("web_abierta"));

const n2Results = bibliography.search("reformas institucionales de Tucumán 1820-1852", 5);
assert.ok(n2Results.total > 0);
assert.ok(n2Results.results.some(item => item.id === "nanni-wilde-2021-reformas-tucumanas"));
assert.ok(n2Results.results.every(item => item.citation && item.metadata_status));

// El Kernel entrega los resultados N2 y conserva sus referencias bibliográficas.
const kernelN2 = kernel.process("Bibliografía e investigaciones sobre la historia política de Tucumán");
assert.equal(kernelN2.estado, "aceptada");
assert.ok(kernelN2.modulos_rag.includes("bibliografico"));
assert.ok(kernelN2.recuperacion_bibliografica.total > 0);

// N3: se seleccionan páginas concretas de una lista controlada.
const n3 = ragRouter.route("Buscá en páginas seleccionadas sobre historia política de Tucumán", {
    domain: "institucional",
    confidence: 0.8
});
assert.ok(n3.modules.includes("web_seleccionada"));
assert.ok(n3.selected_sources.length > 0);
assert.ok(n3.selected_sources.every(item => /^https:\/\//.test(item.url)));
assert.equal(n3.open_web.enabled, false);

// N4: la web abierta queda bloqueada hasta que N3 resulte insuficiente,
// salvo que el usuario solicite explícitamente una búsqueda libre.
const current = ragRouter.route("Necesito noticias actuales y fuentes externas sobre actividad legislativa", {
    domain: "institucional",
    confidence: 0.8
});
assert.equal(current.open_web.enabled, false);
assert.equal(current.open_web.eligible, true);

const n4Fallback = ragRouter.route("Ampliá la búsqueda externa sobre historia de Tucumán", {
    domain: "institucional",
    confidence: 0.8
}, { n3Insufficient: true });
assert.ok(n4Fallback.modules.includes("web_abierta"));
assert.equal(n4Fallback.open_web.enabled, true);
assert.equal(n4Fallback.open_web.must_be_last_resort, true);
assert.equal(n4Fallback.open_web.must_not_be_presented_as_official, true);

const n4Explicit = ragRouter.route("Buscá en toda la web información sobre historia de Tucumán", {
    domain: "institucional",
    confidence: 0.8
});
assert.ok(n4Explicit.modules.includes("web_abierta"));
assert.equal(n4Explicit.open_web.status, "solicitada_expresamente");

console.log("AXIAL RAG FOUR NUCLEI: PASS");
