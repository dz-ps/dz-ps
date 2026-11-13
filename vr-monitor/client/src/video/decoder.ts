import { Flags, MsgType, bytesEqual, decodeConfigPayload, type ConfigPayload, type VideoMessage } from '../net/protocol';
import { BitrateCounter, RateCounter, RollingWindow } from '../util/stats';

export type HwMode = 'auto' | 'prefer-hardware' | 'prefer-software';
type ConcreteMode = Exclude<HwMode, 'auto'>;

export interface DecodedFrame {
  frame: VideoFrame;
  captureTimeUs: number;
  sendTimeUs: number;
  recvMs: number;
  decodedMs: number;
}

interface FrameMeta { sendTimeUs: number; recvMs: number; submitMs: number }

export interface DecoderStats {
  mode: string;
  recvFps: number;
  decodedFps: number;
  decodeMsMedian: number;
  decodeMsP95: number;
  queue: number;
  dropped: number;
  errors: number;
  kbps: number;
  width: number;
  height: number;
}

const AUTO_SAMPLE_FRAMES = 90;
const MAX_QUEUE = 2;
const KEYFRAME_REQUEST_INTERVAL_MS = 250;

/**
 * Decoder de um stream. Recebe mensagens do protocolo, mantém só o VideoFrame mais recente
 * (o anterior é fechado na hora) e se recupera de erros pedindo keyframe.
 *
 * Modo `auto`: mede `prefer-hardware` e depois `prefer-software` com o stream real e fica com o
 * de menor p95 de decode (no Poco X7 Pro o software ganhou no benchmark sintético).
 */
export class StreamDecoder {
  private decoder: VideoDecoder | null = null;
  private config: ConfigPayload | null = null;
  private configuredMode: ConcreteMode | null = null;
  private waitingKeyframe = true;
  private latest: DecodedFrame | null = null;
  private meta = new Map<number, FrameMeta>();
  private lastKeyReq = -Infinity;
  private lastFailMs = -Infinity;
  private retryTimer: number | undefined;

  private autoPhase: 'hw' | 'sw' | 'locked';
  private autoResults: Partial<Record<ConcreteMode, number>> = {};
  private mode: ConcreteMode;

  private readonly recvRate = new RateCounter();
  private readonly decRate = new RateCounter();
  private readonly decodeMs = new RollingWindow(120);
  private readonly phaseDecodeMs = new RollingWindow(AUTO_SAMPLE_FRAMES);
  private readonly bitrate = new BitrateCounter();
  dropped = 0;
  errors = 0;

  constructor(
    readonly displayId: number,
    private readonly requestedMode: HwMode,
    private readonly requestKeyframe: () => void,
  ) {
    this.autoPhase = requestedMode === 'auto' ? 'hw' : 'locked';
    this.mode = requestedMode === 'auto' ? 'prefer-hardware' : requestedMode;
  }

  handle(msg: VideoMessage, recvMs: number, bytes: number): void {
    this.bitrate.add(recvMs, bytes);
    if (msg.header.type === MsgType.Config) {
      const c = decodeConfigPayload(msg.payload);
      const changed = !this.config || !bytesEqual(this.config.avcc, c.avcc) || this.config.width !== c.width || this.config.height !== c.height || this.config.codec !== c.codec;
      if (changed) {
        // copia: o payload é uma view sobre o buffer do WebSocket
        this.config = { ...c, avcc: c.avcc.slice() };
        this.configure();
      } else if (!this.decoder || this.decoder.state !== 'configured' || this.configuredMode !== this.mode) {
        this.configure();
      }
      return;
    }

    this.recvRate.tick(recvMs);
    const key = (msg.header.flags & Flags.keyframe) !== 0;
    const dec = this.decoder;
    if (!this.config || !dec || dec.state !== 'configured') {
      this.dropped++;
      this.askKeyframe(recvMs);
      return;
    }
    if (this.waitingKeyframe && !key) { this.dropped++; this.askKeyframe(recvMs); return; }
    if (!key && dec.decodeQueueSize > MAX_QUEUE) {
      // fila crescendo: descarta até o próximo keyframe em vez de acumular latência
      this.dropped++;
      this.waitingKeyframe = true;
      this.askKeyframe(recvMs);
      return;
    }
    this.waitingKeyframe = false;
    const ts = msg.header.captureTimeUs;
    this.meta.set(ts, { sendTimeUs: msg.header.sendTimeUs, recvMs, submitMs: performance.now() });
    if (this.meta.size > 64) this.meta.delete(this.meta.keys().next().value!);
    try {
      dec.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: ts, data: msg.payload }));
    } catch (e) {
      this.fail(e);
    }
  }

  /** Pega o frame mais recente (quem chama é dono dele e deve chamar `frame.close()`). */
  takeLatest(): DecodedFrame | null {
    const l = this.latest;
    this.latest = null;
    return l;
  }

  stats(now: number): DecoderStats {
    const label = this.requestedMode === 'auto'
      ? `auto:${this.autoPhase === 'locked' ? this.mode : 'medindo ' + this.mode}`
      : this.mode;
    return {
      mode: label,
      recvFps: this.recvRate.rate(now),
      decodedFps: this.decRate.rate(now),
      decodeMsMedian: this.decodeMs.median(),
      decodeMsP95: this.decodeMs.p95(),
      queue: this.decoder?.decodeQueueSize ?? 0,
      dropped: this.dropped,
      errors: this.errors,
      kbps: this.bitrate.kbps(now),
      width: this.config?.width ?? 0,
      height: this.config?.height ?? 0,
    };
  }

  get autoSummary(): Partial<Record<ConcreteMode, number>> { return { ...this.autoResults }; }

  close(): void {
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.latest?.frame.close();
    this.latest = null;
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    this.decoder = null;
  }

  // ---------------------------------------------------------------------------

  private configure(): void {
    if (!this.config) return;
    if (!this.decoder || this.decoder.state === 'closed') {
      this.decoder = new VideoDecoder({ output: (f) => this.onOutput(f), error: (e) => this.fail(e) });
    }
    const cfg: VideoDecoderConfig = {
      codec: this.config.codec,
      description: this.config.avcc,
      codedWidth: this.config.width,
      codedHeight: this.config.height,
      hardwareAcceleration: this.mode,
      optimizeForLatency: true,
    };
    try {
      this.decoder.configure(cfg);
      this.configuredMode = this.mode;
      this.waitingKeyframe = true;
    } catch (e) {
      // sem recursão em fail(): o próximo CONFIG/keyframe tenta de novo
      this.errors++;
      console.warn('decoder configure failed', cfg, e);
      this.decoder.close();
      this.decoder = null;
    }
  }

  private onOutput(frame: VideoFrame): void {
    const now = performance.now();
    const m = this.meta.get(frame.timestamp);
    this.meta.delete(frame.timestamp);
    this.decRate.tick(now);
    if (m) {
      const d = now - m.submitMs;
      this.decodeMs.push(d);
      this.phaseDecodeMs.push(d);
    }
    this.latest?.frame.close();
    this.latest = {
      frame,
      captureTimeUs: frame.timestamp,
      sendTimeUs: m?.sendTimeUs ?? NaN,
      recvMs: m?.recvMs ?? NaN,
      decodedMs: now,
    };
    this.advanceAuto();
  }

  private advanceAuto(): void {
    if (this.autoPhase === 'locked' || this.phaseDecodeMs.count < AUTO_SAMPLE_FRAMES) return;
    this.autoResults[this.mode] = this.phaseDecodeMs.p95();
    this.phaseDecodeMs.clear();
    if (this.autoPhase === 'hw') {
      this.autoPhase = 'sw';
      this.switchMode('prefer-software');
    } else {
      this.autoPhase = 'locked';
      const hw = this.autoResults['prefer-hardware'] ?? Infinity;
      const sw = this.autoResults['prefer-software'] ?? Infinity;
      // empate técnico (±1 ms) → hardware, que gasta menos bateria/CPU
      const best: ConcreteMode = hw <= sw + 1 ? 'prefer-hardware' : 'prefer-software';
      console.info('decoder auto-select', this.autoResults, '→', best);
      if (best !== this.mode) this.switchMode(best);
    }
  }

  private switchMode(m: ConcreteMode): void {
    this.mode = m;
    this.decodeMs.clear();
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    this.decoder = null;
    this.configure();
    this.askKeyframe(performance.now(), true);
  }

  private fail(e: unknown): void {
    this.errors++;
    console.warn(`decoder error (display ${this.displayId}, ${this.mode})`, e);
    const unsupported = e instanceof DOMException && (e.name === 'NotSupportedError' || /unsupported/i.test(e.message));
    if (this.mode === 'prefer-hardware' && this.requestedMode === 'auto' && (unsupported || this.errors >= 3)) {
      // hardware instável: trava no software
      this.autoPhase = 'locked';
      this.mode = 'prefer-software';
    }
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    this.decoder = null;
    // erros em rajada (config que o aparelho rejeita de forma assíncrona) → espera antes de tentar
    const now = performance.now();
    const burst = now - this.lastFailMs < 500;
    this.lastFailMs = now;
    if (burst) {
      if (this.retryTimer === undefined) {
        this.retryTimer = window.setTimeout(() => { this.retryTimer = undefined; this.configure(); this.askKeyframe(performance.now(), true); }, 1000);
      }
      return;
    }
    this.configure();
    this.askKeyframe(now, true);
  }

  private askKeyframe(now: number, force = false): void {
    if (!force && now - this.lastKeyReq < KEYFRAME_REQUEST_INTERVAL_MS) return;
    this.lastKeyReq = now;
    this.requestKeyframe();
  }
}
