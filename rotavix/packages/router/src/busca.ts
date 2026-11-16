/** Busca offline de pontos e linhas, sem acento e com sinônimos (SPEC §3.5). */
import type { Rede } from '@rotavix/data-format';
import MiniSearch from 'minisearch';

export type ItemBusca = { tipo: 'ponto'; ponto: number; nome: string } | { tipo: 'linha'; linha: number; nome: string; curta: string };

// Sinônimos aplicados na indexação e na consulta. TODO: carregar de config na Fase 1.
const SINONIMOS: [RegExp, string][] = [
  [/\bt\.\s*/g, 'terminal '],
  [/\bterm\.\s*/g, 'terminal '],
  [/\bav\.\s*/g, 'avenida '],
  [/\best\.\s*/g, 'estacao '],
  [/\bvv\b/g, 'vila velha'],
  [/\bvix\b/g, 'vitoria'],
];

export function normalizar(s: string): string {
  let t = s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  for (const [re, sub] of SINONIMOS) t = t.replace(re, sub);
  return t
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function criarBusca(rede: Rede): (q: string, limite?: number) => ItemBusca[] {
  const itens: ItemBusca[] = [
    ...rede.cab.pontos.nomes.map((nome, ponto): ItemBusca => ({ tipo: 'ponto', ponto, nome })),
    ...rede.cab.linhas.map((l, linha): ItemBusca => ({ tipo: 'linha', linha, nome: l.longa, curta: l.curta })),
  ];
  const ms = new MiniSearch<{ id: number; texto: string }>({
    fields: ['texto'],
    processTerm: (t) => normalizar(t) || null,
    tokenize: (t) => normalizar(t).split(' '),
    searchOptions: { prefix: true, fuzzy: (termo) => (termo.length > 4 ? 0.2 : 0), combineWith: 'AND' },
  });
  ms.addAll(itens.map((it, id) => ({ id, texto: it.tipo === 'linha' ? `${it.curta} ${it.nome}` : it.nome })));
  return (q, limite = 8) => {
    const qn = normalizar(q);
    if (!qn) return [];
    return ms
      .search(qn)
      .slice(0, limite)
      .map((r) => itens[r.id as number]!);
  };
}
