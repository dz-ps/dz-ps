import type { CapacitorConfig } from '@capacitor/cli';
import { brand } from './src/brand';

const config: CapacitorConfig = {
  appId: brand.appId,
  appName: brand.nome,
  webDir: 'dist',
  android: { backgroundColor: '#F3F6F8' },
};

export default config;
