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
import {
  DX,
  DY,
  LEVEL_COUNT,
  allFish,
  crackIndex,
  generateLevel,
  initialState,
  slide,
  solve,
  starsFor,
  tileAt,
  type Dir,
  type Level,
  type SlideResult,
  type State,
} from './game';
import { lang, t } from './i18n';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/buz/PRIVACY.md';
declare const __APP_VERSION__: string;

document.documentElement.lang = lang;
document.title = lang === 'tr' ? 'Buz' : 'Buz — Ice Slide';

// ───────────────────────── skins ─────────────────────────
interface Outfit { id: string; price: number; body: string; scarf: string; belly: string }
const OUTFITS: Outfit[] = [
  { id: 'classic', price: 0, body: '#1e2b4d', scarf: '#ff5a5f', belly: '#ffffff' },
  { id: 'frost', price: 150, body: '#3f8fc4', scarf: '#ffffff', belly: '#eef9ff' },
  { id: 'ember', price: 250, body: '#b8392f', scarf: '#ffb347', belly: '#fff4ea' },
  { id: 'moss', price: 300, body: '#2e7d4f', scarf: '#f4d35e', belly: '#f3fff4' },
  { id: 'plum', price: 400, body: '#6b3fa0', scarf: '#5ee0c8', belly: '#fbf5ff' },
  { id: 'gold', price: 600, body: '#c8930f', scarf: '#1e2b4d', belly: '#fffaf0' },
  { id: 'night', price: 800, body: '#111827', scarf: '#8ab4ff', belly: '#dfe8ff' },
];
const SKINS = OUTFITS.map((o) => ({
  id: o.id,
  name: t(`skin_${o.id}` as Parameters<typeof t>[0]),
  price: o.price,
  swatch: `radial-gradient(circle at 50% 62%, ${o.belly} 0 30%, transparent 31%), linear-gradient(180deg, ${o.body} 0 48%, ${o.scarf} 48% 58%, ${o.body} 58%)`,
}));

// ───────────────────────── profile + meta ─────────────────────────
const store = createStore('buz');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const profile = createProfile({
  game: 'buz',
  levelCount: LEVEL_COUNT,
  defaultSkin: 'classic',
  skinIds: OUTFITS.map((o) => o.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'fish', targets: [5, 10, 15], reward: (n) => 20 + n * 3 },
  ],
});
let outfit = OUTFITS.find((o) => o.id === profile.data.skin) ?? OUTFITS[0];
const applySkin = (id: string) => (outfit = OUTFITS.find((o) => o.id === id) ?? OUTFITS[0]);

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  skins: SKINS,
  onSkin: applySkin,
  levels: { count: LEVEL_COUNT, play: (n) => startLevel(n) },
  missionText: (id, n) => t(`mission_${id}` as Parameters<typeof t>[0], { n }),
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});
trackSession('buz');

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0])));
$('level-label').textContent = t('level');

let toastTimer = 0;
function toast(text: string, ms = 2000) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

// ───────────────────────── game state ─────────────────────────
let level: Level = generateLevel(1);
let S: State = initialState(level);
let history: State[] = [];
let hintsUsed = 0;
let continuesUsed = 0;
let levelStartedAt = Date.now();
let over = false; // fell or won, waiting for the meta sheet
let hint: { dir: Dir; until: number } | null = null;

interface Anim { from: State; res: SlideResult; dir: Dir; t0: number; dur: number; cells: number[]; shown: number }
let anim: Anim | null = null;
let viewGot = 0; // fish drawn as collected
let viewBroken = 0;

function refreshHud() {
  $('level').textContent = String(level.n);
  const sw = $('swipes');
  sw.textContent = `${history.length}/${level.par}`;
  sw.classList.toggle('over', history.length > level.par);
  $('hint-badge').hidden = hintsUsed === 0;
  const bar = $('fishbar');
  if (bar.childElementCount !== level.fish.length) bar.innerHTML = level.fish.map(() => '<i></i>').join('');
  [...bar.children].forEach((c, i) => c.classList.toggle('on', !!(viewGot & (1 << i))));
}

function startLevel(n: number) {
  n = Math.max(1, Math.min(LEVEL_COUNT, n));
  level = generateLevel(n);
  S = initialState(level);
  history = [];
  hintsUsed = 0;
  continuesUsed = 0;
  over = false;
  anim = null;
  hint = null;
  particles = [];
  trail = [];
  viewGot = 0;
  viewBroken = 0;
  levelStartedAt = Date.now();
  store.set('last', n);
  layout();
  refreshHud();
  $('toast').hidden = true;
  track('level_start', { level: n, par: level.par });
}

// ───────────────────────── layout ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
let cs = 40;
let ox = 0;
let oy = 0;
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  cs = Math.floor(Math.min((W - 28) / level.w, (H - 28) / level.h, 76));
  ox = Math.round((W - cs * level.w) / 2);
  oy = Math.round((H - cs * level.h) / 2);
}
window.addEventListener('resize', layout);
const cx = (cell: number) => ox + ((cell % level.w) + 0.5) * cs;
const cy = (cell: number) => oy + (Math.floor(cell / level.w) + 0.5) * cs;

// ───────────────────────── effects ─────────────────────────
interface Particle { x: number; y: number; vx: number; vy: number; g: number; t0: number; life: number; size: number; color: string }
let particles: Particle[] = [];
let trail: { x: number; y: number; t: number }[] = [];
function puff(x: number, y: number, color: string, count: number, speed: number, g = 0) {
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (g ? speed * 0.6 : 0), g, t0: now, life: 400 + Math.random() * 350, size: cs * (0.06 + Math.random() * 0.08), color });
  }
}

// ───────────────────────── moves ─────────────────────────
function busy() {
  return !!anim || over || meta.covering;
}

function move(dir: Dir) {
  if (busy()) return;
  const r = slide(level, S, dir);
  if (!r) {
    haptic.light();
    tone({ freq: 160, to: 120, duration: 0.08, type: 'triangle', volume: 0.2 });
    return;
  }
  history.push(S);
  const from = S;
  S = r.state;
  hint = null;
  const cells = [from.pos, ...r.path];
  anim = { from, res: r, dir, t0: performance.now(), dur: 90 + r.path.length * 62, cells, shown: 0 };
  tone({ freq: 340, to: 220, duration: Math.min(0.5, anim.dur / 1000), type: 'triangle', volume: 0.12 });
  haptic.light();
  refreshHud();
}

function onSlideEnd(a: Anim) {
  const end = a.res.state.pos;
  viewGot = a.res.state.got;
  viewBroken = a.res.state.broken;
  refreshHud();
  if (a.res.fell) {
    puff(cx(end), cy(end), '#7cc8f0', 26, cs * 4, cs * 9);
    tone({ freq: 520, to: 70, duration: 0.35, type: 'sine', volume: 0.4 });
    haptic.error();
    over = true;
    track('fall', { level: level.n, swipes: history.length });
    setTimeout(lose, 650);
    return;
  }
  puff(cx(end) - DX[a.dir] * cs * 0.3, cy(end) - DY[a.dir] * cs * 0.3 + cs * 0.25, '#ffffff', 12, cs * 2.2);
  tone({ freq: 150, to: 90, duration: 0.09, type: 'triangle', volume: 0.3 });
  haptic.medium();
  if (a.res.won) {
    over = true;
    puff(cx(end), cy(end), '#ffd166', 30, cs * 5, cs * 6);
    [0, 2, 4, 5, 7, 9].forEach((st, i) => tone({ freq: pentatonic(st), duration: 0.2, volume: 0.4, delay: i * 0.07 }));
    haptic.success();
    setTimeout(win, 700);
  } else if (end === level.igloo) toast(t('needFish'));
}

function win() {
  const n = level.n;
  const swipes = history.length;
  const stars = starsFor(swipes, level.par);
  track('level_complete', { level: n, swipes, par: level.par, stars, hints: hintsUsed, duration_s: Math.round((Date.now() - levelStartedAt) / 1000) });
  store.set('last', Math.min(LEVEL_COUNT, n + 1));
  meta.showWin({
    level: n,
    stars,
    coins: 10 + stars * 5,
    onNext: () => {
      if (n >= LEVEL_COUNT) {
        toast(t('allDone'), 3000);
        meta.showHome();
      } else startLevel(n + 1);
    },
  });
  maybeRequestReview(n, n >= 5);
}

function lose() {
  meta.showLose({
    score: 0,
    coins: 0,
    label: t('fell'),
    continuesUsed,
    canContinue: history.length > 0,
    onContinue: () => {
      continuesUsed++;
      undo(true);
    },
    onRetry: () => startLevel(level.n),
  });
}

function undo(silent = false) {
  if (anim) return;
  if (!history.length) return void (silent || toast(t('noUndo')));
  S = history.pop()!;
  viewGot = S.got;
  viewBroken = S.broken;
  over = false;
  hint = null;
  trail = [];
  refreshHud();
  haptic.light();
  tone({ freq: 500, to: 380, duration: 0.1, type: 'triangle', volume: 0.3 });
  track('undo', { level: level.n });
}

async function useHint() {
  if (busy()) return;
  if (hintsUsed > 0 && !(await showRewarded('hint'))) return;
  const sol = solve(level, S);
  if (!sol || !sol.length) return toast(t('noHint'), 3000);
  hintsUsed++;
  hint = { dir: sol[0], until: performance.now() + 3500 };
  refreshHud();
  haptic.light();
  track('hint', { level: level.n });
}

function pause() {
  if (meta.covering) return;
  meta.showPause({ onResume: () => {}, onRestart: () => startLevel(level.n) });
}

$('undo-btn').addEventListener('click', () => {
  unlockAudio();
  if (!meta.covering) undo();
});
$('hint-btn').addEventListener('click', () => {
  unlockAudio();
  void useHint();
});
$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  if (anim || meta.covering) return;
  track('level_restart', { level: level.n });
  startLevel(level.n);
});
$('pause-btn').addEventListener('click', () => {
  unlockAudio();
  pause();
});

// swipe input
let swipeStart: { x: number; y: number; id: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  swipeStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
function trySwipe(e: PointerEvent, min: number) {
  if (!swipeStart || swipeStart.id !== e.pointerId) return;
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return;
  swipeStart = null;
  move((Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0) as Dir);
}
canvas.addEventListener('pointermove', (e) => trySwipe(e, 34));
canvas.addEventListener('pointerup', (e) => trySwipe(e, 16));
canvas.addEventListener('pointercancel', () => (swipeStart = null));
window.addEventListener('keydown', (e) => {
  const d = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }[e.key];
  if (d !== undefined) move(d as Dir);
});

// ───────────────────────── drawing ─────────────────────────
const ease = (x: number) => 1 - (1 - x) * (1 - x);
let frozenAt: number | null = null;

function rr(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawTile(cell: number, tile: string, now: number) {
  const x = ox + (cell % level.w) * cs;
  const y = oy + Math.floor(cell / level.w) * cs;
  const m = cs * 0.04;
  if (tile === '~') {
    rr(x + m, y + m, cs - 2 * m, cs - 2 * m, cs * 0.18);
    ctx.fillStyle = '#2a7fbf';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = cs * 0.04;
    const k = (now / 900) % 1;
    ctx.beginPath();
    ctx.ellipse(x + cs / 2, y + cs / 2, cs * (0.12 + k * 0.25), cs * (0.06 + k * 0.12), 0, 0, Math.PI * 2);
    ctx.globalAlpha = 1 - k;
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  // ice base
  rr(x + m, y + m, cs - 2 * m, cs - 2 * m, cs * 0.18);
  ctx.fillStyle = tile === '*' ? '#ffffff' : '#e9f8ff';
  ctx.fill();
  if (tile !== '*') {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = cs * 0.035;
    ctx.beginPath();
    ctx.moveTo(x + cs * 0.22, y + cs * 0.38);
    ctx.lineTo(x + cs * 0.38, y + cs * 0.22);
    ctx.stroke();
  }
  if (tile === '#') {
    ctx.fillStyle = 'rgba(23,50,77,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + cs / 2, y + cs * 0.74, cs * 0.38, cs * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7d8ea3';
    ctx.beginPath();
    ctx.moveTo(x + cs * 0.14, y + cs * 0.72);
    ctx.quadraticCurveTo(x + cs * 0.12, y + cs * 0.3, x + cs * 0.42, y + cs * 0.18);
    ctx.quadraticCurveTo(x + cs * 0.8, y + cs * 0.12, x + cs * 0.86, y + cs * 0.52);
    ctx.quadraticCurveTo(x + cs * 0.9, y + cs * 0.76, x + cs * 0.5, y + cs * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a7b6c6';
    ctx.beginPath();
    ctx.ellipse(x + cs * 0.42, y + cs * 0.36, cs * 0.17, cs * 0.1, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x + cs * 0.5, y + cs * 0.2, cs * 0.18, cs * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (tile === '*') {
    ctx.fillStyle = '#dcebf5';
    ctx.beginPath();
    ctx.ellipse(x + cs / 2, y + cs * 0.66, cs * 0.34, cs * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + cs * 0.36, y + cs * 0.56, cs * 0.16, 0, Math.PI * 2);
    ctx.arc(x + cs * 0.6, y + cs * 0.52, cs * 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (tile === 'x') {
    ctx.strokeStyle = '#7fb4d3';
    ctx.lineWidth = cs * 0.035;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + cs * 0.18, y + cs * 0.3);
    ctx.lineTo(x + cs * 0.42, y + cs * 0.46);
    ctx.lineTo(x + cs * 0.36, y + cs * 0.7);
    ctx.moveTo(x + cs * 0.42, y + cs * 0.46);
    ctx.lineTo(x + cs * 0.7, y + cs * 0.4);
    ctx.lineTo(x + cs * 0.84, y + cs * 0.62);
    ctx.moveTo(x + cs * 0.7, y + cs * 0.4);
    ctx.lineTo(x + cs * 0.74, y + cs * 0.18);
    ctx.stroke();
  } else if ('^>v<'.includes(tile)) {
    const d = '^>v<'.indexOf(tile);
    ctx.save();
    ctx.translate(x + cs / 2, y + cs / 2);
    ctx.rotate((d * Math.PI) / 2);
    const bob = Math.sin(now / 200) * cs * 0.04;
    ctx.strokeStyle = '#1e88e5';
    ctx.lineWidth = cs * 0.1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-cs * 0.22, cs * 0.12 - bob);
    ctx.lineTo(0, -cs * 0.12 - bob);
    ctx.lineTo(cs * 0.22, cs * 0.12 - bob);
    ctx.stroke();
    ctx.restore();
  } else if (tile >= '1' && tile <= '4') {
    const col = ['#8b5cf6', '#f97316', '#10b981', '#ec4899'][+tile - 1];
    ctx.save();
    ctx.translate(x + cs / 2, y + cs / 2);
    ctx.rotate(now / 500);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = 1 - i * 0.28;
      ctx.lineWidth = cs * 0.07;
      ctx.beginPath();
      ctx.arc(0, 0, cs * (0.32 - i * 0.09), i, i + Math.PI * 1.4);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

function drawIgloo(now: number, open: boolean) {
  const x = cx(level.igloo);
  const y = cy(level.igloo) + cs * 0.12;
  const r = cs * 0.38;
  if (open) {
    const p = 0.5 + 0.5 * Math.sin(now / 260);
    ctx.fillStyle = `rgba(255, 209, 102, ${0.25 + p * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.2, r * 1.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#a9cfe6';
  ctx.lineWidth = cs * 0.03;
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.95, y - r * 0.35);
  ctx.lineTo(x + r * 0.95, y - r * 0.35);
  ctx.moveTo(x - r * 0.7, y - r * 0.7);
  ctx.lineTo(x + r * 0.7, y - r * 0.7);
  ctx.stroke();
  ctx.fillStyle = open ? '#ffb347' : '#2a4a66';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.38, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
}

function drawFish(cell: number, now: number) {
  const x = cx(cell);
  const y = cy(cell) + Math.sin(now / 300 + cell) * cs * 0.04;
  const s = cs * 0.2;
  ctx.fillStyle = 'rgba(23,50,77,0.12)';
  ctx.beginPath();
  ctx.ellipse(x, cy(cell) + cs * 0.24, s * 1.1, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff8a3d';
  ctx.beginPath();
  ctx.ellipse(x - s * 0.2, y, s * 1.05, s * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + s * 0.65, y);
  ctx.lineTo(x + s * 1.35, y - s * 0.6);
  ctx.lineTo(x + s * 1.35, y + s * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x - s * 0.75, y - s * 0.12, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#17324d';
  ctx.beginPath();
  ctx.arc(x - s * 0.78, y - s * 0.12, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(x: number, y: number, dir: Dir, moving: boolean, sink: number) {
  const r = cs * 0.34;
  ctx.save();
  ctx.translate(x, y);
  if (sink > 0) {
    ctx.globalAlpha = 1 - sink;
    ctx.scale(1 - sink * 0.6, 1 - sink * 0.6);
  }
  // shadow
  ctx.fillStyle = 'rgba(23,50,77,0.2)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.95, r * 0.85, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  const lean = moving ? DX[dir] * 0.18 : 0;
  ctx.rotate(lean);
  const sx = moving && DX[dir] ? 1.08 : 1;
  const sy = moving && DY[dir] ? 1.08 : 1;
  ctx.scale(sx, sy);
  // feet
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, r * 0.92, r * 0.25, r * 0.12, 0, 0, Math.PI * 2);
  ctx.ellipse(r * 0.35, r * 0.92, r * 0.25, r * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = outfit.body;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.88, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = outfit.belly;
  ctx.beginPath();
  ctx.ellipse(DX[dir] * r * 0.12, r * 0.22, r * 0.58, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // scarf
  ctx.fillStyle = outfit.scarf;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.12, r * 0.86, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(r * 0.3 - (moving ? DX[dir] * r * 0.9 : 0), -r * 0.12, r * 0.2, r * 0.55);
  // face
  const lx = DX[dir] * r * 0.18;
  const ly = DY[dir] * r * 0.08;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-r * 0.3 + lx, -r * 0.48 + ly, r * 0.2, 0, Math.PI * 2);
  ctx.arc(r * 0.3 + lx, -r * 0.48 + ly, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#17324d';
  ctx.beginPath();
  ctx.arc(-r * 0.3 + lx * 1.4, -r * 0.46 + ly * 1.4, r * 0.1, 0, Math.PI * 2);
  ctx.arc(r * 0.3 + lx * 1.4, -r * 0.46 + ly * 1.4, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  if (DY[dir] >= 0) {
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(-r * 0.16 + lx, -r * 0.3);
    ctx.lineTo(r * 0.16 + lx, -r * 0.3);
    ctx.lineTo(lx * 1.6, -r * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawHintArrow(dir: Dir, now: number) {
  const x = cx(S.pos);
  const y = cy(S.pos);
  const k = (now / 700) % 1;
  ctx.save();
  ctx.translate(x + DX[dir] * cs * (0.55 + k * 0.5), y + DY[dir] * cs * (0.55 + k * 0.5));
  ctx.rotate((dir * Math.PI) / 2);
  ctx.globalAlpha = 1 - k * 0.7;
  ctx.fillStyle = '#ffb347';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = cs * 0.05;
  ctx.beginPath();
  ctx.moveTo(0, -cs * 0.28);
  ctx.lineTo(cs * 0.24, 0);
  ctx.lineTo(cs * 0.09, 0);
  ctx.lineTo(cs * 0.09, cs * 0.2);
  ctx.lineTo(-cs * 0.09, cs * 0.2);
  ctx.lineTo(-cs * 0.09, 0);
  ctx.lineTo(-cs * 0.24, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

let lastDir: Dir = 2;
let tutorialDir: Dir | null = null;
let tutorialKey = '';

function frame(now: number) {
  if (frozenAt !== null) now = frozenAt;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // board
  rr(ox - cs * 0.14, oy - cs * 0.14, cs * level.w + cs * 0.28, cs * level.h + cs * 0.28, cs * 0.3);
  ctx.fillStyle = '#a9dcf3';
  ctx.fill();
  const shownState: State = { pos: S.pos, got: viewGot, broken: viewBroken };
  for (let i = 0; i < level.tiles.length; i++) drawTile(i, tileAt(level, shownState, i), now);
  drawIgloo(now, viewGot === allFish(level));

  // player position
  let px = cx(S.pos);
  let py = cy(S.pos);
  let moving = false;
  let sink = 0;
  if (anim) {
    const a = anim;
    const p = Math.min(1, (now - a.t0) / a.dur);
    const f = ease(p) * (a.cells.length - 1);
    const i = Math.min(a.cells.length - 2, Math.floor(f));
    const c0 = a.cells[i];
    const c1 = a.cells[i + 1];
    const jump = Math.abs((c0 % level.w) - (c1 % level.w)) + Math.abs(Math.floor(c0 / level.w) - Math.floor(c1 / level.w)) > 1;
    const k = jump ? (f - i < 0.5 ? 0 : 1) : f - i;
    px = cx(c0) + (cx(c1) - cx(c0)) * k;
    py = cy(c0) + (cy(c1) - cy(c0)) * k;
    moving = true;
    // collect fish as we pass them
    const reached = Math.floor(f + 0.5);
    for (let j = a.shown + 1; j <= reached; j++) {
      const cell = a.cells[j];
      const fi = level.fish.indexOf(cell);
      if (fi >= 0 && !(viewGot & (1 << fi))) {
        viewGot |= 1 << fi;
        puff(cx(cell), cy(cell), '#ffb347', 14, cs * 3);
        const cnt = a.res.collected.indexOf(fi);
        tone({ freq: pentatonic(4 + Math.max(0, cnt) * 2), duration: 0.14, volume: 0.4 });
        tone({ freq: pentatonic(7 + Math.max(0, cnt) * 2), duration: 0.18, volume: 0.3, delay: 0.06 });
        haptic.light();
        profile.progress('fish');
        refreshHud();
      }
      const cb = crackIndex(level).get(a.cells[j - 1]);
      if (cb !== undefined) viewBroken |= 1 << cb;
    }
    a.shown = Math.max(a.shown, reached);
    trail.push({ x: px, y: py, t: now });
    if (p >= 1) {
      anim = null;
      onSlideEnd(a);
    }
  }
  if (over && !anim && S.pos !== level.igloo && history.length && level.tiles[S.pos] !== '#') {
    const t = tileAt(level, S, S.pos);
    if (t === '~') sink = 1;
  }
  lastDir = anim ? anim.dir : lastDir;

  // fish
  for (let i = 0; i < level.fish.length; i++) if (!(viewGot & (1 << i))) drawFish(level.fish[i], now);

  // slide trail
  trail = trail.filter((p) => now - p.t < 260);
  for (const p of trail) {
    const k = 1 - (now - p.t) / 260;
    ctx.fillStyle = `rgba(255,255,255,${0.55 * k})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y + cs * 0.25, cs * 0.16 * k, 0, Math.PI * 2);
    ctx.fill();
  }

  if (sink < 1) drawPlayer(px, py, lastDir, moving, sink);

  // hints: level 1 always shows the next move
  if (!anim && !over && !meta.covering) {
    if (level.n === 1) {
      const key = `${S.pos}:${S.got}`;
      if (key !== tutorialKey) {
        tutorialKey = key;
        tutorialDir = solve(level, S)?.[0] ?? null;
      }
      if (tutorialDir !== null) drawHintArrow(tutorialDir, now);
    } else if (hint && now < hint.until) drawHintArrow(hint.dir, now);
  }

  particles = particles.filter((p) => now - p.t0 < p.life);
  for (const p of particles) {
    const tt = (now - p.t0) / 1000;
    ctx.globalAlpha = Math.max(0, 1 - (now - p.t0) / p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x + p.vx * tt, p.y + p.vy * tt + p.g * tt * tt, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(frame);
}

// ───────────────────────── boot ─────────────────────────
void initAds();
void initStore();
void setupNative({
  darkBackground: false,
  onBack: () => meta.back() || (!meta.covering ? (pause(), true) : false),
});
startLevel(store.get('last', 1));
requestAnimationFrame(frame);
meta.showHome();

// Exposed for e2e/screenshot scripts.
(window as unknown as { __buz: unknown }).__buz = {
  get state() { return { level: level.n, pos: S.pos, got: S.got, swipes: history.length, par: level.par }; },
  solve: () => solve(level, S),
  busy,
  board: () => ({ ox, oy, cs, w: level.w, h: level.h, rect: canvas.getBoundingClientRect().toJSON() }),
  move,
  falls: (d: Dir) => !!slide(level, S, d)?.fell,
  animating: () => !!anim,
  goto: startLevel,
  freeze: (ms: number | null) => (frozenAt = ms),
};
