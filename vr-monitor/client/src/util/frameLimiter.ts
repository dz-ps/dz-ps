/**
 * Limita o render a `targetFps` mesmo quando a taxa do display não é múltipla do alvo
 * (ex.: monitor de 75 Hz, celular a 120 Hz). Usa um "próximo instante devido" acumulado,
 * em vez de comparar com o último frame (que pulava um sim, um não: 75 Hz → 37.5 fps).
 */
export class FrameLimiter {
  private nextDue = -Infinity;
  private readonly period: number;

  /** `targetFps <= 0` = sem limite. `toleranceMs` absorve o jitter do rAF. */
  constructor(targetFps: number, private readonly toleranceMs = 1.5) {
    this.period = targetFps > 0 ? 1000 / targetFps : 0;
  }

  shouldRender(now: number): boolean {
    if (this.period === 0) return true;
    if (now < this.nextDue - this.toleranceMs) return false;
    this.nextDue = Math.max(this.nextDue + this.period, now - this.period / 2);
    // atrasou muito (aba em segundo plano etc.): não tenta compensar com rajada
    if (this.nextDue < now) this.nextDue = now + this.period;
    return true;
  }
}
