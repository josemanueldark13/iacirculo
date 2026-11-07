'use strict';

const semanticAnalyzer = require('./semantic-analyzer');

const VERSION = '1.0.0';

const ACTIONS = Object.freeze({
    RESPOND_WITH_KNOWLEDGE: 'respond_with_knowledge',
    ACKNOWLEDGE_AND_ESCALATE: 'acknowledge_and_escalate',
    REQUEST_CLARIFICATION: 'request_clarification',
    ARCHIVE_NO_REPLY: 'archive_no_reply',
    HUMAN_REVIEW: 'human_review'
});

function decide(message, options = {}) {
    const analysis = semanticAnalyzer.analyze(message);
    let action;
    let responseTemplate = null;

    switch (analysis.category) {
        case 'institutional_inquiry':
            action = ACTIONS.RESPOND_WITH_KNOWLEDGE;
            break;
        case 'complaint':
            action = ACTIONS.ACKNOWLEDGE_AND_ESCALATE;
            responseTemplate = 'complaint_received';
            break;
        case 'abuse':
        case 'propaganda':
            action = ACTIONS.ARCHIVE_NO_REPLY;
            break;
        case 'request':
            action = analysis.needsHumanReview
                ? ACTIONS.HUMAN_REVIEW
                : ACTIONS.REQUEST_CLARIFICATION;
            break;
        case 'complex':
            action = ACTIONS.HUMAN_REVIEW;
            break;
        default:
            action = ACTIONS.REQUEST_CLARIFICATION;
    }

    if (analysis.needsHumanReview && analysis.category !== 'complaint' && analysis.category !== 'complex') {
        action = ACTIONS.HUMAN_REVIEW;
    }

    const now = options.now instanceof Date ? options.now : new Date();
    const id = String(options.messageId || 'local-' + now.getTime());

    return {
        version: VERSION,
        messageId: id,
        receivedAt: now.toISOString(),
        category: analysis.category,
        intent: analysis.intent,
        confidence: analysis.confidence,
        action,
        responseTemplate,
        needsHumanReview: analysis.needsHumanReview,
        reason: analysis.reason,
        signals: analysis.signals,
        source: options.source || 'messenger',
        status: 'decision_created'
    };
}

function createAuditRecord(message, decision, options = {}) {
    const text = typeof message === 'string' ? message : message?.text || '';
    return {
        schemaVersion: '1.0.0',
        messageId: decision.messageId,
        receivedAt: decision.receivedAt,
        source: decision.source,
        category: decision.category,
        intent: decision.intent,
        action: decision.action,
        confidence: decision.confidence,
        reason: decision.reason,
        needsHumanReview: decision.needsHumanReview,
        messageExcerpt: String(text).slice(0, 500),
        outcome: options.outcome || 'pending',
        errorCode: options.errorCode || null
    };
}

module.exports = { decide, createAuditRecord, ACTIONS, VERSION };
