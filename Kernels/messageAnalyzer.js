"use strict";

/**
 * Analizador conversacional para Messenger.
 * Complementa al analizador institucional: no sustituye su dominio ni sus conceptos.
 */
function normalize(value = "") {
    return String(value ?? "").toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s@._+-]/g, " ")
        .replace(/\s+/g, " ").trim();
}

const RULES = [
    { intent: "urgencia", domain: "operativo", priority: "critica", patterns: [
        /\b(urgente|urgencia|emergencia|inmediato|inmediatamente|ahora mismo)\b/,
        /\b(riesgo inmediato|peligro|amenaza|no puedo esperar|es para hoy)\b/
    ]},
    { intent: "denuncia_sensible", domain: "operativo", priority: "alta", patterns: [
        /\b(estafa|fraude|extorsion|violencia|acoso|robo|suplantacion)\b/,
        /\b(datos personales|me robaron|me estan extorsionando)\b/
    ]},
    { intent: "solicitud_humano", domain: "operativo", priority: "alta", patterns: [
        /\b(persona real|alguien real|operador|operadora|humano|hablar con alguien)\b/,
        /\b(no quiero un bot|quiero hablar con una persona)\b/
    ]},
    { intent: "reclamo", domain: "operativo", priority: "alta", patterns: [
        /\b(reclamo|reclamos|reclamar|queja|quejas|denuncio|denuncia|denuncias|inconveniente)\b/,
        /\b(problema|no funciona|no me respondieron|nadie me contesta|sigo esperando|mal servicio|mala atencion)\b/
    ]},
    { intent: "contacto", domain: "institucional", priority: "normal", patterns: [
        /\b(contacto|comunicarme|comunicar|llamar|telefono|whatsapp|correo|email)\b/,
        /\b(dejar un mensaje|enviar un mensaje|hablar con el circulo)\b/
    ]},
    { intent: "consulta_institucional", domain: "institucional", priority: "normal", patterns: [
        /\b(circulo|legisladores|ex legisladores|legislatura|institucion|autoridades|presidente|historia|decreto|sede|direccion|horario|actividad|actividades)\b/,
        /\b(que hacen|quienes son|donde queda|como funciona|cuando se creo)\b/
    ]},
    { intent: "agradecimiento", domain: "conversacional", priority: "baja", patterns: [
        /\b(gracias|muchas gracias|se agradece|agradecido|agradecida)\b/
    ]},
    { intent: "saludo", domain: "conversacional", priority: "baja", patterns: [
        /^(hola|buen dia|buenas tardes|buenas noches|buenas|saludos|que tal|como estas)(\s|$)/
    ]},
    { intent: "oferta_spam", domain: "externo", priority: "baja", patterns: [
        /\b(cripto|criptomoneda|inversion garantizada|gana dinero|prestamo inmediato|marketing multinivel|promo imperdible|duplicar tu dinero)\b/
    ]}
];

const NEGATIVE_PATTERNS = [
    /\b(enojado|indignado|molesto|harto|cansado|decepcionado|decepcionada)\b/,
    /\b(vergonzoso|una verguenza|inaceptable|lamentable)\b/
];

function isInformationalComplaintQuestion(text) {
    return /^(que es|que significa|definicion de)\s+(?:la palabra\s+)?(un|una|el|la)?\s*(reclamo|queja|denuncia)\b/.test(text);
}
function isNegatedComplaint(text) {
    return /\b(no quiero|no voy a|no deseo|no necesito)\s+(?:hacer|presentar|iniciar|formular)?\s*(?:un|una|el|la)?\s*(reclamo|reclamar|queja|denuncia|denunciar)\b/.test(text)
        || /\bno es (?:un|una)?\s*(reclamo|queja|denuncia)\b/.test(text);
}
function detectImplicitComplaint(text) {
    const signals = [];
    const verbs = "(?:respondio|respondieron|responde|responden|contesto|contestaron|contestan|atiende|atienden|atendio|atendieron|soluciona|solucionan|resuelve|resuelven)";
    if (new RegExp("\\b(?:no me|no nos)\\s+" + verbs + "\\b").test(text)
        || new RegExp("\\bnadie\\s+(?:me\\s+|nos\\s+)?" + verbs + "\\b").test(text)) {
        signals.push("falta_de_respuesta");
    }
    if (/\b(llevo|llevamos|hace)\s+(?:ya\s+)?(?:\d+|un|una|dos|tres|varios|varias)\s+(?:dias?|semanas?|meses?)\b/.test(text)
        && /\b(espero|esperando|aguardo|sin respuesta|respuesta|solucion)\b/.test(text)) {
        signals.push("demora_sin_respuesta");
    }
    if (/\b(nunca|todavia|aun)\s+(?:me\s+)?(?:respondieron|responden|atendieron|solucionaron)\b/.test(text)) {
        signals.push("atencion_pendiente");
    }
    return signals;
}

function analyze(message, context = {}) {
    const original = String(message ?? "").trim();
    const text = normalize(original);
    if (!text) return {
        text: original, normalized: "", intent: "mensaje_vacio", domain: "indeterminado",
        confidence: 1, priority: "baja", sentiment: "neutral", signals: [],
        requires_human: false, is_follow_up: false
    };

    const informational = isInformationalComplaintQuestion(text);
    const negatedComplaint = isNegatedComplaint(text);
    const matches = RULES.map(rule => ({
        rule, hits: rule.patterns.filter(pattern => pattern.test(text)).length
    })).filter(item => item.hits > 0 && !(item.rule.intent === "reclamo" && (informational || negatedComplaint)))
      .sort((a, b) => {
          const rank = { critica: 4, alta: 3, normal: 2, baja: 1 };
          return rank[b.rule.priority] - rank[a.rule.priority] || b.hits - a.hits;
      });

    const implicitComplaintSignals = detectImplicitComplaint(text);
    const explicitComplaint = matches.some(item => item.rule.intent === "reclamo");
    const complaint = !informational && !negatedComplaint && (explicitComplaint || implicitComplaintSignals.length > 0);

    const followUp = Boolean(context.hasPreviousMessage) &&
        (/^(y|pero|entonces|ademas|tambien|eso|ese|esa|lo mismo|como asi|por que|cual|cuando|donde)\b/.test(text)
        || text.split(" ").length <= 4);

    const urgentMatch = matches.find(item => item.rule.intent === "urgencia");
    let selected = urgentMatch?.rule || (complaint
        ? RULES.find(rule => rule.intent === "reclamo")
        : matches[0]?.rule);
    let confidence = urgentMatch ? 0.98 : complaint ? 0.95 : selected?.intent === "denuncia_sensible" ? 0.92 : selected?.intent === "solicitud_humano" ? 0.92 : selected ? Math.min(0.96, 0.76 + Math.max(0, (matches[0]?.hits || 1) - 1) * 0.07) : 0.38;

    if (followUp && (!selected || selected.priority === "baja")) {
        selected = { intent: "continuacion", domain: context.previousDomain || "ambiguo", priority: "normal" };
        confidence = 0.62;
    }
    if (!selected) selected = { intent: "consulta_ambigua", domain: "ambiguo", priority: "normal" };

    const sensitive = selected.intent === "denuncia_sensible";
    const urgent = selected.intent === "urgencia";
    const asksHuman = selected.intent === "solicitud_humano";
    const insultOnly = /\b(inutil|idiota|imbecil|estupido|tarado|pelotudo|boludo|forro|hdp)\b/.test(text) && !complaint;
    if (insultOnly && !urgent && !sensitive && !asksHuman) {
        selected = { intent: "insulto", domain: "conversacional", priority: "baja" };
        confidence = 0.88;
    }
    const negative = NEGATIVE_PATTERNS.some(pattern => pattern.test(text));
    const signals = matches.map(item => item.rule.intent);
    signals.push(...implicitComplaintSignals);
    if (followUp) signals.push("continuidad_contextual");
    if (negative) signals.push("tono_negativo");
    if (insultOnly) signals.push("insulto_aislado");

    return {
        text: original, normalized: text, intent: urgent ? "urgencia" : complaint ? "reclamo" : selected.intent,
        domain: selected.domain, confidence: Number(confidence.toFixed(2)),
        priority: urgent ? "critica" : (complaint || sensitive || asksHuman) ? "alta" : selected.priority,
        sentiment: negative ? "negativo" : selected.intent === "agradecimiento" ? "positivo" : "neutral",
        signals: [...new Set(signals)],
        requires_human: urgent || sensitive || complaint || asksHuman,
        is_follow_up: followUp,
        matched_intents: matches.map(item => item.rule.intent),
        complaint: { detected: complaint, informational_question: informational, negated: negatedComplaint, implicit_signals: implicitComplaintSignals }
    };
}

module.exports = { analyze, normalize };
