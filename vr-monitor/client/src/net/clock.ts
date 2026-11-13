// Sincronização de relógio estilo NTP sobre o canal de controle.
// offsetUs = hostUs - clientUs, onde clientUs = performance.now() * 1000.
// Usa a amostra de menor RTT da janela: é a que tem menor erro de assimetria.

export interface ClockSample { rttMs: number; offsetUs: number; atMs: number }

export class ClockSync {
  private samples: ClockSample[] = [];
  constructor(private readonly window = 20) {}

  addSample(c0Ms: number, c1Ms: number, hostUs: number): ClockSample {
    const s: ClockSample = { rttMs: c1Ms - c0Ms, offsetUs: hostUs - ((c0Ms + c1Ms) / 2) * 1000, atMs: c1Ms };
    this.samples.push(s);
    if (this.samples.length > this.window) this.samples.shift();
    return s;
  }

  private best(): ClockSample | null {
    let b: ClockSample | null = null;
    for (const s of this.samples) if (!b || s.rttMs < b.rttMs) b = s;
    return b;
  }

  get synced(): boolean { return this.samples.length > 0; }
  get offsetUs(): number { return this.best()?.offsetUs ?? NaN; }
  get rttMs(): number { return this.best()?.rttMs ?? NaN; }
  get lastRttMs(): number { return this.samples.at(-1)?.rttMs ?? NaN; }

  hostNowUs(perfNowMs: number): number { return perfNowMs * 1000 + this.offsetUs; }
  /** Converte um instante do host (µs) para o relógio do cliente (ms de performance.now). */
  toClientMs(hostUs: number): number { return (hostUs - this.offsetUs) / 1000; }
}
