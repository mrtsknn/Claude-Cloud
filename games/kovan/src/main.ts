import './style.css';
import {
  createProfile,
  createMeta,
  createStore,
  initAds,
  initStore,
  setupNative,
  setSoundEnabled,
  setHapticsEnabled,
  haptic,
  tone,
  pentatonic,
  unlockAudio,
  track,
  showRewarded,
  type MetaSkin,
} from '@studio/kit';
import * as G from './game';
import { fmt, fmtTime } from './format';
import { t, lang } from './i18n';

declare const __APP_VERSION__: string;
document.documentElement.lang = lang;
document.title = t('title');

// ───────── themes (shop skins) ─────────
interface Theme {
  id: string;
  price: number;
  bg: string; // page background
  deep: string; // solid fallback / gradient bottom
  cell: string; // filled honeycomb cell
  empty: string; // empty cell
  edge: string; // cell outline (wax)
  ink: string;
  accent: string;
}
const THEMES: Theme[] = [
  { id: 'amber', price: 0, bg: '#4a2c0c', deep: '#2b1a08', cell: '#f6b93b', empty: '#6b4416', edge: '#ffd77a', ink: '#3a2205', accent: '#ffc83d' },
  { id: 'mint', price: 150, bg: '#0f3b33', deep: '#082420', cell: '#7fe0b5', empty: '#1b5a4d', edge: '#c8ffe6', ink: '#0b2a24', accent: '#7fe0b5' },
  { id: 'lavender', price: 200, bg: '#33285c', deep: '#1c1636', cell: '#b9a4ff', empty: '#4a3c80', edge: '#e2d8ff', ink: '#221a44', accent: '#c9b8ff' },
  { id: 'night', price: 300, bg: '#141a33', deep: '#0a0d1c', cell: '#ffd35c', empty: '#26305a', edge: '#5d6ca8', ink: '#141a33', accent: '#ffd35c' },
  { id: 'berry', price: 300, bg: '#4a1430', deep: '#2a0a1a', cell: '#ff8fb1', empty: '#6e2347', edge: '#ffd0de', ink: '#3a0e24', accent: '#ff9ebd' },
  { id: 'forest', price: 400, bg: '#1e3312', deep: '#101d09', cell: '#c2e25a', empty: '#34521f', edge: '#e8ffaa', ink: '#1a2a0e', accent: '#c2e25a' },
  { id: 'ocean', price: 500, bg: '#0c2f4a', deep: '#061a2a', cell: '#5fd0ff', empty: '#174a6e', edge: '#c4efff', ink: '#082236', accent: '#6fd6ff' },
];
const SKINS: MetaSkin[] = THEMES.map((th) => ({
  id: th.id,
  name: t(`skin_${th.id}` as 'skin_amber'),
  price: th.price,
  swatch: `radial-gradient(circle at 50% 40%, ${th.cell} 0 34%, ${th.edge} 35% 40%, ${th.bg} 41%)`,
}));
let theme = THEMES[0];
function applySkin(id: string) {
  theme = THEMES.find((x) => x.id === id) ?? THEMES[0];
  const r = document.documentElement.style;
  r.setProperty('--bg', theme.bg);
  r.setProperty('--deep', theme.deep);
  r.setProperty('--cell', theme.cell);
  r.setProperty('--edge', theme.edge);
  r.setProperty('--ink', theme.ink);
  r.setProperty('--accent', theme.accent);
  r.setProperty('--m-bg', `radial-gradient(120% 80% at 50% 0%, ${theme.bg}, ${theme.deep})`);
  r.setProperty('--m-accent', theme.accent);
  r.setProperty('--m-accent-ink', theme.ink);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.deep);
}

// ───────── profile / meta ─────────
const store = createStore('kovan');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const profile = createProfile({
  game: 'kovan',
  levelCount: 1,
  defaultSkin: 'amber',
  skinIds: THEMES.map((x) => x.id),
  missions: [
    { id: 'merges', targets: [10, 25, 50], reward: (n) => 20 + n },
    { id: 'spawns', targets: [15, 40, 80], reward: (n) => 15 + Math.round(n / 2) },
    { id: 'newBee', targets: [1, 2, 3], reward: (n) => 30 + n * 15 },
  ],
});
applySkin(profile.data.skin);

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: 'https://indiestudio.app/kovan/privacy',
  profile,
  skins: SKINS,
  onSkin: applySkin,
  endless: { title: t('myHive'), play: enterHive },
  missionText: (id, n) => t(`mission_${id}` as 'mission_merges', { n }),
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});

// ───────── state ─────────
const SAVE_KEY = 'kovan.hive';
function loadState(): G.State {
  try {
    return G.sanitize(JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'), Date.now());
  } catch {
    return G.newState(Date.now());
  }
}
let state = loadState();
function save() {
  state.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* storage blocked */
  }
}

// ───────── DOM ─────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
const honeyEl = $('honey');
const rateEl = $('rate');
const coinsEl = $('coins');
const eggBtn = $<HTMLButtonElement>('egg-btn');
const eggCost = $('egg-cost');
const goldBtn = $<HTMLButtonElement>('gold-btn');
const sheet = $('sheet');
const sheetBody = $('sheet-body');
const toastEl = $('toast');
$('gold-price').textContent = String(G.GOLDEN_PRICE);
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((e) => (e.textContent = t(e.dataset.i18n as 'egg')));

let toastTimer = 0;
function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), 1600);
}

let onSheetClose: (() => void) | null = null;
function openSheet(html: string, onClose?: () => void) {
  sheetBody.innerHTML = html;
  sheet.hidden = false;
  onSheetClose = onClose ?? null;
}
function closeSheet() {
  if (sheet.hidden) return false;
  sheet.hidden = true;
  const cb = onSheetClose;
  onSheetClose = null;
  cb?.();
  return true;
}
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) closeSheet();
});

// ───────── bee drawing ─────────
const SQ3 = Math.sqrt(3);
const beeHue = (l: number) => (42 + (l - 1) * 47) % 360;

function hexPath(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    c.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  c.closePath();
}

function drawBee(c: CanvasRenderingContext2D, x: number, y: number, R: number, level: number, time: number) {
  const s = R * (0.5 + level * 0.012);
  const hue = beeHue(level);
  const flap = Math.sin(time * 18 + level) * 0.25;
  c.save();
  c.translate(x, y);
  // wings
  c.fillStyle = 'rgba(255,255,255,.75)';
  c.strokeStyle = 'rgba(40,40,60,.35)';
  c.lineWidth = Math.max(1, s * 0.04);
  for (const side of [-1, 1]) {
    c.save();
    c.translate(side * s * 0.2, -s * 0.45);
    c.rotate(side * (0.5 + flap));
    c.beginPath();
    c.ellipse(0, -s * 0.22, s * 0.22, s * 0.36, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
  }
  // halo for elders
  if (level >= 15) {
    c.strokeStyle = `hsla(${hue},100%,75%,.8)`;
    c.lineWidth = s * 0.08;
    c.beginPath();
    c.arc(0, 0, s * 0.85, 0, Math.PI * 2);
    c.stroke();
  }
  // body
  c.beginPath();
  c.ellipse(0, 0, s * 0.62, s * 0.5, 0, 0, Math.PI * 2);
  c.fillStyle = `hsl(${hue},85%,${level === 20 ? 62 : 58}%)`;
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = `hsl(${hue},60%,18%)`;
  const stripes = 1 + (level % 3);
  for (let k = 0; k < stripes; k++) c.fillRect(-s * 0.05 + (k - (stripes - 1) / 2) * s * 0.3, -s, s * 0.13, s * 2);
  if (level > 10) {
    c.fillStyle = 'rgba(255,255,255,.55)';
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      c.arc(-s * 0.35 + k * s * 0.24, s * 0.28 * (k % 2 ? 1 : -1), s * 0.06, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
  c.lineWidth = Math.max(1.5, s * 0.07);
  c.strokeStyle = `hsl(${hue},60%,18%)`;
  c.beginPath();
  c.ellipse(0, 0, s * 0.62, s * 0.5, 0, 0, Math.PI * 2);
  c.stroke();
  // eyes
  c.fillStyle = '#1b1426';
  for (const ex of [-0.2, 0.2]) {
    c.beginPath();
    c.arc(s * ex - s * 0.28 * 0, -s * 0.08, s * 0.07, 0, Math.PI * 2);
    c.fill();
  }
  // crown for the queen
  if (level === 20) {
    c.fillStyle = '#ffd23f';
    c.beginPath();
    c.moveTo(-s * 0.3, -s * 0.45);
    c.lineTo(-s * 0.3, -s * 0.75);
    c.lineTo(-s * 0.15, -s * 0.58);
    c.lineTo(0, -s * 0.8);
    c.lineTo(s * 0.15, -s * 0.58);
    c.lineTo(s * 0.3, -s * 0.75);
    c.lineTo(s * 0.3, -s * 0.45);
    c.fill();
  }
  // level badge
  c.fillStyle = 'rgba(0,0,0,.55)';
  c.beginPath();
  c.arc(s * 0.55, s * 0.42, s * 0.24, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#fff';
  c.font = `800 ${s * 0.3}px ui-rounded, system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(level), s * 0.55, s * 0.43);
  c.restore();
}

function drawGift(c: CanvasRenderingContext2D, x: number, y: number, R: number, time: number) {
  const s = R * 0.55;
  c.save();
  c.translate(x, y);
  c.rotate(Math.sin(time * 6) * 0.08);
  c.fillStyle = '#ff6b8b';
  c.beginPath();
  c.roundRect(-s * 0.6, -s * 0.35, s * 1.2, s * 0.95, s * 0.12);
  c.fill();
  c.fillStyle = '#ff8fa6';
  c.beginPath();
  c.roundRect(-s * 0.7, -s * 0.55, s * 1.4, s * 0.3, s * 0.1);
  c.fill();
  c.fillStyle = '#fff2b0';
  c.fillRect(-s * 0.1, -s * 0.55, s * 0.2, s * 1.15);
  c.beginPath();
  c.ellipse(-s * 0.2, -s * 0.66, s * 0.2, s * 0.12, -0.4, 0, Math.PI * 2);
  c.ellipse(s * 0.2, -s * 0.66, s * 0.2, s * 0.12, 0.4, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// ───────── layout & render ─────────
let W = 0;
let H = 0;
let R = 20;
let centers: { x: number; y: number }[] = [];
function layout() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const [cols, rows] = G.gridOf(state);
  R = Math.min(W / ((cols + 0.5) * SQ3), H / ((rows - 1) * 1.5 + 2)) * 0.97;
  const ox = (W - (cols + 0.5) * SQ3 * R) / 2 + (SQ3 * R) / 2;
  const oy = (H - ((rows - 1) * 1.5 + 2) * R) / 2 + R;
  centers = state.cells.map((_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return { x: ox + c * SQ3 * R + (r % 2 ? (SQ3 * R) / 2 : 0), y: oy + r * 1.5 * R };
  });
}
window.addEventListener('resize', layout);

const pops = new Map<number, number>(); // cell → time of spawn/merge (pop-in)
interface Fx {
  x: number;
  y: number;
  t0: number;
  text?: string;
  ring?: boolean;
}
let fx: Fx[] = [];
let drag: { from: number; x: number; y: number } | null = null;
let now = performance.now() / 1000;

function cellAt(x: number, y: number) {
  let best = -1;
  let bd = R * R * 0.9;
  centers.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

function render() {
  ctx.clearRect(0, 0, W, H);
  const target = drag ? cellAt(drag.x, drag.y) : -1;
  const dragLvl = drag ? state.cells[drag.from] : 0;
  state.cells.forEach((v, i) => {
    const p = centers[i];
    if (!p) return;
    hexPath(ctx, p.x, p.y, R * 0.94);
    ctx.fillStyle = v === 0 ? theme.empty : theme.cell;
    ctx.globalAlpha = v === 0 ? 1 : 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(2, R * 0.07);
    const hot = drag && i === target && i !== drag.from && state.cells[i] === dragLvl;
    ctx.strokeStyle = hot ? '#ffffff' : theme.edge;
    if (hot) ctx.lineWidth *= 2;
    ctx.stroke();
  });
  state.cells.forEach((v, i) => {
    const p = centers[i];
    if (!p || v === 0 || (drag && drag.from === i)) return;
    const age = now - (pops.get(i) ?? -9);
    const sc = age < 0.3 ? 0.4 + 0.6 * Math.sin((age / 0.3) * (Math.PI / 2)) * 1.08 : 1;
    ctx.save();
    ctx.translate(p.x, p.y + Math.sin(now * 2.2 + i) * R * 0.04);
    ctx.scale(sc, sc);
    if (v > 0) drawBee(ctx, 0, 0, R, v, now + i * 0.1);
    else drawGift(ctx, 0, 0, R, now);
    ctx.restore();
  });
  if (drag) drawBee(ctx, drag.x, drag.y - R * 0.3, R * 1.15, dragLvl, now);
  fx = fx.filter((f) => now - f.t0 < 1);
  for (const f of fx) {
    const a = now - f.t0;
    ctx.globalAlpha = 1 - a;
    if (f.ring) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4 * (1 - a);
      ctx.beginPath();
      ctx.arc(f.x, f.y, R * (0.5 + a * 1.2), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (f.text) {
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.max(12, R * 0.32)}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y - R * 0.5 - a * R * 0.7);
    }
    ctx.globalAlpha = 1;
  }
}

// ───────── HUD ─────────
function hud() {
  honeyEl.textContent = fmt(state.honey);
  rateEl.textContent = t('perSec', { n: fmt(G.rate(state)) });
  coinsEl.textContent = String(profile.data.coins);
  const cost = G.spawnCost(state);
  eggCost.textContent = fmt(cost);
  eggBtn.classList.toggle('poor', state.honey < cost || G.freeCells(state).length === 0);
  goldBtn.classList.toggle('poor', profile.data.coins < G.GOLDEN_PRICE);
  const canUp = G.expandCost(state) <= state.honey || G.spawnUpCost(state) <= state.honey;
  $('up-badge').hidden = !canUp;
}
profile.onChange(hud);

// ───────── actions ─────────
let inHive = false;

function popAt(i: number) {
  pops.set(i, now);
}

function onSpawned(i: number, level: number) {
  popAt(i);
  fx.push({ ...centers[i], t0: now, ring: true });
  tone({ freq: pentatonic(level), duration: 0.09, volume: 0.35, type: 'triangle' });
  haptic.light();
}

eggBtn.addEventListener('click', () => {
  unlockAudio();
  if (!G.freeCells(state).length) return toast(t('full'));
  if (state.honey < G.spawnCost(state)) return toast(t('noHoney'));
  const i = G.spawn(state);
  if (i < 0) return;
  onSpawned(i, state.cells[i]);
  profile.progress('spawns');
  hud();
});

goldBtn.addEventListener('click', () => {
  unlockAudio();
  if (!G.freeCells(state).length) return toast(t('full'));
  if (!profile.spend(G.GOLDEN_PRICE)) return meta.openShop('coins');
  const i = G.goldenEgg(state);
  onSpawned(i, state.cells[i]);
  track('golden_egg', { level: state.cells[i] });
  save();
});

$('coins-btn').addEventListener('click', () => meta.openShop('coins'));
$('menu-btn').addEventListener('click', openPause);
$('up-btn').addEventListener('click', openUpgrades);

function openPause() {
  save();
  meta.showPause({ onResume: () => {}, onRestart: () => {}, onMenu: leaveHive });
}

function openUpgrades() {
  const [c0, r0] = G.gridOf(state);
  const next = G.GRIDS[state.expansion + 1];
  const ec = G.expandCost(state);
  const sc = G.spawnUpCost(state);
  const lockedAt = state.spawnLevel + 3;
  openSheet(`<h2>${t('upgrades')}</h2>
    <div class="up-row"><span><b>${t('expand')}</b><small>${next ? t('expandSub', { a: c0 * r0, b: next[0] * next[1] }) : t('expandMax')}</small></span>
      <button class="btn small" data-up="expand" ${next && ec <= state.honey ? '' : 'disabled'}>${next ? `🍯 ${fmt(ec)}` : '✓'}</button></div>
    <div class="up-row"><span><b>${t('eggs')}</b><small>${sc < Infinity ? t('eggsSub', { n: state.spawnLevel + 1 }) : t('eggsLocked', { n: lockedAt })}</small></span>
      <button class="btn small" data-up="eggs" ${sc <= state.honey ? '' : 'disabled'}>${sc < Infinity ? `🍯 ${fmt(sc)}` : '🔒'}</button></div>
    <button class="btn ghost" data-close>${t('close')}</button>`);
  sheetBody.querySelector('[data-up="expand"]')?.addEventListener('click', () => {
    if (G.expand(state)) {
      layout();
      tone({ freq: 392, to: 784, duration: 0.3, volume: 0.4 });
      haptic.success();
      track('expand', { expansion: state.expansion });
      save();
    }
    openUpgrades();
  });
  sheetBody.querySelector('[data-up="eggs"]')?.addEventListener('click', () => {
    if (G.upgradeSpawn(state)) {
      haptic.success();
      track('spawn_upgrade', { level: state.spawnLevel });
      save();
    }
    openUpgrades();
  });
  sheetBody.querySelector('[data-close]')!.addEventListener('click', closeSheet);
}

function celebrate(level: number) {
  const name = G.BEE_NAMES[lang][level - 1];
  profile.progress('newBee');
  profile.recordBest(level);
  profile.addCoins(level * 2);
  track('new_best', { level });
  [0, 2, 4, 7, 9].forEach((s, k) => tone({ freq: pentatonic(s + level % 5), duration: 0.16, volume: 0.35, delay: k * 0.07 }));
  haptic.success();
  openSheet(`<div class="celebrate"><p class="eyebrow">${t('newBee')}</p><canvas width="240" height="240"></canvas>
    <h2>${name}</h2><p class="muted">${t('level', { n: level })} · ${t('perSec', { n: fmt(G.prodOf(level)) })}</p>
    <p class="note">${t('giftNote')}</p><button class="btn" data-close>${t('great')}</button></div>`);
  const cv = sheetBody.querySelector('canvas')!;
  const c2 = cv.getContext('2d')!;
  const spin = () => {
    if (sheet.hidden || !cv.isConnected) return;
    c2.clearRect(0, 0, 240, 240);
    drawBee(c2, 120, 130, 120, level, performance.now() / 1000);
    requestAnimationFrame(spin);
  };
  spin();
  sheetBody.querySelector('[data-close]')!.addEventListener('click', closeSheet);
}

function showOffline(o: G.Offline) {
  openSheet(`<div class="celebrate"><p class="eyebrow">${t('awayTitle')}</p><div class="big">🍯 ${fmt(o.honey)}</div>
    <p class="muted">${t('awaySub', { t: fmtTime(o.seconds) })}</p>
    <button class="btn" data-collect>${t('collect')}</button><button class="btn alt" data-double>▶ ${t('double')}</button></div>`);
  let done = false;
  const give = (mult: number) => {
    if (done) return;
    done = true;
    state.honey += o.honey * mult;
    tone({ freq: 523, to: 1046, duration: 0.25, volume: 0.4 });
    haptic.success();
    save();
    hud();
    closeSheet();
  };
  sheetBody.querySelector('[data-collect]')!.addEventListener('click', () => give(1));
  sheetBody.querySelector('[data-double]')!.addEventListener('click', async () => {
    if (await showRewarded('offline_double')) give(2);
  });
  onSheetClose = () => give(1);
}

/** Banks time away (app closed or backgrounded) when it is at least a minute. */
function checkOffline() {
  const o = G.offlineEarnings(state, Date.now());
  state.lastSeen = Date.now();
  if (o.seconds >= 60 && o.honey >= 1) showOffline(o);
}

function enterHive() {
  inHive = true;
  document.body.classList.add('in-hive');
  layout();
  hud();
  track('game_start');
  if (pendingOffline) {
    showOffline(pendingOffline);
    pendingOffline = null;
  }
  if (profile.data.firstRun) {
    toast(t('hint'));
    profile.finishFirstRun();
  }
}
function leaveHive() {
  inHive = false;
  closeSheet();
  document.body.classList.remove('in-hive');
  save();
}

// ───────── drag & drop ─────────
const pt = (e: PointerEvent) => {
  const b = canvas.getBoundingClientRect();
  return { x: e.clientX - b.left, y: e.clientY - b.top };
};
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const p = pt(e);
  const i = cellAt(p.x, p.y);
  if (i < 0) return;
  const v = state.cells[i];
  if (v < 0) {
    const lvl = G.openGift(state, i);
    popAt(i);
    fx.push({ ...centers[i], t0: now, ring: true, text: '🎁' });
    tone({ freq: pentatonic(lvl + 3), duration: 0.15, volume: 0.4 });
    haptic.medium();
    save();
    return;
  }
  if (v > 0) {
    drag = { from: i, ...p };
    canvas.setPointerCapture(e.pointerId);
    haptic.light();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  Object.assign(drag, pt(e));
});
const endDrag = (e: PointerEvent) => {
  if (!drag) return;
  const p = pt(e);
  const from = drag.from;
  drag = null;
  const to = cellAt(p.x, p.y);
  if (to < 0 || to === from) return;
  const res = G.merge(state, from, to);
  if (res) {
    popAt(to);
    fx.push({ ...centers[to], t0: now, ring: true });
    tone({ freq: pentatonic(res.level), duration: 0.14, volume: 0.45 });
    tone({ freq: pentatonic(res.level + 2), duration: 0.14, volume: 0.35, delay: 0.06 });
    haptic.medium();
    profile.progress('merges');
    if (res.gift >= 0) popAt(res.gift);
    if (res.newBest) celebrate(res.level);
    save();
  } else if (G.move(state, from, to)) {
    popAt(to);
    haptic.light();
  }
  hud();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => (drag = null));

// ───────── loop ─────────
let last = performance.now();
let saveAcc = 0;
let floatAcc = 0;
let floatIdx = 0;
function frame(ms: number) {
  const dt = Math.min(1, Math.max(0, (ms - last) / 1000));
  last = ms;
  now = ms / 1000;
  G.tick(state, dt);
  saveAcc += dt;
  if (saveAcc > 2) {
    saveAcc = 0;
    save();
  }
  if (inHive) {
    floatAcc += dt;
    if (floatAcc > 0.6) {
      floatAcc = 0;
      const bees = state.cells.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
      if (bees.length) {
        const i = bees[floatIdx++ % bees.length];
        if (centers[i] && drag?.from !== i)
          fx.push({ ...centers[i], t0: now, text: `+${fmt(G.prodOf(state.cells[i]) * G.hiveBonus(state))}` });
      }
    }
    render();
    hud();
  }
  requestAnimationFrame(frame);
}

// ───────── boot ─────────
let pendingOffline: G.Offline | null = null;
{
  const o = G.offlineEarnings(state, Date.now());
  state.lastSeen = Date.now();
  if (o.seconds >= 60 && o.honey >= 1) pendingOffline = o;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
  else {
    last = performance.now();
    if (inHive) checkOffline();
    else {
      const o = G.offlineEarnings(state, Date.now());
      state.lastSeen = Date.now();
      if (o.seconds >= 60 && o.honey >= 1) pendingOffline = o;
    }
  }
});

void setupNative({
  onBack: () => {
    if (meta.back()) return true;
    if (closeSheet()) return true;
    if (inHive && !meta.covering) {
      openPause();
      return true;
    }
    return false;
  },
  onPause: save,
});
void initAds();
void initStore();
profile.recordBest(state.best);
meta.showHome();
requestAnimationFrame(frame);

// test hooks (e2e / screenshots)
(window as unknown as { __kovan: unknown }).__kovan = {
  get state() {
    return state;
  },
  set state(s: G.State) {
    state = G.sanitize(s, Date.now());
    layout();
  },
  center: (i: number) => {
    const b = canvas.getBoundingClientRect();
    return { x: b.left + centers[i].x, y: b.top + centers[i].y };
  },
  save,
  profile,
};
