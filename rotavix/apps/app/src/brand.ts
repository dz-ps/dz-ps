// Identidade do app em um só lugar. Trocar nome/ícone/paleta aqui.
// Não usar nada que lembre Transcol, GVBus, Ceturb, Semobi ou Ônibus GV.
export const brand = {
  nome: 'RotaVix',
  nomeCurto: 'RotaVix',
  slogan: 'Rotas que desviam do trânsito',
  icone: '/icons/icon.svg',
  aviso: 'App independente. Horários e posições podem divergir; confira os canais oficiais.',
  paleta: {
    primaria: '#0E7C66',   // verde-mar
    secundaria: '#F2A541', // âmbar (alertas leves)
    perigo: '#D64545',
    fundoClaro: '#F7F8F7',
    fundoEscuro: '#0F1514',
    // Fonte do dado na UI (SPEC §3.2): visual distinto por origem.
    fonte: {
      aoVivo: '#0E7C66',
      colaborativo: '#2F80ED',
      tabela: '#8A94A6',
      simulador: '#9B51E0',
    },
  },
} as const;

export type Brand = typeof brand;
