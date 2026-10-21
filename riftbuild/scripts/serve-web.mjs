#!/usr/bin/env node
// Static server for the exported web build (SPA fallback) plus /local-data/ -> pipeline/out.
// Used for screenshots and local checks only; the web build is not a product target.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.gz': 'application/gzip',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

function safeJoin(base, urlPath) {
  const target = normalize(join(base, decodeURIComponent(urlPath)));
  return target.startsWith(base) ? target : undefined;
}

export function startServer({
  port = 0,
  webDir = join(root, 'apps/mobile/dist'),
  dataDir = join(root, 'pipeline/out'),
} = {}) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let file;
    if (url.pathname.startsWith('/local-data/')) {
      file = safeJoin(dataDir, url.pathname.slice('/local-data/'.length));
    } else {
      file = safeJoin(webDir, url.pathname);
      if (!file || !existsSync(file) || statSync(file).isDirectory())
        file = join(webDir, 'index.html');
    }
    if (!file || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolvePromise) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolvePromise({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8081);
  const { url } = await startServer({ port });
  console.log(`Serving web build at ${url}`);
}
