import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { aplicarTema, useEstado } from './estado';
import './styles.css';

aplicarTema(useEstado.getState().tema);

const nativo = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ?? false;
if ('serviceWorker' in navigator && import.meta.env.PROD && !nativo) {
  // No Android (Capacitor) os arquivos já estão no APK; o service worker é só da PWA.
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
