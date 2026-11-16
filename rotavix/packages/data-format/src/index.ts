/** Leitor do pacote de rede .rvx v1. Especificação em ../FORMATO.md. */

export type ServicoMeta = { id: string; dias: boolean[]; inicio: string; fim: string; add: string[]; rem: string[] };
export type TipoServico = 'troncal' | 'alimentadora' | 'aquaviario' | 'expresso' | 'municipal' | 'outro';
export type LinhaMeta = { id: string; curta: string; longa: string; tipo: number; servico: TipoServico; cor: string | null };
export type PadraoMeta = { linha: number; destino: string; sentido: number };
type SecaoMeta = { tipo: 'f32' | 'i32' | 'u32' | 'u16' | 'u8'; offset: number; n: number };

export type Cabecalho = {
  formato: 'rvx';
  versao: number;
  gerado_em: string;
  rede: { nome: string; sintetica: boolean; fonte: string; versao_feed: string };
  fuso: string;
  pontos: { ids: string[]; nomes: string[] };
  linhas: LinhaMeta[];
  padroes: PadraoMeta[];
  servicos: ServicoMeta[];
  caminhada: { metodo: string; fator: number; velocidade_ms: number; raio_transferencia_m: number; estimativa: boolean };
  scoring: Record<string, unknown>;
  secoes: Record<string, SecaoMeta>;
};

export type Rede = {
  cab: Cabecalho;
  nPontos: number;
  nPadroes: number;
  pontoLat: Float32Array;
  pontoLon: Float32Array;
  padraoLinha: Uint32Array;
  padraoPontosIni: Uint32Array;
  padraoPontos: Uint32Array;
  padraoViagensIni: Uint32Array;
  padraoTemposIni: Uint32Array;
  viagemServico: Uint16Array;
  chegada: Int32Array;
  partida: Int32Array;
  pontoPadroesIni: Uint32Array;
  pontoPadroes: Uint32Array;
  pontoPadroesPos: Uint32Array;
  transfIni: Uint32Array;
  transfPara: Uint32Array;
  transfS: Uint16Array;
};

const CTOR = { f32: Float32Array, i32: Int32Array, u32: Uint32Array, u16: Uint16Array, u8: Uint8Array } as const;

export class FormatoInvalido extends Error {}

export function lerCabecalho(buf: ArrayBuffer): { cab: Cabecalho; inicioDados: number } {
  if (buf.byteLength < 8) throw new FormatoInvalido('arquivo curto demais');
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  if (magic !== 'RVX1') throw new FormatoInvalido('não é um pacote .rvx');
  const n = new DataView(buf).getUint32(4, true);
  const cab = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n))) as Cabecalho;
  if (cab.versao !== 1) throw new FormatoInvalido(`versão ${cab.versao} não suportada`);
  return { cab, inicioDados: Math.ceil((8 + n) / 8) * 8 };
}

export function lerRede(buf: ArrayBuffer): Rede {
  if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) {
    throw new FormatoInvalido('plataforma big-endian não suportada');
  }
  const { cab, inicioDados } = lerCabecalho(buf);
  const sec = <K extends keyof typeof CTOR>(nome: string, tipo: K): InstanceType<(typeof CTOR)[K]> => {
    const s = cab.secoes[nome];
    if (!s) throw new FormatoInvalido(`seção ausente: ${nome}`);
    if (s.tipo !== tipo) throw new FormatoInvalido(`seção ${nome}: tipo ${s.tipo}, esperado ${tipo}`);
    const C = CTOR[tipo];
    const fim = inicioDados + s.offset + s.n * C.BYTES_PER_ELEMENT;
    if (fim > buf.byteLength) throw new FormatoInvalido(`seção ${nome} fora do arquivo`);
    return new C(buf, inicioDados + s.offset, s.n) as InstanceType<(typeof CTOR)[K]>;
  };
  const rede: Rede = {
    cab,
    nPontos: cab.pontos.ids.length,
    nPadroes: cab.padroes.length,
    pontoLat: sec('ponto_lat', 'f32'),
    pontoLon: sec('ponto_lon', 'f32'),
    padraoLinha: sec('padrao_linha', 'u32'),
    padraoPontosIni: sec('padrao_pontos_ini', 'u32'),
    padraoPontos: sec('padrao_pontos', 'u32'),
    padraoViagensIni: sec('padrao_viagens_ini', 'u32'),
    padraoTemposIni: sec('padrao_tempos_ini', 'u32'),
    viagemServico: sec('viagem_servico', 'u16'),
    chegada: sec('chegada', 'i32'),
    partida: sec('partida', 'i32'),
    pontoPadroesIni: sec('ponto_padroes_ini', 'u32'),
    pontoPadroes: sec('ponto_padroes', 'u32'),
    pontoPadroesPos: sec('ponto_padroes_pos', 'u32'),
    transfIni: sec('transf_ini', 'u32'),
    transfPara: sec('transf_para', 'u32'),
    transfS: sec('transf_s', 'u16'),
  };
  if (rede.pontoLat.length !== rede.nPontos || rede.padraoPontosIni.length !== rede.nPadroes + 1) {
    throw new FormatoInvalido('tamanhos inconsistentes');
  }
  return rede;
}
