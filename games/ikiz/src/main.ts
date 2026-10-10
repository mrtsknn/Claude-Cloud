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
  showRewarded,
  tone,
  track,
  trackSession,
  unlockAudio,
} from '@studio/kit';
import { LEVEL_COUNT, generateLevel, initialState, mirror, solve, starsFor, step, type Dir, type Level, type State } from './game';
import { t, type Key } from './i18n';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/ikiz/PRIVACY.md';
declare const __APP_VERSION__: string;

type Shape = 'round' | 'square' | 'ghost';
const SKINS: { id: string; a: string; b: string; shape: Shape; price: number }[] = [
  { id: 'classic', a: '#57c4a8', b: '#f29e6d', shape: 'round', price: 0 },
  { id: 'ocean', a: '#4aa8e0', b: '#8c8ff0', shape: 'round', price: 150 },
  { id: 'sunset', a: '#ef8579', b: '#f2bf58', shape: 'round', price: 200 },
  { id: 'forest', a: '#6dba70', b: '#c4a26a', shape: 'round', price: 250 },
  { id: 'mono', a: '#5a5f7a', b: '#b4b9cf', shape: 'round', price: 300 },
  { id: 'berry', a: '#a979dc', b: '#e57aa8', shape: 'round', price: 400 },
  { id: 'cubes', a: '#57c4a8', b: '#f29e6d', shape: 'square', price: 500 },
  { id: 'ghosts', a: '#86cde6', b: '#f2a5c6', shape: 'ghost', price: 600 },
];

document.documentElement.lang = navigator.language.slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n as Key)));

const store = createStore('ikiz');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const profile = createProfile({
  game: 'ikiz',
  levelCount: LEVEL_COUNT,
  defaultSkin: 'classic',
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'moves', targets: [30, 60, 100], reward: (n) => 20 + Math.round(n / 3) },
    { id: 'noUndo', targets: [1, 2, 3], reward: (n) => 25 + n * 10 },
  ],
});

let skin = SKINS.find((s) => s.id === profile.data.skin) ?? SKINS[0];
const applySkin = (id: string) => (skin = SKINS.find((s) => s.id === id) ?? SKINS[0]);

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as Key), price: s.price, swatch: `linear-gradient(90deg, ${s.a} 0 50%, ${s.b} 50% 100%)` })),
  onSkin: applySkin,
  levels: { count: LEVEL_COUNT, play: (n) => startLevel(n) },
  missionText: (id, n) => t(`mission_${id}` as Key, { n }),
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});

// ───────────────────────── game state ─────────────────────────
let lv: Level = generateLevel(1);
let S: State = initialState(lv);
let history: State[] = [];
let moves = 0;
let undoUsed = false;
let freeHint = true;
let hintDir: Dir | null = null;
let ending = false;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;

let toastTimer = 0;
function toast(text: string) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 1800);
}

function refreshHud() {
  $('level').textContent = t('level', { n: lv.n });
  $('moves').textContent = `${t('moves', { n: moves })} · ${t('par', { n: lv.par })}`;
  const st = starsFor(Math.max(moves, 0), lv.par);
  $('hud-stars').innerHTML = [1, 2, 3].map((i) => `<i class="${i <= st ? 'on' : ''}">★</i>`).join('');
  $('hint-badge').textContent = freeHint ? '1' : 'AD';
  $('hint-badge').classList.toggle('ad', !freeHint);
  $<HTMLButtonElement>('undo-btn').disabled = history.length === 0;
  $('tip').hidden = !(lv.n === 1 && moves === 0);
  if (!$('tip').hidden) $('tip').textContent = t('swipe');
}

function startLevel(n: number) {
  n = Math.max(1, Math.min(LEVEL_COUNT, n));
  lv = generateLevel(n);
  S = initialState(lv);
  history = [];
  moves = 0;
  undoUsed = false;
  freeHint = true;
  hintDir = null;
  ending = false;
  store.set('level', n);
  snapAnim();
  layout();
  refreshHud();
  track('level_start', { level: n, par: lv.par });
}

function restart() {
  if (ending) return;
  const n = lv.n;
  startLevel(n);
}

// ───────────────────────── animation ─────────────────────────
interface Anim { fx: number; fy: number; tx: number; ty: number; t0: number; bump: [number, number] | null; dead: boolean }
const anims: [Anim, Anim] = [
  { fx: 0, fy: 0, tx: 0, ty: 0, t0: 0, bump: null, dead: false },
  { fx: 0, fy: 0, tx: 0, ty: 0, t0: 0, bump: null, dead: false },
];
const look: [number, number][] = [
  [0, 1],
  [0, 1],
];
const MOVE_MS = 140;
let shakeT0 = -1e9;
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const xy = (p: number) => [p % lv.w, Math.floor(p / lv.w)];

function snapAnim() {
  for (const i of [0, 1]) {
    const [x, y] = xy(S.pos[i]);
    Object.assign(anims[i], { fx: x, fy: y, tx: x, ty: y, t0: 0, bump: null, dead: false });
  }
}
function animPos(i: number, now: number): [number, number] {
  const a = anims[i];
  const k = (now - a.t0) / MOVE_MS;
  if (a.bump) {
    const b = Math.sin(Math.min(1, k) * Math.PI) * 0.16;
    return [a.tx + a.bump[0] * b, a.ty + a.bump[1] * b];
  }
  const e = ease(k);
  return [a.fx + (a.tx - a.fx) * e, a.fy + (a.ty - a.fy) * e];
}
const busy = () => ending || anims.some((a) => performance.now() - a.t0 < MOVE_MS);

// ───────────────────────── moves ─────────────────────────
const DV: Record<Dir, [number, number]> = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

function move(d: Dir) {
  if (ending || meta.covering) return;
  unlockAudio();
  const r = step(lv, S, d);
  const now = performance.now();
  for (const i of [0, 1] as const) {
    const [cx, cy] = animPos(i, now);
    const [tx, ty] = xy(r.state.pos[i]);
    const dd = i === 0 ? d : mirror(d);
    look[i] = DV[dd];
    anims[i] = r.moved[i] ? { fx: cx, fy: cy, tx, ty, t0: now, bump: null, dead: false } : { fx: tx, fy: ty, tx, ty, t0: now, bump: DV[dd], dead: false };
  }
  hintDir = null;
  if (!r.moved[0] && !r.moved[1]) {
    haptic.light();
    tone({ freq: 180, duration: 0.08, volume: 0.25, type: 'triangle' });
    return;
  }
  history.push(S);
  S = r.state;
  moves++;
  profile.progress('moves');
  haptic.light();
  tone({ freq: pentatonic(moves % 5), duration: 0.09, volume: 0.3 });
  if (r.dead) {
    ending = true;
    shakeT0 = now + MOVE_MS;
    haptic.error();
    tone({ freq: 300, to: 120, duration: 0.3, volume: 0.35, type: 'sawtooth' });
    toast(t('spiked'));
    track('spiked', { level: lv.n, moves });
    setTimeout(() => {
      ending = false;
      startLevel(lv.n);
    }, 650);
  } else if (r.won) {
    ending = true;
    const stars = starsFor(moves, lv.par);
    track('level_complete', { level: lv.n, moves, par: lv.par, stars });
    if (!undoUsed) profile.progress('noUndo');
    setTimeout(() => {
      [0, 2, 4, 7, 9].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.18, volume: 0.35, delay: i * 0.07 }));
      const n = lv.n;
      meta.showWin({
        level: n,
        stars,
        coins: 10 + stars * 5,
        onNext: () => {
          if (n >= LEVEL_COUNT) meta.showHome();
          else startLevel(n + 1);
          maybeRequestReview(n, stars === 3);
        },
        onMenu: () => (ending = false),
      });
    }, 380);
  }
  refreshHud();
}

function undo() {
  if (ending || meta.covering) return;
  const prev = history.pop();
  if (!prev) return toast(t('noUndo'));
  S = prev;
  moves = Math.max(0, moves - 1);
  undoUsed = true;
  hintDir = null;
  snapAnim();
  haptic.light();
  refreshHud();
}

async function hint() {
  if (ending || meta.covering) return;
  const path = solve(lv, S);
  if (!path || !path.length) return restartNudge();
  if (!freeHint) {
    if (!(await showRewarded('hint'))) return toast(t('noAd'));
  }
  freeHint = false;
  hintDir = path[0];
  track('hint', { level: lv.n });
  haptic.medium();
  refreshHud();
}
/** No way out from here (moves are not always reversible): say so, then reset the level. */
function restartNudge() {
  haptic.error();
  toast(t('stuck'));
  restart();
}

// ───────────────────────── input ─────────────────────────
let p0: { x: number; y: number; id: number } | null = null;
canvas.addEventListener('pointerdown', (e) => (p0 = { x: e.clientX, y: e.clientY, id: e.pointerId }));
const endSwipe = (e: PointerEvent) => {
  if (!p0 || e.pointerId !== p0.id) return;
  const dx = e.clientX - p0.x;
  const dy = e.clientY - p0.y;
  p0 = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U');
};
window.addEventListener('pointerup', endSwipe);
window.addEventListener('pointercancel', () => (p0 = null));
window.addEventListener('keydown', (e) => {
  const d = ({ ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R' } as Record<string, Dir>)[e.key];
  if (d) move(d);
});
$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', () => void hint());
$('restart-tool').addEventListener('click', () => {
  haptic.medium();
  restart();
});
function pause() {
  if (meta.covering || ending) return;
  meta.showPause({ onResume: () => {}, onRestart: restart });
}
$('pause-btn').addEventListener('click', pause);

// ───────────────────────── layout & draw ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
let cell = 30;
const GAP = 22;
let ox: [number, number] = [0, 0];
let oy = 0;

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  cell = Math.floor(Math.min((W - GAP - 14) / (2 * lv.w), (H * 0.86) / lv.h));
  const bw = cell * lv.w;
  ox = [W / 2 - GAP / 2 - bw, W / 2 + GAP / 2];
  oy = (H - cell * lv.h) / 2;
}
window.addEventListener('resize', layout);

function rr(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawTwin(i: number, cx: number, cy: number, size: number, color: string, now: number, deadT: number) {
  const r = size / 2;
  const a = anims[i];
  const k = Math.min(1, (now - a.t0) / MOVE_MS);
  const squash = a.bump ? Math.sin(k * Math.PI) * 0.12 : Math.sin(k * Math.PI) * 0.08;
  const sx = 1 + squash;
  const sy = 1 - squash;
  ctx.save();
  ctx.translate(cx, cy + Math.sin(now / 420 + i) * size * 0.02);
  if (deadT > 0) ctx.rotate(Math.sin(deadT * 40) * 0.2);
  ctx.scale(sx, sy);
  ctx.fillStyle = 'rgba(44,49,96,0.14)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.92, r * 0.8, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  if (skin.shape === 'square') ctx.roundRect(-r, -r, 2 * r, 2 * r, r * 0.38);
  else if (skin.shape === 'ghost') {
    ctx.moveTo(-r, r * 0.9);
    ctx.lineTo(-r, -r * 0.1);
    ctx.arc(0, -r * 0.1, r, Math.PI, 0);
    ctx.lineTo(r, r * 0.9);
    for (let j = 0; j < 3; j++) ctx.quadraticCurveTo(r - (j * 2 + 1) * (r / 3), r * 0.55, r - (j + 1) * ((2 * r) / 3), r * 0.9);
    ctx.closePath();
  } else ctx.ellipse(0, 0, r, r * 0.94, 0, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  const [lx, ly] = look[i];
  for (const ex of [-0.34, 0.34]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(ex * r + lx * r * 0.08, -r * 0.12 + ly * r * 0.06, r * 0.22, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2c3160';
    ctx.beginPath();
    ctx.arc(ex * r + lx * r * 0.16, -r * 0.1 + ly * r * 0.13, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.45, -r * 0.6, r * 0.18, r * 0.1, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawArrow(cx: number, cy: number, d: Dir, size: number) {
  const [dx, dy] = DV[d];
  ctx.save();
  ctx.translate(cx + dx * size * 0.95, cy + dy * size * 0.95);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = '#5b6bd6';
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 160);
  ctx.beginPath();
  ctx.moveTo(size * 0.32, 0);
  ctx.lineTo(-size * 0.18, -size * 0.3);
  ctx.lineTo(-size * 0.18, size * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function draw(now: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  let shx = 0;
  const st = (now - shakeT0) / 1000;
  if (st > 0 && st < 0.35) shx = Math.sin(st * 60) * 5 * (1 - st / 0.35);
  ctx.translate(shx, 0);
  // center line
  ctx.strokeStyle = 'rgba(91,107,214,0.35)';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(W / 2, oy - 10);
  ctx.lineTo(W / 2, oy + cell * lv.h + 10);
  ctx.stroke();
  ctx.setLineDash([]);
  const colors = [skin.a, skin.b];
  for (const i of [0, 1]) {
    const b = lv.boards[i];
    const x0 = ox[i];
    rr(x0 - 5, oy - 5, cell * lv.w + 10, cell * lv.h + 10, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    for (let p = 0; p < b.cells.length; p++) {
      const [gx, gy] = xy(p);
      const x = x0 + gx * cell;
      const y = oy + gy * cell;
      const c = b.cells[p];
      const pad = 2;
      if (c === '#') {
        rr(x + pad, y + pad, cell - 2 * pad, cell - 2 * pad, cell * 0.22);
        ctx.fillStyle = '#c5cbe2';
        ctx.fill();
        rr(x + pad, y + pad, cell - 2 * pad, cell - 2 * pad - 4, cell * 0.22);
        ctx.fillStyle = '#d6dbee';
        ctx.fill();
        continue;
      }
      rr(x + pad, y + pad, cell - 2 * pad, cell - 2 * pad, cell * 0.2);
      ctx.fillStyle = (gx + gy) % 2 ? '#f3f5fb' : '#eef1f9';
      ctx.fill();
      if (c === '^') {
        ctx.fillStyle = '#e06d6d';
        for (let s = 0; s < 3; s++) {
          const sx = x + cell * (0.2 + s * 0.3);
          ctx.beginPath();
          ctx.moveTo(sx - cell * 0.12, y + cell * 0.72);
          ctx.lineTo(sx, y + cell * 0.3);
          ctx.lineTo(sx + cell * 0.12, y + cell * 0.72);
          ctx.closePath();
          ctx.fill();
        }
      } else if (c === 'k' && !S.keys[i]) {
        ctx.strokeStyle = '#e0a630';
        ctx.lineWidth = Math.max(2, cell * 0.09);
        ctx.beginPath();
        ctx.arc(x + cell * 0.36, y + cell * 0.5, cell * 0.13, 0, Math.PI * 2);
        ctx.moveTo(x + cell * 0.49, y + cell * 0.5);
        ctx.lineTo(x + cell * 0.76, y + cell * 0.5);
        ctx.lineTo(x + cell * 0.76, y + cell * 0.62);
        ctx.stroke();
      } else if (c === 'd') {
        if (S.keys[i]) {
          ctx.strokeStyle = 'rgba(224,166,48,0.4)';
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 4]);
          rr(x + 5, y + 5, cell - 10, cell - 10, 6);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          rr(x + pad + 2, y + pad + 2, cell - 2 * pad - 4, cell - 2 * pad - 4, 6);
          ctx.fillStyle = '#e0a630';
          ctx.fill();
          ctx.fillStyle = '#fff6df';
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell * 0.45, cell * 0.09, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(x + cell / 2 - cell * 0.04, y + cell * 0.48, cell * 0.08, cell * 0.16);
        }
      }
    }
    // goal
    const [gx, gy] = xy(b.goal);
    const on = S.pos[i] === b.goal;
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = Math.max(2.5, cell * 0.08);
    ctx.setLineDash(on ? [] : [cell * 0.14, cell * 0.1]);
    rr(x0 + gx * cell + cell * 0.14, oy + gy * cell + cell * 0.14, cell * 0.72, cell * 0.72, cell * 0.22);
    ctx.globalAlpha = on ? 0.35 : 0.18;
    ctx.fillStyle = colors[i];
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const i of [0, 1]) {
    const [px, py] = animPos(i, now);
    const cx = ox[i] + (px + 0.5) * cell;
    const cy = oy + (py + 0.5) * cell;
    const deadT = ending && shakeT0 > 0 && now > shakeT0 && now - shakeT0 < 600 ? (now - shakeT0) / 1000 : 0;
    drawTwin(i, cx, cy, cell * 0.74, colors[i], now, deadT);
    if (hintDir) drawArrow(cx, cy, i === 0 ? hintDir : mirror(hintDir), cell);
  }
}

function frame(now: number) {
  if (W !== canvas.clientWidth || H !== canvas.clientHeight) layout();
  draw(now);
  requestAnimationFrame(frame);
}

// ───────────────────────── boot ─────────────────────────
trackSession('ikiz');
startLevel(Math.min(store.get('level', 1), profile.data.unlocked));
requestAnimationFrame(frame);
void setupNative({ onBack: () => meta.back() || (meta.covering ? false : (pause(), true)), darkBackground: false });
void initAds();
void initStore();
meta.showHome();

declare global {
  interface Window {
    __ikiz: unknown;
  }
}
window.__ikiz = {
  get level() {
    return lv;
  },
  get state() {
    return S;
  },
  get moves() {
    return moves;
  },
  solve: () => solve(lv, S),
  busy,
  play: (n: number) => {
    meta.hideHome();
    startLevel(n);
  },
};
