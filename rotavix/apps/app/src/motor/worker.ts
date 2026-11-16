/// <reference lib="webworker" />
/** Motor de rotas num Web Worker: a UI nunca trava enquanto o McRAPTOR roda. */
import { lerRede, type Rede } from '@rotavix/data-format';
import { agoraNoFuso, criarBusca, planejar, type ItemBusca, type Opcao, type Pedido } from '@rotavix/router';
import { expose } from 'comlink';

export type InfoRede = { nome: string; sintetica: boolean; fonte: string; geradoEm: string; nPontos: number; nLinhas: number; fuso: string };
export type ResultadoBusca =
  | { tipo: 'ponto'; ponto: number; nome: string; lat: number; lon: number; linhas: string[] }
  | { tipo: 'linha'; linha: number; nome: string; curta: string; servico: string };
export type Desenho = { modo: 'a_pe' | 'onibus' | 'barca'; servico?: string; coords: [number, number][] };
export type OpcaoMapa = Opcao & { desenho: Desenho[] };

let rede: Rede | null = null;
let buscar: ((q: string, n?: number) => ItemBusca[]) | null = null;
let linhasDoPonto: string[][] = [];

function exigir(): Rede {
  if (!rede) throw new Error('rede não carregada');
  return rede;
}

const api = {
  carregar(buf: ArrayBuffer): InfoRede {
    const r = lerRede(buf);
    rede = r;
    buscar = criarBusca(r);
    linhasDoPonto = Array.from({ length: r.nPontos }, () => [] as string[]);
    for (let s = 0; s < r.nPontos; s++) {
      const set = new Set<string>();
      for (let i = r.pontoPadroesIni[s]!; i < r.pontoPadroesIni[s + 1]!; i++) set.add(r.cab.linhas[r.padraoLinha[r.pontoPadroes[i]!]!]!.curta);
      linhasDoPonto[s] = [...set].sort();
    }
    return {
      nome: r.cab.rede.nome, sintetica: r.cab.rede.sintetica, fonte: r.cab.rede.fonte, geradoEm: r.cab.gerado_em,
      nPontos: r.nPontos, nLinhas: r.cab.linhas.length, fuso: r.cab.fuso,
    };
  },

  agora(): { data: string; horaS: number } {
    const { data, segundos } = agoraNoFuso(exigir().cab.fuso);
    return { data, horaS: segundos };
  },

  buscar(q: string, limite = 8): ResultadoBusca[] {
    const r = exigir();
    return (buscar?.(q, limite) ?? []).map((it): ResultadoBusca =>
      it.tipo === 'ponto'
        ? { ...it, lat: r.pontoLat[it.ponto]!, lon: r.pontoLon[it.ponto]!, linhas: linhasDoPonto[it.ponto]! }
        : { ...it, servico: r.cab.linhas[it.linha]!.servico },
    );
  },

  planejar(pedido: Pedido): OpcaoMapa[] {
    const r = exigir();
    const pos = (i: number): [number, number] => [r.pontoLon[i]!, r.pontoLat[i]!];
    const coordLugar = (l: Pedido['origem']): [number, number] => (l.tipo === 'ponto' ? pos(l.ponto) : [l.lon, l.lat]);
    return planejar(r, pedido).map((o) => {
      const desenho: Desenho[] = [];
      let ultimo = coordLugar(pedido.origem);
      for (const t of o.trechos) {
        if (t.tipo === 'veiculo') {
          const coords = t.pontos.map(pos);
          desenho.push({ modo: t.modo, servico: t.linha.servico, coords });
          ultimo = coords.at(-1)!;
        } else {
          const fim = t.pontoPara !== undefined ? pos(t.pontoPara) : coordLugar(pedido.destino);
          desenho.push({ modo: 'a_pe', coords: [ultimo, fim] });
          ultimo = fim;
        }
      }
      return { ...o, desenho };
    });
  },

  pontos(): GeoJSON.FeatureCollection<GeoJSON.Point> {
    const r = exigir();
    return {
      type: 'FeatureCollection',
      features: r.cab.pontos.nomes.map((nome, i) => ({
        type: 'Feature', id: i,
        properties: { nome, aquaviario: nome.startsWith('Estação Aquaviária') ? 1 : 0 },
        geometry: { type: 'Point', coordinates: [r.pontoLon[i]!, r.pontoLat[i]!] },
      })),
    };
  },
};

export type ApiMotor = typeof api;
expose(api);
