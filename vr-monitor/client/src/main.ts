import { ControlClient } from './net/control';
import type { DisplayInfo, HostMessage, VirtualCapability } from './net/protocol';
import { VideoSocket } from './net/videoSocket';
import { GridView } from './render/gridView';
import { Hud, fmt } from './ui/hud';
import { Toolbar } from './ui/toolbar';
import { FrameLimiter } from './util/frameLimiter';
import { RateCounter, RollingWindow, SustainedDropDetector } from './util/stats';
import { StreamDecoder, type HwMode } from './video/decoder';
import './style.css';

// ---------------- config via query string ----------------
const q = new URLSearchParams(location.search);
const cfg = {
  /** quais displays mostrar: "auto" (virtuais se houver, senão o principal), "all" ou lista "1,3" */
  show: q.get('show') ?? (q.has('display') ? q.get('display')! : 'auto'),
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

// ---------------- streams ----------------
interface Stream {
  info: DisplayInfo;
  decoder: StreamDecoder;
  socket: VideoSocket;
  presentRate: RateCounter;
  e2e: RollingWindow;
  hostPipe: RollingWindow;
  network: RollingWindow;
  wait: RollingWindow;
  decodeDrop: SustainedDropDetector;
}

const view = new GridView(canvas);
const streams = new Map<number, Stream>();
let displays: DisplayInfo[] = [];
let virtualCap: VirtualCapability | null = null;
let status = 'conectando…';
let permissions = '';
let toolbarMsg = '';

const control = new ControlClient(token, {
  onStatus: (s) => { status = s === 'open' ? 'conectado' : s === 'connecting' ? 'conectando…' : 'desconectado'; },
  onMessage: (m) => onHostMessage(m),
});

const toolbar = new Toolbar(app, {
  create: (width, height) => { toolbarMsg = ''; control.send({ t: 'display.create', width, height }); },
  destroy: (id) => { toolbarMsg = ''; control.send({ t: 'display.destroy', display: id }); },
});

function onHostMessage(m: HostMessage): void {
  switch (m.t) {
    case 'welcome':
      permissions = m.permissions.screen === 'granted' ? '' : '⚠ host sem permissão de Gravação de Tela';
      virtualCap = m.virtualDisplays ?? null;
      setDisplays(m.displays);
      break;
    case 'displays':
      setDisplays(m.displays);
      break;
    case 'error':
      console.warn('host error', m.code, m.message);
      toolbarMsg = m.message;
      toolbar.update(displays, virtualCap, toolbarMsg);
      break;
    case 'pong':
      break;
  }
}

function selectDisplays(all: DisplayInfo[]): DisplayInfo[] {
  if (cfg.show === 'all') return all;
  if (cfg.show === 'auto') {
    const v = all.filter((d) => d.virtual);
    if (v.length) return v;
    const main = all.find((d) => d.main) ?? all[0];
    return main ? [main] : [];
  }
  const ids = cfg.show.split(',').map(Number);
  return all.filter((d) => ids.includes(d.id));
}

/** Abre/fecha streams pra bater com a lista de displays do host. */
function setDisplays(all: DisplayInfo[]): void {
  displays = all;
  const wanted = selectDisplays(all);
  const wantedIds = new Set(wanted.map((d) => d.id));
  for (const [id, s] of streams) {
    if (!wantedIds.has(id)) {
      s.socket.close();
      s.decoder.close();
      streams.delete(id);
    }
  }
  for (const d of wanted) {
    const existing = streams.get(d.id);
    if (existing) { existing.info = d; continue; }
    streams.set(d.id, openStream(d));
  }
  view.setTiles(wanted.map((d) => d.id));
  toolbar.update(displays, virtualCap, toolbarMsg);
}

function openStream(d: DisplayInfo): Stream {
  const id = d.id;
  const decoder = new StreamDecoder(id, cfg.hw, () => control.send({ t: 'keyframe', display: id }));
  const socket = new VideoSocket(token!, id, (msg, recvMs, bytes) => decoder.handle(msg, recvMs, bytes), () => {
    control.send({ t: 'stream.config', display: id, fps: cfg.fps, bitrateKbps: cfg.kbps, active: true });
    control.send({ t: 'keyframe', display: id });
  });
  socket.connect();
  return {
    info: d, decoder, socket,
    presentRate: new RateCounter(),
    e2e: new RollingWindow(120), hostPipe: new RollingWindow(120), network: new RollingWindow(120), wait: new RollingWindow(120),
    decodeDrop: new SustainedDropDetector(5000),
  };
}

// ---------------- loop de render ----------------
const limiter = new FrameLimiter(cfg.renderFps);
const renderRate = new RateCounter();
const renderDrop = new SustainedDropDetector(5000);
let lastHud = 0;
let lastStats = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (!limiter.shouldRender(now)) return;
  renderRate.tick(now);

  const clock = control.clock;
  for (const [id, s] of streams) {
    const d = s.decoder.takeLatest();
    if (!d) continue;
    view.present(id, d.frame); // fecha o frame
    // `now` do rAF é o início do frame (anterior a este callback); medições usam o relógio real
    const t = performance.now();
    s.presentRate.tick(t);
    if (clock.synced) {
      s.e2e.push((clock.hostNowUs(t) - d.captureTimeUs) / 1000);
      s.hostPipe.push((d.sendTimeUs - d.captureTimeUs) / 1000);
      s.network.push((clock.hostNowUs(d.recvMs) - d.sendTimeUs) / 1000);
    }
    s.wait.push(t - d.decodedMs);
  }
  view.render();

  if (now - lastHud > 250) { lastHud = now; updateHud(performance.now()); }
  if (now - lastStats > 2000) {
    lastStats = now;
    const t = performance.now();
    for (const [id, s] of streams) {
      const st = s.decoder.stats(t);
      control.send({ t: 'stats', display: id, fps: Math.round(st.decodedFps), decodeMs: Math.round(st.decodeMsMedian * 10) / 10, e2eMs: Math.round(s.e2e.median()) });
    }
  }
}

function updateHud(now: number): void {
  const rfps = renderRate.rate(now);
  const lines = [
    `vr-monitor · ${status}${permissions ? ' · ' + permissions : ''}`,
    `render ${fmt(rfps, 0)} fps (alvo ${cfg.renderFps > 0 ? cfg.renderFps : 'livre'})  ·  rtt ${fmt(control.clock.rttMs)} ms  ·  ${streams.size} stream(s)`,
  ];
  let warn = cfg.renderFps > 0 && renderDrop.update(now, rfps, cfg.renderFps * 0.9);
  for (const [id, s] of streams) {
    const st = s.decoder.stats(now);
    lines.push(
      `#${id} ${s.info.name}  ${st.width}×${st.height}  ${fmt(st.kbps / 1000, 2)} Mbps  ·  recv ${fmt(st.recvFps, 0)} dec ${fmt(st.decodedFps, 0)} desenh ${fmt(s.presentRate.rate(now), 0)}`,
      `   e2e ${fmt(s.e2e.median(), 0)} (p95 ${fmt(s.e2e.p95(), 0)}) = host ${fmt(s.hostPipe.median())} + rede ${fmt(s.network.median())} + dec ${fmt(st.decodeMsMedian)} + espera ${fmt(s.wait.median())}`,
      `   decoder ${st.mode} p95 ${fmt(st.decodeMsP95)} fila ${st.queue} · desc ${st.dropped} err ${st.errors}`,
    );
    // decode só conta como queda se está chegando frame suficiente (tela parada = SCK não manda)
    if (st.recvFps > 10) warn = s.decodeDrop.update(now, st.decodedFps, st.recvFps * 0.8) || warn;
    else s.decodeDrop.reset();
  }
  if (warn) lines.push('⚠ fps caindo de forma sustentada: possível throttling térmico');
  hud.set(lines, warn);
}

// ---------------- gestos / tela cheia ----------------
overlay.innerHTML = '<p>Toque para tela cheia</p><p class="mut">toque na tela: liga/desliga estatísticas e barra</p>';
overlay.addEventListener('click', async () => {
  overlay.style.display = 'none';
  try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { /* desktop/simulador */ }
  try { await (screen.orientation as ScreenOrientation & { lock(o: string): Promise<void> }).lock('landscape'); } catch { /* sem suporte */ }
  await requestWakeLock();
});
canvas.addEventListener('click', () => { hud.toggle(); toolbar.toggle(hud.visible); });

let wakeLock: WakeLockSentinel | null = null;
async function requestWakeLock(): Promise<void> {
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock?.released !== false) void requestWakeLock();
});

control.connect();
requestAnimationFrame(frame);
