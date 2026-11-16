/**
 * McRAPTOR (Delling, Pajor, Werneck, 2012) sobre o pacote .rvx.
 *
 * Critérios de Pareto: horário de chegada, número de viagens (rodadas) e tempo a pé.
 * Funciona igual online e offline; o overlay de trânsito (Fase 2) entra ajustando
 * os horários antes da busca, sem mudar este algoritmo.
 */
import type { Rede } from '@rotavix/data-format';
import { servicosAtivos } from './calendario';

export type Acesso = { ponto: number; caminhadaS: number };

export type Etiqueta = {
  chegada: number;
  caminhada: number;
  /** Rodada em que a etiqueta foi criada (= número de viagens até aqui). */
  rodada: number;
  ponto: number;
  pai: Etiqueta | null;
  modo: 'acesso' | 'viagem' | 'caminhada';
  /** Só em `viagem`. */
  padrao?: number;
  viagem?: number;
  posEmbarque?: number;
  posDesembarque?: number;
  /** Só em `caminhada`: segundos do trecho a pé. */
  trechoS?: number;
};

export type Resultado = {
  chegada: number;
  caminhada: number;
  viagens: number;
  ultima: Etiqueta;
  egressoS: number;
};

export type OpcoesBusca = {
  maxViagens?: number;
  transferenciaMinimaS?: number;
};

type EtiquetaRota = { viagem: number; caminhada: number; pai: Etiqueta; posEmbarque: number };

function domina(a: { chegada: number; caminhada: number }, b: { chegada: number; caminhada: number }): boolean {
  return a.chegada <= b.chegada && a.caminhada <= b.caminhada;
}

/**
 * Insere `e` na sacola se nenhuma etiqueta (desta rodada ou de rodadas anteriores) a dominar.
 * Só remove etiquetas da MESMA rodada: as de rodadas anteriores têm menos viagens e
 * continuam no Pareto (e ainda podem embarcar na rodada atual).
 */
function inserir(sacola: Etiqueta[], e: Etiqueta): boolean {
  for (const x of sacola) if (domina(x, e)) return false;
  for (let i = sacola.length - 1; i >= 0; i--) {
    const x = sacola[i]!;
    if (x.rodada === e.rodada && domina(e, x)) sacola.splice(i, 1);
  }
  sacola.push(e);
  return true;
}

/** Primeira viagem ativa do padrão que parte da posição `pos` em `t` ou depois. -1 se não houver. */
export function primeiraViagem(rede: Rede, ativos: Uint8Array, p: number, pos: number, t: number): number {
  const v0 = rede.padraoViagensIni[p]!;
  const nv = rede.padraoViagensIni[p + 1]! - v0;
  const n = rede.padraoPontosIni[p + 1]! - rede.padraoPontosIni[p]!;
  const base = rede.padraoTemposIni[p]! + pos;
  let lo = 0;
  let hi = nv;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (rede.partida[base + m * n]! < t) lo = m + 1;
    else hi = m;
  }
  for (let v = lo; v < nv; v++) if (ativos[rede.viagemServico[v0 + v]!]) return v;
  return -1;
}

export function mcRaptor(
  rede: Rede,
  data: string,
  partida: number,
  origem: Acesso[],
  destino: Acesso[],
  opcoes: OpcoesBusca = {},
): Resultado[] {
  const maxViagens = opcoes.maxViagens ?? 5;
  const transfMin = opcoes.transferenciaMinimaS ?? 120;
  const ativos = servicosAtivos(rede, data);
  const S = rede.nPontos;

  const egresso = new Map<number, number>();
  for (const d of destino) egresso.set(d.ponto, Math.min(egresso.get(d.ponto) ?? Infinity, d.caminhadaS));
  const resultados: Resultado[] = [];

  const podado = (chegada: number, caminhada: number): boolean => {
    for (const r of resultados) if (r.chegada <= chegada && r.caminhada <= caminhada) return true;
    return false;
  };

  // sacolas[p]: etiquetas não dominadas acumuladas até a rodada atual.
  const sacolas: Etiqueta[][] = Array.from({ length: S }, () => []);
  let marcados = new Set<number>();
  let novas: Etiqueta[] = [];

  for (const o of origem) {
    const e: Etiqueta = { chegada: partida + o.caminhadaS, caminhada: o.caminhadaS, rodada: 0, ponto: o.ponto, pai: null, modo: 'acesso' };
    if (inserir(sacolas[o.ponto]!, e)) novas.push(e);
  }
  novas = caminhar(rede, sacolas, novas, podado);
  for (const e of novas) marcados.add(e.ponto);
  registrar(novas);

  for (let k = 1; k <= maxViagens && marcados.size > 0; k++) {
    // Padrões a varrer, com a posição mais cedo de um ponto marcado.
    const fila = new Map<number, number>();
    for (const s of marcados) {
      for (let i = rede.pontoPadroesIni[s]!; i < rede.pontoPadroesIni[s + 1]!; i++) {
        const p = rede.pontoPadroes[i]!;
        const pos = rede.pontoPadroesPos[i]!;
        const atual = fila.get(p);
        if (atual === undefined || pos < atual) fila.set(p, pos);
      }
    }

    const daRodada: Etiqueta[] = [];
    for (const [p, pos0] of fila) {
      const ini = rede.padraoPontosIni[p]!;
      const n = rede.padraoPontosIni[p + 1]! - ini;
      const v0 = rede.padraoViagensIni[p]!;
      const tIni = rede.padraoTemposIni[p]!;
      let sacolaRota: EtiquetaRota[] = [];

      for (let pos = pos0; pos < n; pos++) {
        const s = rede.padraoPontos[ini + pos]!;
        // 1) Desembarque: etiquetas da rota chegam neste ponto.
        for (const r of sacolaRota) {
          if (r.posEmbarque === pos) continue;
          const chegada = rede.chegada[tIni + r.viagem * n + pos]!;
          if (podado(chegada, r.caminhada)) continue;
          const e: Etiqueta = {
            chegada, caminhada: r.caminhada, rodada: k, ponto: s, pai: r.pai, modo: 'viagem',
            padrao: p, viagem: v0 + r.viagem, posEmbarque: r.posEmbarque, posDesembarque: pos,
          };
          if (inserir(sacolas[s]!, e)) daRodada.push(e);
        }
        // 2) Embarque: etiquetas da rodada anterior neste ponto entram na rota.
        for (const e of sacolas[s]!) {
          if (e.rodada !== k - 1) continue;
          const pronto = e.chegada + (e.modo === 'viagem' ? transfMin : 0);
          const v = primeiraViagem(rede, ativos, p, pos, pronto);
          if (v < 0) continue;
          const r: EtiquetaRota = { viagem: v, caminhada: e.caminhada, pai: e, posEmbarque: pos };
          if (sacolaRota.some((x) => x.viagem <= r.viagem && x.caminhada <= r.caminhada)) continue;
          sacolaRota = sacolaRota.filter((x) => !(r.viagem <= x.viagem && r.caminhada <= x.caminhada));
          sacolaRota.push(r);
        }
      }
    }
    // Etiquetas podem ter sido removidas por dominância dentro da própria rodada.
    const vivas = daRodada.filter((e) => sacolas[e.ponto]!.includes(e));
    const comCaminhada = caminhar(rede, sacolas, vivas, podado);
    marcados = new Set(comCaminhada.map((e) => e.ponto));
    registrar(comCaminhada);
  }

  function registrar(lista: Etiqueta[]): void {
    for (const e of lista) {
      const eg = egresso.get(e.ponto);
      if (eg === undefined || e.rodada === 0) continue;
      const r: Resultado = { chegada: e.chegada + eg, caminhada: e.caminhada + eg, viagens: e.rodada, ultima: e, egressoS: eg };
      // Resultados com menos viagens chegam antes nas rodadas; só entra se não for dominado.
      if (resultados.some((x) => x.chegada <= r.chegada && x.caminhada <= r.caminhada && x.viagens <= r.viagens)) continue;
      for (let i = resultados.length - 1; i >= 0; i--) {
        const x = resultados[i]!;
        if (r.chegada <= x.chegada && r.caminhada <= x.caminhada && r.viagens <= x.viagens) resultados.splice(i, 1);
      }
      resultados.push(r);
    }
  }

  return resultados.sort((a, b) => a.chegada - b.chegada || a.viagens - b.viagens);
}

/** Relaxa as transferências a pé a partir das etiquetas novas (uma caminhada por vez). */
function caminhar(
  rede: Rede,
  sacolas: Etiqueta[][],
  novas: Etiqueta[],
  podado: (c: number, w: number) => boolean,
): Etiqueta[] {
  const saida = [...novas];
  for (const e of novas) {
    if (e.modo === 'caminhada') continue;
    for (let i = rede.transfIni[e.ponto]!; i < rede.transfIni[e.ponto + 1]!; i++) {
      const q = rede.transfPara[i]!;
      const t = rede.transfS[i]!;
      const c: Etiqueta = {
        chegada: e.chegada + t, caminhada: e.caminhada + t, rodada: e.rodada, ponto: q, pai: e,
        modo: 'caminhada', trechoS: t,
      };
      if (podado(c.chegada, c.caminhada)) continue;
      if (inserir(sacolas[q]!, c)) saida.push(c);
    }
  }
  return saida.filter((e) => sacolas[e.ponto]!.includes(e));
}
