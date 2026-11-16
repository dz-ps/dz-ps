// Orçamento do shell (SPEC §7): JS + CSS carregados no primeiro paint, gzip < 170 KB.
// O chunk do mapa (MapLibre) e o worker do roteador ficam fora: carregam em paralelo e vão para o cache do SW.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMITE_KB = 170;
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
const entrada = Object.values(manifest).find((c) => c.isEntry);
const vistos = new Set();
const arquivos = [];
(function visitar(chave) {
  const c = manifest[chave] ?? entrada;
  if (vistos.has(c.file)) return;
  vistos.add(c.file);
  arquivos.push(c.file, ...(c.css ?? []));
  for (const i of c.imports ?? []) visitar(i);
})(Object.keys(manifest).find((k) => manifest[k] === entrada));
arquivos.push('index.html');
let total = 0;
for (const f of new Set(arquivos)) {
  const kb = gzipSync(readFileSync(`dist/${f}`)).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(7)} KB  ${f}`);
}
console.log(`${total.toFixed(1).padStart(7)} KB  TOTAL (limite ${LIMITE_KB} KB)`);
if (total > LIMITE_KB) {
  console.error('Shell acima do orçamento.');
  process.exit(1);
}
