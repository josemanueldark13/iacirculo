"use strict";

/**
 * Base conversacional versionada de CÍRCULO IA.
 * Solo los registros approved pueden alimentar respuestas sugeridas.
 * Esta capa no reemplaza al RAG documental ni ejecuta acciones externas.
 */

const VERSION = "1.0.0";

function normalize(value = "") {
    return String(value ?? "").toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ").trim();
}

const ENTRIES = [
    {
        id: "saludo-inicial",
        intent: "saludo",
        status: "approved",
        version: 1,
        reviewed_at: "2026-11-16",
        owner: "Círculo IA",
        examples: ["hola", "buen dia", "buenas tardes", "buenas noches", "buenas", "saludos"],
        answer: "Hola. Soy Círculo IA, el asistente digital del Círculo de Legisladores de Tucumán. Puedo orientarte sobre la institución, ayudarte a encontrar información y preparar una consulta para atención humana. ¿Qué necesitás saber?"
    },
    {
        id: "guia-de-interaccion",
        intent: "ayuda_interaccion",
        status: "approved",
        version: 1,
        reviewed_at: "2026-11-16",
        owner: "Círculo IA",
        examples: ["que podes hacer", "como podes ayudarme", "como funciona este chat", "necesito ayuda", "ayuda", "como puedo consultar"],
        answer: "Puedo orientarte sobre información institucional, historia, documentación, publicaciones y actividades. También puedo ayudarte a formular una consulta o preparar un mensaje para la institución. Si querés hablar con una persona, decímelo y derivo tu solicitud a atención humana."
    },
    {
        id: "preparar-correo",
        intent: "preparar_correo",
        status: "approved",
        version: 1,
        reviewed_at: "2026-11-16",
        owner: "Círculo IA",
        examples: ["quiero enviar un correo", "ayudame a redactar un correo", "quiero mandar un email", "preparar un correo"],
        answer: "Puedo ayudarte a redactar el correo. Primero indicame el motivo y el área o persona destinataria, si la conocés. Antes de cualquier envío, vas a poder revisar el destinatario y el texto y confirmar la operación. Por ahora puedo preparar el borrador; el envío requiere una función autorizada y confirmación expresa."
    },
    {
        id: "mejora-del-asistente",
        intent: "retroalimentacion",
        status: "approved",
        version: 1,
        reviewed_at: "2026-11-16",
        owner: "Círculo IA",
        examples: ["quiero corregir una respuesta", "esa respuesta esta mal", "no entendiste mi pregunta", "quiero dejar una sugerencia"],
        answer: "Podés indicarme qué información falta o qué debería corregirse. La observación puede registrarse para evaluación; las nuevas respuestas institucionales deben verificarse y aprobarse antes de incorporarse a la base."
    }
];

const MATCHERS = [
    { id: "saludo-inicial", test: text => /^(hola|buen dia|buenas tardes|buenas noches|buenas|saludos)(\s|$)/.test(text) },
    { id: "guia-de-interaccion", test: text => /^(ayuda|que podes hacer|como podes ayudarme|como funciona este chat|necesito ayuda|como puedo consultar)\b/.test(text) },
    { id: "preparar-correo", test: text => /\b(correo|email|e mail)\b/.test(text) && /\b(enviar|mandar|redactar|preparar|escribir|hacer)\b/.test(text) },
    { id: "mejora-del-asistente", test: text => /\b(corregir una respuesta|respuesta esta mal|no entendiste|dejar una sugerencia)\b/.test(text) }
];

function match(question) {
    const normalized = normalize(question);
    if (!normalized) return null;
    const matcher = MATCHERS.find(item => item.test(normalized));
    if (!matcher) return null;
    const entry = ENTRIES.find(item => item.id === matcher.id && item.status === "approved");
    if (!entry) return null;
    return {
        id: entry.id,
        intent: entry.intent,
        answer: entry.answer,
        version: entry.version,
        reviewed_at: entry.reviewed_at,
        status: entry.status
    };
}

module.exports = { match, normalize, VERSION, ENTRIES };
