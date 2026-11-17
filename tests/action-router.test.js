'use strict';

const assert = require('node:assert/strict');
const kernel = require('../Kernels/kernel');
const actionRouter = require('../Kernels/actionRouter');

const known = actionRouter.routeAction('ACTION_QUERY_PATRIMONY', 'quick_reply');
assert.equal(known.recognized, true);
assert.equal(known.tipo, 'consulta_patrimonio');
assert.match(known.pregunta, /patrimonio documental/i);

const unknownPostback = kernel.process({
    pregunta: 'ACTION_NOT_REGISTERED',
    type: 'postback',
    senderId: 'test-sender'
});
assert.equal(unknownPostback.estado, 'accion_no_reconocida');
assert.equal(unknownPostback.payload, 'ACTION_NOT_REGISTERED');

const unknownQuickReply = kernel.process({
    pregunta: 'ACTION_NOT_REGISTERED',
    type: 'quick_reply',
    senderId: 'test-sender'
});
assert.equal(unknownQuickReply.estado, 'accion_no_reconocida');

const knownAction = kernel.process({
    pregunta: 'ACTION_QUERY_PATRIMONY',
    type: 'quick_reply',
    senderId: 'test-sender'
});
assert.equal(knownAction.estado, 'aceptada');
assert.equal(knownAction.accion_directa, true);
assert.equal(knownAction.intencion, 'consulta_patrimonio');
assert.equal(knownAction.documentQuery, true);
assert.match(knownAction.pregunta, /patrimonio documental/i);
assert.equal(Object.hasOwn(knownAction, 'modulos_rag'), false);
assert.notEqual(knownAction.pregunta, 'ACTION_QUERY_PATRIMONY');

const freeTextQuickReply = kernel.process({
    pregunta: 'Quiero conocer la historia institucional',
    type: 'quick_reply',
    senderId: 'test-sender'
});
assert.notEqual(freeTextQuickReply.estado, 'accion_no_reconocida');
assert.notEqual(freeTextQuickReply.pregunta, 'ACTION_QUERY_PATRIMONY');

const mainMenu = kernel.process({
    pregunta: 'SHOW_MAIN_MENU',
    type: 'quick_reply',
    senderId: 'test-sender'
});
assert.equal(mainMenu.accion_directa, true);
assert.match(mainMenu.responseMessage, /Menú principal/i);
assert.equal(Object.hasOwn(mainMenu, 'modulos_rag'), false);

const help = kernel.process({
    pregunta: 'HELP_INFO',
    type: 'postback',
    senderId: 'test-sender'
});
assert.match(help.responseMessage, /canal institucional automatizado/i);
assert.equal(Object.hasOwn(help, 'modulos_rag'), false);

console.log('ACTION ROUTER: PASS (7 escenarios)');
