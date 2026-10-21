#!/usr/bin/env node
// EAS lifecycle hook (eas-build-pre-install): embeds the latest *published* catalog + meta as the app's seed,
// so a fresh install works offline before the first sync (DECISIONS.md D5). Runs before `pnpm install`, so it
// only uses Node built-ins; the app validates the seed with zod before importing it.
//
// Writes assets/seed/release.json only on EAS (EAS_BUILD=true) or with --force; the committed file is a stub.
// SEED_REQUIRED=1 (preview/production profiles) fails the build when the seed cannot be fetched.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const force = process.argv.includes('--force');
const required = process.env.SEED_REQUIRED === '1';
const out = new URL('../assets/seed/release.json', import.meta.url);

function stop(message) {
  if (required) {
    console.error(`seed: ${message}`);
    process.exit(1);
  }
  console.warn(`seed: ${message} (continuing with an empty seed)`);
  process.exit(0);
}

if (process.env.EAS_BUILD !== 'true' && !force) {
  console.log('seed: not an EAS build; leaving the stub in place (use --force to fetch locally)');
  process.exit(0);
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const manifestUrl =
  process.env.EXPO_PUBLIC_CATALOG_MANIFEST_URL ??
  (supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/catalog/manifest.json` : undefined);
if (!manifestUrl) stop('no EXPO_PUBLIC_CATALOG_MANIFEST_URL or EXPO_PUBLIC_SUPABASE_URL');

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function bundle(entry) {
  let bytes = await fetchBytes(new URL(entry.path, manifestUrl));
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (digest !== entry.hash) throw new Error(`hash mismatch for ${entry.path}`);
  return JSON.parse(bytes.toString('utf8'));
}

try {
  const manifest = JSON.parse((await fetchBytes(manifestUrl)).toString('utf8'));
  if (manifest.game !== 'wild_rift' || !manifest.catalog) stop('manifest has no published catalog');
  const catalog = await bundle(manifest.catalog);
  if (catalog.game !== 'wild_rift' || catalog.fixture || catalog.partial)
    stop('published catalog is not a complete Wild Rift bundle');
  const meta = manifest.meta ? await bundle(manifest.meta) : null;
  if (meta?.fixture) stop('published meta is a fixture');
  const seed = {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    manifest: { ...manifest, icons_base: new URL(manifest.icons_base, manifestUrl).toString() },
    catalog,
    meta,
  };
  writeFileSync(out, JSON.stringify({ seed }));
  console.log(`seed: catalog ${manifest.catalog.patch} ${manifest.catalog.hash}`);
} catch (err) {
  stop(err.message);
}
