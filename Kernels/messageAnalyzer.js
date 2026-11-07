/**
 * AXIAL MESSAGING — Semantic Analyzer
 * Interpreta intención conversacional antes de decidir una respuesta.
 * No reemplaza al analizador institucional: trabaja sobre mensajes ciudadanos.
 */

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s@._+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RULES = [
  {
    intent: "urgente",
    domain: "operativo",
    priority: "critica",
    patterns: [
      /\b(urgente|urgencia|emergencia|inmediato|inmediatamente|ahora mismo)\b/,
      /\b(riesgo|peligro|amenaza|no puedo esperar|es para hoy)\b/
    ]
  },
  {
    intent: "denuncia_sensible",
    domain: "operativo",
    priority: "alta",
    patterns: [
      /\b(estafa|fraude|extorsion|amenaza|violencia|acoso|robo|suplantacion)\b/,
      /\b(datos personales|me robaron|me estan extorsionando)\b/
    ]
  },
  {
    intent: "solicitud_humano",
    domain: "operativo",
    priority: "alta",
    patterns: [
      /\b(persona real|alguien real|operador|operadora|humano|hablar con alguien)\b/,
      /\b(no quiero un bot|no me responde nadie|quiero hablar con una persona)\b/
    ]
  },
  {
    intent: "reclamo",
    domain: "operativo",
    priority: "alta",
    patterns: [
      /\b(reclamo|queja|denuncio|denuncia|inconveniente|problema|no funciona|no funciona nada)\b/,
      /\b(no me respondieron|nadie me contesta|sigo esperando|mal servicio|mala atencion)\b/
    ]
  },
  {
    intent: "contacto",
    domain: "institucional",
    priority: "normal",
    patterns: [
      /\b(contacto|comunicarme|comunicar|llamar|telefono|whatsapp|correo|email)\b/,
      /\b(dejar un mensaje|enviar un mensaje|hablar con el circulo)\b/
    ]
  },
  {
    intent: "consulta_institucional",
    domain: "institucional",
    priority: "normal",
    patterns: [
      /\b(circulo|legisladores|ex legisladores|legislatura|institucion|autoridades|presidente|historia|ley|decreto|sede|direccion|horario|actividad|actividades)\b/,
      /\b(que hacen|quienes son|donde queda|como funciona|cuando se creo)\b/
    ]
  },
  {
    intent: "agradecimiento",
    domain: "conversacional",
    priority: "baja",
    patterns: [
      /\b(gracias|muchas gracias|se agradece|agradecido|agradecida|genial gracias)\b/
    ]
  },
  {
    intent: "saludo",
    domain: "conversacional",
    priority: "baja",
    patterns: [
      /^(hola|buen dia|buenas tardes|buenas noches|buenas|saludos|que tal|como estas)(\s|$)/
    ]
  },
  {
    intent: "oferta_spam",
    domain: "externo",
    priority: "baja",
    patterns: [
      /\b(cripto|criptomoneda|inversion garantizada|gana dinero|prestamo inmediato|marketing multinivel)\b/,
      /\b(promo imperdible|oferta laboral|duplicar tu dinero)\b/
    ]
  }
];

const NEGATIVE_PATTERNS = [
  /\b(enojado|indignado|molesto|harto|cansado|decepcionado|decepcionada)\b/,
  /\b(vergonzoso|una verguenza|inaceptable|lamentable)\b/
];

function analyze(message, context = {}) {
  const original = String(message ?? "").trim();
  const text = normalize(original);

  if (!text) {
    return {
      text: original,
      normalized: text,
      intent: "mensaje_vacio",
      domain: "indeterminado",
      confidence: 1,
      priority: "baja",
      sentiment: "neutral",
      signals: [],
      requires_human: false,
      is_follow_up: false
    };
  }

  const matches = RULES
    .map(rule => ({
      rule,
      hits: rule.patterns.filter(pattern => pattern.test(text)).length
    }))
    .filter(item => item.hits > 0)
    .sort((a, b) => {
      const priority = { critica: 5, alta: 4, normal: 3, baja: 1 };
      return priority[b.rule.priority] - priority[a.rule.priority] || b.hits - a.hits;
    });

  const followUp = Boolean(context.hasPreviousMessage) &&
    (/^(y|pero|entonces|ademas|tambien|eso|ese|esa|lo mismo|como asi|por que|cual|cuando|donde)\b/.test(text) ||
     text.split(" ").length <= 4);

  let selected = matches[0]?.rule;
  let confidence = selected ? Math.min(0.99, 0.72 + (matches[0].hits - 1) * 0.08) : 0.35;

  if (followUp && (!selected || selected.priority === "baja")) {
    selected = {
      intent: "continuacion",
      domain: context.previousDomain || "ambiguo",
      priority: "normal"
    };
    confidence = 0.62;
  }

  if (!selected) {
    selected = { intent: "consulta_ambigua", domain: "ambiguo", priority: "normal" };
  }

  const urgent = selected.intent === "urgente";
  const sensitive = selected.intent === "denuncia_sensible";
  const complaint = selected.intent === "reclamo";
  const asksHuman = selected.intent === "solicitud_humano";
  const negative = NEGATIVE_PATTERNS.some(pattern => pattern.test(text));

  const signals = matches.map(item => item.rule.intent);
  if (followUp) signals.push("continuidad_contextual");
  if (negative) signals.push("tono_negativo");

  return {
    text: original,
    normalized: text,
    intent: selected.intent,
    domain: selected.domain,
    confidence: Number(confidence.toFixed(2)),
    priority: selected.priority,
    sentiment: negative ? "negativo" :
      selected.intent === "agradecimiento" ? "positivo" : "neutral",
    signals: [...new Set(signals)],
    requires_human: urgent || sensitive || complaint || asksHuman,
    is_follow_up: followUp,
    matched_intents: matches.map(item => item.rule.intent)
  };
}

module.exports = { analyze, normalize };
