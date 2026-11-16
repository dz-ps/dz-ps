/** Busca offline de pontos, lugares e linhas, sem acento e com sinônimos (SPEC §3.5). */
import type { Rede } from '@rotavix/data-format';
import MiniSearch from 'minisearch';
import { distanciaM } from './geo';

export type ItemBusca =
  /** `pontos`: todas as plataformas com o mesmo nome a até 400 m (ex.: as baias de um terminal). */
  | { tipo: 'ponto'; ponto: number; pontos: number[]; nome: string }
  | { tipo: 'linha'; linha: number; nome: string; curta: string }
  | { tipo: 'lugar'; lugar: number; nome: string; categoria: string; lat: number; lon: number };

// Sinônimos aplicados na indexação e na consulta. TODO: carregar de config na Fase 1.
const SINONIMOS: [RegExp, string][] = [
  [/\bt\.\s*/g, 'terminal '],
  [/\bterm\.\s*/g, 'terminal '],
  [/\bav\.\s*/g, 'avenida '],
  [/\best\.\s*/g, 'estacao '],
  [/\bvv\b/g, 'vila velha'],
  [/\bvix\b/g, 'vitoria'],
];

/** Rótulo em PT-BR para o tipo de lugar do OSM. */
export const CATEGORIAS: Record<string, string> = {
  'place=suburb': 'Bairro',
  'place=neighbourhood': 'Bairro',
  'place=quarter': 'Bairro',
  'place=town': 'Cidade',
  'place=village': 'Localidade',
  'place=city': 'Cidade',
  'amenity=university': 'Universidade',
  'amenity=college': 'Faculdade',
  'amenity=hospital': 'Hospital',
  'amenity=bus_station': 'Terminal',
  'amenity=ferry_terminal': 'Aquaviário',
  'amenity=townhall': 'Prefeitura',
  'amenity=library': 'Biblioteca',
  'amenity=marketplace': 'Mercado',
  'shop=mall': 'Shopping',
  'aeroway=aerodrome': 'Aeroporto',
  'leisure=stadium': 'Estádio',
  'leisure=park': 'Parque',
  'tourism=attraction': 'Atração',
  'tourism=museum': 'Museu',
  'public_transport=station': 'Estação',
};

export function normalizar(s: string): string {
  let t = s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  for (const [re, sub] of SINONIMOS) t = t.replace(re, sub);
  return t
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Agrupa pontos de mesmo nome (normalizado) a até 400 m do primeiro do grupo. */
export function agruparPontos(rede: Rede): number[][] {
  const porNome = new Map<string, number[][]>();
  for (let i = 0; i < rede.nPontos; i++) {
    const chave = normalizar(rede.cab.pontos.nomes[i]!);
    const grupos = porNome.get(chave) ?? [];
    const g = grupos.find((x) => distanciaM(rede.pontoLat[x[0]!]!, rede.pontoLon[x[0]!]!, rede.pontoLat[i]!, rede.pontoLon[i]!) <= 400);
    if (g) g.push(i);
    else grupos.push([i]);
    porNome.set(chave, grupos);
  }
  return [...porNome.values()].flat();
}

export function criarBusca(rede: Rede): (q: string, limite?: number) => ItemBusca[] {
  const itens: ItemBusca[] = [
    ...agruparPontos(rede).map((pontos): ItemBusca => ({
      tipo: 'ponto',
      ponto: pontos[0]!,
      pontos,
      nome: rede.cab.pontos.nomes[pontos[0]!]!,
    })),
    ...rede.cab.linhas.map((l, linha): ItemBusca => ({ tipo: 'linha', linha, nome: l.longa, curta: l.curta })),
    ...(rede.cab.lugares?.nomes ?? []).map((nome, i): ItemBusca => ({
      tipo: 'lugar',
      lugar: i,
      nome,
      categoria: CATEGORIAS[rede.cab.lugares!.tipos[i]!] ?? 'Lugar',
      lat: rede.cab.lugares!.lat[i]!,
      lon: rede.cab.lugares!.lon[i]!,
    })),
  ];
  const ms = new MiniSearch<{ id: number; texto: string }>({
    fields: ['texto'],
    processTerm: (t) => normalizar(t) || null,
    tokenize: (t) => normalizar(t).split(' '),
    searchOptions: { prefix: true, fuzzy: (termo) => (termo.length > 4 ? 0.2 : 0), combineWith: 'AND' },
  });
  ms.addAll(itens.map((it, id) => ({ id, texto: it.tipo === 'linha' ? `${it.curta} ${it.nome}` : it.nome })));
  const peso = (it: ItemBusca) => (it.tipo === 'lugar' ? 1.3 : it.tipo === 'ponto' && /^terminal/i.test(it.nome) ? 1.4 : 1);
  return (q, limite = 8) => {
    const qn = normalizar(q);
    if (!qn) return [];
    return ms
      .search(qn)
      .map((r) => ({ it: itens[r.id as number]!, s: r.score * peso(itens[r.id as number]!) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, limite)
      .map((x) => x.it);
  };
}
