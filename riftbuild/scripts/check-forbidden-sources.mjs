#!/usr/bin/env node
// Golden rule (spec §2): no League of Legends PC data sources anywhere in shipped code or data.
// Also refuses fixture bundles inside the app's assets (DECISIONS.md D11).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

// Hosts/paths that serve LoL PC data. The guard list itself lives in the pipeline and this file.
const FORBIDDEN = [
  /ddragon\.leagueoflegends\.com/i,
  /raw\.communitydragon\.org/i,
  /cdn\.communitydragon\.org/i,
  /\bu\.gg\b/i,
  /\bop\.gg\b/i,
  /mobalytics\.gg/i,
  /lolalytics\.com/i,
  /leagueofgraphs\.com/i,
  /metasrc\.com/i,
  /riftpatchnotes\.com\/lol\b/i,
];

const SCAN_DIRS = [
  'apps/mobile/src',
  'apps/mobile/assets',
  'packages/shared/src',
  'supabase',
  'evals',
];
const ALLOWLIST = new Set([
  // Files that must name the forbidden hosts in order to block them.
  'scripts/check-forbidden-sources.mjs',
]);
const SKIP_DIRS = new Set(['node_modules', '.temp', 'dist']);

function walk(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const problems = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(root, dir))) {
    const rel = relative(root, file);
    if (ALLOWLIST.has(rel) || /\.(png|jpe?g|webp|ico|ttf|otf)$/i.test(rel)) continue;
    const text = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text)) problems.push(`${rel}: references forbidden PC source ${pattern}`);
    }
    if (rel.startsWith('apps/mobile/assets') && /"fixture"\s*:\s*true/.test(text)) {
      problems.push(`${rel}: fixture data must never ship inside the app`);
    }
    // The seed is filled only inside EAS builds; the repo never stores game data (D5).
    if (rel === 'apps/mobile/assets/seed/release.json' && JSON.parse(text).seed !== null) {
      problems.push(`${rel}: commit the empty stub ({"seed": null}), not a fetched seed`);
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('No forbidden data sources found.');
