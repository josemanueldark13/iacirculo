"use strict";

const circuloIA = require("./agents/circuloIA");
const bibliography = require("./bibliografia");
const documentRetriever = require("./documentRetriever");
const webRetriever = require("./webRetriever");
const openWebRetriever = require("./openWebRetriever");

function formatN3(result, limit = 3) {
    const sources = (result?.results || []).slice(0, limit);
    if (!sources.length) return "";
    return [
        "Fuentes recuperadas del núcleo N3 (páginas seleccionadas):",
        ...sources.map((item, index) =>
            (index + 1) + ". " + item.title + " — " + item.organization +
            "\n" + item.snippet.slice(0, 520) +
            "\nConsulta: " + item.url
        )
    ].join("\n\n");
}

function formatN4(result, limit = 4) {
    const sources = (result?.results || []).slice(0, limit);
    if (!sources.length) return "";
    return [
        "Resultados del núcleo N4 (web abierta; fuentes externas pendientes de validación institucional):",
        ...sources.map((item, index) =>
            (index + 1) + ". " + item.title +
            (item.snippet ? "\n" + item.snippet.slice(0, 500) : "") +
            "\nFuente: " + item.url
        )
    ].join("\n\n");
}

async function compose(question, decision, options = {}) {
    const modules = decision?.modulos_rag || decision?.plan_rag?.modules || [];
    const sections = [];
    const evidence = {
        N1: decision?.recuperacion_oficial || null,
        N2: decision?.recuperacion_bibliografica || null,
        N3: null,
        N4: null
    };
    const statuses = {};

    if (modules.includes("oficial")) {
        const answer = circuloIA.responder(question);
        if (answer) sections.push(answer);
        statuses.N1 = evidence.N1?.total ? "retrieved" : "no_local_match";
        const officialDetails = documentRetriever.formatResults(evidence.N1, { limit: 3 });
        if (officialDetails) {
            sections.push("Evidencia documental recuperada de N1:\n" + officialDetails);
        }
    }

    if (modules.includes("bibliografico")) {
        sections.push(bibliography.formatResults(evidence.N2, {
            limit: options.bibliographyLimit || 4,
            abstractLength: options.abstractLength || 420
        }));
        statuses.N2 = evidence.N2?.total ? "retrieved" : "no_catalog_match";
    }

    const explicitlyOpen = decision?.plan_rag?.open_web?.status === "solicitada_expresamente"
        || decision?.plan_rag?.open_web?.enabled === true;
    const needsN3 = modules.includes("web_seleccionada") && !explicitlyOpen;
    let n3Insufficient = false;

    if (needsN3) {
        evidence.N3 = await webRetriever.searchSelected(question, {
            maxSources: options.maxSources || 3,
            limit: options.webLimit || 4,
            timeoutMs: options.n3TimeoutMs || options.timeoutMs || 3500,
            fetchImpl: options.fetchImpl
        });
        n3Insufficient = evidence.N3.insufficient;
        statuses.N3 = evidence.N3.total_sources_retrieved > 0
            ? (n3Insufficient ? "partial" : "retrieved")
            : "no_selected_source_content";
        const n3Answer = formatN3(evidence.N3, options.webLimit || 3);
        if (n3Answer) sections.push(n3Answer);
    }

    const n4Required = explicitlyOpen
        || (needsN3 && n3Insufficient && decision?.plan_rag?.open_web?.eligible !== false);
    if (n4Required) {
        evidence.N4 = await openWebRetriever.search(question, {
            limit: options.openWebLimit || 5,
            timeoutMs: options.n4TimeoutMs || options.timeoutMs || 5000,
            fetchImpl: options.fetchImpl,
            apiKey: options.apiKey
        });
        statuses.N4 = evidence.N4.status;

        const n4Answer = formatN4(evidence.N4, options.openWebLimit || 4);
        if (n4Answer) {
            sections.push(n4Answer);
        } else if (evidence.N4.status === "provider_not_configured") {
            sections.push("La búsqueda libre N4 está preparada, pero falta configurar BRAVE_SEARCH_API_KEY en las variables de entorno del servidor. No se realizó una búsqueda abierta.");
        } else {
            sections.push("N4 no devolvió resultados utilizables en esta consulta. No se inventaron fuentes ni se completó información sin evidencia.");
        }
    } else if (needsN3 && n3Insufficient) {
        sections.push("N3 no encontró suficiente contenido entre las páginas seleccionadas. La búsqueda abierta N4 no está habilitada para esta solicitud.");
    }

    if (!sections.length) {
        sections.push(circuloIA.responder(question));
    }

    return {
        answer: sections.join("\n\n").trim(),
        evidence,
        statuses,
        used_levels: Object.keys(statuses).filter(level => statuses[level] === "retrieved" || statuses[level] === "partial"),
        external_search_configured: openWebRetriever.isConfigured()
    };
}

module.exports = { compose, formatN3, formatN4 };
