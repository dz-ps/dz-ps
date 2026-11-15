import { describe, expect, it } from 'vitest';
import { nivelLotacao } from './lotacao';

describe('nivelLotacao', () => {
  it('reduz o enum GTFS-RT a 3 níveis', () => {
    expect(nivelLotacao('MANY_SEATS_AVAILABLE')).toBe('vazio');
    expect(nivelLotacao('STANDING_ROOM_ONLY')).toBe('em_pe');
    expect(nivelLotacao('FULL')).toBe('lotado');
  });
  it('sem dado não vira nível', () => {
    expect(nivelLotacao('NO_DATA_AVAILABLE')).toBeNull();
  });
});
