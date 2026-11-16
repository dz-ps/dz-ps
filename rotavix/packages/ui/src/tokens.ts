/**
 * Design tokens do RotaVix. A identidade (nome, primária, destaque) vem de apps/app/src/brand.ts;
 * aqui ficam a estrutura, os neutros, as cores semânticas e as cores por tipo de serviço.
 * Documentação: packages/ui/TOKENS.md.
 */
import { textoSobre } from './contraste';

export type Paleta = {
  /** Azul-oceano (cor primária). Uma variante para cada tema. */
  primaria: { claro: string; escuro: string };
  /** Coral (destaque). */
  destaque: { claro: string; escuro: string };
};

export type TipoServicoCor = 'troncal' | 'alimentadora' | 'aquaviario' | 'expresso' | 'municipal' | 'outro';

export type Tema = {
  fundo: string;
  superficie: string;
  superficie2: string;
  borda: string;
  texto: string;
  textoSuave: string;
  primaria: string;
  sobrePrimaria: string;
  destaque: string;
  sobreDestaque: string;
  foco: string;
  // Semânticas fixas (SPEC §7)
  noHorario: string;
  atrasado: string;
  incidente: string;
  lotacao: string;
  estimativa: string;
  // Mapa
  mapaRota: string;
  mapaPonto: string;
};

/** Fundo dos selos de linha (texto branco). Iguais nos dois temas para a linha ser reconhecível. */
export const CORES_SERVICO: Record<TipoServicoCor, string> = {
  troncal: '#1F4E9E',
  alimentadora: '#2E6B34',
  aquaviario: '#00707A',
  expresso: '#A3261E',
  municipal: '#5E4387',
  outro: '#4E5960',
};

export function criarTemas(p: Paleta): { claro: Tema; escuro: Tema } {
  const claro: Tema = {
    fundo: '#F3F6F8',
    superficie: '#FFFFFF',
    superficie2: '#EAF0F3',
    borda: '#D3DEE4',
    texto: '#0E1B22',
    textoSuave: '#465863',
    primaria: p.primaria.claro,
    sobrePrimaria: textoSobre(p.primaria.claro),
    destaque: p.destaque.claro,
    sobreDestaque: textoSobre(p.destaque.claro),
    foco: p.primaria.claro,
    noHorario: '#1B7A43',
    atrasado: '#A35F00',
    incidente: '#B42318',
    lotacao: '#6D44A8',
    estimativa: '#5A6A76',
    mapaRota: p.primaria.claro,
    mapaPonto: '#0E1B22',
  };
  const escuro: Tema = {
    fundo: '#081217',
    superficie: '#0F1C23',
    superficie2: '#172932',
    borda: '#263A44',
    texto: '#E6EFF3',
    textoSuave: '#9DB1BD',
    primaria: p.primaria.escuro,
    sobrePrimaria: textoSobre(p.primaria.escuro),
    destaque: p.destaque.escuro,
    sobreDestaque: textoSobre(p.destaque.escuro),
    foco: p.primaria.escuro,
    noHorario: '#4CC27E',
    atrasado: '#F0A43A',
    incidente: '#FF7A70',
    lotacao: '#B897EC',
    estimativa: '#93A5B2',
    mapaRota: p.primaria.escuro,
    mapaPonto: '#E6EFF3',
  };
  return { claro, escuro };
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const bloco = (t: Tema) => Object.entries(t).map(([k, v]) => `--rv-${kebab(k)}:${v};`).join('');
const servicos = Object.entries(CORES_SERVICO).map(([k, v]) => `--rv-linha-${k}:${v};`).join('');

/** CSS das variáveis: tema claro padrão, escuro automático e escolha manual via data-theme. */
export function cssVariaveis(p: Paleta): string {
  const { claro, escuro } = criarTemas(p);
  return [
    `:root{${bloco(claro)}${servicos}color-scheme:light}`,
    `:root[data-theme=dark]{${bloco(escuro)}color-scheme:dark}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme=light]){${bloco(escuro)}color-scheme:dark}}`,
  ].join('\n');
}
