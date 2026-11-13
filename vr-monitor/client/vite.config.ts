import { defineConfig } from 'vite';

// Em dev (npm run dev), o Vite serve em :5173 e faz proxy dos WebSockets para o host.
// Rode o host com: --allow-origin http://localhost:5173
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1200, outDir: 'dist', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/ws': { target: 'ws://127.0.0.1:8420', ws: true } },
  },
  test: { include: ['test/**/*.test.ts'] },
});
