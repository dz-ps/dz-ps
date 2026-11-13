import { ClockSync } from './clock';
import { SUBPROTOCOL, authSubprotocol, parseHostMessage, type ClientMessage, type HostMessage } from './protocol';

export function wsUrl(path: string): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}${path}`;
}

export interface ControlHandlers {
  onMessage(m: HostMessage): void;
  onStatus(s: 'connecting' | 'open' | 'closed'): void;
}

/** Canal de controle JSON com reconexão e ping/pong para sync de relógio. */
export class ControlClient {
  readonly clock = new ClockSync();
  private ws: WebSocket | null = null;
  private pingId = 0;
  private pending = new Map<number, number>();
  private pingTimer: number | undefined;
  private backoffMs = 500;
  private stopped = false;

  constructor(private readonly token: string, private readonly h: ControlHandlers) {}

  connect(): void {
    this.stopped = false;
    this.h.onStatus('connecting');
    const ws = new WebSocket(wsUrl('/ws/control'), [SUBPROTOCOL, authSubprotocol(this.token)]);
    this.ws = ws;
    ws.onopen = () => {
      this.backoffMs = 500;
      this.h.onStatus('open');
      this.send({ t: 'hello', client: { ua: navigator.userAgent, screenW: screen.width, screenH: screen.height, dpr: devicePixelRatio } });
      this.startPings();
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      const m = parseHostMessage(ev.data);
      if (!m) return;
      if (m.t === 'pong') {
        const c0 = this.pending.get(m.id);
        if (c0 !== undefined) {
          this.pending.delete(m.id);
          this.clock.addSample(c0, performance.now(), m.h);
        }
      }
      this.h.onMessage(m);
    };
    ws.onclose = () => {
      this.stopPings();
      this.h.onStatus('closed');
      if (this.ws === ws) this.ws = null;
      if (!this.stopped) {
        setTimeout(() => this.connect(), this.backoffMs);
        this.backoffMs = Math.min(this.backoffMs * 2, 5000);
      }
    };
  }

  close(): void {
    this.stopped = true;
    this.ws?.close();
  }

  send(m: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  private ping(): void {
    const id = ++this.pingId;
    const c0 = performance.now();
    this.pending.set(id, c0);
    if (this.pending.size > 50) this.pending.delete(this.pending.keys().next().value!);
    this.send({ t: 'ping', id, c0 });
  }

  private startPings(): void {
    this.stopPings();
    // rajada inicial para sincronizar rápido, depois 1 Hz
    let burst = 5;
    const tick = () => {
      this.ping();
      this.pingTimer = window.setTimeout(tick, burst-- > 0 ? 100 : 1000);
    };
    tick();
  }

  private stopPings(): void {
    if (this.pingTimer !== undefined) clearTimeout(this.pingTimer);
    this.pingTimer = undefined;
  }
}
