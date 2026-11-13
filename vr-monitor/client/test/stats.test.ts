import { describe, expect, it } from 'vitest';
import { RateCounter, RollingWindow, SustainedDropDetector } from '../src/util/stats';

describe('stats utils', () => {
  it('RollingWindow quantiles', () => {
    const w = new RollingWindow(100);
    for (let i = 1; i <= 100; i++) w.push(i);
    expect(w.median()).toBe(51);
    expect(w.p95()).toBe(96);
    w.push(NaN);
    expect(w.count).toBe(100);
  });
  it('RateCounter', () => {
    const r = new RateCounter(1000);
    for (let t = 0; t < 1000; t += 1000 / 60) r.tick(t);
    expect(r.rate(999)).toBeCloseTo(60, -1);
    expect(r.rate(5000)).toBe(0);
  });
  it('SustainedDropDetector', () => {
    const d = new SustainedDropDetector(5000);
    expect(d.update(0, 40, 54)).toBe(false);
    expect(d.update(4999, 40, 54)).toBe(false);
    expect(d.update(5000, 40, 54)).toBe(true);
    expect(d.update(5100, 60, 54)).toBe(false);
    expect(d.update(5200, 40, 54)).toBe(false);
  });
});
