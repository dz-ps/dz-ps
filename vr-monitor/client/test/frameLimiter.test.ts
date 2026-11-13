import { describe, expect, it } from 'vitest';
import { FrameLimiter } from '../src/util/frameLimiter';

function simulate(displayHz: number, target: number, seconds = 5, jitterMs = 0): number {
  const l = new FrameLimiter(target);
  let n = 0;
  const dt = 1000 / displayHz;
  for (let i = 0; i < displayHz * seconds; i++) {
    const jitter = jitterMs ? (Math.sin(i * 12.9898) * 43758.5453 % 1) * jitterMs : 0;
    if (l.shouldRender(i * dt + jitter)) n++;
  }
  return n / seconds;
}

describe('FrameLimiter', () => {
  it('60 Hz display → 60 fps, mesmo com jitter', () => {
    expect(simulate(60, 60)).toBeCloseTo(60, 0);
    expect(simulate(60, 60, 5, 1)).toBeGreaterThan(59);
  });
  it('75 Hz display → ~60 fps (antes dava 37.5)', () => {
    expect(simulate(75, 60)).toBeGreaterThan(59);
    expect(simulate(75, 60)).toBeLessThan(61);
  });
  it('120 Hz display → 60 fps; alvo 90 → ~90', () => {
    expect(simulate(120, 60)).toBeCloseTo(60, 0);
    expect(simulate(120, 90)).toBeGreaterThan(85);
    expect(simulate(120, 90)).toBeLessThan(91);
  });
  it('display mais lento que o alvo → todos os frames', () => {
    expect(simulate(50, 60)).toBeCloseTo(50, 0);
  });
  it('sem limite', () => {
    expect(simulate(144, 0)).toBeCloseTo(144, 0);
  });
});
