import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: { ...minimal2023Preset, maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#0B5A7A' } } },
  images: ['public/icons/icon.svg'],
});
