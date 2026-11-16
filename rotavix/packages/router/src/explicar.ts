import type { Motivo } from './planejador';

/** Texto em PT-BR de cada motivo. A explicação vem sempre dos dados do motivo. */
export function explicar(m: Motivo): string {
  switch (m.tipo) {
    case 'mais_rapida':
      return m.minutosAMenos ? `Chega ${m.minutosAMenos} min antes da alternativa` : 'A que chega mais cedo';
    case 'menos_baldeacoes':
      return m.baldeacoes === 0 ? 'Sem baldeação' : `Só ${m.baldeacoes} baldeação${m.baldeacoes > 1 ? 'ões' : ''}`;
    case 'menos_caminhada':
      return m.minutos === 0 ? 'Sem caminhada' : `Menos caminhada: ${m.minutos} min a pé`;
    case 'direta':
      return 'Uma condução só, sem baldeação';
    case 'usa_aquaviario':
      return `Aquaviário ${m.de} → ${m.para}`;
    case 'baldeacao':
      return m.folgaMin <= 3
        ? `Baldeação apertada em ${m.ponto}: ${m.folgaMin} min de folga`
        : `Baldeação em ${m.ponto} com ${m.folgaMin} min de folga`;
    case 'pela_tabela':
      return 'Pela tabela: horários programados, sem trânsito ao vivo';
    case 'caminhada_estimada':
      return 'Caminhada estimada em linha reta';
    case 'rede_sintetica':
      return 'Rede sintética de teste: não use para viajar';
  }
}
