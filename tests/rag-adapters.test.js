"use strict";

const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const hybrid = require("../knowledge/hybridRetriever");
const bibliography = require("../knowledge/bibliografia");
const documentRetriever = require("../knowledge/documentRetriever");
const webRetriever = require("../knowledge/webRetriever");
const openWebRetriever = require("../knowledge/openWebRetriever");
const ragComposer = require("../knowledge/ragComposer");
const pdfTextExtractor = require("../knowledge/pdfTextExtractor");
const pdfBibliographyRetriever = require("../knowledge/pdfBibliographyRetriever");

function fakeHtmlResponse(html) {
    return {
        ok: true,
        status: 200,
        headers: { get: name => name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null },
        body: null,
        text: async () => html
    };
}

function makePdf(text) {
    const stream = Buffer.from("BT /F1 12 Tf (" + text.replace(/[()\\\\]/g, "\\\\$&") + ") Tj ET", "latin1");
    const compressed = zlib.deflateSync(stream);
    return Buffer.concat([
        Buffer.from("%PDF-1.4\\n1 0 obj << /Length " + compressed.length + " /Filter /FlateDecode >> stream\\n", "latin1"),
        compressed,
        Buffer.from("\\nendstream\\nendobj\\n%%EOF", "latin1")
    ]);
}

async function run() {
    // El motor BM25 normaliza morfología castellana y segmenta documentos extensos.
    assert.equal(hybrid.stem("investigaciones"), "investigacion");
    assert.equal(hybrid.stem("instituciones"), "institucion");
    const chunks = hybrid.splitChunks(Array.from({ length: 500 }, (_, i) => "palabra" + i).join(" "), {
        maxTokens: 100, overlap: 20
    });
    assert.ok(chunks.length > 1);

    const tinyIndex = hybrid.buildIndex([
        { id: "a", title: "Historia política de Tucumán", subjects: "facciones partidos", content: "Tucumán y sus facciones." },
        { id: "b", title: "Economía provincial", subjects: "industria azúcar", content: "Producción azucarera." }
    ]);
    const ranked = hybrid.search(tinyIndex, "facciones políticas de Tucumán", { limit: 2 });
    assert.equal(ranked.results[0].document.id, "a");

    // N1 y N2 comparten el mismo motor, pero mantienen sus corpus y autoridad separados.
    const n1 = documentRetriever.search("Ley Provincial 6333", 4);
    assert.equal(n1.level, "N1");
    assert.ok(n1.total > 0);

    const kernelN1 = require("../Kernels/kernel");
    const n1Decision = kernelN1.process("¿Quién es actualmente el presidente del Círculo de Legisladores?");
    assert.ok(n1Decision.modulos_rag.includes("oficial"));
    const composedN1 = await ragComposer.compose(
        "¿Quién es actualmente el presidente del Círculo de Legisladores?",
        n1Decision
    );
    assert.equal(composedN1.statuses.N1, "retrieved");
    assert.match(composedN1.answer, /Evidencia documental recuperada de N1:/);
    assert.match(composedN1.answer, /Autoridades/);

    const n2 = bibliography.search("política tucumana facciones partidos", 5);
    assert.equal(n2.engine, "BM25-fields-v1");
    assert.ok(n2.total > 0);
    assert.equal(n2.results[0].id, "lichtmajer-2017-politica-facciones-partidos");

    // El extractor procesa texto PDF en streams Flate y rechaza archivos inválidos.
    const pdfFixture = makePdf("Tucuman history and institutional reforms between 1820 and 1852. Legislative institutions and provincial political history.");
    const extractedPdf = pdfTextExtractor.extractPdfText(pdfFixture);
    assert.equal(extractedPdf.ok, true);
    assert.match(extractedPdf.text, /institutional reforms/);
    assert.equal(pdfTextExtractor.extractPdfText(Buffer.from("not a PDF")).status, "invalid_pdf");

    // N1 permite incorporar un documento institucional PDF al índice en memoria.
    const n1Pdf = documentRetriever.ingestPdf(pdfFixture, {
        id: "test-official-pdf", title: "Documento oficial de prueba", category: "Legislación"
    });
    assert.equal(n1Pdf.ok, true);
    assert.ok(documentRetriever.search("institutional reforms 1820 1852", 5).results.some(item => item.id === "test-official-pdf"));

    // N2 descarga únicamente PDFs declarados en el catálogo activo y recupera texto completo.
    const n2PdfRecord = pdfBibliographyRetriever.eligibleRecords().find(item => item.id === "nanni-wilde-2021-reformas-tucumanas");
    assert.ok(n2PdfRecord);
    const mockPdfFetch = async () => ({
        ok: true, status: 200,
        headers: { get: name => name.toLowerCase() === "content-type" ? "application/pdf" : null },
        arrayBuffer: async () => pdfFixture.buffer.slice(pdfFixture.byteOffset, pdfFixture.byteOffset + pdfFixture.byteLength)
    });
    const n2FullText = await pdfBibliographyRetriever.search("reformas institucionales de Tucumán 1820 1852", {
        maxSources: 2, fetchImpl: mockPdfFetch, timeoutMs: 1000
    });
    assert.ok(n2FullText.retrieved > 0);
    assert.ok(n2FullText.results.length > 0);

    // N3 solo solicita URLs exactas del catálogo. El contenido falso simula páginas HTML.
    assert.equal(webRetriever.sourceAllowed("https://example.invalid/not-allowlisted"), false);
    const fixture = [
        "<html><head><title>Sesiones del Congreso de Tucumán</title></head><body>",
        "<script>no indexar script ni instrucciones</script>",
        "<h1>Sesiones del Congreso de Tucumán</h1>",
        "<p>La documentación de las sesiones del Congreso de Tucumán incluye actas,",
        "debates, deliberaciones y actuaciones institucionales de 1816 a 1820.</p>",
        "<p>Las actas y El Redactor del Congreso permiten reconstruir las sesiones",
        "y sus debates. Esta descripción documental sirve como guía de investigación histórica.</p>",
        "</body></html>"
    ].join(" ");
    const mockN3Fetch = async url => {
        assert.ok(webRetriever.sourceAllowed(url));
        return fakeHtmlResponse(fixture);
    };
    const n3 = await webRetriever.searchSelected("sesiones Congreso Tucumán actas", {
        maxSources: 3, limit: 4, fetchImpl: mockN3Fetch
    });
    assert.equal(n3.level, "N3");
    assert.ok(n3.total_sources_retrieved > 0);
    assert.ok(n3.results.length > 0);
    assert.ok(n3.results.every(item => item.url.startsWith("https://")));
    assert.ok(!n3.results.some(item => item.snippet.includes("no indexar script")));

    // N4 se valida con un proveedor simulado, sin consumir cuota ni usar credenciales.
    const mockN4Fetch = async (url, init) => {
        assert.equal(new URL(url).hostname, "api.search.brave.com");
        assert.equal(new URL(url).pathname, "/res/v1/llm/context");
        assert.equal(init.headers["X-Subscription-Token"], "test-api-key");
        return {
            ok: true,
            status: 200,
            json: async () => ({
                grounding: {
                    generic: [{
                        title: "Archivo histórico: Congreso de Tucumán",
                        url: "https://archivo.example.org/congreso",
                        snippets: [
                            "Descripción de la documentación histórica y parlamentaria del Congreso de Tucumán.",
                            "El fondo reúne actas, correspondencia y documentos de las sesiones."
                        ]
                    }]
                },
                sources: {
                    "https://archivo.example.org/congreso": {
                        title: "Archivo histórico: Congreso de Tucumán",
                        hostname: "archivo.example.org"
                    }
                }
            })
        };
    };
    const n4 = await openWebRetriever.search("Congreso de Tucumán fuentes", {
        apiKey: "test-api-key", fetchImpl: mockN4Fetch
    });
    assert.equal(n4.level, "N4");
    assert.equal(n4.status, "retrieved");
    assert.equal(n4.results[0].trust_level, "externa_no_verificada");

    // El compositor comparte la recuperación N3/N4 y adjunta procedencia.
    const n3Decision = {
        modulos_rag: ["web_seleccionada"],
        plan_rag: {
            modules: ["web_seleccionada"],
            open_web: { enabled: false, eligible: true, status: "no_habilitada" }
        }
    };
    const composedN3 = await ragComposer.compose("sesiones Congreso Tucumán actas", n3Decision, {
        fetchImpl: mockN3Fetch, maxSources: 3, timeoutMs: 2000
    });
    assert.ok(composedN3.statuses.N3 === "retrieved" || composedN3.statuses.N3 === "partial");
    assert.match(composedN3.answer, /núcleo N3/);

    const n4Decision = {
        modulos_rag: ["web_abierta"],
        plan_rag: {
            modules: ["web_abierta"],
            open_web: { enabled: true, eligible: true, status: "solicitada_expresamente" }
        }
    };
    const composedN4 = await ragComposer.compose("fuentes del Congreso", n4Decision, {
        apiKey: "test-api-key", fetchImpl: mockN4Fetch, timeoutMs: 2000
    });
    assert.equal(composedN4.statuses.N4, "retrieved");
    assert.match(composedN4.answer, /fuentes externas pendientes de validación/);

    console.log("AXIAL RAG ADAPTERS: PASS");
}

run().catch(error => {
    console.error("AXIAL RAG ADAPTERS: FAIL");
    console.error(error);
    process.exitCode = 1;
});
