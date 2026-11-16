"use strict";

/**
 * AXIAL RAG Router — arquitectura de cuatro núcleos.
 *
 * N1: documentación oficial propia.
 * N2: bibliografía académica e historiográfica catalogada.
 * N3: páginas web seleccionadas explícitamente (allowlist exacta).
 * N4: búsqueda web abierta, último escalón y nunca fuente oficial por defecto.
 *
 * Este módulo diseña el plan de recuperación y selecciona fuentes. La consulta
 * efectiva a proveedores externos debe realizarla el adaptador correspondiente.
 */

const curatedCatalog = require("../knowledge/fuentesWebSeleccionadas.json");

const NUCLEI = [
    { id: "N1", name: "oficial", label: "Documentación institucional oficial", order: 1, trust: "primaria_institucional" },
    { id: "N2", name: "bibliografico", label: "Bibliografía académica e historiográfica", order: 2, trust: "secundaria_academica" },
    { id: "N3", name: "web_seleccionada", label: "Web de páginas seleccionadas", order: 3, trust: "fuente_externa_curada" },
    { id: "N4", name: "web_abierta", label: "Web abierta", order: 4, trust: "fuente_externa_por_evaluar" }
];

const STOP_WORDS = new Set([
    "que", "cual", "quien", "quienes", "como", "donde", "cuando", "para",
    "por", "con", "sin", "sobre", "entre", "desde", "hacia", "del", "las",
    "los", "una", "uno", "unos", "unas", "este", "esta", "estos", "estas",
    "tiene", "tienen", "hay", "fue", "son", "era", "eran", "sus", "mas",
    "muy", "busca", "buscar", "consulta", "consultar", "informacion"
]);

function normalize(value = "") {
    return String(value ?? "").toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ").trim();
}

function tokens(value) {
    return [...new Set(normalize(value).split(" ")
        .filter(token => token.length > 2 && !STOP_WORDS.has(token)))];
}

function hasAny(text, terms) {
    return terms.some(term => {
        const normalized = normalize(term);
        return normalized && (" " + text + " ").includes(" " + normalized + " ");
    });
}

function sourceScore(questionTokens, source) {
    const sourceText = normalize([
        source.title, source.organization, source.purpose,
        ...(source.topics || [])
    ].join(" "));
    let score = 0;
    const matches = [];
    for (const token of questionTokens) {
        if ((" " + sourceText + " ").includes(" " + token + " ")) {
            score += 1;
            matches.push(token);
        }
    }
    return { score, matches };
}

function selectCuratedSources(question, limit = 4) {
    const queryTokens = tokens(question);
    if (!queryTokens.length) return [];
    return curatedCatalog.sources
        .filter(source => source.selection_status === "active" && source.url)
        .map(source => ({ source, relevance: sourceScore(queryTokens, source) }))
        .filter(item => item.relevance.score > 0)
        .sort((a, b) => b.relevance.score - a.relevance.score
            || a.source.title.localeCompare(b.source.title, "es"))
        .slice(0, Math.max(1, Math.min(Number(limit) || 4, 8)))
        .map(({ source, relevance }) => ({
            id: source.id,
            title: source.title,
            organization: source.organization,
            url: source.url,
            source_type: source.source_type,
            trust_level: source.trust_level,
            purpose: source.purpose,
            matched_topics: relevance.matches
        }));
}

function route(question, analysis = {}, options = {}) {
    const text = normalize(question);
    const modules = [];
    const selectedSources = selectCuratedSources(question, options.maxSelectedSources || 4);

    const officialTerms = [
        "ley", "decreto", "resolucion", "acta", "estatuto", "autoridad",
        "autoridades", "presidente", "vicepresidente", "sede", "direccion",
        "domicilio institucional", "texto oficial", "normativa vigente",
        "documento oficial", "reglamento", "resolucion institucional"
    ];
    const bibliographyTerms = [
        "historia", "historico", "historiografia", "bibliografia",
        "referencias bibliograficas", "investigacion", "investigador",
        "libro", "libros", "autor", "autores", "articulo academico",
        "tesis", "estudio", "estudios", "contexto historico",
        "historia legislativa", "fuentes secundarias", "publicaciones academicas",
        "reformas institucionales", "reformas politicas", "historia provincial", "historia politica",
        "politica tucumana", "instituciones provinciales", "estado provincial", "facciones",
        "caudillismo", "geografia historica", "historia regional", "participacion politica",
        "siglo xix", "historia parlamentaria", "debate historiografico"
    ];
    const webTerms = [
        "internet", "en la web", "busca en la web", "buscar en la web",
        "fuentes externas", "informacion externa", "consulta externa",
        "noticias", "actualidad", "ultima informacion", "ultimas noticias",
        "reciente", "recientes", "hoy", "actualmente", "a la fecha",
        "fuentes adicionales", "ampliar la busqueda", "investiga en linea"
    ];
    const selectedTerms = [
        "paginas seleccionadas", "sitios seleccionados", "fuentes seleccionadas",
        "sitios academicos", "fuentes academicas", "repositorios",
        "bibliotecas digitales", "portales universitarios"
    ];
    const openTerms = [
        "toda la web", "toda internet", "web abierta", "busqueda abierta",
        "busqueda libre", "cualquier sitio", "cualquier pagina", "sin limitar fuentes",
        "internet libre", "busca en cualquier sitio"
    ];
    const currentTerms = [
        "hoy", "actualmente", "en este momento", "ultima noticia",
        "ultimas noticias", "reciente", "recientes", "actualizado",
        "ultima version", "a la fecha", "vigente"
    ];

    const requiresOfficial = hasAny(text, officialTerms);
    const wantsBibliography = hasAny(text, bibliographyTerms)
        || (analysis.domain === "institucional" && /\b(historia|historico|historiografia)\b/.test(text));
    const asksWeb = hasAny(text, webTerms) || Boolean(analysis.requiere_fuente_externa);
    const asksSelected = hasAny(text, selectedTerms);
    const asksOpen = hasAny(text, openTerms);
    const timeSensitive = hasAny(text, currentTerms);
    const requiresExternal = asksWeb || asksSelected || asksOpen || timeSensitive;

    if (requiresOfficial || (analysis.domain === "institucional" && !wantsBibliography && !requiresExternal)) {
        modules.push("oficial");
    }

    if (wantsBibliography) modules.push("bibliografico");

    const selectedWebNeeded = asksSelected || asksWeb || asksOpen || timeSensitive;
    if (selectedWebNeeded && selectedSources.length > 0) {
        modules.push("web_seleccionada");
    }

    // N4 se habilita solo si se solicita búsqueda libre, la consulta necesita
    // actualidad que la allowlist no garantiza o N3 no ofrece páginas pertinentes.
    const openWebNeeded = asksOpen || options.n3Insufficient === true || options.forceOpenWeb === true;
    if (openWebNeeded) modules.push("web_abierta");

    if (modules.length === 0 && analysis.domain === "institucional") modules.push("oficial");

    const orderedModules = [...new Set(modules)].sort((a, b) =>
        NUCLEI.find(item => item.name === a).order - NUCLEI.find(item => item.name === b).order
    );
    const priority = orderedModules[0] || null;
    const selectedFallbacks = orderedModules.slice(1);
    const openWebStatus = openWebNeeded
        ? (asksOpen ? "solicitada_expresamente" : "habilitada_como_ultimo_recurso")
        : "no_habilitada";

    return {
        architecture: "AXIAL-RAG-4N",
        architectureVersion: "1.0.0",
        nuclei: NUCLEI,
        modules: orderedModules,
        priority,
        fallbacks: selectedFallbacks,
        selected_sources: selectedWebNeeded ? selectedSources : [],
        requires_external_source: requiresExternal,
        open_web: {
            enabled: openWebNeeded,
            eligible: requiresExternal && !asksOpen,
            fallback_trigger: "n3_insufficient_or_no_relevant_curated_source",
            status: openWebStatus,
            must_be_last_resort: true,
            requires_citations: true,
            must_not_be_presented_as_official: true
        },
        source_policy: {
            official_first_for_institutional_facts: true,
            bibliography_is_secondary: true,
            curated_web_uses_exact_allowlist: true,
            open_web_requires_source_evaluation: true,
            preserve_source_provenance: true
        }
    };
}

function getArchitecture() {
    return {
        id: "AXIAL-RAG-4N",
        version: "1.0.0",
        nuclei: NUCLEI,
        curatedSourceCount: curatedCatalog.sources.filter(source => source.selection_status === "active").length
    };
}

module.exports = { route, selectCuratedSources, getArchitecture, NUCLEI, normalize };
