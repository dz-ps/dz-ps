// Protocolo de vídeo v1 (ver docs/ARCHITECTURE.md §4.3). Little-endian, header fixo de 28 bytes.

export const MAGIC = 0x4d56;
export const VERSION = 1;
export const HEADER_SIZE = 28;

export const enum MsgType {
  Config = 1,
  Frame = 2,
}

export const Flags = {
  keyframe: 1 << 0,
  repeat: 1 << 1,
} as const;

export interface VideoHeader {
  type: MsgType;
  displayId: number;
  flags: number;
  seq: number;
  captureTimeUs: number; // u64 no fio; cabe com folga em double (2^53 µs ≈ 285 anos)
  sendTimeUs: number;
}

export interface ConfigPayload {
  width: number;
  height: number;
  codec: string;
  avcc: Uint8Array;
}

export interface VideoMessage {
  header: VideoHeader;
  payload: Uint8Array; // view sobre o buffer original (sem cópia)
}

export class ProtocolError extends Error {}

export function decodeVideoMessage(buf: ArrayBuffer | Uint8Array): VideoMessage {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.byteLength < HEADER_SIZE) throw new ProtocolError(`message too short: ${bytes.byteLength}`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = dv.getUint16(0, true);
  if (magic !== MAGIC) throw new ProtocolError(`bad magic 0x${magic.toString(16)}`);
  const version = dv.getUint8(2);
  if (version !== VERSION) throw new ProtocolError(`unsupported version ${version}`);
  const type = dv.getUint8(3);
  if (type !== MsgType.Config && type !== MsgType.Frame) throw new ProtocolError(`unknown type ${type}`);
  return {
    header: {
      type,
      displayId: dv.getUint16(4, true),
      flags: dv.getUint16(6, true),
      seq: dv.getUint32(8, true),
      captureTimeUs: Number(dv.getBigUint64(12, true)),
      sendTimeUs: Number(dv.getBigUint64(20, true)),
    },
    payload: bytes.subarray(HEADER_SIZE),
  };
}

export function encodeVideoMessage(header: VideoHeader, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(HEADER_SIZE + payload.byteLength);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, MAGIC, true);
  dv.setUint8(2, VERSION);
  dv.setUint8(3, header.type);
  dv.setUint16(4, header.displayId, true);
  dv.setUint16(6, header.flags, true);
  dv.setUint32(8, header.seq >>> 0, true);
  dv.setBigUint64(12, BigInt(header.captureTimeUs), true);
  dv.setBigUint64(20, BigInt(header.sendTimeUs), true);
  out.set(payload, HEADER_SIZE);
  return out;
}

export function decodeConfigPayload(p: Uint8Array): ConfigPayload {
  if (p.byteLength < 5) throw new ProtocolError('config payload too short');
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const width = dv.getUint16(0, true);
  const height = dv.getUint16(2, true);
  const codecLen = dv.getUint8(4);
  if (p.byteLength < 5 + codecLen + 7) throw new ProtocolError('config payload truncated');
  const codec = String.fromCharCode(...p.subarray(5, 5 + codecLen));
  if (!/^avc1\.[0-9a-fA-F]{6}$/.test(codec)) throw new ProtocolError(`unexpected codec ${codec}`);
  const avcc = p.subarray(5 + codecLen);
  if (avcc[0] !== 1) throw new ProtocolError('avcC version != 1');
  return { width, height, codec, avcc };
}

export function encodeConfigPayload(c: ConfigPayload): Uint8Array {
  const codec = new TextEncoder().encode(c.codec);
  const out = new Uint8Array(5 + codec.byteLength + c.avcc.byteLength);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, c.width, true);
  dv.setUint16(2, c.height, true);
  dv.setUint8(4, codec.byteLength);
  out.set(codec, 5);
  out.set(c.avcc, 5 + codec.byteLength);
  return out;
}

export function bytesEqual(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): boolean {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------- canal de controle (JSON) ----------------

export interface DisplayInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  virtual: boolean;
  main: boolean;
}

export interface Permissions {
  screen: 'granted' | 'denied' | 'unknown';
  accessibility: 'granted' | 'denied' | 'unknown';
}

export interface VirtualCapability {
  available: boolean;
  reason?: string | null;
  max: number;
}

export type HostMessage =
  | { t: 'welcome'; proto: number; hostTimeUs: number; displays: DisplayInfo[]; permissions: Permissions; inputEnabled: boolean; virtualDisplays: VirtualCapability }
  | { t: 'pong'; id: number; c0: number; h: number }
  | { t: 'displays'; displays: DisplayInfo[] }
  | { t: 'error'; code: string; message: string };

export type ClientMessage =
  | { t: 'hello'; client: { ua: string; screenW: number; screenH: number; dpr: number } }
  | { t: 'ping'; id: number; c0: number }
  | { t: 'keyframe'; display: number }
  | { t: 'stream.config'; display: number; fps?: number; bitrateKbps?: number; active?: boolean }
  | { t: 'stats'; display: number; fps: number; decodeMs: number; e2eMs: number }
  | { t: 'display.create'; width: number; height: number; hiDPI?: boolean; name?: string }
  | { t: 'display.destroy'; display: number };

export function parseHostMessage(text: string): HostMessage | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || typeof (v as { t?: unknown }).t !== 'string') return null;
  return v as HostMessage;
}

export const SUBPROTOCOL = 'vrm.v1';
export const authSubprotocol = (token: string): string => `vrm.auth.${token}`;
