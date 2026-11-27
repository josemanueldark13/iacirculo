'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const prototypePath = path.join(root, 'public', 'generador-encuestas-prototipo.html');
const homepagePath = path.join(root, 'public', 'index.html');
const html = fs.readFileSync(prototypePath, 'utf8');
const homepage = fs.readFileSync(homepagePath, 'utf8');

const scriptStart = html.indexOf('<script>');
const scriptEnd = html.indexOf('</script>', scriptStart + 8);
assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, 'No se encontró el script local del prototipo.');

const script = html.slice(scriptStart + 8, scriptEnd);
new vm.Script(script, { filename: 'generador-encuestas-prototipo.html' });

const dynamicIds = new Set(['surveyPreviewForm', 'answerAgainButton']);
const referencedIds = [...script.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);

for (const id of referencedIds) {
    if (dynamicIds.has(id)) continue;
    assert.ok(html.includes('id="' + id + '"'), 'Falta el elemento HTML requerido por el script: ' + id);
}

for (const type of ['single', 'multiple', 'text', 'rating']) {
    assert.ok(html.includes('value="' + type + '"'), 'Falta el formato de pregunta: ' + type);
}

assert.ok(html.includes('localStorage'), 'El prototipo debe guardar borradores localmente.');
assert.ok(html.includes('downloadJson'), 'El prototipo debe permitir exportar JSON.');
assert.ok(html.includes('/circulo-ia-logo.png'), 'Debe utilizar el recurso oficial del logo.');
assert.ok(!script.includes('fetch('), 'El prototipo no debe transmitir datos a un backend.');
assert.ok(!homepage.includes('generador-encuestas-prototipo'), 'El prototipo no debe añadirse automáticamente a la portada.');
assert.ok(homepage.includes('Mini Pizarra'), 'Debe preservarse Mini Pizarra.');
assert.ok(homepage.includes('Historiografía de Tucumán'), 'Debe preservarse Historiografía de Tucumán.');
assert.ok(homepage.includes('AXIAL · TRUTHTABLE'), 'Debe preservarse AXIAL · TruthTable.');

console.log('SURVEY BUILDER: PASS (script syntax, selectors, four question types, local-only data, homepage preservation)');
