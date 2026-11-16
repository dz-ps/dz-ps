import type { Lugar } from '@rotavix/router';
import { create } from 'zustand';
import type { InfoRede, OpcaoMapa } from './motor/worker';

export type LugarEscolhido = { rotulo: string; lugar: Lugar; lat: number; lon: number };
export type Quando = { tipo: 'agora' } | { tipo: 'em'; data: string; horaS: number };
export type Tema = 'auto' | 'claro' | 'escuro';

type Estado = {
  fase: 'iniciando' | 'baixando' | 'pronto' | 'erro';
  progresso: { pacote: string; recebidos: number; total: number } | null;
  erro: string | null;
  rede: InfoRede | null;
  mapaArquivo: File | null;
  online: boolean;
  origem: LugarEscolhido | null;
  destino: LugarEscolhido | null;
  quando: Quando;
  opcoes: OpcaoMapa[];
  selecionada: number;
  planejando: boolean;
  tema: Tema;
  definir: (p: Partial<Estado>) => void;
};

function temaSalvo(): Tema {
  try {
    const t = localStorage.getItem('rv-tema');
    return t === 'claro' || t === 'escuro' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export const useEstado = create<Estado>((set) => ({
  fase: 'iniciando',
  progresso: null,
  erro: null,
  rede: null,
  mapaArquivo: null,
  online: navigator.onLine,
  origem: null,
  destino: null,
  quando: { tipo: 'agora' },
  opcoes: [],
  selecionada: 0,
  planejando: false,
  tema: temaSalvo(),
  definir: (p) => set(p),
}));

export function aplicarTema(t: Tema): void {
  const raiz = document.documentElement;
  if (t === 'auto') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', t === 'escuro' ? 'dark' : 'light');
  try {
    localStorage.setItem('rv-tema', t);
  } catch {
    /* sem armazenamento: só nesta sessão */
  }
}

export function temaEfetivo(t: Tema): 'claro' | 'escuro' {
  if (t !== 'auto') return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}
