// Identidade do app em um só lugar: troque nome, ícone e paleta aqui.
// Não usar nada que lembre Transcol, GVBus, Ceturb, Semobi ou Ônibus GV.
import type { Paleta } from '@rotavix/ui';

export const brand = {
  nome: 'RotaVix',
  nomeCurto: 'RotaVix',
  descricao: 'Rotas de ônibus e Aquaviário na Grande Vitória que desviam do trânsito, inclusive offline.',
  /** ID do app Android. TODO: trocar por um domínio seu antes de publicar na Play Store. */
  appId: 'app.rotavix.dev',
  icone: '/icons/icon.svg',
  aviso: 'App independente. Horários e posições podem divergir; confira os canais oficiais.',
  /** Litoral capixaba: azul-oceano profundo (primária) e coral de pôr do sol (destaque). */
  paleta: {
    primaria: { claro: '#0B5A7A', escuro: '#5BB8DD' },
    destaque: { claro: '#E8604F', escuro: '#FF8E7E' },
  } satisfies Paleta,
} as const;

export type Brand = typeof brand;
