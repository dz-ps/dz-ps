/**
 * Casos com resposta conhecida na REDE SINTÉTICA DE TESTE.
 * As respostas esperadas são lidas direto do GTFS (stop_times.txt), não do roteador.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lerRede } from '@rotavix/data-format';
import { describe, expect, it } from 'vitest';
import { explicar } from './explicar';
import { criarBusca, normalizar } from './busca';
import { diaDaSemana, servicosAtivos } from './calendario';
import { planejar, type Opcao } from './planejador';

const raiz = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const b = readFileSync(raiz('packages/data-format/fixtures/sintetico.rvx'));
const rede = lerRede(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
const P = (id: string) => rede.cab.pontos.ids.indexOf(id);
const h = (hh: number, mm = 0) => hh * 3600 + mm * 60;

// --- GTFS lido de forma independente ---------------------------------------------------
const hms = (s: string) => s.split(':').reduce((a, x) => a * 60 + Number(x), 0);
const stopTimes = new Map<string, { stop: string; arr: number; dep: number }[]>();
for (const linha of readFileSync(raiz('pipeline/fixtures/sintetico/gtfs/stop_times.txt'), 'utf8').trim().split('\n').slice(1)) {
  const [trip, arr, dep, stop] = linha.split(',');
  const l = stopTimes.get(trip!) ?? [];
  l.push({ stop: stop!, arr: hms(arr!), dep: hms(dep!) });
  stopTimes.set(trip!, l);
}
/** Primeira viagem direta da linha/serviço que sai de `de` em `t` ou depois, e sua chegada em `para`. */
function diretaGtfs(linha: string, servico: string, de: string, para: string, t: number) {
  let melhor: { dep: number; arr: number } | null = null;
  for (const [trip, st] of stopTimes) {
    if (!trip.startsWith(`${linha}-`) || !trip.includes(`-${servico}-`)) continue;
    const i = st.findIndex((x) => x.stop === de);
    const j = st.findIndex((x) => x.stop === para);
    if (i < 0 || j <= i || st[i]!.dep < t) continue;
    if (!melhor || st[i]!.dep < melhor.dep) melhor = { dep: st[i]!.dep, arr: st[j]!.arr };
  }
  return melhor!;
}

const plan = (o: string, d: string, data: string, hora: number): Opcao[] =>
  planejar(rede, { origem: { tipo: 'ponto', ponto: P(o) }, destino: { tipo: 'ponto', ponto: P(d) }, data, horaS: hora });

const TERCA = '20261117';
const SABADO = '20261121';
const NATAL = '20261225'; // sexta-feira com exceção: vira DOM na rede sintética

describe('calendário', () => {
  it('dia da semana', () => {
    expect(diaDaSemana(TERCA)).toBe(1);
    expect(diaDaSemana(SABADO)).toBe(5);
  });
  it('exceção de calendar_dates troca o serviço', () => {
    const ids = rede.cab.servicos.map((s) => s.id);
    const ativos = (d: string) => ids.filter((_, i) => servicosAtivos(rede, d)[i]);
    expect(ativos(TERCA)).toEqual(['UTIL']);
    expect(ativos(NATAL)).toEqual(['DOM']);
  });
});

describe('planejador (respostas conhecidas)', () => {
  it('viagem direta: T. Vila Velha → Praia do Canto, terça 07:00', () => {
    const esperado = diretaGtfs('S1', 'UTIL', 'TVV', 'CANTO', h(7));
    const [melhor] = plan('TVV', 'CANTO', TERCA, h(7));
    expect(melhor!.baldeacoes).toBe(0);
    expect(melhor!.partida).toBe(esperado.dep);
    expect(melhor!.chegada).toBe(esperado.arr);
    expect(melhor!.rotulos).toContain('Mais rápida');
    expect(melhor!.proximasPartidas.length).toBeGreaterThan(0);
  });

  it('sábado usa o quadro de sábado', () => {
    const esperado = diretaGtfs('S1', 'SAB', 'TVV', 'CANTO', h(7));
    const [melhor] = plan('TVV', 'CANTO', SABADO, h(7));
    expect(melhor!.partida).toBe(esperado.dep);
  });

  it('feriado com exceção usa o quadro de domingo', () => {
    const esperado = diretaGtfs('S1', 'DOM', 'TVV', 'CANTO', h(7));
    const [melhor] = plan('TVV', 'CANTO', NATAL, h(7));
    expect(melhor!.partida).toBe(esperado.dep);
  });

  it('baldeação no terminal: Jacaraípe → UFES', () => {
    const [melhor] = plan('JAC', 'UFES', TERCA, h(7));
    const veic = melhor!.trechos.filter((t) => t.tipo === 'veiculo');
    expect(veic.map((t) => t.linha.curta)).toEqual(['S5', 'S4']);
    expect(veic[0]!.desembarque.id).toBe('TLAR');
    // respeita a transferência mínima (2 min em config/scoring.yaml)
    expect(veic[1]!.embarque.hora - veic[0]!.desembarque.hora).toBeGreaterThanOrEqual(120);
  });

  it('sem serviço depois do último horário', () => {
    expect(plan('TVV', 'CANTO', TERCA, h(23, 50))).toEqual([]);
  });

  it('fronteira de Pareto: oferece opção com menos caminhada mesmo com mais baldeação', () => {
    const ops = plan('TCG', 'PAPA', TERCA, h(17, 20));
    const menosPe = ops.find((o) => o.rotulos.includes('Menos caminhada'));
    const rapida = ops.find((o) => o.rotulos.includes('Mais rápida'));
    expect(menosPe).toBeDefined();
    expect(menosPe!.caminhadaS).toBeLessThan(rapida!.caminhadaS);
    expect(menosPe!.baldeacoes).toBeGreaterThan(rapida!.baldeacoes);
  });

  it('Aquaviário aparece como modo barca e é explicado', () => {
    const ops = plan('STNA', 'PAPAA', TERCA, h(8));
    const barca = ops[0]!.trechos.find((t) => t.tipo === 'veiculo');
    expect(barca?.tipo === 'veiculo' && barca.modo).toBe('barca');
    expect(ops[0]!.motivos.map(explicar)).toContain('Aquaviário Estação Aquaviária Porto de Santana → Estação Aquaviária Praça do Papa');
  });

  it('origem por coordenada gera trecho a pé estimado', () => {
    const ops = planejar(rede, {
      origem: { tipo: 'coord', lat: -20.3300, lon: -40.2885, nome: 'Minha localização' },
      destino: { tipo: 'ponto', ponto: P('ENS') }, data: TERCA, horaS: h(8),
    });
    const t0 = ops.find((o) => o.id !== 'a_pe')!.trechos[0]!;
    expect(t0.tipo).toBe('a_pe');
    expect(t0.tipo === 'a_pe' && t0.estimativa).toBe(true);
  });

  it('toda opção explica o porquê e avisa que a rede é sintética', () => {
    for (const o of plan('JAC', 'UFES', TERCA, h(7))) {
      const textos = o.motivos.map(explicar);
      expect(textos).toContain('Pela tabela: horários programados, sem trânsito ao vivo');
      expect(textos).toContain('Rede sintética de teste: não use para viajar');
      expect(textos.some((t) => t.includes('Terminal Laranjeiras'))).toBe(true);
    }
  });
});

describe('busca offline', () => {
  const buscar = criarBusca(rede);
  it('ignora acentos e caixa', () => {
    expect(buscar('jacaraipe')[0]).toMatchObject({ tipo: 'ponto', nome: 'Jacaraípe' });
    expect(buscar('PRACA DO PAPA').map((r) => r.nome)).toContain('Praça do Papa');
  });
  it('sinônimos: T. = Terminal', () => {
    expect(normalizar('T. Laranjeiras')).toBe('terminal laranjeiras');
    expect(buscar('T. Laranj')[0]).toMatchObject({ nome: 'Terminal Laranjeiras' });
  });
  it('encontra linha pelo número', () => {
    expect(buscar('S4').some((r) => r.tipo === 'linha' && r.curta === 'S4')).toBe(true);
  });
});
