import type { DraftInput } from '../schemas/ai.ts';

/** Canonical JSON (sorted keys) so equal inputs always produce the same cache key. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Cache identity for a draft analysis (spec §6.2: patch + comp + my champion + role + elo). */
export function draftCacheMaterial(
  input: DraftInput,
  extra: { kind: string; model: string; promptVersion: string; bundleHash: string },
): string {
  return canonicalJson({
    ...extra,
    patch: input.patch,
    enemies: [...input.enemies].sort(),
    allies: [...input.allies].sort(),
    my_champion: input.my_champion,
    my_role: input.my_role,
    elo: input.elo,
    style: [...input.style].map((s) => s.toLowerCase()).sort(),
  });
}

export async function sha256Hex(
  text: string,
  digest: (data: Uint8Array) => Promise<ArrayBuffer>,
): Promise<string> {
  const bytes = new Uint8Array(await digest(new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
