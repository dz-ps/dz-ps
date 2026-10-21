import { indexCatalog, type CatalogIndex } from './riftbuild-shared/catalog/index.ts';
import { CatalogBundle } from './riftbuild-shared/schemas/catalog.ts';
import { Manifest } from './riftbuild-shared/schemas/manifest.ts';
import { MetaBundle } from './riftbuild-shared/schemas/meta.ts';

export type LoadedCatalog = {
  index: CatalogIndex;
  meta: MetaBundle | null;
  bundleHash: string;
  gamePatch: string;
};

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function fetchVerified(url: string, hash: string, fetchFn: typeof fetch): Promise<unknown> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  let bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const digest = `sha256:${toHex(await crypto.subtle.digest('SHA-256', bytes))}`;
  if (digest !== hash) throw new Error(`hash mismatch for ${url}`);
  return JSON.parse(new TextDecoder().decode(bytes));
}

let cached: { at: number; manifestHash: string; value: LoadedCatalog } | null = null;

/** Current published release, memoized per isolate; re-checks the manifest every 5 minutes. */
export async function loadCatalog(
  manifestUrl: string,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
): Promise<LoadedCatalog> {
  if (cached && now - cached.at < 5 * 60_000) return cached.value;
  const res = await fetchFn(manifestUrl, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
  const manifest = Manifest.parse(await res.json());
  if (!manifest.catalog) throw new Error('no catalog published yet');
  const key = `${manifest.catalog.hash}|${manifest.meta?.hash ?? ''}`;
  if (cached && cached.manifestHash === key) {
    cached.at = now;
    return cached.value;
  }
  const base = new URL(manifestUrl);
  const catalog = CatalogBundle.parse(
    await fetchVerified(
      new URL(manifest.catalog.path, base).toString(),
      manifest.catalog.hash,
      fetchFn,
    ),
  );
  const meta = manifest.meta
    ? MetaBundle.parse(
        await fetchVerified(
          new URL(manifest.meta.path, base).toString(),
          manifest.meta.hash,
          fetchFn,
        ),
      )
    : null;
  const value = {
    index: indexCatalog(catalog),
    meta,
    bundleHash: manifest.catalog.hash,
    gamePatch: manifest.game_patch.version,
  };
  cached = { at: now, manifestHash: key, value };
  return value;
}

/** For tests and local runs: wrap an already-parsed bundle. */
export function catalogFromBundles(
  catalog: unknown,
  meta: unknown,
  bundleHash = 'sha256:test',
): LoadedCatalog {
  const bundle = CatalogBundle.parse(catalog);
  return {
    index: indexCatalog(bundle),
    meta: meta ? MetaBundle.parse(meta) : null,
    bundleHash,
    gamePatch: bundle.patch,
  };
}
