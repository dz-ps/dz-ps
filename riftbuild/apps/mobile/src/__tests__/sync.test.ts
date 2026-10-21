import { createHash } from 'node:crypto';
import { gzipSync } from 'fflate';
import { syncRelease, SyncError, type SyncDeps } from '@/data/catalog/sync';
import { testRelease } from '@/test/fixtures';

const digest = async (data: Uint8Array) => {
  const buf = createHash('sha256').update(data).digest();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};
const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function server(files: Record<string, unknown>) {
  return jest.fn(async (url: string) => {
    const path = url.replace('https://data.example/', '');
    const body = files[path];
    if (body === undefined) return { ok: false, status: 404 } as Response;
    const bytes =
      body instanceof Uint8Array ? body : new TextEncoder().encode(JSON.stringify(body));
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(new TextDecoder().decode(bytes)),
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

function publish(catalog: unknown, opts: { tamper?: boolean } = {}) {
  const raw = new TextEncoder().encode(JSON.stringify(catalog));
  const manifest = {
    schema_version: 1,
    game: 'wild_rift',
    game_patch: {
      version: '9.9z',
      source_url: 'https://example.invalid/',
      detected_at: '2026-01-01T00:00:00Z',
    },
    catalog: {
      patch: '9.9z',
      hash: opts.tamper ? `sha256:${'0'.repeat(64)}` : sha(raw),
      path: 'catalog/x.json.gz',
      bytes: raw.length,
      published_at: '2026-01-01T00:00:00Z',
    },
    meta: null,
    icons_base: 'icons/',
    verified_at: '2026-01-01T00:00:00Z',
  };
  return { 'manifest.json': manifest, 'catalog/x.json.gz': gzipSync(raw) };
}

const deps = (fetchFn: typeof fetch, extra: Partial<SyncDeps> = {}): SyncDeps => ({
  manifestUrl: 'https://data.example/manifest.json',
  fetchFn,
  digest,
  allowFixtures: true,
  allowPartial: false,
  ...extra,
});

describe('catalog sync (manifest + hash)', () => {
  const catalog = testRelease().catalog;

  it('downloads, verifies and resolves the icons base against the manifest URL', async () => {
    const result = await syncRelease(null, deps(server(publish(catalog))));
    expect(result.kind).toBe('updated');
    if (result.kind !== 'updated') return;
    expect(result.release.catalog.champions.length).toBe(catalog.champions.length);
    expect(result.release.manifest.icons_base).toBe('https://data.example/icons/');
  });

  it('skips the download when the hash did not change', async () => {
    const files = publish(catalog);
    const first = await syncRelease(null, deps(server(files)));
    const fetchFn = server(files);
    const second = await syncRelease(
      first.kind === 'updated' ? first.release : null,
      deps(fetchFn),
    );
    expect(second.kind).toBe('unchanged');
    expect(fetchFn).toHaveBeenCalledTimes(1); // manifest only
  });

  it('rejects a bundle whose hash does not match', async () => {
    await expect(
      syncRelease(null, deps(server(publish(catalog, { tamper: true })))),
    ).rejects.toMatchObject({ code: 'integrity' });
  });

  it('refuses fixture bundles unless explicitly allowed', async () => {
    await expect(
      syncRelease(null, deps(server(publish(catalog)), { allowFixtures: false })),
    ).rejects.toBeInstanceOf(SyncError);
  });

  it('reports network failures without throwing away the stored release', async () => {
    const failing = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await expect(syncRelease(testRelease(), deps(failing))).rejects.toMatchObject({
      code: 'network',
    });
  });
});
