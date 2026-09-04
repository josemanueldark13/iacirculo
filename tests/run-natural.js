const kernel = require('../Kernels/kernel');
const cases = require('./test-natural-data');

let failures = 0;
for (const item of cases) {
  const result = kernel.process(item.q);
  const ok = result.estado === 'aceptada' && result.dominio === item.intent;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${item.q} | ${result.estado} | ${result.dominio} | ${result.confianza}`);
  if (!ok) failures++;
}

if (failures) {
  console.error(`LENGUAJE NATURAL: FAIL (${failures})`);
  process.exit(1);
}
console.log(`LENGUAJE NATURAL: PASS (${cases.length}/${cases.length})`);
