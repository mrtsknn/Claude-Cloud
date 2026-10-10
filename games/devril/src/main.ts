import './style.css';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import {
  createMeta,
  createProfile,
  createStore,
  haptic,
  initAds,
  initStore,
  isNative,
  maybeRequestReview,
  pentatonic,
  rewardedAvailable,
  setHapticsEnabled,
  setSoundEnabled,
  setupNative,
  showRewarded,
  tone,
  track,
  trackSession,
  unlockAudio,
} from '@studio/kit';
import { DX, DY, LEVEL_COUNT, generateLevel, hintFor, rotateCw, simulate, solve, starsFor, type Dir, type Level } from './game';
import { t } from './i18n';
import { SKINS, type Palette } from './skins';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/devril/PRIVACY.md';
declare const __APP_VERSION__: string;

/** Canvas palette; the material part is swapped by the equipped skin (see applySkin). */
let C: Palette & { bad: string; hint: string } = { ...SKINS[0].colors, bad: '#d24b3c', hint: '#f2b43c' };
let CONFETTI = ['#d9643a', '#f2b43c', '#5f9a6c', '#ecc99c', '#7fb0c9', '#ffffff'];
const HINT_COINS = 40;
const STEP = 150; // ms between chain links
const FALL = 230; // ms a tile takes to tip over

// ───────────────────────── persistence ─────────────────────────
interface Save {
  level: number;
  dirs: Dir[];
  taps: number;
  /** `hint` marks turns made by a hint: undoing one never gives back a tap. */
  history: { tile: number; prev: Dir; hint?: boolean }[];
  hintsUsed: number;
  pushes: number;
}

const store = createStore('devril');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

function freshLevel(level: number): Save {
  return { level, dirs: generateLevel(level).scrambled.slice(), taps: 0, history: [], hintsUsed: 0, pushes: 0 };
}

function loadSave(): Save {
  const s = store.get<Save | null>('save', null);
  if (!s || !(s.level >= 1 && s.level <= LEVEL_COUNT)) return freshLevel(1);
  const lv = generateLevel(s.level);
  if (!Array.isArray(s.dirs) || s.dirs.length !== lv.tiles.length) return freshLevel(s.level);
  return s;
}

let S = loadSave();
let L: Level = generateLevel(S.level);
let levelStartedAt = Date.now();
const save = () => store.set('save', S);

trackSession('devril');

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;

document.documentElement.lang = navigator.language.slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
});

let toastTimer = 0;
function toast(text: string, ms = 2200) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

type Phase = 'edit' | 'falling' | 'failed' | 'won';
let phase: Phase = 'edit';

function refreshHud() {
  $('level').textContent = String(S.level);
  $('taps').textContent = String(S.taps);
  $('par').textContent = String(L.par);
  const best = profile.data.stars[S.level - 1] ?? 0;
  $('level-stars').querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < best));
  $('meter-cap').hidden = S.hintsUsed === 0;
  const badge = $('hint-badge');
  badge.innerHTML = S.hintsUsed === 0 ? '1' : `${COIN}${HINT_COINS}`;
  badge.classList.toggle('paid', S.hintsUsed > 0);
  const push = $<HTMLButtonElement>('push-btn');
  push.classList.toggle('reset', phase === 'failed');
  push.disabled = phase === 'falling' || phase === 'won';
  $('push-label').textContent = t(phase === 'failed' ? 'reset' : 'push');
  $<HTMLButtonElement>('undo-btn').disabled = phase === 'falling';
  $<HTMLButtonElement>('hint-btn').disabled = phase === 'falling';
  updateTutorial();
}

// ───────────────────────── layout ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
let bx = 0;
let by = 0;
let cell = 0;

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const bs = Math.min(W - 28, H - 24, 560);
  cell = bs / L.size;
  bx = (W - bs) / 2;
  by = (H - bs) / 2;
  canvas.dataset.layout = JSON.stringify({ bx, by, cell, size: L.size, tiles: L.tiles.map((t) => [t.x, t.y]) });
  updateTutorial();
}
window.addEventListener('resize', layout);

// ───────────────────────── animation state ─────────────────────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOutBack = (x: number) => {
  x = clamp01(x);
  const c1 = 1.9;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

let angle: number[] = []; // displayed arrow angle in quarter turns (can exceed 3)
let rotFrom: number[] = [];
let rotT0: number[] = [];
let fallT0: number[] = []; // Infinity = standing
let sounded: boolean[] = [];
let shakeT0: number[] = [];
let hintGlow: { tile: number; t0: number } | null = null;
let failAt = 0;
let standing: number[] = [];
interface Particle { x: number; y: number; vx: number; vy: number; color: string; t0: number; life: number; size: number; spin: number }
let particles: Particle[] = [];
let frozenAt: number | null = null; // screenshot hook

function resetAnim() {
  angle = S.dirs.map((d) => d);
  rotFrom = angle.slice();
  rotT0 = S.dirs.map(() => -1e9);
  fallT0 = S.dirs.map(() => Infinity);
  sounded = S.dirs.map(() => false);
  shakeT0 = S.dirs.map(() => -1e9);
  standing = [];
}
resetAnim();

// ───────────────────────── drawing ─────────────────────────
function rr(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawArrow(s: number, alpha: number, color = C.arrow) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.11;
  // shaft + chevron pointing up (rotation applied by caller)
  ctx.beginPath();
  ctx.moveTo(0, s * 0.24);
  ctx.lineTo(0, -s * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, -s * 0.04);
  ctx.lineTo(0, -s * 0.27);
  ctx.lineTo(s * 0.2, -s * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPin(x: number, y: number, s: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.arc(x + s * 0.02, y + s * 0.03, s * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.pin;
  ctx.beginPath();
  ctx.arc(x, y, s * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(x - s * 0.03, y - s * 0.03, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
}

function drawStartBadge(x: number, y: number, s: number) {
  ctx.fillStyle = C.startArrow;
  ctx.beginPath();
  ctx.arc(x, y, s * 0.15, 0, Math.PI * 2);
  ctx.fill();
  // the same pointing hand as the tutorial, shrunk into the badge
  const k = (s * 0.19) / 64;
  ctx.save();
  ctx.translate(x - 32 * k, y - 31 * k);
  ctx.scale(k, k);
  ctx.fillStyle = C.startEdge;
  ctx.fill(HAND);
  ctx.restore();
}
const HAND = new Path2D('M26 30V10a5 5 0 0 1 10 0v16l13 3c4 1 6 4 5 8l-3 13c-1 5-5 8-10 8H30c-3 0-6-2-8-4L11 41c-2-3-1-6 2-7 2-1 5 0 6 2l7 8z');

/** One tile at cell centre (cx, cy). k = fall progress 0..1. */
function drawTile(i: number, cx: number, cy: number, now: number, k: number) {
  const tile = L.tiles[i];
  const isStart = i === L.start;
  const s = cell * 0.8;
  const dir = S.dirs[i];
  // rotation animation
  const rp = easeOutBack((now - rotT0[i]) / 260);
  const a = rotFrom[i] + (angle[i] - rotFrom[i]) * rp;
  // shake (locked tap) / wobble (left standing after a failed push)
  let ox = 0;
  const sp = (now - shakeT0[i]) / 320;
  if (sp >= 0 && sp < 1) ox = Math.sin(sp * Math.PI * 6) * (1 - sp) * cell * 0.08;
  const failed = phase === 'failed' && standing.includes(i);
  if (failed) ox += Math.sin((now - failAt) / 70) * Math.max(0, 1 - (now - failAt) / 600) * cell * 0.05;

  const fx = DX[dir];
  const fy = DY[dir];
  const kk = k * k; // gravity-ish
  const depth = cell * 0.09 * (1 - kk) + cell * 0.02 * kk;
  // standing: square top face; fallen: flat slab reaching into the next cell
  const along = s + cell * 0.5 * kk;
  const across = s * (1 - 0.32 * kk);
  const off = cell * 0.27 * kk;
  const w = fx !== 0 ? along : across;
  const h = fx !== 0 ? across : along;
  const x = cx + ox + fx * off - w / 2;
  const y = cy + fy * off - h / 2 - depth * 0.4;

  // shadow, stretching toward the fall direction while tipping
  ctx.fillStyle = C.shadow;
  const sh = cell * 0.12 * Math.sin(Math.PI * Math.min(1, k));
  rr(x + fx * sh, y + fy * sh + depth + cell * 0.035, w, h, s * 0.18);
  ctx.fill();
  // side (thickness)
  ctx.fillStyle = isStart ? C.startEdge : C.woodEdge;
  rr(x, y + depth, w, h, s * 0.18);
  ctx.fill();
  // top face
  const g = ctx.createLinearGradient(x, y, x, y + h);
  if (isStart) {
    g.addColorStop(0, C.startLight);
    g.addColorStop(1, C.start);
  } else if (k >= 1) {
    g.addColorStop(0, C.woodFallen);
    g.addColorStop(1, C.woodFallen);
  } else {
    g.addColorStop(0, C.woodLight);
    g.addColorStop(1, C.wood);
  }
  ctx.fillStyle = g;
  rr(x, y, w, h, s * 0.18);
  ctx.fill();
  // grain lines
  ctx.strokeStyle = C.grain;
  ctx.lineWidth = 1;
  for (let gI = 1; gI <= 2; gI++) {
    ctx.beginPath();
    ctx.moveTo(x + w * 0.14, y + (h * gI) / 3 + cell * 0.03);
    ctx.quadraticCurveTo(x + w / 2, y + (h * gI) / 3 - cell * 0.04, x + w * 0.86, y + (h * gI) / 3 + cell * 0.02);
    ctx.stroke();
  }
  if (failed) {
    const pulse = 0.5 + 0.5 * Math.sin((now - failAt) / 160);
    ctx.strokeStyle = C.bad;
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    ctx.lineWidth = Math.max(2.5, cell * 0.06);
    rr(x - 2, y - 2, w + 4, h + depth + 4, s * 0.22);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (hintGlow && hintGlow.tile === i) {
    const p = (now - hintGlow.t0) / 2400;
    if (p >= 1) hintGlow = null;
    else {
      ctx.strokeStyle = C.hint;
      ctx.globalAlpha = 1 - p * p;
      ctx.lineWidth = Math.max(3, cell * 0.07);
      rr(x - 3, y - 3, w + 6, h + depth + 6, s * 0.24);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // arrow
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((a * Math.PI) / 2);
  drawArrow(s, 1 - 0.65 * kk, isStart ? C.startArrow : C.arrow);
  ctx.restore();
  if (k < 0.5) {
    if (tile.locked) drawPin(x + w - s * 0.18, y + s * 0.18, s);
    if (isStart) drawStartBadge(x + s * 0.18, y + s * 0.18, s);
  }
}

let wasCovering: boolean | null = null;
function frame(nowReal: number) {
  const now = frozenAt ?? nowReal;
  // Hide the tutorial hand/tip and toasts while a meta screen covers the game.
  if (meta.covering !== wasCovering) {
    wasCovering = meta.covering;
    document.body.classList.toggle('covered', wasCovering);
    updateStatusBar();
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const bs = cell * L.size;
  // board
  ctx.fillStyle = C.board;
  rr(bx - 8, by - 8, bs + 16, bs + 16, 22);
  ctx.fill();
  ctx.fillStyle = C.cell;
  for (let y = 0; y < L.size; y++) {
    for (let x = 0; x < L.size; x++) {
      rr(bx + x * cell + cell * 0.08, by + y * cell + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.16);
      ctx.fill();
    }
  }

  // chain events (sound + haptic as each tile starts to fall)
  for (let i = 0; i < L.tiles.length; i++) {
    if (!sounded[i] && now >= fallT0[i] && frozenAt === null) {
      sounded[i] = true;
      const step = order.indexOf(i);
      tone({ freq: pentatonic(step, 392), duration: 0.1, type: 'triangle', volume: 0.42, delay: FALL / 1000 * 0.8 });
      tone({ freq: 140, to: 70, duration: 0.07, type: 'sine', volume: 0.35, delay: FALL / 1000 * 0.8 });
      setTimeout(() => haptic.light(), FALL * 0.8);
    }
  }

  // fallen/falling tiles under standing ones; later links draw over earlier ones
  const progress = (i: number) => clamp01((now - fallT0[i]) / FALL);
  const down = order.filter((i) => progress(i) >= 1);
  const fallingIdx = order.filter((i) => now >= fallT0[i] && progress(i) < 1);
  const standingIdx = L.tiles.map((_, i) => i).filter((i) => !(now >= fallT0[i]));
  for (const i of [...down, ...standingIdx]) {
    const tl = L.tiles[i];
    drawTile(i, bx + (tl.x + 0.5) * cell, by + (tl.y + 0.5) * cell, now, progress(i));
  }
  for (const i of fallingIdx) {
    const tl = L.tiles[i];
    drawTile(i, bx + (tl.x + 0.5) * cell, by + (tl.y + 0.5) * cell, now, progress(i));
  }

  particles = particles.filter((p) => now - p.t0 < p.life);
  for (const p of particles) {
    const tt = Math.max(0, (now - p.t0) / 1000);
    const k = 1 - (now - p.t0) / p.life;
    ctx.save();
    ctx.translate(p.x + p.vx * tt, p.y + p.vy * tt + 600 * tt * tt);
    ctx.rotate(p.spin * tt);
    ctx.globalAlpha = Math.min(1, k * 1.5);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(frame);
}

// ───────────────────────── tutorial ─────────────────────────
function updateTutorial() {
  const hand = $('hand');
  const tip = $('tip');
  const show = S.level === 1 && (phase === 'edit' || phase === 'failed');
  if (!show || !cell) {
    $('push-btn').classList.remove('pulse');
    hand.hidden = true;
    tip.hidden = true;
    return;
  }
  const solved = simulate(L, S.dirs).allFell;
  const rect = canvas.getBoundingClientRect();
  let x: number;
  let y: number;
  if (solved) {
    const b = $('push-btn').getBoundingClientRect();
    x = b.left + b.width / 2;
    y = b.top + b.height * 0.45;
    tip.textContent = t('tutPush');
  } else {
    const wrong = L.tiles.findIndex((_, i) => S.dirs[i] !== L.solution[i] && i !== simulate(L, L.solution).order.at(-1));
    const tl = L.tiles[Math.max(0, wrong)];
    x = rect.left + bx + (tl.x + 0.5) * cell;
    y = rect.top + by + (tl.y + 0.5) * cell;
    tip.textContent = t('tutTap');
  }
  hand.style.left = `${x - 18}px`;
  hand.style.top = `${y - 4}px`;
  hand.hidden = false;
  tip.hidden = false;
  $('push-btn').classList.toggle('pulse', solved);
}

// ───────────────────────── game flow ─────────────────────────
let order: number[] = [];

function burst(x: number, y: number, count: number, spread: number, up: number) {
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * spread,
      vy: -Math.random() * up - 60,
      color: CONFETTI[i % CONFETTI.length],
      t0: now + Math.random() * 120,
      life: 1000 + Math.random() * 700,
      size: 7 + Math.random() * 6,
      spin: (Math.random() - 0.5) * 14,
    });
  }
}

function setUp() {
  phase = 'edit';
  order = [];
  fallT0 = S.dirs.map(() => Infinity);
  sounded = S.dirs.map(() => false);
  standing = [];
  $('toast').hidden = true;
}

function rotate(i: number) {
  const now = performance.now();
  if (L.tiles[i].locked) {
    shakeT0[i] = now;
    haptic.error();
    tone({ freq: 160, to: 120, duration: 0.12, type: 'triangle', volume: 0.3 });
    toast(t('locked'), 1400);
    return;
  }
  S.history.push({ tile: i, prev: S.dirs[i] });
  if (S.history.length > 200) S.history.shift();
  S.dirs[i] = rotateCw(S.dirs[i]);
  S.taps++;
  save();
  rotFrom[i] = currentAngle(i, now);
  angle[i] += 1;
  rotT0[i] = now;
  haptic.light();
  tone({ freq: 1100, to: 760, duration: 0.035, type: 'triangle', volume: 0.3 });
  tone({ freq: 260, to: 180, duration: 0.05, type: 'sine', volume: 0.25 });
  refreshHud();
}

function currentAngle(i: number, now: number) {
  const rp = easeOutBack((now - rotT0[i]) / 260);
  return rotFrom[i] + (angle[i] - rotFrom[i]) * rp;
}

function tapTile(i: number) {
  if (phase === 'falling' || phase === 'won') return;
  if (phase === 'failed') setUp();
  rotate(i);
}

function push() {
  unlockAudio();
  if (phase === 'failed') {
    setUp();
    haptic.light();
    tone({ freq: 520, to: 700, duration: 0.07, type: 'triangle', volume: 0.25 });
    refreshHud();
    return;
  }
  if (phase !== 'edit') return;
  const chain = simulate(L, S.dirs);
  S.pushes++;
  save();
  profile.progress('pushes');
  order = chain.order;
  const t0 = performance.now() + 40;
  order.forEach((i, k) => (fallT0[i] = t0 + k * STEP));
  sounded = S.dirs.map(() => false);
  phase = 'falling';
  haptic.medium();
  refreshHud();
  track('push', { level: S.level, fell: order.length, total: L.tiles.length });
  const done = (order.length - 1) * STEP + FALL + 120;
  setTimeout(() => {
    if (phase !== 'falling') return;
    profile.progress('topples', order.length);
    if (chain.allFell) return win();
    phase = 'failed';
    failAt = performance.now();
    standing = L.tiles.map((_, i) => i).filter((i) => !order.includes(i));
    haptic.error();
    tone({ freq: 300, to: 180, duration: 0.22, type: 'triangle', volume: 0.3 });
    toast(standing.length === 1 ? t('standingOne') : t('standing', { n: standing.length }), 2600);
    refreshHud();
  }, done);
}

function win() {
  phase = 'won';
  const hinted = S.hintsUsed > 0;
  const got = starsFor(S.taps, L.par, hinted);
  const completed = S.level;
  burst(W * 0.25, H * 0.3, 60, 600, 500);
  burst(W * 0.75, H * 0.3, 60, 600, 500);
  [0, 2, 4, 5, 7, 9].forEach((st, i) => tone({ freq: pentatonic(st), duration: 0.22, volume: 0.45, delay: i * 0.08 }));
  haptic.success();
  track('level_complete', {
    level: completed,
    taps: S.taps,
    par: L.par,
    stars: got,
    hints: S.hintsUsed,
    pushes: S.pushes,
    duration_s: Math.round((Date.now() - levelStartedAt) / 1000),
  });
  // Persist progress now so quitting on the win screen never loses the level.
  const next = completed < LEVEL_COUNT ? completed + 1 : 1;
  store.set('save', freshLevel(next));
  refreshHud();
  setTimeout(() => {
    meta.showWin({
      level: completed,
      stars: got,
      coins: 10 + got * 5,
      onNext: () => {
        haptic.medium();
        if (completed >= LEVEL_COUNT) toast(t('allDone'), 3000);
        playLevel(next);
      },
      // Back to the menu: the next level waits on the board behind the home screen.
      onMenu: () => startLevel(freshLevel(next)),
    });
    if (completed === 1) profile.finishFirstRun();
    refreshHud();
  }, 650);
  maybeRequestReview(completed, completed >= 5 && got === 3);
}

/** Level map / home "Play" card: resumes the saved board of that level, else a fresh one. */
function playLevel(n: number) {
  unlockAudio();
  const saved = loadSave();
  const resume = saved.level === n && phase !== 'won';
  startLevel(resume ? saved : freshLevel(n), resume && saved.taps > 0);
}

function startLevel(state: Save, resumed = false) {
  S = state;
  phase = 'edit';
  L = generateLevel(S.level);
  save();
  phase = 'edit';
  order = [];
  hintGlow = null;
  levelStartedAt = Date.now();
  resetAnim();
  layout();
  refreshHud();
  $('toast').hidden = true;
  track('level_start', { level: S.level, tiles: L.tiles.length, par: L.par, resumed });
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (meta.covering) return;
  const rect = canvas.getBoundingClientRect();
  const gx = Math.floor((e.clientX - rect.left - bx) / cell);
  const gy = Math.floor((e.clientY - rect.top - by) / cell);
  const i = L.tiles.findIndex((tl) => tl.x === gx && tl.y === gy);
  if (i >= 0) tapTile(i);
  else if (phase === 'failed') push();
});

$('push-btn').addEventListener('click', push);

function restartLevel() {
  if (phase === 'falling' || phase === 'won') return;
  track('level_restart', { level: S.level, taps: S.taps, pushes: S.pushes });
  const fresh = freshLevel(S.level);
  // Keep the free-hint state so restarting can't farm free hints.
  fresh.hintsUsed = S.hintsUsed;
  S = fresh;
  save();
  resetAnim();
  setUp();
  haptic.medium();
  tone({ freq: 600, to: 400, duration: 0.1, type: 'triangle', volume: 0.25 });
  refreshHud();
}
$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  restartLevel();
});

$('undo-btn').addEventListener('click', () => {
  unlockAudio();
  if (phase === 'falling' || phase === 'won') return;
  if (phase === 'failed') setUp();
  const last = S.history.pop();
  if (!last) {
    toast(t('noUndo'), 1400);
    refreshHud();
    return;
  }
  const now = performance.now();
  rotFrom[last.tile] = currentAngle(last.tile, now);
  angle[last.tile] -= tapsBetweenCcw(S.dirs[last.tile], last.prev);
  rotT0[last.tile] = now;
  S.dirs[last.tile] = last.prev;
  if (!last.hint) S.taps = Math.max(0, S.taps - 1);
  save();
  haptic.light();
  tone({ freq: 500, to: 380, duration: 0.1, type: 'triangle', volume: 0.3 });
  track('undo', { level: S.level });
  refreshHud();
});

const tapsBetweenCcw = (from: Dir, to: Dir) => (from - to + 4) % 4;

$('hint-btn').addEventListener('click', () => {
  unlockAudio();
  if (phase === 'falling' || phase === 'won') return;
  if (phase === 'failed') setUp();
  if (!hintFor(L, S.dirs)) {
    toast(t('noHint'), 1800);
    refreshHud();
    return;
  }
  // First hint of every level is free; after that coins or a rewarded video.
  if (S.hintsUsed === 0) applyHint('free');
  else openHintSheet();
});

function applyHint(paid: 'free' | 'coins' | 'video') {
  if (phase === 'falling' || phase === 'won') return;
  if (phase === 'failed') setUp();
  const h = hintFor(L, S.dirs);
  if (!h) return;
  S.hintsUsed++;
  const now = performance.now();
  rotFrom[h.tile] = currentAngle(h.tile, now);
  angle[h.tile] += (h.dir - S.dirs[h.tile] + 4) % 4;
  rotT0[h.tile] = now;
  S.history.push({ tile: h.tile, prev: S.dirs[h.tile], hint: true });
  S.dirs[h.tile] = h.dir;
  save();
  hintGlow = { tile: h.tile, t0: now };
  haptic.light();
  tone({ freq: pentatonic(4), duration: 0.14, volume: 0.35 });
  tone({ freq: pentatonic(7), duration: 0.18, volume: 0.35, delay: 0.08 });
  toast(t('hintShown'), 2200);
  track('hint', { level: S.level, paid });
  refreshHud();
}

const hintSheet = $('hint-sheet');
function openHintSheet() {
  const coinsBtn = $<HTMLButtonElement>('hint-coins');
  coinsBtn.innerHTML = `<span>${t('hint')}</span>${COIN}<span>${HINT_COINS}</span>`;
  coinsBtn.classList.toggle('short', profile.data.coins < HINT_COINS);
  $('hint-balance').innerHTML = `${COIN}<span>${profile.data.coins}</span>`;
  $<HTMLButtonElement>('hint-video').disabled = !rewardedAvailable();
  hintSheet.hidden = false;
}
function closeHintSheet() {
  hintSheet.hidden = true;
}
$('hint-coins').addEventListener('click', () => {
  if (!profile.spend(HINT_COINS)) {
    haptic.error();
    toast(t('notEnough'), 1600);
    return;
  }
  closeHintSheet();
  applyHint('coins');
});
$('hint-video').addEventListener('click', async () => {
  closeHintSheet();
  if (await showRewarded('hint')) applyHint('video');
});
$('hint-cancel').addEventListener('click', closeHintSheet);
hintSheet.addEventListener('click', (e) => {
  if (e.target === hintSheet) closeHintSheet();
});

// ───────────────────────── meta (home, map, missions, daily, shop, pause, win) ─────────────────────────
const COIN =
  '<svg class="coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffc83d" stroke="#b57d10" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#e0a21c" stroke-width="1.6"/></svg>';

let darkSkin = false;
function applySkin(id: string) {
  const skin = SKINS.find((s) => s.id === id) ?? SKINS[0];
  const p = skin.colors;
  C = { ...p, bad: '#d24b3c', hint: '#f2b43c' };
  CONFETTI = [p.start, '#f2b43c', p.wood, p.woodEdge, '#7fb0c9', '#ffffff'];
  const vars: Record<string, string> = {
    '--bg-top': p.bgTop,
    '--bg-bottom': p.bgBottom,
    '--hud-ink': p.hudInk,
    '--hud-muted': p.hudMuted,
    '--m-bg': `radial-gradient(120% 80% at 50% 0%, ${p.home[0]}, ${p.home[1]})`,
    '--d-face': p.woodLight,
    '--d-face2': p.wood,
    '--d-edge': p.woodEdge,
    '--d-start': p.startLight,
    '--d-start2': p.start,
    '--d-start-edge': p.startEdge,
    '--d-arrow': p.arrow,
    '--d-start-arrow': p.startArrow,
  };
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bgTop);
  darkSkin = skin.id === 'midnight';
  updateStatusBar();
}
/** Light status-bar icons over the dark home screen and the midnight table, dark icons otherwise. */
function updateStatusBar() {
  if (!isNative()) return;
  const dark = darkSkin || !!wasCovering;
  void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
  if (Capacitor.getPlatform() === 'android') void StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
}

const profile = createProfile({
  game: 'devril',
  levelCount: LEVEL_COUNT,
  defaultSkin: SKINS[0].id,
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'topples', targets: [40, 80, 150], reward: (n) => 20 + Math.round(n / 4) },
    { id: 'pushes', targets: [5, 10, 20], reward: (n) => 15 + n * 2 },
  ],
});

// v1.0 kept stars and the current level in its own store: fold them into the profile once.
if (!store.get('migrated', false)) {
  const d = profile.data;
  const oldStars = store.get<unknown>('stars', []);
  if (Array.isArray(oldStars)) {
    oldStars.forEach((v, i) => {
      if (i < d.stars.length && typeof v === 'number') d.stars[i] = Math.max(d.stars[i], Math.min(3, Math.max(0, Math.floor(v))));
    });
  }
  let reached = S.level;
  d.stars.forEach((v, i) => {
    if (v > 0) reached = Math.max(reached, Math.min(LEVEL_COUNT, i + 2));
  });
  d.unlocked = Math.max(d.unlocked, Math.min(LEVEL_COUNT, reached));
  if (reached > 1 || S.taps > 0) d.firstRun = false;
  profile.save();
  store.set('migrated', true);
  store.remove('stars');
  store.remove('best');
}
applySkin(profile.data.skin);

/** Home-screen artwork: a short row of dominoes toppling one after another, in the skin's colours. */
function heroArt() {
  const el = document.createElement('div');
  el.className = 'hero';
  el.setAttribute('aria-hidden', 'true');
  const arrow = '<svg viewBox="0 0 24 24"><path d="M12 18V7M7.5 11.5L12 7l4.5 4.5" /></svg>';
  el.innerHTML =
    Array.from({ length: 5 }, (_, i) => `<i class="${i === 0 ? 'first' : ''}" style="--i:${i}">${arrow}</i>`).join('') + '<b></b>';
  return el;
}

const meta = createMeta({
  title: 'Devril',
  hero: heroArt(),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  levels: { count: LEVEL_COUNT, play: playLevel },
  missionText: (id, n) => t(`mission_${id}` as 'mission_levels', { n }),
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as 'skin_oak'), price: s.price, swatch: s.swatch })),
  onSkin: applySkin,
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});
profile.onChange(refreshHud);

function openPause() {
  if (phase === 'falling' || phase === 'won' || meta.covering) return;
  closeHintSheet();
  meta.showPause({ onResume: () => {}, onRestart: restartLevel, onMenu: save });
}
$('settings-btn').addEventListener('click', () => {
  unlockAudio();
  openPause();
});

// ───────────────────────── boot ─────────────────────────
layout();
refreshHud();
void initAds();
void initStore();
void setupNative({
  darkBackground: true,
  onPause: save,
  onBack: () => {
    if (!hintSheet.hidden) {
      closeHintSheet();
      return true;
    }
    if (meta.back()) return true;
    if (meta.covering) return false;
    if (phase === 'failed') {
      push();
      return true;
    }
    openPause();
    return true;
  },
});
track('level_start', { level: S.level, tiles: L.tiles.length, par: L.par, resumed: S.taps > 0 });
meta.showHome();
requestAnimationFrame(frame);

// Exposed for e2e/screenshot scripts.
(window as unknown as { __devril: unknown }).__devril = {
  get state() { return S; },
  get level() { return L; },
  get phase() { return phase; },
  tap: tapTile,
  optimal: () => solve(L, S.dirs, 2_000_000)?.dirs ?? L.solution,
  push,
  goto: (level: number) => (meta.hideHome(), startLevel(freshLevel(level))),
  load: (s: Save) => (meta.hideHome(), startLevel(s)),
  profile,
  /** Unlocks + equips a skin (screenshots). */
  skin: (id: string) => (profile.unlockSkin(id), applySkin(id)),
  /** Pins the animation clock `ms` after the current push started (null to release). */
  freeze: (ms: number | null) => (frozenAt = ms === null ? null : (order.length ? fallT0[order[0]] + ms : performance.now())),
};
