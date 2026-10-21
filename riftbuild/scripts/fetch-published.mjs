#!/usr/bin/env node
// Downloads the currently published catalog + meta (verified by sha256) into <outDir>/{catalog,meta}/latest.json.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const outDir = process.argv[2] ?? 'pipeline/out';
const manifestUrl = process.env.CATALOG_MANIFEST_URL;
if (!manifestUrl) {
  console.error('CATALOG_MANIFEST_URL is not set');
  process.exit(2);
}
const manifest = await (await fetch(manifestUrl)).json();
for (const kind of ['catalog', 'meta']) {
  const entry = manifest[kind];
  if (!entry) continue;
  let bytes = Buffer.from(await (await fetch(new URL(entry.path, manifestUrl))).arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (digest !== entry.hash) throw new Error(`hash mismatch for ${entry.path}`);
  mkdirSync(join(outDir, kind), { recursive: true });
  writeFileSync(join(outDir, kind, 'latest.json'), bytes);
  console.log(`${kind}: ${entry.patch} ${entry.hash}`);
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
