import { describe, expect, it } from 'vitest';
import { ClockSync } from '../src/net/clock';

describe('ClockSync', () => {
  it('estimates offset with symmetric delay', () => {
    const c = new ClockSync();
    // host = client + 5_000_000 µs; 10 ms ida e 10 ms volta
    const c0 = 1000, c1 = 1020;
    const hostAtMid = (c0 + 10) * 1000 + 5_000_000;
    c.addSample(c0, c1, hostAtMid);
    expect(c.offsetUs).toBeCloseTo(5_000_000, 0);
    expect(c.rttMs).toBe(20);
    expect(c.hostNowUs(2000)).toBeCloseTo(2_000_000 + 5_000_000, 0);
    expect(c.toClientMs(7_000_000)).toBeCloseTo(2000, 6);
  });

  it('prefers the lowest-RTT sample', () => {
    const c = new ClockSync(5);
    c.addSample(0, 100, 50 * 1000 + 30_000 + 1); // assimétrico, RTT alto → erro de 30 ms
    c.addSample(200, 204, 202 * 1000 + 1);       // RTT baixo, exato
    expect(c.rttMs).toBe(4);
    expect(c.offsetUs).toBeCloseTo(1, 0);
  });

  it('forgets samples outside the window', () => {
    const c = new ClockSync(2);
    c.addSample(0, 2, 1000);      // melhor RTT, mas vai sair da janela
    c.addSample(10, 20, 15_000);
    c.addSample(30, 40, 35_000);
    expect(c.rttMs).toBe(10);
  });
});
