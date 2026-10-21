#!/usr/bin/env node
// Prepares the data the web smoke test serves at /local-data/:
// - the real pipeline output (pipeline/out) when it exists (local runs after `uv run riftbuild run`);
// - otherwise a fixture release built from contracts/fixtures (CI), which the app labels "DADOS DE TESTE".
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const real = join(root, 'pipeline/out');
export const fixtureDir = join(root, '.web-fixture-data');

export function localDataDir() {
  if (existsSync(join(real, 'manifest.json'))) return { dir: real, fixture: false };
  mkdirSync(join(fixtureDir, 'catalog'), { recursive: true });
  const entries = {};
  for (const kind of ['catalog', 'meta']) {
    const raw = readFileSync(join(root, `contracts/fixtures/valid/${kind}.fixture.json`));
    const canonical = Buffer.from(JSON.stringify(JSON.parse(raw)));
    const hash = createHash('sha256').update(canonical).digest('hex');
    const path = `catalog/${kind}-${hash}.json.gz`;
    writeFileSync(join(fixtureDir, path), gzipSync(canonical));
    entries[kind] = {
      patch: '9.9z',
      hash: `sha256:${hash}`,
      path,
      bytes: canonical.length,
      published_at: '2026-01-01T00:00:00Z',
    };
  }
  const manifest = {
    schema_version: 1,
    game: 'wild_rift',
    game_patch: {
      version: '9.9z',
      source_url: 'https://example.invalid/',
      detected_at: '2026-01-01T00:00:00Z',
    },
    ...entries,
    icons_base: 'icons/',
    verified_at: '2026-01-01T00:00:00Z',
  };
  writeFileSync(join(fixtureDir, 'manifest.json'), JSON.stringify(manifest));
  return { dir: fixtureDir, fixture: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { dir, fixture } = localDataDir();
  // Consumed by `pnpm web:export` (see package.json): fixture data needs EXPO_PUBLIC_ALLOW_FIXTURES=1.
  console.log(JSON.stringify({ dir, fixture }));
}
