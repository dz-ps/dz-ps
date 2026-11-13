// Janelas deslizantes e contadores usados no HUD de estatísticas.

export class RollingWindow {
  private buf: number[] = [];
  constructor(private readonly size = 120) {}
  push(v: number): void {
    if (!Number.isFinite(v)) return;
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
  }
  get count(): number { return this.buf.length; }
  clear(): void { this.buf = []; }
  quantile(q: number): number {
    if (this.buf.length === 0) return NaN;
    const s = [...this.buf].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]!;
  }
  median(): number { return this.quantile(0.5); }
  p95(): number { return this.quantile(0.95); }
  mean(): number { return this.buf.length ? this.buf.reduce((a, b) => a + b, 0) / this.buf.length : NaN; }
}

/** Eventos por segundo numa janela de `windowMs`. */
export class RateCounter {
  private times: number[] = [];
  constructor(private readonly windowMs = 1000) {}
  tick(now: number): void {
    this.times.push(now);
    this.trim(now);
  }
  rate(now: number): number {
    this.trim(now);
    return (this.times.length * 1000) / this.windowMs;
  }
  private trim(now: number): void {
    const min = now - this.windowMs;
    let i = 0;
    while (i < this.times.length && this.times[i]! < min) i++;
    if (i) this.times.splice(0, i);
  }
}

/** Soma de bytes por segundo → kbps. */
export class BitrateCounter {
  private items: { t: number; bytes: number }[] = [];
  constructor(private readonly windowMs = 1000) {}
  add(now: number, bytes: number): void { this.items.push({ t: now, bytes }); this.trim(now); }
  kbps(now: number): number {
    this.trim(now);
    return (this.items.reduce((s, x) => s + x.bytes, 0) * 8) / this.windowMs;
  }
  private trim(now: number): void {
    const min = now - this.windowMs;
    while (this.items.length && this.items[0]!.t < min) this.items.shift();
  }
}

/**
 * Detecta queda sustentada (sinal de throttling térmico): fica `true` quando `value < threshold`
 * por pelo menos `holdMs` seguidos, e volta a `false` quando se recupera.
 */
export class SustainedDropDetector {
  private belowSince: number | null = null;
  constructor(private readonly holdMs = 5000) {}
  update(now: number, value: number, threshold: number): boolean {
    if (value < threshold) {
      if (this.belowSince === null) this.belowSince = now;
      return now - this.belowSince >= this.holdMs;
    }
    this.belowSince = null;
    return false;
  }
  reset(): void { this.belowSince = null; }
}
