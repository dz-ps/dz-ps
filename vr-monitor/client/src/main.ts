import { ControlClient } from './net/control';
import type { DisplayInfo, HostMessage } from './net/protocol';
import { VideoSocket } from './net/videoSocket';
import { FlatView } from './render/flatView';
import { Hud, fmt } from './ui/hud';
import { RateCounter, RollingWindow, SustainedDropDetector } from './util/stats';
import { StreamDecoder, type HwMode } from './video/decoder';
import './style.css';

// ---------------- config via query string ----------------
const q = new URLSearchParams(location.search);
const cfg = {
  display: q.has('display') ? Number(q.get('display')) : null,
  fps: Number(q.get('fps') ?? 60),
  kbps: Number(q.get('kbps') ?? 6000),
  hw: ((): HwMode => {
    const v = q.get('hw');
    return v === 'hw' ? 'prefer-hardware' : v === 'sw' ? 'prefer-software' : 'auto';
  })(),
  renderFps: Number(q.get('renderfps') ?? 60),
};

// ---------------- token (fragmento #t=..., nunca vai pro servidor) ----------------
function takeToken(): string | null {
  const m = /(?:^#|&)t=([A-Za-z0-9_-]{16,})/.exec(location.hash);
  if (m) {
    sessionStorage.setItem('vrm.token', m[1]!);
    history.replaceState(null, '', location.pathname + location.search);
    return m[1]!;
  }
  return sessionStorage.getItem('vrm.token');
}

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
app.appendChild(canvas);
const hud = new Hud(app);
const overlay = document.getElementById('overlay')!;

const token = takeToken();
if (!token) {
  overlay.innerHTML = '<p>Sem token de sessão.</p><p>Abra pela URL que o <code>run.sh</code> imprime (com <code>#t=…</code>).</p>';
  throw new Error('missing token');
}

// ---------------- estado ----------------
const view = new FlatView(canvas);
let status = 'conectando…';
let permissions = '';
let displays: DisplayInfo[] = [];
let decoder: StreamDecoder | null = null;
let video: VideoSocket | null = null;

const renderRate = new RateCounter();
const presentRate = new RateCounter();
const e2e = new RollingWindow(120);
const hostPipe = new RollingWindow(120);
const network = new RollingWindow(120);
const waitMs = new RollingWindow(120);
const renderDrop = new SustainedDropDetector(5000);
const decodeDrop = new SustainedDropDetector(5000);

const control = new ControlClient(token, {
  onStatus: (s) => { status = s === 'open' ? 'conectado' : s === 'connecting' ? 'conectando…' : 'desconectado'; },
  onMessage: (m) => onHostMessage(m),
});

function onHostMessage(m: HostMessage): void {
  switch (m.t) {
    case 'welcome': {
      displays = m.displays;
      permissions = m.permissions.screen === 'granted' ? '' : '⚠ host sem permissão de Gravação de Tela';
      const target = displays.find((d) => d.id === cfg.display) ?? displays.find((d) => d.main) ?? displays[0];
      if (target) openStream(target);
      break;
    }
    case 'displays':
      displays = m.displays;
      break;
    case 'error':
      console.warn('host error', m.code, m.message);
      status = `erro: ${m.message}`;
      break;
    case 'pong':
      break;
  }
}

function openStream(d: DisplayInfo): void {
  if (video?.displayId === d.id) return;
  video?.close();
  decoder?.close();
  const id = d.id;
  decoder = new StreamDecoder(id, cfg.hw, () => control.send({ t: 'keyframe', display: id }));
  const dec = decoder;
  video = new VideoSocket(token!, id, (msg, recvMs, bytes) => dec.handle(msg, recvMs, bytes), () => {
    control.send({ t: 'stream.config', display: id, fps: cfg.fps, bitrateKbps: cfg.kbps, active: true });
    control.send({ t: 'keyframe', display: id });
  });
  video.connect();
}

// ---------------- loop de render ----------------
const minFrameMs = 1000 / cfg.renderFps - 2;
let lastRender = 0;
let lastHud = 0;
let lastStats = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (now - lastRender < minFrameMs) return;
  lastRender = now;
  renderRate.tick(now);

  const d = decoder?.takeLatest();
  if (d) {
    const clock = control.clock;
    view.present(d.frame); // fecha o frame
    // `now` do rAF é o início do frame (anterior a este callback); medições usam o relógio real
    const t = performance.now();
    presentRate.tick(t);
    if (clock.synced) {
      e2e.push((clock.hostNowUs(t) - d.captureTimeUs) / 1000);
      hostPipe.push((d.sendTimeUs - d.captureTimeUs) / 1000);
      network.push((clock.hostNowUs(d.recvMs) - d.sendTimeUs) / 1000);
    }
    waitMs.push(t - d.decodedMs);
  }
  view.render();

  if (now - lastHud > 250) { lastHud = now; updateHud(now); }
  if (decoder && now - lastStats > 2000) {
    lastStats = now;
    const s = decoder.stats(now);
    control.send({ t: 'stats', display: decoder.displayId, fps: Math.round(s.decodedFps), decodeMs: Math.round(s.decodeMsMedian * 10) / 10, e2eMs: Math.round(e2e.median()) });
  }
}

function updateHud(now: number): void {
  const rfps = renderRate.rate(now);
  const lines = [
    `vr-monitor · ${status}${permissions ? ' · ' + permissions : ''}`,
    `render ${fmt(rfps, 0)} fps (alvo ${cfg.renderFps})  ·  rtt ${fmt(control.clock.rttMs)} ms`,
  ];
  let warn = renderDrop.update(now, rfps, cfg.renderFps * 0.9);
  if (decoder) {
    const s = decoder.stats(now);
    lines.push(
      `display ${decoder.displayId}  ${s.width}×${s.height}  ${fmt(s.kbps / 1000, 2)} Mbps`,
      `recv ${fmt(s.recvFps, 0)} · dec ${fmt(s.decodedFps, 0)} · desenhado ${fmt(presentRate.rate(now), 0)} fps`,
      `decoder ${s.mode}  ${fmt(s.decodeMsMedian)} / p95 ${fmt(s.decodeMsP95)} ms  fila ${s.queue}`,
      `e2e ${fmt(e2e.median(), 0)} ms (p95 ${fmt(e2e.p95(), 0)})`,
      `  host ${fmt(hostPipe.median())} · rede ${fmt(network.median())} · decode ${fmt(s.decodeMsMedian)} · espera ${fmt(waitMs.median())}`,
      `descartados ${s.dropped} · erros ${s.errors}`,
    );
    // decode só conta como queda se está chegando frame suficiente (tela parada = SCK não manda)
    if (s.recvFps > 10) warn = decodeDrop.update(now, s.decodedFps, s.recvFps * 0.8) || warn;
    else decodeDrop.reset();
  }
  if (warn) lines.push('⚠ fps caindo de forma sustentada: possível throttling térmico');
  hud.set(lines, warn);
}

// ---------------- gestos / tela cheia ----------------
overlay.innerHTML = '<p>Toque para tela cheia</p><p class="mut">toque na tela: liga/desliga estatísticas</p>';
overlay.addEventListener('click', async () => {
  overlay.style.display = 'none';
  try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { /* desktop/simulador */ }
  try { await (screen.orientation as ScreenOrientation & { lock(o: string): Promise<void> }).lock('landscape'); } catch { /* sem suporte */ }
  await requestWakeLock();
});
canvas.addEventListener('click', () => hud.toggle());

let wakeLock: WakeLockSentinel | null = null;
async function requestWakeLock(): Promise<void> {
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock?.released !== false) void requestWakeLock();
});

control.connect();
requestAnimationFrame(frame);
