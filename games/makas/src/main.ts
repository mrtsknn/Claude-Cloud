import './style.css';
import {
  createMeta,
  createProfile,
  createStore,
  haptic,
  initAds,
  initStore,
  maybeRequestReview,
  pentatonic,
  setHapticsEnabled,
  setSoundEnabled,
  setupNative,
  tone,
  track,
  trackSession,
  unlockAudio,
} from '@studio/kit';
import {
  LEVEL_COUNT,
  HEARTS,
  continueSim,
  createSim,
  edgePath,
  flip,
  generateLevel,
  route,
  starsFor,
  step,
  trainPos,
  type Ev,
  type Sim,
} from './game';
import { lang, t } from './i18n';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/makas/PRIVACY.md';
declare const __APP_VERSION__: string;
document.documentElement.lang = lang;
document.title = t('title');

// ───────────────────────── skins ─────────────────────────
interface Skin { id: string; price: number; bg: string; bg2: string; ink: string; chip: string; rail: string; bed: string; sleeper: string; colors: string[] }
const SKINS: Skin[] = [
  { id: 'classic', price: 0, bg: '#2f5e3d', bg2: '#16301f', ink: '#fff', chip: 'rgba(255,255,255,.14)', rail: '#e6e0d2', bed: '#3b6f49', sleeper: '#6b4f35', colors: ['#ff4d4d', '#3d7bff', '#ffc800', '#b46bff', '#ff8a1f', '#22d3ee'] },
  { id: 'night', price: 120, bg: '#1d2648', bg2: '#0a0e1f', ink: '#fff', chip: 'rgba(255,255,255,.12)', rail: '#a9b8e0', bed: '#252f57', sleeper: '#3a4670', colors: ['#ff5d73', '#4da3ff', '#ffd84d', '#c08bff', '#ff9f43', '#3ee6c1'] },
  { id: 'desert', price: 200, bg: '#e8c084', bg2: '#c08850', ink: '#3b2410', chip: 'rgba(60,30,0,.12)', rail: '#5a3d24', bed: '#d9a866', sleeper: '#8a5a32', colors: ['#d62f2f', '#1f5fd6', '#2a9d3a', '#7b2fbf', '#1f2937', '#e6007e'] },
  { id: 'snow', price: 250, bg: '#eef5fb', bg2: '#bccfe0', ink: '#1e2a3a', chip: 'rgba(30,42,58,.1)', rail: '#55657a', bed: '#dbe7f2', sleeper: '#93a3b8', colors: ['#e63946', '#1d4ed8', '#f59e0b', '#7c3aed', '#059669', '#db2777'] },
  { id: 'neon', price: 300, bg: '#1a0830', bg2: '#05010a', ink: '#fff', chip: 'rgba(255,255,255,.12)', rail: '#8a6cff', bed: '#22103d', sleeper: '#3a1f66', colors: ['#ff2bd6', '#00e5ff', '#faff00', '#7cff3a', '#ff7a00', '#ffffff'] },
  { id: 'toy', price: 400, bg: '#bfe3ff', bg2: '#83c2f2', ink: '#14304a', chip: 'rgba(20,48,74,.12)', rail: '#ff6b6b', bed: '#a8d6fb', sleeper: '#ffd93d', colors: ['#e63946', '#2b59c3', '#f4a261', '#8338ec', '#2a9d8f', '#111111'] },
  { id: 'metro', price: 500, bg: '#2e3036', bg2: '#141518', ink: '#fff', chip: 'rgba(255,255,255,.12)', rail: '#c0c4cc', bed: '#383b42', sleeper: '#50545d', colors: ['#e4002b', '#0072ce', '#ffd100', '#00a651', '#ff8200', '#b07cd8'] },
];
let skin = SKINS[0];
function applySkin(id: string) {
  skin = SKINS.find((s) => s.id === id) ?? SKINS[0];
  const r = document.documentElement.style;
  r.setProperty('--bg', skin.bg);
  r.setProperty('--bg2', skin.bg2);
  r.setProperty('--ink', skin.ink);
  r.setProperty('--chip', skin.chip);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', skin.bg);
}

// ───────────────────────── profile / meta ─────────────────────────
const store = createStore('makas');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const profile = createProfile({
  game: 'makas',
  levelCount: LEVEL_COUNT,
  defaultSkin: 'classic',
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'trains', targets: [15, 30, 50], reward: (n) => 20 + Math.round(n * 1.5) },
  ],
});
applySkin(profile.data.skin);

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  skins: SKINS.map((s) => ({
    id: s.id,
    name: t(`skin_${s.id}` as 'skin_classic'),
    price: s.price,
    swatch: `linear-gradient(135deg, ${s.bg} 0 45%, ${s.rail} 45% 52%, ${s.colors[0]} 52% 70%, ${s.colors[1]} 70% 86%, ${s.colors[2]} 86%)`,
  })),
  onSkin: applySkin,
  levels: { count: LEVEL_COUNT, play: (n) => startLevel(n) },
  missionText: (id, n) => t(`mission_${id}` as 'mission_levels', { n }),
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
const HEART = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.1C.9 8.6 3 4.5 6.9 4.5c2.2 0 3.6 1.2 5.1 3 1.5-1.8 2.9-3 5.1-3 3.9 0 6 4.1 4.5 7.4C19.5 16.4 12 21 12 21z"/></svg>';

// ───────────────────────── game state ─────────────────────────
let sim: Sim = createSim(generateLevel(1));
let level = 1;
let running = false;
let paused = false;
let continuesUsed = 0;
let resultShown = false;
let timeScale = 1;
let frozen = false;
const swAngle = new Map<number, number>();
const swBump = new Map<number, number>();
const stationPulse = new Map<number, number>();
interface Particle { x: number; y: number; vx: number; vy: number; color: string; t0: number; life: number; size: number }
let particles: Particle[] = [];
interface Floater { x: number; y: number; text: string; color: string; t0: number }
let floaters: Floater[] = [];
let shakeT = -1;

function refreshHud(popHeart = false) {
  $('level').textContent = t('level', { n: level });
  $('count').textContent = `${t('delivered')} ${Math.min(sim.delivered, sim.lv.goal)}/${sim.lv.goal}`;
  $('bar').style.width = `${(Math.min(sim.delivered, sim.lv.goal) / sim.lv.goal) * 100}%`;
  const hearts = $('hearts');
  const total = Math.max(HEARTS, sim.hearts);
  hearts.innerHTML = Array.from({ length: total }, (_, i) => HEART.replace('<svg', `<svg class="${i < sim.hearts ? '' : 'off'} ${popHeart && i === sim.hearts ? 'pop' : ''}"`)).join('');
}

function startLevel(n: number) {
  level = Math.max(1, Math.min(LEVEL_COUNT, n));
  sim = createSim(generateLevel(level));
  running = true;
  paused = false;
  resultShown = false;
  continuesUsed = 0;
  particles = [];
  floaters = [];
  swAngle.clear();
  layout();
  refreshHud();
  meta.hideHome();
  $('hint').textContent = t('tapSwitch');
  $('hint').hidden = level !== 1;
  track('level_start', { level });
}

// ───────────────────────── layout ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
let U = 40;
let OX = 0;
let OY = 0;
const X = (x: number) => OX + x * U;
const Y = (y: number) => OY + y * U;

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const { w, h } = sim.lv.net;
  U = Math.min(W / (w + 1.8), (H - 20) / (h + 1.6), 96);
  OX = (W - w * U) / 2;
  OY = (H - h * U) / 2 + U * 0.1;
}
window.addEventListener('resize', layout);

// ───────────────────────── drawing ─────────────────────────
function symbol(k: number, cx: number, cy: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (k % 6) {
    case 0: ctx.arc(cx, cy, s * 0.45, 0, Math.PI * 2); ctx.fill(); break;
    case 1: ctx.moveTo(cx, cy - s * 0.55); ctx.lineTo(cx + s * 0.55, cy + s * 0.42); ctx.lineTo(cx - s * 0.55, cy + s * 0.42); ctx.fill(); break;
    case 2: ctx.rect(cx - s * 0.42, cy - s * 0.42, s * 0.84, s * 0.84); ctx.fill(); break;
    case 3: ctx.moveTo(cx, cy - s * 0.6); ctx.lineTo(cx + s * 0.5, cy); ctx.lineTo(cx, cy + s * 0.6); ctx.lineTo(cx - s * 0.5, cy); ctx.fill(); break;
    case 4:
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? s * 0.26 : s * 0.6;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.fill();
      break;
    default: ctx.moveTo(cx - s * 0.5, cy); ctx.lineTo(cx + s * 0.5, cy); ctx.moveTo(cx, cy - s * 0.5); ctx.lineTo(cx, cy + s * 0.5); ctx.stroke();
  }
}

function trackPath(ei: number) {
  const pts = edgePath(sim.lv.net, ei);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
}

function drawTracks() {
  const { net } = sim.lv;
  const inactive = (ei: number) => {
    const e = net.edges[ei];
    return net.nodes[e.from].kind === 'switch' && net.nodes[e.from].out[sim.sw[e.from]] !== ei;
  };
  const order = net.edges.map((_, i) => i).sort((a, b) => Number(inactive(b)) - Number(inactive(a)));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const ei of order) {
    ctx.globalAlpha = inactive(ei) ? 0.32 : 1;
    trackPath(ei);
    ctx.setLineDash([U * 0.07, U * 0.12]);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = skin.sleeper;
    ctx.lineWidth = U * 0.36;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = skin.rail;
    ctx.lineWidth = U * 0.22;
    ctx.stroke();
    ctx.strokeStyle = skin.bed;
    ctx.lineWidth = U * 0.12;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTunnel(i: number, now: number) {
  const n = sim.lv.net.nodes[i];
  const x = X(n.x);
  const y = Y(n.y);
  const w = U * 0.62;
  ctx.fillStyle = '#3a3a40';
  ctx.beginPath();
  ctx.roundRect(x - w * 0.62, y - U * 0.5, w * 1.24, U * 0.62, [U * 0.3, U * 0.3, U * 0.06, U * 0.06]);
  ctx.fill();
  ctx.fillStyle = '#0d0d10';
  ctx.beginPath();
  ctx.roundRect(x - w * 0.42, y - U * 0.34, w * 0.84, U * 0.46, [U * 0.22, U * 0.22, 0, 0]);
  ctx.fill();
  // next train from this tunnel: colour lamp + countdown ring
  const next = sim.lv.trains.slice(sim.next).find((tr) => tr.tunnel === i);
  if (next) {
    const left = next.t - sim.time;
    const k = Math.max(0, Math.min(1, 1 - left / 4));
    const lx = x;
    const ly = y - U * 0.72;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.arc(lx, ly, U * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.colors[next.color];
    ctx.globalAlpha = 0.35 + 0.65 * k;
    ctx.beginPath();
    ctx.arc(lx, ly, U * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = skin.colors[next.color];
    ctx.lineWidth = U * 0.05;
    ctx.beginPath();
    ctx.arc(lx, ly, U * 0.2, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
    ctx.stroke();
    if (left < 0.6) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 60);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(lx, ly, U * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawStation(i: number, now: number) {
  const n = sim.lv.net.nodes[i];
  const x = X(n.x);
  const y = Y(n.y);
  const c = skin.colors[n.color];
  const p = stationPulse.get(i);
  const k = p !== undefined ? Math.max(0, 1 - (now - p) / 400) : 0;
  const s = 1 + 0.18 * Math.sin(k * Math.PI);
  const w = U * 0.82 * s;
  const h = U * 0.56 * s;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h * 0.15 + U * 0.06, w, h, U * 0.12);
  ctx.fill();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h * 0.15, w, h, U * 0.12);
  ctx.fill();
  // roof
  ctx.beginPath();
  ctx.moveTo(x - w * 0.6, y - h * 0.15);
  ctx.lineTo(x, y - h * 0.75);
  ctx.lineTo(x + w * 0.6, y - h * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.beginPath();
  ctx.moveTo(x - w * 0.6, y - h * 0.15);
  ctx.lineTo(x, y - h * 0.75);
  ctx.lineTo(x, y - h * 0.15);
  ctx.closePath();
  ctx.fill();
  symbol(n.color, x, y + h * 0.13, U * 0.26, 'rgba(255,255,255,.95)');
}

function drawSwitch(i: number, now: number, pulse: boolean) {
  const { net } = sim.lv;
  const n = net.nodes[i];
  const x = X(n.x);
  const y = Y(n.y);
  // arrow toward the chosen branch, sideways part exaggerated so left/right reads at a glance
  const to = net.nodes[net.edges[n.out[sim.sw[i]]].to];
  const target = Math.atan2(to.y - n.y, Math.sign(to.x - n.x) * Math.max(Math.abs(to.x - n.x) * 2, 1.2));
  let a = swAngle.get(i) ?? target;
  a += (target - a) * 0.3;
  swAngle.set(i, a);
  const b = swBump.get(i);
  const k = b !== undefined ? Math.max(0, 1 - (now - b) / 260) : 0;
  const r = U * 0.34 * (1 + 0.22 * Math.sin(k * Math.PI));
  if (pulse) {
    const pp = (now % 1000) / 1000;
    ctx.strokeStyle = `rgba(255,207,63,${1 - pp})`;
    ctx.lineWidth = U * 0.08;
    ctx.beginPath();
    ctx.arc(x, y, r * (1.1 + pp * 0.9), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  ctx.arc(x, y + U * 0.05, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffcf3f';
  ctx.lineWidth = U * 0.06;
  ctx.stroke();
  // arrow
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = '#1c2a20';
  ctx.beginPath();
  ctx.moveTo(r * 0.62, 0);
  ctx.lineTo(r * 0.02, -r * 0.5);
  ctx.lineTo(r * 0.02, -r * 0.2);
  ctx.lineTo(-r * 0.55, -r * 0.2);
  ctx.lineTo(-r * 0.55, r * 0.2);
  ctx.lineTo(r * 0.02, r * 0.2);
  ctx.lineTo(r * 0.02, r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTrain(tr: Sim['trains'][number]) {
  const p = trainPos(sim, tr);
  const c = skin.colors[tr.color];
  const L = U * 0.56;
  const Wd = U * 0.34;
  ctx.save();
  ctx.translate(X(p.x), Y(p.y));
  ctx.rotate(p.a);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.roundRect(-L / 2 + 2, -Wd / 2 + 3, L, Wd, Wd * 0.3);
  ctx.fill();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -Wd / 2, L, Wd, [Wd * 0.25, Wd * 0.5, Wd * 0.5, Wd * 0.25]);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(-L / 2 + L * 0.08, -Wd * 0.36, L * 0.3, Wd * 0.72);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.fillRect(-L / 2, -Wd / 2, L, Wd * 0.18);
  ctx.fillStyle = '#fff6c2';
  ctx.beginPath();
  ctx.arc(L / 2 - Wd * 0.18, 0, Wd * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  symbol(tr.color, X(p.x), Y(p.y), U * 0.17, 'rgba(255,255,255,.95)');
}

/** Next switch the oldest train needs, and whether it is already set right (tutorial + e2e). */
function plan(): { node: number; ok: boolean } | null {
  const { net } = sim.lv;
  const trains = [...sim.trains].sort((a, b) => a.idx - b.idx);
  for (const tr of trains) {
    const r = route(net, net.edges[tr.edge].to, tr.target);
    if (!r || !r.length) continue;
    return { node: r[0][0], ok: sim.sw[r[0][0]] === r[0][1] };
  }
  return null;
}

let lastFrame = 0;
let acc = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (running && !paused && !frozen && !meta.covering && sim.status === 'play') {
    acc += dt * timeScale;
    while (acc >= 1 / 60) {
      acc -= 1 / 60;
      handle(step(sim, 1 / 60), now);
      if (sim.status !== 'play') break;
    }
  } else acc = 0;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (shakeT >= 0) {
    const k = (now - shakeT) / 300;
    if (k >= 1) shakeT = -1;
    else ctx.translate(Math.sin(k * 40) * (1 - k) * 7, 0);
  }
  // ground dots
  ctx.fillStyle = skin.chip;
  const g = U * 0.7;
  for (let y = (OY % g) - g; y < H; y += g) for (let x = (OX % g) - g; x < W; x += g) ctx.fillRect(x, y, 2, 2);

  drawTracks();
  const { nodes } = sim.lv.net;
  const tip = level <= 3 && running ? plan() : null;
  nodes.forEach((n, i) => n.kind === 'station' && drawStation(i, now));
  for (const tr of sim.trains) drawTrain(tr);
  nodes.forEach((n, i) => {
    if (n.kind === 'tunnel') drawTunnel(i, now);
    else if (n.kind === 'switch') drawSwitch(i, now, !!tip && tip.node === i && !tip.ok);
    else if (n.kind === 'merge') {
      ctx.fillStyle = skin.rail;
      ctx.beginPath();
      ctx.arc(X(n.x), Y(n.y), U * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  particles = particles.filter((p) => now - p.t0 < p.life);
  for (const p of particles) {
    const tt = (now - p.t0) / 1000;
    ctx.globalAlpha = Math.max(0, 1 - (now - p.t0) / p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x + p.vx * tt, p.y + p.vy * tt + 300 * tt * tt, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  floaters = floaters.filter((f) => now - f.t0 < 900);
  ctx.font = `800 ${Math.round(U * 0.42)}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (const f of floaters) {
    const k = (now - f.t0) / 900;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - k * U * 0.8);
  }
  ctx.globalAlpha = 1;
}

function burst(x: number, y: number, colors: string[], count: number, spread: number) {
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    particles.push({ x, y, vx: (Math.random() - 0.5) * spread, vy: -Math.random() * spread * 0.8, color: colors[i % colors.length], t0: now, life: 500 + Math.random() * 500, size: 2 + Math.random() * U * 0.08 });
  }
}

function handle(evs: Ev[], now: number) {
  for (const e of evs) {
    const x = X(e.x);
    const y = Y(e.y);
    switch (e.kind) {
      case 'spawn':
        tone({ freq: 330, to: 440, duration: 0.12, type: 'triangle', volume: 0.12 });
        break;
      case 'deliver': {
        const st = sim.lv.net.nodes.findIndex((n) => n.kind === 'station' && n.x === e.x && n.y === e.y);
        stationPulse.set(st, now);
        burst(x, y, [skin.colors[e.color], '#ffffff'], 16, U * 3);
        floaters.push({ x, y: y - U * 0.6, text: '+1', color: '#ffffff', t0: now });
        tone({ freq: pentatonic(sim.delivered % 8), duration: 0.14, volume: 0.35 });
        haptic.light();
        profile.progress('trains');
        refreshHud();
        break;
      }
      case 'wrong':
        floaters.push({ x, y: y - U * 0.6, text: '✕', color: '#ff5a5f', t0: now });
        tone({ freq: 180, to: 110, duration: 0.25, type: 'sawtooth', volume: 0.25 });
        haptic.error();
        shakeT = now;
        refreshHud(true);
        break;
      case 'crash':
        burst(x, y, ['#ffb020', '#ff5a1f', '#444', '#fff'], 40, U * 6);
        tone({ freq: 120, to: 40, duration: 0.4, type: 'sawtooth', volume: 0.4 });
        haptic.heavy();
        shakeT = now;
        refreshHud(true);
        break;
      case 'win':
        setTimeout(onWin, 650);
        break;
      case 'lose':
        setTimeout(onLose, 650);
        break;
    }
  }
}

function onWin() {
  if (resultShown) return;
  resultShown = true;
  $('hint').hidden = true;
  const stars = starsFor(sim.hearts, continuesUsed > 0);
  track('level_complete', { level, stars, hearts: sim.hearts, continues: continuesUsed });
  burst(W / 2, H * 0.3, skin.colors, 60, U * 10);
  [0, 2, 4, 5, 7].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.2, volume: 0.4, delay: i * 0.08 }));
  profile.finishFirstRun();
  const done = level;
  meta.showWin({ level: done, stars, coins: 10 + stars * 5, onNext: () => startLevel(Math.min(LEVEL_COUNT, done + 1)), onMenu: () => (running = false) });
  maybeRequestReview(done, stars === 3 && done >= 5);
}

function onLose() {
  if (resultShown) return;
  resultShown = true;
  $('hint').hidden = true;
  track('level_fail', { level, delivered: sim.delivered, continues: continuesUsed });
  meta.showLose({
    score: sim.delivered,
    coins: 0,
    label: t('outOfHearts'),
    continuesUsed,
    canContinue: continuesUsed < 3,
    onContinue: () => {
      continuesUsed++;
      continueSim(sim);
      resultShown = false;
      refreshHud();
      track('continue', { level, n: continuesUsed });
    },
    onRetry: () => startLevel(level),
    onMenu: () => (running = false),
  });
}

function pauseGame() {
  if (!running || paused || meta.covering || sim.status !== 'play') return;
  paused = true;
  meta.showPause({ onResume: () => (paused = false), onRestart: () => startLevel(level), onMenu: () => (running = false) });
}

// ───────────────────────── input ─────────────────────────
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (!running || paused || sim.status !== 'play') return;
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  let best = -1;
  let bestD = Math.max(U * 0.75, 30);
  for (const s of sim.lv.switches) {
    const n = sim.lv.net.nodes[s];
    const d = Math.hypot(X(n.x) - px, Y(n.y) - py);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  if (best < 0 || !flip(sim, best)) return;
  swBump.set(best, performance.now());
  tone({ freq: 900, to: 600, duration: 0.05, type: 'square', volume: 0.12 });
  tone({ freq: 500, to: 350, duration: 0.05, type: 'square', volume: 0.1, delay: 0.05 });
  haptic.light();
  if (level === 1) $('hint').hidden = true;
});
$('pause-btn').addEventListener('click', () => {
  unlockAudio();
  pauseGame();
});

// ───────────────────────── boot ─────────────────────────
trackSession('makas');
layout();
refreshHud();
void initAds();
void initStore();
void setupNative({
  darkBackground: true,
  onBack: () => {
    if (meta.back()) return true;
    if (running && !meta.covering) {
      pauseGame();
      return true;
    }
    return false;
  },
  onPause: () => pauseGame(),
});
meta.showHome();
requestAnimationFrame((n) => {
  lastFrame = n;
  frame(n);
});

// Hooks for e2e and screenshot scripts.
(window as unknown as { __makas: unknown }).__makas = {
  get sim() { return sim; },
  get level() { return level; },
  plan,
  /** Screen position (page px) of a switch node. */
  at(node: number) {
    const r = canvas.getBoundingClientRect();
    const n = sim.lv.net.nodes[node];
    return { x: r.left + X(n.x), y: r.top + Y(n.y) };
  },
  speed(k: number) { timeScale = k; },
  /** Plays `seconds` with perfect routing, then freezes the frame (store screenshots). */
  scene(n: number, seconds: number) {
    startLevel(n);
    sim.auto = true;
    for (let i = 0; i < seconds * 60 && sim.status === 'play'; i++) step(sim, 1 / 60);
    sim.auto = false;
    refreshHud();
    frozen = true;
  },
};
