#!/usr/bin/env node
// Exports the web build wired to the local data server used by scripts/web-smoke.mjs (port 8765).
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDataDir } from './prepare-local-data.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { fixture } = localDataDir();
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist', '--clear'], {
  cwd: resolve(root, 'apps/mobile'),
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_PUBLIC_CATALOG_MANIFEST_URL: 'http://127.0.0.1:8765/local-data/manifest.json',
    EXPO_PUBLIC_ALLOW_FIXTURES: fixture ? '1' : '0',
  },
});
