import type { OccupancyStatus } from './types';

/** Os 3 níveis mostrados na UI (SPEC §3.3). */
export type NivelLotacao = 'vazio' | 'em_pe' | 'lotado';

export function nivelLotacao(s: OccupancyStatus): NivelLotacao | null {
  switch (s) {
    case 'EMPTY':
    case 'MANY_SEATS_AVAILABLE':
    case 'FEW_SEATS_AVAILABLE':
      return 'vazio';
    case 'STANDING_ROOM_ONLY':
      return 'em_pe';
    case 'CRUSHED_STANDING_ROOM_ONLY':
    case 'FULL':
    case 'NOT_ACCEPTING_PASSENGERS':
      return 'lotado';
    default:
      return null;
  }
}
