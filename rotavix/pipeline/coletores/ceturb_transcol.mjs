/**
 * Coletor do portal público de horários do Transcol (https://transcol.ceturb.es.gov.br/horarios).
 *
 * Abre as páginas públicas num navegador (como qualquer pessoa faria) e lê a área de impressão
 * do quadro de horários. NÃO chama a API interna do portal diretamente (SPEC §3: nada de
 * endpoints não documentados). robots.txt inexistente em 2026-11-16; ritmo baixo e cache.
 *
 * Uso: node pipeline/coletores/ceturb_transcol.mjs [pasta-saida] [--linhas 0500,0501] [--intervalo-ms 1500]
 * Saída: <pasta>/linhas.json (lista) e <pasta>/linhas/<numero>.json (quadro bruto de cada linha).
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const saida = args.find((a) => !a.startsWith('--')) ?? `data/brutos/ceturb/${new Date().toISOString().slice(0, 10)}`;
const so = args.includes('--linhas') ? args[args.indexOf('--linhas') + 1].split(',') : null;
const intervalo = args.includes('--intervalo-ms') ? Number(args[args.indexOf('--intervalo-ms') + 1]) : 1500;
const URL_HORARIOS = 'https://transcol.ceturb.es.gov.br/horarios';
const UA = `RotaVix-pipeline/0.1 (app independente; coleta de dados públicos${process.env.RV_CONTATO ? `; ${process.env.RV_CONTATO}` : ''})`;

mkdirSync(join(saida, 'linhas'), { recursive: true });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function parseItem(texto) {
  const t = texto.replace(/\s+/g, ' ').trim();
  const m = t.match(/^(\S+)\s+(.*)$/);
  return { numero: m?.[1] ?? t, texto: m?.[2] ?? '' };
}

/** Extrai o quadro da área de impressão: sentidos > dias > horários (com sufixos de observação). */
function extrairQuadro() {
  const area = document.querySelector('.print-area');
  if (!area) return null;
  const cab = {
    numero: area.querySelector('.print-line-number')?.textContent.trim() ?? '',
    nome: area.querySelector('.print-header h1')?.textContent.trim() ?? '',
    descricao: area.querySelector('.print-header p')?.textContent.trim() ?? '',
  };
  const sentidos = [];
  let atual = null;
  let dia = null;
  for (const el of area.querySelectorAll('h2.print-direcao, h3, p.print-data, table.print-tabela')) {
    if (el.matches('h2.print-direcao')) {
      atual = { saida: el.textContent.replace(/^\s*SA[ÍI]DA:\s*/i, '').trim(), dias: [] };
      sentidos.push(atual);
    } else if (el.tagName === 'H3' && atual && !el.closest('.print-orientacoes')) {
      dia = { dia: el.textContent.trim(), inicio_operacao: null, horarios: [] };
      atual.dias.push(dia);
    } else if (el.matches('p.print-data') && dia) {
      dia.inicio_operacao = el.textContent.replace(/.*:\s*/, '').trim();
    } else if (el.matches('table.print-tabela') && dia) {
      dia.horarios = [...el.querySelectorAll('td')].map((td) => td.textContent.trim()).filter(Boolean);
    }
  }
  const orientacoes = [...area.querySelectorAll('.print-orientacoes li')].map((li) => li.textContent.trim());
  return { ...cab, sentidos, orientacoes };
}

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ userAgent: UA, locale: 'pt-BR' });
const pagina = await ctx.newPage();
await pagina.goto(URL_HORARIOS, { waitUntil: 'networkidle', timeout: 90_000 });
const campo = pagina.locator('input.form-control-lg');

// 1) Lista de linhas: a busca por cada dígito inicial cobre todos os números.
const linhas = new Map();
for (const q of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
  await campo.fill(q);
  await dormir(intervalo);
  for (const t of await pagina.locator('.autocomplete-item').allInnerTexts()) {
    const it = parseItem(t);
    if (/^\d/.test(it.numero)) linhas.set(it.numero, it);
  }
}
const lista = [...linhas.values()].sort((a, b) => a.numero.localeCompare(b.numero));
writeFileSync(
  join(saida, 'linhas.json'),
  JSON.stringify({ coletado_em: new Date().toISOString(), fonte: URL_HORARIOS, linhas: lista }, null, 1),
);
console.log(`${lista.length} linhas no portal`);

// 2) Quadro de cada linha.
let ok = 0;
const falhas = [];
for (const l of lista) {
  if (so && !so.includes(l.numero)) continue;
  const arq = join(saida, 'linhas', `${l.numero}.json`);
  if (existsSync(arq) && JSON.parse(readFileSync(arq, 'utf8')).sentidos?.length) {
    ok++;
    continue;
  }
  try {
    await campo.fill(l.numero);
    await dormir(intervalo);
    const itens = pagina.locator('.autocomplete-item');
    const n = await itens.count();
    let clicou = false;
    for (let i = 0; i < n; i++) {
      if (parseItem(await itens.nth(i).innerText()).numero === l.numero) {
        await itens.nth(i).click();
        clicou = true;
        break;
      }
    }
    if (!clicou) throw new Error('linha não apareceu na busca');
    // O quadro chega em etapas: espera o número certo E as tabelas de horário estabilizarem.
    await pagina.waitForFunction(
      (num) =>
        document.querySelector('.print-area .print-line-number')?.textContent.trim() === num &&
        document.querySelectorAll('.print-area table.print-tabela').length > 0,
      l.numero,
      { timeout: 20_000 },
    );
    let anterior = -1;
    for (let i = 0; i < 10; i++) {
      const tam = await pagina.evaluate(() => document.querySelector('.print-area')?.innerHTML.length ?? 0);
      if (tam === anterior) break;
      anterior = tam;
      await dormir(300);
    }
    const quadro = await pagina.evaluate(extrairQuadro);
    writeFileSync(arq, JSON.stringify({ coletado_em: new Date().toISOString(), ...quadro }, null, 1));
    ok++;
    if (ok % 25 === 0) console.log(`${ok}/${lista.length}`);
  } catch (e) {
    falhas.push({ numero: l.numero, erro: String(e).slice(0, 200) });
    await pagina.goto(URL_HORARIOS, { waitUntil: 'networkidle', timeout: 90_000 }).catch(() => {});
  }
  await dormir(intervalo);
}
writeFileSync(join(saida, 'falhas.json'), JSON.stringify(falhas, null, 1));
console.log(`fim: ${ok} quadros, ${falhas.length} falhas`);
await navegador.close();
