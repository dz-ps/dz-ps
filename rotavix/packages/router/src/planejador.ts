/**
 * Planejador: transforma pedidos (origem, destino, horário) em opções de rota
 * ordenadas, rotuladas e explicadas. Usa o McRAPTOR repetido ao longo da janela de partida.
 */
import type { LinhaMeta, Rede } from '@rotavix/data-format';
import { distanciaM } from './geo';
import { type Acesso, type Etiqueta, mcRaptor, type Resultado } from './raptor';

export type Lugar = { tipo: 'ponto'; ponto: number } | { tipo: 'coord'; lat: number; lon: number; nome?: string };

export type Pedido = {
  origem: Lugar;
  destino: Lugar;
  /** 'AAAAMMDD' no fuso da rede. */
  data: string;
  /** Segundos desde a meia-noite. */
  horaS: number;
  janelaS?: number;
  maxCaminhadaM?: number;
  maxOpcoes?: number;
};

export type Ponto = { indice: number; id: string; nome: string; lat: number; lon: number };

export type Trecho =
  | { tipo: 'a_pe'; de: string; para: string; inicio: number; fim: number; estimativa: true; pontoPara?: number }
  | {
      tipo: 'veiculo';
      linha: LinhaMeta & { indice: number };
      padrao: number;
      destino: string;
      embarque: Ponto & { hora: number };
      desembarque: Ponto & { hora: number };
      paradas: number;
      /** Pontos do padrão do embarque ao desembarque (para desenhar no mapa). */
      pontos: number[];
      modo: 'onibus' | 'barca';
      fonte: 'tabela';
    };

export type Rotulo = 'Mais rápida' | 'Menos baldeação' | 'Menos caminhada' | 'A pé';

export type Motivo =
  | { tipo: 'mais_rapida'; minutosAMenos: number | null }
  | { tipo: 'menos_baldeacoes'; baldeacoes: number }
  | { tipo: 'menos_caminhada'; minutos: number }
  | { tipo: 'direta' }
  | { tipo: 'usa_aquaviario'; de: string; para: string }
  | { tipo: 'baldeacao'; ponto: string; folgaMin: number }
  | { tipo: 'pela_tabela' }
  | { tipo: 'caminhada_estimada' }
  | { tipo: 'rede_sintetica' };

export type Opcao = {
  id: string;
  partida: number;
  chegada: number;
  duracaoS: number;
  baldeacoes: number;
  caminhadaS: number;
  trechos: Trecho[];
  rotulos: Rotulo[];
  motivos: Motivo[];
  score: number;
  /** Mesma combinação de linhas, partidas seguintes (horário de sair da origem). */
  proximasPartidas: number[];
  /** Linhas usadas, na ordem (agrupa opções equivalentes). */
  assinatura: string;
};

type Scoring = { penalidade_baldeacao_min?: number; peso_caminhada?: number; peso_espera?: number; transferencia_minima_min?: number };

export function ponto(rede: Rede, i: number): Ponto {
  return { indice: i, id: rede.cab.pontos.ids[i]!, nome: rede.cab.pontos.nomes[i]!, lat: rede.pontoLat[i]!, lon: rede.pontoLon[i]! };
}

function coordenada(rede: Rede, l: Lugar): { lat: number; lon: number } {
  return l.tipo === 'ponto' ? { lat: rede.pontoLat[l.ponto]!, lon: rede.pontoLon[l.ponto]! } : l;
}

function nomeLugar(rede: Rede, l: Lugar, padrao: string): string {
  return l.tipo === 'ponto' ? rede.cab.pontos.nomes[l.ponto]! : (l.nome ?? padrao);
}

/** Tempo a pé estimado (linha reta × fator ÷ velocidade), como o pipeline faz offline. */
export function caminhadaS(rede: Rede, metros: number): number {
  const c = rede.cab.caminhada;
  return Math.ceil((metros * c.fator) / c.velocidade_ms);
}

export function acessos(rede: Rede, l: Lugar, maxM: number): Acesso[] {
  if (l.tipo === 'ponto') return [{ ponto: l.ponto, caminhadaS: 0 }];
  const res: Acesso[] = [];
  for (let i = 0; i < rede.nPontos; i++) {
    const d = distanciaM(l.lat, l.lon, rede.pontoLat[i]!, rede.pontoLon[i]!);
    if (d * rede.cab.caminhada.fator <= maxM) res.push({ ponto: i, caminhadaS: caminhadaS(rede, d) });
  }
  return res;
}

function cadeia(e: Etiqueta): Etiqueta[] {
  const lista: Etiqueta[] = [];
  for (let x: Etiqueta | null = e; x; x = x.pai) lista.push(x);
  return lista.reverse();
}

function horario(rede: Rede, tabela: Int32Array, padrao: number, viagem: number, pos: number): number {
  const v = viagem - rede.padraoViagensIni[padrao]!;
  const n = rede.padraoPontosIni[padrao + 1]! - rede.padraoPontosIni[padrao]!;
  return tabela[rede.padraoTemposIni[padrao]! + v * n + pos]!;
}

function montar(rede: Rede, r: Resultado, pedido: Pedido): Opcao {
  const etapas = cadeia(r.ultima);
  const trechos: Trecho[] = [];
  const nomeOrigem = nomeLugar(rede, pedido.origem, 'Origem');
  const nomeDestino = nomeLugar(rede, pedido.destino, 'Destino');
  const viagens = etapas.filter((e) => e.modo === 'viagem');
  const primeira = viagens[0]!;
  const partidaVeiculo = horario(rede, rede.partida, primeira.padrao!, primeira.viagem!, primeira.posEmbarque!);
  // Caminhada antes da primeira viagem: acesso + transferências até o embarque.
  const antes = etapas.slice(0, etapas.indexOf(primeira)).reduce((s, e) => s + (e.modo === 'acesso' ? e.caminhada : (e.trechoS ?? 0)), 0);
  const partida = partidaVeiculo - antes;

  let t = partida;
  let anterior = nomeOrigem;
  for (const e of etapas) {
    if (e.modo === 'acesso') {
      if (e.caminhada > 0) {
        trechos.push({
          tipo: 'a_pe',
          de: nomeOrigem,
          para: rede.cab.pontos.nomes[e.ponto]!,
          inicio: t,
          fim: t + e.caminhada,
          estimativa: true,
          pontoPara: e.ponto,
        });
        t += e.caminhada;
      }
      anterior = rede.cab.pontos.nomes[e.ponto]!;
    } else if (e.modo === 'caminhada') {
      const para = rede.cab.pontos.nomes[e.ponto]!;
      trechos.push({ tipo: 'a_pe', de: anterior, para, inicio: t, fim: t + e.trechoS!, estimativa: true, pontoPara: e.ponto });
      t += e.trechoS!;
      anterior = para;
    } else {
      const p = e.padrao!;
      const ini = rede.padraoPontosIni[p]!;
      const pts = Array.from(rede.padraoPontos.subarray(ini + e.posEmbarque!, ini + e.posDesembarque! + 1));
      const li = rede.padraoLinha[p]!;
      const linha = rede.cab.linhas[li]!;
      const hEmb = horario(rede, rede.partida, p, e.viagem!, e.posEmbarque!);
      const hDes = horario(rede, rede.chegada, p, e.viagem!, e.posDesembarque!);
      trechos.push({
        tipo: 'veiculo',
        linha: { ...linha, indice: li },
        padrao: p,
        destino: rede.cab.padroes[p]!.destino,
        embarque: { ...ponto(rede, pts[0]!), hora: hEmb },
        desembarque: { ...ponto(rede, pts.at(-1)!), hora: hDes },
        paradas: pts.length - 1,
        pontos: pts,
        modo: linha.tipo === 4 ? 'barca' : 'onibus',
        fonte: 'tabela',
      });
      t = hDes;
      anterior = rede.cab.pontos.nomes[pts.at(-1)!]!;
    }
  }
  if (r.egressoS > 0) {
    trechos.push({ tipo: 'a_pe', de: anterior, para: nomeDestino, inicio: t, fim: t + r.egressoS, estimativa: true });
  }

  const scoring = rede.cab.scoring as Scoring;
  const b = r.viagens - 1;
  const espera = esperaEntreViagens(trechos);
  const score =
    r.chegada +
    60 * (scoring.penalidade_baldeacao_min ?? 3) * b +
    ((scoring.peso_caminhada ?? 1.5) - 1) * r.caminhada +
    ((scoring.peso_espera ?? 1.2) - 1) * espera;
  return {
    id: viagens.map((v) => `${v.viagem}:${v.posEmbarque}-${v.posDesembarque}`).join('|'),
    partida,
    chegada: r.chegada,
    duracaoS: r.chegada - partida,
    baldeacoes: b,
    caminhadaS: r.caminhada,
    trechos,
    rotulos: [],
    motivos: [],
    score,
    proximasPartidas: [],
    assinatura: viagens.map((v) => `${rede.padraoLinha[v.padrao!]}@${v.ponto}`).join('>'),
  };
}

function esperaEntreViagens(trechos: Trecho[]): number {
  let espera = 0;
  let fim: number | null = null;
  for (const t of trechos) {
    if (t.tipo === 'veiculo') {
      if (fim !== null) espera += Math.max(0, t.embarque.hora - fim);
      fim = t.desembarque.hora;
    } else if (fim !== null) fim = t.fim;
  }
  return espera;
}

function dominaOpcao(a: Opcao, b: Opcao): boolean {
  return (
    a.partida >= b.partida &&
    a.chegada <= b.chegada &&
    a.baldeacoes <= b.baldeacoes &&
    a.caminhadaS <= b.caminhadaS &&
    (a.partida > b.partida || a.chegada < b.chegada || a.baldeacoes < b.baldeacoes || a.caminhadaS < b.caminhadaS)
  );
}

export function planejar(rede: Rede, pedido: Pedido): Opcao[] {
  const janela = pedido.janelaS ?? 3600;
  const maxM = pedido.maxCaminhadaM ?? 1000;
  const scoring = rede.cab.scoring as Scoring;
  const origem = acessos(rede, pedido.origem, maxM);
  const destino = acessos(rede, pedido.destino, maxM);
  const opcoes = new Map<string, Opcao>();

  let t = pedido.horaS;
  for (let i = 0; i < 8 && t <= pedido.horaS + janela; i++) {
    const res = mcRaptor(rede, pedido.data, t, origem, destino, {
      transferenciaMinimaS: 60 * (scoring.transferencia_minima_min ?? 2),
    });
    if (res.length === 0) break;
    let proxima = Infinity;
    for (const r of res) {
      const o = montar(rede, r, pedido);
      if (!opcoes.has(o.id)) opcoes.set(o.id, o);
      const emb = o.trechos.find((x) => x.tipo === 'veiculo');
      if (emb && emb.tipo === 'veiculo') proxima = Math.min(proxima, emb.embarque.hora);
    }
    t = Math.max(t + 60, proxima - (origem.length ? Math.min(...origem.map((o) => o.caminhadaS)) : 0) + 60);
  }

  let lista = [...opcoes.values()].filter((o) => o.partida >= pedido.horaS);
  lista = lista.filter((o) => !lista.some((x) => x !== o && dominaOpcao(x, o)));

  // Opção só a pé, quando faz sentido.
  const a = coordenada(rede, pedido.origem);
  const b = coordenada(rede, pedido.destino);
  const dist = distanciaM(a.lat, a.lon, b.lat, b.lon);
  if (dist * rede.cab.caminhada.fator <= 2000 && dist > 0) {
    const s = caminhadaS(rede, dist);
    lista.push({
      id: 'a_pe',
      partida: pedido.horaS,
      chegada: pedido.horaS + s,
      duracaoS: s,
      baldeacoes: 0,
      caminhadaS: s,
      trechos: [
        {
          tipo: 'a_pe',
          de: nomeLugar(rede, pedido.origem, 'Origem'),
          para: nomeLugar(rede, pedido.destino, 'Destino'),
          inicio: pedido.horaS,
          fim: pedido.horaS + s,
          estimativa: true,
        },
      ],
      rotulos: ['A pé'],
      motivos: [],
      score: pedido.horaS + s * (scoring.peso_caminhada ?? 1.5),
      proximasPartidas: [],
      assinatura: 'a_pe',
    });
  }

  lista.sort((x, y) => x.score - y.score || y.partida - x.partida);
  // Agrupa a mesma combinação de linhas: o cartão mostra a melhor e lista as próximas partidas.
  const grupos = new Map<string, Opcao>();
  for (const o of lista) {
    const g = grupos.get(o.assinatura);
    if (g) g.proximasPartidas.push(o.partida);
    else grupos.set(o.assinatura, o);
  }
  lista = [...grupos.values()].slice(0, pedido.maxOpcoes ?? 6);
  for (const o of lista)
    o.proximasPartidas = o.proximasPartidas
      .filter((p) => p > o.partida)
      .sort((a, b) => a - b)
      .slice(0, 4);
  rotular(rede, lista);
  return lista;
}

function rotular(rede: Rede, lista: Opcao[]): void {
  const transporte = lista.filter((o) => o.id !== 'a_pe');
  if (transporte.length === 0) return;
  const porChegada = [...transporte].sort((a, b) => a.chegada - b.chegada || b.partida - a.partida);
  const rapida = porChegada[0]!;
  const segunda = porChegada.find((o) => o.assinatura !== rapida.assinatura);
  rapida.rotulos.push('Mais rápida');
  rapida.motivos.push({
    tipo: 'mais_rapida',
    minutosAMenos: segunda && segunda.chegada > rapida.chegada ? Math.round((segunda.chegada - rapida.chegada) / 60) : null,
  });

  const minB = Math.min(...transporte.map((o) => o.baldeacoes));
  const menosB = transporte.find((o) => o.baldeacoes === minB)!;
  if (transporte.some((o) => o.baldeacoes > minB)) {
    menosB.rotulos.push('Menos baldeação');
    menosB.motivos.push({ tipo: 'menos_baldeacoes', baldeacoes: minB });
  }
  const minW = Math.min(...transporte.map((o) => o.caminhadaS));
  const menosW = transporte.find((o) => o.caminhadaS === minW)!;
  if (transporte.some((o) => o.caminhadaS - minW >= 120)) {
    menosW.rotulos.push('Menos caminhada');
    menosW.motivos.push({ tipo: 'menos_caminhada', minutos: Math.round(minW / 60) });
  }

  for (const o of transporte) {
    const veic = o.trechos.filter((t) => t.tipo === 'veiculo');
    if (veic.length === 1) o.motivos.push({ tipo: 'direta' });
    for (const v of veic) {
      if (v.modo === 'barca') o.motivos.push({ tipo: 'usa_aquaviario', de: v.embarque.nome, para: v.desembarque.nome });
    }
    for (let i = 1; i < veic.length; i++) {
      const ant = veic[i - 1]!;
      const prox = veic[i]!;
      const idx = o.trechos.indexOf(prox);
      const anteriorFim =
        (o.trechos[idx - 1] as Trecho).tipo === 'a_pe' ? (o.trechos[idx - 1] as { fim: number }).fim : ant.desembarque.hora;
      o.motivos.push({ tipo: 'baldeacao', ponto: prox.embarque.nome, folgaMin: Math.round((prox.embarque.hora - anteriorFim) / 60) });
    }
    o.motivos.push({ tipo: 'pela_tabela' });
    if (o.trechos.some((t) => t.tipo === 'a_pe')) o.motivos.push({ tipo: 'caminhada_estimada' });
    if (rede.cab.rede.sintetica) o.motivos.push({ tipo: 'rede_sintetica' });
  }
}
