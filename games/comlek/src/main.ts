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
} from '@studio/kit';
import { LEVEL_COUNT, ROWS, heightOf, matchPercent, push, radiusAt, startProfile, starsFor, targetFor, type Kind, type Profile } from './game';
import { lang, t, type Key } from './i18n';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/comlek/PRIVACY.md';
declare const __APP_VERSION__: string;

document.documentElement.lang = lang;
document.title = t('title');

// ───────────────────────── glazes (skins) ─────────────────────────
type Pattern = 'plain' | 'stripes' | 'dots' | 'speckle' | 'rim';
interface Glaze { id: string; price: number; base: string; alt: string; pattern: Pattern }
const GLAZES: Glaze[] = [
  { id: 'terracotta', price: 0, base: '#c0663d', alt: '#8e4528', pattern: 'plain' },
  { id: 'celadon', price: 150, base: '#8fbfa4', alt: '#5e8f76', pattern: 'plain' },
  { id: 'honey', price: 200, base: '#e0a43a', alt: '#a8701c', pattern: 'rim' },
  { id: 'cobalt', price: 300, base: '#f4efe6', alt: '#2c4fa3', pattern: 'stripes' },
  { id: 'speckle', price: 300, base: '#efe3cf', alt: '#6b5544', pattern: 'speckle' },
  { id: 'rose', price: 400, base: '#e6a0a4', alt: '#b5646c', pattern: 'rim' },
  { id: 'iznik', price: 500, base: '#f7f5f0', alt: '#1f6fb5', pattern: 'dots' },
  { id: 'obsidian', price: 800, base: '#2a2730', alt: '#d6aa45', pattern: 'rim' },
];
const glazeName = (g: Glaze) => t(`g_${g.id}` as Key);
const swatch = (g: Glaze) =>
  g.pattern === 'stripes' ? `repeating-linear-gradient(0deg, ${g.base} 0 8px, ${g.alt} 8px 12px)`
  : g.pattern === 'dots' ? `radial-gradient(circle at 50% 50%, ${g.alt} 0 18%, transparent 20%) 0 0/14px 14px, ${g.base}`
  : g.pattern === 'speckle' ? `radial-gradient(circle, ${g.alt} 0 1.5px, transparent 2px) 0 0/7px 9px, ${g.base}`
  : g.pattern === 'rim' ? `linear-gradient(${g.alt} 0 22%, ${g.base} 22%)`
  : `linear-gradient(160deg, ${g.base}, ${g.alt})`;

// ───────────────────────── profile + meta ─────────────────────────
const store = createStore('comlek');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const profile = createProfile({
  game: 'comlek',
  levelCount: LEVEL_COUNT,
  defaultSkin: 'terracotta',
  skinIds: GLAZES.map((g) => g.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'pots', targets: [2, 4, 6], reward: (n) => 20 + n * 8 },
  ],
});

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  skins: GLAZES.map((g) => ({ id: g.id, name: glazeName(g), price: g.price, swatch: swatch(g) })),
  onSkin: (id) => (glazeId = id),
  levels: { count: LEVEL_COUNT, play: (n) => startLevel(n) },
  missionText: (id, n) => t(`mission_${id}` as Key, { n }),
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});

// ───────────────────────── state ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
const fireBtn = $<HTMLButtonElement>('fire-btn');
const glazesEl = $('glazes');
const hintEl = $('hint');
$('match-label').textContent = t('match');
hintEl.textContent = t('hint');

type Phase = 'shape' | 'glaze';
const state = {
  level: 1,
  phase: 'shape' as Phase,
  kind: 'cup' as Kind,
  clay: startProfile(),
  target: startProfile(),
  pct: 0,
  stars: 0,
  touched: false,
};
let glazeId = profile.data.skin;
let spin = 0;
let fireT = -1;
const pointers = new Map<number, { x: number; y: number }>();

function startLevel(n: number) {
  meta.hideHome();
  const tg = targetFor(n);
  Object.assign(state, { level: n, phase: 'shape', kind: tg.kind, clay: startProfile(), target: tg.profile, stars: 0, touched: false });
  glazeId = profile.data.skin;
  pointers.clear();
  fireT = -1;
  $('level').textContent = t('level', { n });
  $('kind').textContent = t(tg.kind);
  fireBtn.textContent = t('fire');
  glazesEl.hidden = true;
  hintEl.classList.toggle('gone', n > 3);
  updateMatch();
  track('game_start', { level: n });
}

function updateMatch() {
  state.pct = matchPercent(state.clay, state.target);
  $('match').textContent = `${state.pct}%`;
}

function fire() {
  if (state.phase !== 'shape' || meta.covering) return;
  updateMatch();
  state.stars = starsFor(state.pct);
  track('game_over', { level: state.level, match: state.pct, stars: state.stars });
  if (!state.stars) {
    haptic.error();
    tone({ freq: 220, to: 150, duration: 0.3, volume: 0.4 });
    meta.showFail({
      level: state.level,
      reason: t('failed', { n: state.pct }),
      onRetry: () => startLevel(state.level),
    });
    return;
  }
  fireT = performance.now();
  state.phase = 'glaze';
  hintEl.classList.add('gone');
  haptic.success();
  [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s, 392), duration: 0.25, volume: 0.35, delay: i * 0.08 }));
  fireBtn.textContent = t('done');
  renderGlazes();
}

function renderGlazes() {
  glazesEl.innerHTML = '';
  for (const g of GLAZES.filter((g) => profile.owns(g.id))) {
    const b = document.createElement('button');
    b.style.background = swatch(g);
    b.setAttribute('aria-label', glazeName(g));
    b.className = g.id === glazeId ? 'on' : '';
    b.addEventListener('click', () => {
      glazeId = g.id;
      haptic.light();
      tone({ freq: pentatonic(GLAZES.indexOf(g)), duration: 0.12, volume: 0.3 });
      renderGlazes();
    });
    glazesEl.appendChild(b);
  }
  glazesEl.hidden = false;
}

function finish() {
  if (state.phase !== 'glaze' || meta.covering) return;
  profile.progress('pots');
  track('level_complete', { level: state.level, stars: state.stars, glaze: glazeId });
  maybeRequestReview(profile.data.stars.filter((s) => s > 0).length, state.stars === 3);
  meta.showWin({
    level: state.level,
    stars: state.stars,
    coins: 10 + state.stars * 5,
    onNext: () => startLevel(Math.min(state.level + 1, LEVEL_COUNT)),
  });
}

fireBtn.addEventListener('click', () => (state.phase === 'shape' ? fire() : finish()));

function pause() {
  if (meta.covering) return;
  pointers.clear();
  meta.showPause({ onResume: () => {}, onRestart: () => startLevel(state.level) });
}
$('pause-btn').addEventListener('click', pause);

// ───────────────────────── layout + input ─────────────────────────
let W = 0, H = 0, dpr = 1;
const L = { cx: 0, base: 0, potH: 0, maxR: 0 };
function resize() {
  dpr = Math.min(3, window.devicePixelRatio || 1);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  L.cx = W / 2;
  L.base = H - 46;
  L.potH = Math.max(80, H - 90);
  L.maxR = Math.min(W * 0.44, L.potH * 0.5);
}
window.addEventListener('resize', resize);

const local = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
canvas.addEventListener('pointerdown', (e) => {
  if (state.phase !== 'shape' || meta.covering) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, local(e));
  haptic.light();
});
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, local(e));
});
const lift = (e: PointerEvent) => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);

let lastTick = 0;
function sculpt(dt: number, now: number) {
  if (state.phase !== 'shape' || meta.covering || !pointers.size) return;
  const h = heightOf(state.clay);
  let moved = 0;
  for (const p of pointers.values()) {
    const row = ((L.base - p.y) / (L.potH * h)) * ROWS - 0.5;
    if (row < -4 || row > ROWS + 4) continue;
    const x = Math.abs(p.x - L.cx) / L.maxR;
    const before = state.clay;
    state.clay = push(state.clay, row, x, 1 - Math.exp(-dt * 6));
    moved += before.reduce((s, r, i) => s + r - state.clay[i], 0);
  }
  if (moved > 0.002) {
    if (!state.touched) {
      state.touched = true;
      hintEl.classList.add('gone');
    }
    if (now - lastTick > 140) {
      lastTick = now;
      haptic.light();
    }
    updateMatch();
  }
}

// ───────────────────────── drawing ─────────────────────────
const CLAY = { base: '#b9774f', dark: '#7a4529', light: '#e2a982' };
function shade(c: string, k: number) {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawPot(p: Profile, glaze: Glaze | null, wet: boolean) {
  const h = heightOf(p);
  const rowH = (L.potH * h) / ROWS;
  const base = glaze ? glaze.base : CLAY.base;
  // smooth scanlines (2px) interpolated from the row profile
  const total = L.potH * h;
  for (let y = 0; y < total; y += 2) {
    const rp = radiusAt(p, h, (y + 1) / L.potH) * L.maxR;
    const i = Math.floor((y / total) * ROWS);
    let col = base;
    if (glaze?.pattern === 'stripes' && i % 10 >= 7) col = glaze.alt;
    if (glaze?.pattern === 'rim' && i >= ROWS - 5) col = glaze.alt;
    const g = ctx.createLinearGradient(L.cx - rp, 0, L.cx + rp, 0);
    g.addColorStop(0, shade(col, -0.45));
    g.addColorStop(0.3, shade(col, glaze ? 0.35 : 0.18));
    g.addColorStop(0.42, col);
    g.addColorStop(0.85, shade(col, -0.25));
    g.addColorStop(1, shade(col, -0.5));
    ctx.fillStyle = g;
    ctx.fillRect(L.cx - rp, L.base - y - 2.6, rp * 2, 2.6);
  }
  // pattern decorations / spin streaks, front half only (cos > 0)
  const marks = glaze ? (glaze.pattern === 'dots' ? 40 : glaze.pattern === 'speckle' ? 140 : 0) : wet ? 26 : 0;
  for (let k = 0; k < marks; k++) {
    const seed = Math.sin(k * 12.9898) * 43758.5453;
    const fr = seed - Math.floor(seed);
    const row = glaze?.pattern === 'dots' ? 8 + (k % 5) * 10 : Math.floor(fr * ROWS);
    if (row >= ROWS) continue;
    const ang = spin * (glaze ? 0.15 : 1) + k * 2.399;
    const c = Math.cos(ang);
    if (c <= 0.05) continue;
    const rp = p[row] * L.maxR;
    const x = L.cx + rp * Math.sin(ang);
    const y = L.base - (row + 0.5) * rowH;
    if (!glaze) {
      ctx.strokeStyle = `rgba(255,235,215,${0.22 * c})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - rp * 0.22 * c, y);
      ctx.lineTo(x + rp * 0.22 * c, y);
      ctx.stroke();
    } else {
      ctx.fillStyle = glaze.alt;
      ctx.globalAlpha = 0.5 + 0.5 * c;
      ctx.beginPath();
      const s = glaze.pattern === 'dots' ? Math.min(7, L.maxR * 0.06) : 1.4;
      ctx.ellipse(x, y, s * c, s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // top opening
  const top = p[ROWS - 1] * L.maxR;
  const ty = L.base - L.potH * h;
  ctx.fillStyle = shade(glaze ? glaze.alt : CLAY.dark, -0.3);
  ctx.beginPath();
  ctx.ellipse(L.cx, ty + 1, top * 0.86, Math.max(2, top * 0.12), 0, 0, Math.PI * 2);
  ctx.fill();
  if (wet) {
    ctx.strokeStyle = 'rgba(255,240,225,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(L.cx, ty + 1, top * 0.93, Math.max(2, top * 0.14), 0, 0, Math.PI);
    ctx.stroke();
  }
}

function outline(p: Profile) {
  const h = heightOf(p);
  ctx.beginPath();
  const steps = 90;
  for (let s = 0; s <= steps; s++) {
    const y = (s / steps) * h * 0.999;
    const r = radiusAt(p, h, y) * L.maxR;
    s ? ctx.lineTo(L.cx - r, L.base - y * L.potH) : ctx.moveTo(L.cx - r, L.base - y * L.potH);
  }
  for (let s = steps; s >= 0; s--) {
    const y = (s / steps) * h * 0.999;
    ctx.lineTo(L.cx + radiusAt(p, h, y) * L.maxR, L.base - y * L.potH);
  }
}

function draw(now: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const shaping = state.phase === 'shape';
  if (shaping) {
    // wheel
    const wr = L.maxR * 1.12;
    ctx.fillStyle = '#5b4a40';
    ctx.beginPath();
    ctx.ellipse(L.cx, L.base + 10, wr, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8b7566';
    ctx.beginPath();
    ctx.ellipse(L.cx, L.base + 2, wr, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const a = spin * 0.5 + (k * Math.PI) / 3;
      if (Math.sin(a) < 0) continue;
      ctx.beginPath();
      ctx.moveTo(L.cx + Math.cos(a) * wr * 0.75, L.base + 2 + Math.sin(a) * 13);
      ctx.lineTo(L.cx + Math.cos(a) * wr * 0.95, L.base + 2 + Math.sin(a) * 17);
      ctx.stroke();
    }
    drawPot(state.clay, null, true);
    // target silhouette
    outline(state.target);
    ctx.setLineDash([8, 7]);
    ctx.lineDashOffset = -now / 60;
    ctx.strokeStyle = 'rgba(59,42,32,0.75)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of pointers.values()) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // shelf
    const sw = Math.min(W - 24, L.maxR * 2.6);
    ctx.fillStyle = '#a8794f';
    ctx.fillRect(L.cx - sw / 2, L.base, sw, 14);
    ctx.fillStyle = '#7d5532';
    ctx.fillRect(L.cx - sw / 2, L.base + 14, sw, 8);
    ctx.fillStyle = 'rgba(59,42,32,0.18)';
    ctx.beginPath();
    ctx.ellipse(L.cx, L.base + 1, state.clay[0] * L.maxR * 1.1, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    drawPot(state.clay, GLAZES.find((g) => g.id === glazeId) ?? GLAZES[0], false);
    const k = fireT < 0 ? 0 : 1 - (now - fireT) / 900;
    if (k > 0) {
      ctx.fillStyle = `rgba(255,140,40,${0.55 * k})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
  spin += dt * (state.phase === 'shape' ? 9 : 1);
  sculpt(dt, now);
  draw(now);
  requestAnimationFrame(frame);
}

// ───────────────────────── boot ─────────────────────────
resize();
startLevel(Math.min(profile.data.unlocked, LEVEL_COUNT));
requestAnimationFrame(frame);
trackSession('comlek');
void setupNative({
  darkBackground: false,
  onBack: () => meta.back() || (!meta.covering && (pause(), true)) || true,
});
void initAds();
void initStore();
meta.showHome();

// e2e / screenshot hook
(window as unknown as { __comlek: object }).__comlek = {
  state,
  perfect: () => {
    state.clay = state.target.slice();
    state.touched = true;
    updateMatch();
  },
  set: (p: Profile) => {
    state.clay = p.slice();
    state.touched = true;
    hintEl.classList.add('gone');
    updateMatch();
  },
  fire,
  finish,
  start: startLevel,
  glaze: (id: string) => {
    glazeId = id;
    if (state.phase === 'glaze') renderGlazes();
  },
};
