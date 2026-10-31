'use strict';

const assert = require('node:assert/strict');
const logic = require('../Kernels/axial-truthtable/logic-engine');

let passed = 0;
const tests = [];

function test(name, callback) {
    tests.push({ name, callback });
}

test('modus ponens: argumento válido y premisas consistentes', () => {
    const result = logic.analizarArgumento({
        premisas: ['P', 'P -> Q'],
        conclusion: 'Q'
    });
    assert.equal(result.diagnostico.validezFormal, true);
    assert.equal(result.diagnostico.esConsistente, true);
    assert.equal(result.diagnostico.contraejemplo, null);
    assert.equal(result.formalizacion.totalFilas, 4);
});

test('afirmación del consecuente: detecta contraejemplo', () => {
    const result = logic.analizarArgumento({
        premisas: ['P -> Q', 'Q'],
        conclusion: 'P'
    });
    assert.equal(result.diagnostico.validezFormal, false);
    assert.deepEqual(result.diagnostico.contraejemplo.asignacion, { P: false, Q: true });
});

test('respeta precedencia: negación, conjunción y disyunción', () => {
    assert.equal(logic.evaluate('!P | Q & R', { P: false, Q: true, R: false }), true);
    assert.equal(logic.evaluate('!P | (Q & R)', { P: true, Q: true, R: false }), false);
});

test('implicación compuesta y asociatividad a la derecha', () => {
    for (const P of [false, true]) {
        for (const Q of [false, true]) {
            for (const R of [false, true]) {
                const context = { P, Q, R };
                assert.equal(
                    logic.evaluate('P -> Q -> R', context),
                    logic.evaluate('P -> (Q -> R)', context)
                );
                assert.equal(
                    logic.evaluate('P -> (Q -> R)', context),
                    logic.evaluate('(P & Q) -> R', context)
                );
            }
        }
    }
});

test('detecta premisas inconsistentes y explica la validez vacua', () => {
    const result = logic.analizarArgumento({
        premisas: ['P', '!P'],
        conclusion: 'Q'
    });
    assert.equal(result.diagnostico.esConsistente, false);
    assert.equal(result.diagnostico.validezFormal, true);
    assert.match(result.diagnostico.etiquetaValidez, /vacuidad/i);
});

test('extrae variables desde el árbol sintáctico', () => {
    assert.deepEqual(logic.extractVariables(['P1 & ESTADO_A', '!Q -> P1']), ['ESTADO_A', 'P1', 'Q']);
});

test('rechaza fórmulas incompletas y paréntesis sin cerrar', () => {
    assert.throws(() => logic.parseExpression('P ->'), /Se esperaba/);
    assert.throws(() => logic.parseExpression('(P | Q'), /paréntesis de cierre/);
    assert.throws(() => logic.parseExpression('P & & Q'), /Se esperaba/);
});

test('rechaza código JavaScript y caracteres fuera de la gramática', () => {
    assert.throws(() => logic.parseExpression('P; process.exit()'), /Símbolo no permitido/);
    assert.throws(() => logic.parseExpression('P.constructor'), /Símbolo no permitido/);
});

test('limita el tamaño combinatorio y las premisas', () => {
    const manyVariables = Array.from({ length: 13 }, (_, index) => `P${index + 1}`).join(' | ');
    assert.throws(() => logic.analizarArgumento({ premisas: [manyVariables], conclusion: 'P1' }), /máximo permitido/);
    assert.throws(() => logic.analizarArgumento({ premisas: Array(21).fill('P'), conclusion: 'P' }), /máximo de 20 premisas/);
});

test('rechaza asignaciones incompletas incluso con cortocircuito lógico', () => {
    assert.throws(() => logic.evaluate('P & Q', { P: true }), /Falta asignar/);
    assert.throws(() => logic.evaluate('P | Q', { P: true }), /Falta asignar/);
    assert.throws(() => logic.evaluate('P', { P: 1 }), /debe ser booleano/);
});

for (const { name, callback } of tests) {
    try {
        callback();
        passed += 1;
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
}

if (process.exitCode !== 1) {
    console.log(`\nAXIAL TRUTHTABLE: ${passed}/${tests.length} pruebas aprobadas.`);
}
