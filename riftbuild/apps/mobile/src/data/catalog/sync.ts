import { CatalogBundle, Manifest, MetaBundle, type ManifestEntry } from '@riftbuild/shared';
import { gunzipSync, strFromU8 } from 'fflate';
import type { StoredRelease } from '../store/types';

export type SyncDeps = {
  manifestUrl: string;
  fetchFn: typeof fetch;
  digest: (data: Uint8Array) => Promise<ArrayBuffer>;
  allowFixtures: boolean;
  allowPartial: boolean;
  now?: () => Date;
};

export type SyncResult =
  | { kind: 'unchanged'; release: StoredRelease; gamePatch: string }
  | { kind: 'updated'; release: StoredRelease; gamePatch: string }
  | { kind: 'empty'; gamePatch: string | null };

export class SyncError extends Error {
  constructor(
    message: string,
    readonly code: 'network' | 'integrity' | 'invalid' | 'refused',
  ) {
    super(message);
  }
}

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function resolveUrl(relative: string, base: string): string {
  return new URL(relative, base).toString();
}

async function download(entry: ManifestEntry, deps: SyncDeps): Promise<unknown> {
  const url = resolveUrl(entry.path, deps.manifestUrl);
  let bytes: Uint8Array;
  try {
    const res = await deps.fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    throw new SyncError(`falha ao baixar ${entry.path}: ${(err as Error).message}`, 'network');
  }
  // Servers may transparently decompress; accept both gzip and plain JSON bodies.
  const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  const digest = `sha256:${toHex(await deps.digest(raw))}`;
  if (digest !== entry.hash) {
    throw new SyncError(`hash não confere para ${entry.path}`, 'integrity');
  }
  return JSON.parse(strFromU8(raw));
}

/** Manifest/hash sync (DECISIONS.md D5): downloads only what changed, validates with zod, never half-applies. */
export async function syncRelease(
  current: StoredRelease | null,
  deps: SyncDeps,
): Promise<SyncResult> {
  let manifest: Manifest;
  try {
    const res = await deps.fetchFn(deps.manifestUrl, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = Manifest.parse(await res.json());
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError')
      throw new SyncError('manifest inválido', 'invalid');
    throw new SyncError(
      `sem conexão com o servidor de dados (${(err as Error).message})`,
      'network',
    );
  }
  const gamePatch = manifest.game_patch.version;
  if (!manifest.catalog)
    return current
      ? { kind: 'unchanged', release: current, gamePatch }
      : { kind: 'empty', gamePatch };

  const catalogChanged = current?.catalogHash !== manifest.catalog.hash;
  const metaChanged = (current?.metaHash ?? null) !== (manifest.meta?.hash ?? null);
  if (current && !catalogChanged && !metaChanged) {
    return { kind: 'unchanged', release: { ...current, manifest }, gamePatch };
  }

  let catalog = current?.catalog;
  if (catalogChanged || !catalog) {
    const parsed = CatalogBundle.safeParse(await download(manifest.catalog, deps));
    if (!parsed.success) throw new SyncError('catálogo não passou na validação', 'invalid');
    if (parsed.data.fixture && !deps.allowFixtures)
      throw new SyncError('pacote de teste recusado', 'refused');
    if (parsed.data.partial && !deps.allowPartial)
      throw new SyncError('pacote parcial recusado', 'refused');
    catalog = parsed.data;
  }
  let meta = metaChanged ? null : (current?.meta ?? null);
  if (manifest.meta && (metaChanged || !meta)) {
    const parsed = MetaBundle.safeParse(await download(manifest.meta, deps));
    if (!parsed.success) throw new SyncError('meta não passou na validação', 'invalid');
    if (parsed.data.fixture && !deps.allowFixtures)
      throw new SyncError('pacote de teste recusado', 'refused');
    meta = parsed.data;
  }
  const release: StoredRelease = {
    catalog,
    catalogHash: manifest.catalog.hash,
    meta,
    metaHash: manifest.meta?.hash ?? null,
    manifest: { ...manifest, icons_base: resolveUrl(manifest.icons_base, deps.manifestUrl) },
    savedAt: (deps.now?.() ?? new Date()).toISOString(),
  };
  return { kind: 'updated', release, gamePatch };
}

export function staleMessage(
  dataPatch: string | null | undefined,
  gamePatch: string | null | undefined,
): string | null {
  if (!dataPatch || !gamePatch || dataPatch === gamePatch) return null;
  return `Dados do patch ${dataPatch}. O jogo está no patch ${gamePatch}.`;
}
