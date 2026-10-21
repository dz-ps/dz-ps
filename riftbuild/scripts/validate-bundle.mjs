#!/usr/bin/env node
// Zod gate (DECISIONS.md D4): validates pipeline output with the app's real schemas before publishing.
// Usage: node scripts/validate-bundle.mjs <catalog.json|meta.json|manifest.json>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { CatalogBundle, Manifest, MetaBundle } from '../packages/shared/src/schemas/index.ts';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: validate-bundle.mjs <file>...');
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const raw = readFileSync(file);
  const data = JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
  const schema =
    data.kind === 'catalog'
      ? CatalogBundle
      : data.kind === 'meta'
        ? MetaBundle
        : 'game_patch' in data
          ? Manifest
          : null;
  if (!schema) {
    console.error(`${file}: unknown document kind`);
    failed = true;
    continue;
  }
  const result = schema.safeParse(data);
  if (result.success) {
    console.log(`${file}: ok (${data.kind ?? 'manifest'})`);
  } else {
    failed = true;
    console.error(`${file}: INVALID`);
    for (const issue of result.error.issues.slice(0, 20)) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
  }
}
process.exit(failed ? 1 : 0);
