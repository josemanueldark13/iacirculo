'use strict';

const VERSION = '1.0.0';

function normalize(value) {
    return String(value || '')
        .toLocaleLowerCase('es')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/https?:\/\/\S+/g, ' URL ')
        .replace(/[^a-z0-9@._\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasAny(text, terms) {
    return terms.some(term => text.includes(term));
}

const SIGNALS = {
    institutional: [
        'circulo de legisladores', 'circulo', 'legislador', 'legisladores',
        'ley 6333', 'ley provincial', 'autoridades', 'sede', 'direccion',
        'historia institucional', 'actividad institucional', 'biblioteca',
        'publicacion', 'decreto', 'estatuto', 'contacto institucional'
    ],
    complaint: [
        'reclamo', 'reclamar', 'denuncia', 'queja', 'no me respondieron',
        'no funciona', 'problema', 'mal servicio', 'quiero reclamar'
    ],
    personalRequest: [
        'trabajo', 'empleo', 'puesto laboral', 'subsidio', 'ayuda economica',
        'beneficio', 'turno', 'mi tramite', 'mi expediente', 'mi caso'
    ],
    request: [
        'necesito', 'solicito', 'quisiera', 'quiero pedir', 'pueden enviar',
        'me pueden informar', 'como hago', 'donde puedo', 'por favor enviar'
    ],
    abuse: [
        'idiota', 'inutil', 'inutiles', 'estupido', 'estupidos', 'pelotudo',
        'pelotudos', 'boludo', 'boludos', 'mierda', 'hdp', 'hijo de puta'
    ],
    urgency: [
        'amenaza', 'me amenazaron', 'violencia', 'peligro inmediato',
        'urgente', 'emergencia', 'me quieren agredir'
    ],
    promotional: [
        'compra ahora', 'oferta exclusiva', 'contratame', 'contratenme',
        'vota a', 'voten a', 'sumate a mi campaña', 'apoya mi candidatura',
        'promociono', 'publicidad', 'cripto', 'inversion garantizada'
    ],
    callToAction: [
        'compra', 'contrata', 'vota', 'voten', 'sumate', 'ingresa al link',
        'hace clic', 'haz clic', 'inverti', 'inverti ahora'
    ]
};

function analyze(input) {
    const raw = typeof input === 'string' ? input : input?.text;
    const text = normalize(raw);
    const signals = Object.fromEntries(
        Object.entries(SIGNALS).map(([key, terms]) => [key, hasAny(text, terms)])
    );

    if (!text) {
        return {
            version: VERSION,
            category: 'ambiguous',
            intent: 'non_text_or_empty',
            confidence: 0.25,
            signals,
            needsHumanReview: true,
            reason: 'No se recibió texto suficiente para interpretar el mensaje.'
        };
    }

    if (signals.urgency) {
        return {
            version: VERSION,
            category: 'complex',
            intent: 'urgent_safety_issue',
            confidence: 0.82,
            signals,
            needsHumanReview: true,
            reason: 'Se detectaron señales de urgencia o posible riesgo.'
        };
    }

    const hasQuestion = /\?|\b(que|como|cuando|donde|quien|cual|cuanto)\b/.test(text);
    const hasInstitutionalContext = signals.institutional;

    if (signals.abuse && !hasQuestion && !hasInstitutionalContext && !signals.complaint) {
        return {
            version: VERSION,
            category: 'abuse',
            intent: 'insult_without_institutional_request',
            confidence: 0.78,
            signals,
            needsHumanReview: false,
            reason: 'Agresión sin una solicitud institucional identificable.'
        };
    }

    if (signals.complaint) {
        return {
            version: VERSION,
            category: 'complaint',
            intent: 'complaint_or_claim',
            confidence: 0.76,
            signals,
            needsHumanReview: true,
            reason: 'Los reclamos requieren clasificación y eventual atención humana.'
        };
    }

    if (signals.personalRequest) {
        return {
            version: VERSION,
            category: 'request',
            intent: 'personal_or_sensitive_request',
            confidence: 0.72,
            signals,
            needsHumanReview: true,
            reason: 'La solicitud puede involucrar datos personales o decisiones particulares.'
        };
    }

    if (signals.promotional && (signals.callToAction || text.includes(' URL '))) {
        return {
            version: VERSION,
            category: 'propaganda',
            intent: 'unsolicited_promotion',
            confidence: 0.80,
            signals,
            needsHumanReview: false,
            reason: 'Contenido promocional no solicitado.'
        };
    }

    if (hasInstitutionalContext) {
        return {
            version: VERSION,
            category: 'institutional_inquiry',
            intent: 'institutional_information',
            confidence: signals.abuse ? 0.66 : 0.74,
            signals,
            needsHumanReview: false,
            reason: signals.abuse
                ? 'Se identificó una consulta institucional junto con lenguaje agresivo.'
                : 'Se identificó contexto institucional.'
        };
    }

    if (signals.request || hasQuestion) {
        return {
            version: VERSION,
            category: 'request',
            intent: 'general_request',
            confidence: 0.58,
            signals,
            needsHumanReview: true,
            reason: 'Hay una solicitud, pero falta contexto para resolverla con seguridad.'
        };
    }

    return {
        version: VERSION,
        category: 'ambiguous',
        intent: 'unclear_intent',
        confidence: 0.30,
        signals,
        needsHumanReview: true,
        reason: 'No hay señales suficientes para asignar una categoría con confianza.'
    };
}

module.exports = { analyze, normalize, VERSION };
