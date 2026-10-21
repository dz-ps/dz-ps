#!/usr/bin/env node
// Opens the exported web build in Chromium (phone viewport, dark), runs per-screen assertions and
// saves screenshots to docs/screenshots/. Usage: node scripts/web-smoke.mjs [--only=name,name]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { localDataDir } from './prepare-local-data.mjs';
import { startServer } from './serve-web.mjs';
import { CHECKS } from './web-smoke.checks.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, 'docs/screenshots');
mkdirSync(outDir, { recursive: true });

const only = process.argv
  .find((a) => a.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',');

const { server, url } = await startServer({ port: 8765 });
const realData = !localDataDir().fixture;
const checks = CHECKS.filter((c) => (!only || only.includes(c.name)) && (realData || !c.realData));
console.log(`data: ${realData ? 'real pipeline output' : 'fixture (DADOS DE TESTE)'}`);
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  locale: 'pt-BR',
});

let failed = 0;
for (const check of checks) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  try {
    await page.goto(`${url}${check.path}`, { waitUntil: 'networkidle' });
    await check.run(page, { url, realData });
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    await page.screenshot({ path: join(outDir, `${check.name}.png`), fullPage: false });
    console.log(`ok   ${check.name}`);
  } catch (err) {
    failed += 1;
    await page.screenshot({ path: join(outDir, `FAILED-${check.name}.png`) }).catch(() => {});
    console.error(`FAIL ${check.name}: ${err instanceof Error ? err.message : err}`);
  } finally {
    await page.close();
  }
}

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
