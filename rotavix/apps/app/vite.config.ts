import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { cssVariaveis } from '../../packages/ui/src/tokens';
import { brand } from './src/brand';

/** Injeta as variáveis de cor no <head> em tempo de build (sem flash de tema). */
function tokens(): Plugin {
  return {
    name: 'rotavix-tokens',
    transformIndexHtml: (html) =>
      html
        .replace('</head>', `<style id="rv-tokens">${cssVariaveis(brand.paleta)}</style></head>`)
        .replaceAll('%NOME%', brand.nome)
        .replaceAll('%DESCRICAO%', brand.descricao)
        .replaceAll('%COR%', brand.paleta.primaria.claro),
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    tokens(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        // Shell + fontes/sprites do mapa. Pacotes grandes (rede, mapa) vão para o OPFS.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}', 'map-assets/**/*.{pbf,json,png}'],
        globIgnores: ['pacotes/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: brand.nome,
        short_name: brand.nomeCurto,
        description: brand.descricao,
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F3F6F8',
        theme_color: brand.paleta.primaria.claro,
        categories: ['travel', 'navigation'],
        icons: [
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Casa', url: '/?atalho=casa', icons: [{ src: '/icons/pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Trabalho', url: '/?atalho=trabalho', icons: [{ src: '/icons/pwa-192x192.png', sizes: '192x192' }] },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    manifest: true,
  },
});
