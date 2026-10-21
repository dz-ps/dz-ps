import { ROLES, type Role } from '../schemas/common.ts';
import type { UserBuild } from '../rules/types.ts';

/**
 * Offline share links: a build is encoded as versioned, compact JSON in base64url (IDs only, no names), e.g.
 * riftbuild://b/<code>. Decoding validates shape; catalog validation happens in the app afterwards.
 */
type Payload = {
  v: 1;
  p: string;
  c: string | null;
  r: Role | null;
  i: (string | null)[];
  k: string | null;
  pp: string | null;
  pr: (string | null)[];
  s2: string | null;
  sp: [string | null, string | null];
  so: string[];
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function fromUtf8(bytes: number[]): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    const at = (k: number) => bytes[i + k]! & 63;
    let c: number;
    let size: number;
    if (b < 0x80) {
      c = b;
      size = 1;
    } else if (b < 0xe0) {
      c = ((b & 31) << 6) | at(1);
      size = 2;
    } else if (b < 0xf0) {
      c = ((b & 15) << 12) | (at(1) << 6) | at(2);
      size = 3;
    } else {
      c = ((b & 7) << 18) | (at(1) << 12) | (at(2) << 6) | at(3);
      size = 4;
    }
    out += String.fromCodePoint(c);
    i += size;
  }
  return out;
}

function toBase64Url(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = [
      ALPHABET[(n >> 18) & 63],
      ALPHABET[(n >> 12) & 63],
      ALPHABET[(n >> 6) & 63],
      ALPHABET[n & 63],
    ];
    out += chars.slice(0, i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2).join('');
  }
  return out;
}

function fromBase64Url(text: string): number[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('invalid character');
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return bytes;
}

export function encodeBuild(build: UserBuild, patch: string): string {
  const payload: Payload = {
    v: 1,
    p: patch,
    c: build.championId,
    r: build.role,
    i: build.items,
    k: build.runes.keystone,
    pp: build.runes.primaryPath,
    pr: build.runes.primary,
    s2: build.runes.secondary,
    sp: build.spells,
    so: build.skillOrder,
  };
  return toBase64Url(utf8(JSON.stringify(payload)));
}

const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9_]{1,40}$/.test(v);
const idOrNull = (v: unknown) => (v === null ? null : isId(v) ? v : undefined);

export function decodeBuild(code: string): { build: UserBuild; patch: string } | null {
  try {
    const p = JSON.parse(fromUtf8(fromBase64Url(code))) as Payload;
    if (p.v !== 1 || typeof p.p !== 'string' || !Array.isArray(p.i) || p.i.length > 8) return null;
    const items = p.i.map(idOrNull);
    const primary = (p.pr ?? []).map(idOrNull);
    const spells = (p.sp ?? []).map(idOrNull);
    if ([...items, ...primary, ...spells].some((x) => x === undefined)) return null;
    const role = p.r === null || (ROLES as readonly string[]).includes(p.r) ? p.r : null;
    return {
      patch: p.p,
      build: {
        championId: idOrNull(p.c) ?? null,
        role,
        items: items as (string | null)[],
        runes: {
          keystone: idOrNull(p.k) ?? null,
          primaryPath: idOrNull(p.pp) ?? null,
          primary: primary as (string | null)[],
          secondary: idOrNull(p.s2) ?? null,
        },
        spells: [spells[0] ?? null, spells[1] ?? null] as [string | null, string | null],
        skillOrder: Array.isArray(p.so)
          ? p.so.filter((k) => ['Q', 'W', 'E', 'R'].includes(k)).slice(0, 4)
          : [],
        purchaseOrder: [],
      },
    };
  } catch {
    return null;
  }
}
