"use strict";

/**
 * Semantic Frame 0.3.1.
 * Capa pragmática contextual independiente del clasificador de mensajes.
 * Reglas deterministas; no se presenta como comprensión lingüística general.
 */
const semanticAnalyzer = require("./semanticAnalyzer");

function analyzeFrame(input = {}) {
    const text = typeof input === "string" ? input : String(input.text ?? input.originalText ?? "");
    const context = Array.isArray(input.conversationContext) ? input.conversationContext : [];
    const normalized = semanticAnalyzer.normalize(text);
    const contextText = semanticAnalyzer.normalize(context
        .map(item => item && typeof item.content === "string" ? item.content : "")
        .join(" "));
    const combined = [contextText, normalized].filter(Boolean).join(" ");
    const legacy = semanticAnalyzer.analyze(text);

    const affection = /\b(te amo|te quiero|chango|culiado|culia|querido|genio)\b/.test(normalized);
    const selfDeprecation = /\b(que boludo soy|que estupido soy|soy un idiota|que tonto soy)\b/.test(normalized);
    const ambiguousCommand = /\b(arregla eso|arregla esto|arregla|soluciona eso|hace eso|hace lo)\b/.test(normalized);
    const ironicCue = /\b(justo lo que necesitaba|en la gloria|que maravilla|que suerte|espectacular)\b/.test(normalized);
    const negativeContext = /\b(rompio|problema|mala noticia|perjudica|perjuicio|aumento|suba|subieron|precios|perdida|fallo|demora)\b/.test(combined);
    const pragmaticMismatch = ironicCue && negativeContext;
    const economic = /\b(aumento|precios|presupuesto|gobierno|inflacion|salario|sueldo|economia)\b/.test(combined);
    const technology = /\b(ia|codigo|programa|software|computadora|sistema|analizador|servidor)\b/.test(normalized);

    let intent = "general_statement";
    if (affection) intent = "affectionate_statement";
    else if (selfDeprecation) intent = "self_deprecating_statement";
    else if (ambiguousCommand) intent = "underspecified_instruction";
    else if (/\?$/.test(text.trim()) || /\b(que|quien|cuando|donde|como|cual)\b/.test(normalized)) intent = "information_request";
    else if (pragmaticMismatch) intent = "ironic_critical_statement";

    let domain = legacy.domain;
    let domainConfidence = legacy.confidence;
    if (economic) { domain = "economy"; domainConfidence = 0.88; }
    else if (technology) { domain = "technology"; domainConfidence = 0.90; }
    else if (affection || selfDeprecation) { domain = "social_interaction"; domainConfidence = 0.86; }
    else if (domain === "indeterminado" && ambiguousCommand) { domain = "general"; domainConfidence = 0.45; }

    const tone = pragmaticMismatch ? "ironic sarcastic critical"
        : affection ? "affectionate colloquial"
        : selfDeprecation ? "self-deprecating humorous colloquial"
        : ambiguousCommand ? "directive underspecified" : "neutral";
    const paraphrase = pragmaticMismatch
        ? (economic
            ? "ironía y crítica por el perjuicio de los aumentos de precios sobre el presupuesto"
            : "ironía ante una situación inoportuna y otra mala noticia")
        : affection ? "expresa cariño, afecto, confianza y cercanía en registro coloquial"
        : selfDeprecation ? "autocrítica coloquial posiblemente humorística o irónica"
        : ambiguousCommand ? "instrucción de reparación sin identificar qué elemento debe modificarse"
        : text.trim() || "entrada vacía";

    const ambiguityDetected = ambiguousCommand || !text.trim();
    const confidence = value => Number(Math.max(0, Math.min(1, value)).toFixed(2));
    return {
        originalText: text,
        normalizedText: normalized,
        language: "es",
        languageConfidence: 0.98,
        intent,
        intentConfidence: confidence(pragmaticMismatch ? 0.91 : affection || selfDeprecation ? 0.88 : ambiguousCommand ? 0.93 : 0.72),
        domain,
        domainConfidence: confidence(domainConfidence || 0.35),
        paraphrase,
        paraphraseNote: pragmaticMismatch
            ? "Interpretación pragmática basada en el contraste entre la expresión positiva literal y el contexto negativo."
            : "Paráfrasis orientativa basada en señales léxicas y contexto disponible.",
        paraphraseConfidence: confidence(pragmaticMismatch ? 0.86 : affection || selfDeprecation ? 0.84 : ambiguousCommand ? 0.82 : 0.65),
        entities: [],
        topics: economic ? ["economía", "precios", "presupuesto"]
            : technology ? ["tecnología", "software"]
            : affection ? ["interacción social", "afecto"] : [],
        sentiment: pragmaticMismatch || economic ? "negative" : affection ? "positive" : "neutral",
        tone,
        register: /\b(chango|culiado|boludo|culia)\b/.test(normalized)
            ? "colloquial informal argentino" : "neutral",
        ambiguity: {
            detected: ambiguityDetected,
            reason: ambiguousCommand
                ? "La referencia 'eso' no identifica el objeto de la acción."
                : ambiguityDetected
                    ? "No hay texto suficiente para interpretar la entrada."
                    : "No se detecta ambigüedad relevante."
        },
        context: { supplied: context.length > 0, turns: context.length, relevantContextDetected: negativeContext },
        responseMode: ambiguityDetected ? "GUIDED" : "DIRECT",
        modeReason: ambiguityDetected
            ? "Falta información para identificar el objeto de la instrucción."
            : pragmaticMismatch
                ? "La intención requiere interpretar ironía y contexto."
                : "La intención puede atenderse directamente.",
        risk: "low",
        routing: { domain, destination: ambiguityDetected ? "clarification" : "response" },
        signals: {
            pragmaticMismatch,
            literalIntendedMismatch: pragmaticMismatch,
            affectionateLanguage: affection,
            selfDeprecation,
            underspecifiedInstruction: ambiguousCommand
        },
        analyzerVersion: "0.3.1"
    };
}

module.exports = { analyzeFrame };
