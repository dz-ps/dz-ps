import { describe, expect, it } from 'vitest';
import vectors from '../../protocol-fixtures/vectors.json';
import {
  HEADER_SIZE, MsgType, ProtocolError, decodeConfigPayload, decodeVideoMessage,
  encodeConfigPayload, encodeVideoMessage, bytesEqual,
} from '../src/net/protocol';

const hex = (h: string): Uint8Array => new Uint8Array(h.match(/../g)!.map((b) => parseInt(b, 16)));
const toHex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

describe('video protocol v1', () => {
  it('decodes the FRAME vector', () => {
    const v = vectors.frame;
    const m = decodeVideoMessage(hex(v.hex));
    expect(m.header).toEqual({ type: MsgType.Frame, displayId: v.displayId, flags: v.flags, seq: v.seq, captureTimeUs: v.captureTimeUs, sendTimeUs: v.sendTimeUs });
    expect(toHex(m.payload)).toBe(v.payloadHex);
  });

  it('encodes the FRAME vector byte-exact', () => {
    const v = vectors.frame;
    const out = encodeVideoMessage({ type: MsgType.Frame, displayId: v.displayId, flags: v.flags, seq: v.seq, captureTimeUs: v.captureTimeUs, sendTimeUs: v.sendTimeUs }, hex(v.payloadHex));
    expect(toHex(out)).toBe(v.hex);
  });

  it('round-trips the CONFIG vector', () => {
    const v = vectors.config;
    const m = decodeVideoMessage(hex(v.hex));
    expect(m.header.type).toBe(MsgType.Config);
    const c = decodeConfigPayload(m.payload);
    expect(c.width).toBe(v.width);
    expect(c.height).toBe(v.height);
    expect(c.codec).toBe(v.codec);
    expect(toHex(c.avcc)).toBe(v.avccHex);
    const re = encodeVideoMessage(m.header, encodeConfigPayload(c));
    expect(toHex(re)).toBe(v.hex);
  });

  it('payload is a zero-copy view', () => {
    const buf = hex(vectors.frame.hex);
    const m = decodeVideoMessage(buf);
    expect(m.payload.buffer).toBe(buf.buffer);
    expect(m.payload.byteOffset).toBe(HEADER_SIZE);
  });

  it('rejects malformed messages', () => {
    expect(() => decodeVideoMessage(new Uint8Array(10))).toThrow(ProtocolError);
    const bad = hex(vectors.frame.hex); bad[0] = 0;
    expect(() => decodeVideoMessage(bad)).toThrow(/magic/);
    const badVer = hex(vectors.frame.hex); badVer[2] = 9;
    expect(() => decodeVideoMessage(badVer)).toThrow(/version/);
    const badType = hex(vectors.frame.hex); badType[3] = 7;
    expect(() => decodeVideoMessage(badType)).toThrow(/type/);
    expect(() => decodeConfigPayload(new Uint8Array([0, 5, 0, 3, 2]))).toThrow(ProtocolError);
  });

  it('bytesEqual', () => {
    expect(bytesEqual(hex('0102'), hex('0102'))).toBe(true);
    expect(bytesEqual(hex('0102'), hex('0103'))).toBe(false);
    expect(bytesEqual(hex('01'), null)).toBe(false);
  });
});
