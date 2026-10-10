import './style.css';
import {
  createMeta,
  createProfile,
  createStore,
  haptic,
  initAds,
  initStore,
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
import { CUP, DIRS, LEVEL_COUNT, PIT, WALL, generateLevel, solve, starsFor, tilt, type Dir, type Level, type Marble, type MarbleMove } from './game';
import { lang, t } from './i18n';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/egim/PRIVACY.md';
declare const __APP_VERSION__: string;

// ───────────────────────── skins ─────────────────────────
interface Skin {
  id: string;
  price: number;
  frame: string;
  floor: string;
  wall: string;
  wallTop: string;
  palette: [string, string, string, string];
  gloss: number; // 0..1 highlight strength
}
const SKINS: Skin[] = [
  { id: 'classic', price: 0, frame: '#3a4f78', floor: '#dfe7f5', wall: '#5a6f99', wallTop: '#7f93bd', palette: ['#ef4444', '#2563eb', '#facc15', '#16a34a'], gloss: 0.9 },
  { id: 'wood', price: 200, frame: '#6b4426', floor: '#e8cfa6', wall: '#8a5a33', wallTop: '#b07a4c', palette: ['#c2410c', '#1d4ed8', '#eab308', '#15803d'], gloss: 0.6 },
  { id: 'neon', price: 300, frame: '#141028', floor: '#221b3d', wall: '#3b2f6b', wallTop: '#5b4bab', palette: ['#ff3d7f', '#22d3ee', '#fde047', '#4ade80'], gloss: 1 },
  { id: 'stone', price: 400, frame: '#55595f', floor: '#ecebe7', wall: '#8b8f96', wallTop: '#b4b8bf', palette: ['#b91c1c', '#1e40af', '#ca8a04', '#166534'], gloss: 0.5 },
  { id: 'candy', price: 500, frame: '#d9468f', floor: '#ffe4f1', wall: '#f472b6', wallTop: '#f9a8d4', palette: ['#e11d48', '#3b82f6', '#f59e0b', '#10b981'], gloss: 1 },
  { id: 'gold', price: 800, frame: '#7a5a12', floor: '#fbf3dc', wall: '#b8892a', wallTop: '#e3b94e', palette: ['#dc2626', '#2563eb', '#a16207', '#059669'], gloss: 1 },
  { id: 'night', price: 1000, frame: '#070b1a', floor: '#121a33', wall: '#26345e', wallTop: '#3d5291', palette: ['#f87171', '#60a5fa', '#fcd34d', '#34d399'], gloss: 0.8 },
];
const skinOf = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0];

// ───────────────────────── settings, profile, meta ─────────────────────────
const store = createStore('egim');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const profile = createProfile({
  game: 'egim',
  levelCount: LEVEL_COUNT,
  defaultSkin: 'classic',
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'marbles', targets: [10, 20, 30], reward: (n) => 20 + n * 2 },
  ],
});
let skin = skinOf(profile.data.skin);

document.documentElement.lang = lang;
document.title = t('title');
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
});

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  skins: SKINS.map((s) => ({
    id: s.id,
    name: t(`skin_${s.id}` as Parameters<typeof t>[0]),
    price: s.price,
    swatch: `radial-gradient(circle at 35% 30%, #fff 0 8%, ${s.palette[0]} 9% 28%, transparent 29%), radial-gradient(circle at 68% 66%, #fff 0 6%, ${s.palette[1]} 7% 24%, transparent 25%), ${s.floor}`,
  })),
  onSkin: (id) => {
    skin = skinOf(id);
  },
  levels: { count: LEVEL_COUNT, play: (n) => startLevel(n) },
  missionText: (id, n) => t(`mission_${id}` as Parameters<typeof t>[0], { n }),
  settings,
  onSettings: (s) => {
    Object.assign(settings, s);
    store.set('settings', settings);
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
  },
});

// ───────────────────────── game state ─────────────────────────
let level: Level = generateLevel(1);
let marbles: Marble[] = level.marbles;
let history: Marble[][] = [];
let tilts = 0;
let hintFree = true;
let inGame = false;
let won = false;
let hintDir: { dir: Dir; until: number } | null = null;

interface Anim {
  moves: MarbleMove[];
  t0: number;
  durs: number[];
  end: number;
  played: boolean[];
  done: () => void;
}
let anim: Anim | null = null;

function startLevel(n: number) {
  level = generateLevel(Math.max(1, Math.min(LEVEL_COUNT, n)));
  marbles = level.marbles;
  history = [];
  tilts = 0;
  hintFree = true;
  won = false;
  anim = null;
  hintDir = null;
  inGame = true;
  meta.hideHome();
  $('howto').classList.toggle('hide', n > 2);
  layout();
  refreshHud();
  track('level_start', { level: level.n, par: level.par });
}

function refreshHud() {
  $('level').textContent = String(level.n);
  $('tilts').textContent = t('tilts', { n: tilts, p: level.par });
  $('hint-badge').textContent = hintFree ? '1' : 'AD';
}

let toastTimer = 0;
function toast(text: string, ms = 2000) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

// ───────────────────────── input ─────────────────────────
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;

function doTilt(dir: Dir) {
  if (!inGame || anim || won || meta.covering) return;
  unlockAudio();
  const r = tilt(level, marbles, dir);
  const [dx, dy] = DIRS[dir];
  canvas.style.transform = `rotateX(${-dy * 9}deg) rotateY(${dx * 9}deg)`;
  setTimeout(() => (canvas.style.transform = ''), 180);
  if (!r.changed) {
    haptic.light();
    tone({ freq: 140, duration: 0.08, type: 'triangle', volume: 0.25 });
    return;
  }
  $('howto').classList.add('hide');
  hintDir = null;
  history.push(marbles);
  tilts++;
  refreshHud();
  const prev = marbles;
  const durs = r.moves.map((m) => {
    const d = Math.abs((m.to % level.w) - (m.from % level.w)) + Math.abs(Math.floor(m.to / level.w) - Math.floor(m.from / level.w));
    return d === 0 ? 0 : 70 + d * 55;
  });
  anim = {
    moves: r.moves,
    t0: performance.now(),
    durs,
    end: Math.max(...durs, 0) + 220,
    played: r.moves.map(() => false),
    done: () => {
      anim = null;
      if (r.lost) {
        marbles = history.pop() ?? prev;
        haptic.heavy();
        toast(t('lost'));
        return;
      }
      marbles = r.marbles;
      if (r.sunk) profile.progress('marbles', r.sunk);
      if (marbles.length === 0) win();
    },
  };
}

let start: { x: number; y: number; id: number } | null = null;
window.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('button, .meta-root')) return;
  start = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
window.addEventListener('pointermove', (e) => {
  if (!start || e.pointerId !== start.id) return;
  const dx = e.clientX - start.x;
  const dy = e.clientY - start.y;
  if (Math.hypot(dx, dy) < 28) return;
  start = null;
  doTilt(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
});
window.addEventListener('pointerup', () => (start = null));
window.addEventListener('keydown', (e) => {
  const k = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].indexOf(e.key);
  if (k >= 0) doTilt(k as Dir);
});

function undo() {
  if (anim || won) return;
  const prev = history.pop();
  if (!prev) return toast(t('noUndo'));
  marbles = prev;
  haptic.light();
  tone({ freq: 420, to: 300, duration: 0.1, volume: 0.25 });
}
function restart() {
  startLevel(level.n);
}
async function hint() {
  if (anim || won) return;
  if (!hintFree && !(await showRewarded('hint'))) return;
  const sol = solve(level, marbles);
  if (!sol || !sol.length) return toast(t('stuck'));
  hintFree = false;
  refreshHud();
  hintDir = { dir: sol[0], until: performance.now() + 2200 };
  haptic.light();
}
function pause() {
  if (!inGame || meta.covering) return;
  meta.showPause({ onResume: () => {}, onRestart: restart, onMenu: () => (inGame = false) });
}
$('undo-btn').addEventListener('click', undo);
$('hint-btn').addEventListener('click', () => void hint());
$('restart-btn').addEventListener('click', restart);
$('pause-btn').addEventListener('click', pause);

function win() {
  won = true;
  const stars = starsFor(tilts, level.par);
  track('level_complete', { level: level.n, tilts, par: level.par, stars });
  [0, 2, 4, 7, 9].forEach((s, i) => tone({ freq: pentatonic(s + 2), duration: 0.18, volume: 0.3, delay: i * 0.07 }));
  setTimeout(() => {
    meta.showWin({
      level: level.n,
      stars,
      coins: 10 + stars * 5,
      onNext: () => startLevel(Math.min(level.n + 1, LEVEL_COUNT)),
      onMenu: () => (inGame = false),
    });
  }, 450);
}

// ───────────────────────── layout + drawing ─────────────────────────
let W = 0;
let H = 0;
let cs = 40; // cell size
let ox = 0;
let oy = 0;
function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cs = Math.floor(Math.min((W - 12) / level.w, (H - 12) / level.h, 72));
  ox = (W - cs * level.w) / 2;
  oy = (H - cs * level.h) / 2;
}
window.addEventListener('resize', layout);

const center = (p: number) => ({ x: ox + ((p % level.w) + 0.5) * cs, y: oy + (Math.floor(p / level.w) + 0.5) * cs });

function rr(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawBoard() {
  const { w, h, cells } = level;
  rr(ox - 6, oy - 6, cs * w + 12, cs * h + 12, cs * 0.35);
  ctx.fillStyle = skin.frame;
  ctx.fill();
  rr(ox + cs * 0.5, oy + cs * 0.5, cs * (w - 1), cs * (h - 1), cs * 0.2);
  ctx.fillStyle = skin.floor;
  ctx.fill();
  for (let p = 0; p < cells.length; p++) {
    const c = cells[p];
    const x = ox + (p % w) * cs;
    const y = oy + Math.floor(p / w) * cs;
    const { x: cx, y: cy } = center(p);
    if (c === WALL) {
      const edge = p % w === 0 || p < w || p % w === w - 1 || p >= w * (h - 1);
      if (edge) continue; // frame covers the border
      rr(x + 2, y + 2, cs - 4, cs - 4, cs * 0.18);
      ctx.fillStyle = skin.wall;
      ctx.fill();
      rr(x + 2, y + 2, cs - 4, cs - 9, cs * 0.18);
      ctx.fillStyle = skin.wallTop;
      ctx.fill();
    } else if (c === PIT) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cs * 0.4);
      g.addColorStop(0, '#000');
      g.addColorStop(0.75, '#0a0a12');
      g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.4, 0, Math.PI * 2);
      ctx.fill();
      // dashed hazard rim so pits never read as black marbles
      ctx.setLineDash([cs * 0.09, cs * 0.07]);
      ctx.lineWidth = Math.max(2, cs * 0.05);
      ctx.strokeStyle = '#8a93a6';
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.43, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (c >= CUP) {
      const col = skin.palette[c - CUP];
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      const g = ctx.createRadialGradient(cx, cy - cs * 0.06, 0, cx, cy, cs * 0.31);
      g.addColorStop(0, '#05060a');
      g.addColorStop(1, '#232838');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawMarble(x: number, y: number, color: string, scale = 1, alpha = 1) {
  const r = cs * 0.36 * scale;
  if (r <= 0.5) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.15, y + r * 0.3, r, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, color);
  g.addColorStop(1, shade(color));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${0.75 * skin.gloss})`;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.38, y - r * 0.45, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.45);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawArrow(dir: Dir, now: number) {
  const [dx, dy] = DIRS[dir];
  const cx = W / 2;
  const cy = H / 2;
  const L = Math.min(W, H) * 0.22;
  const a = 0.55 + 0.35 * Math.sin(now / 160);
  ctx.save();
  ctx.translate(cx + dx * L * 0.3 * a, cy + dy * L * 0.3 * a);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = `rgba(255,181,71,${a})`;
  ctx.strokeStyle = 'rgba(42,26,0,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(L * 0.6, 0);
  ctx.lineTo(0, -L * 0.45);
  ctx.lineTo(0, -L * 0.18);
  ctx.lineTo(-L * 0.6, -L * 0.18);
  ctx.lineTo(-L * 0.6, L * 0.18);
  ctx.lineTo(0, L * 0.18);
  ctx.lineTo(0, L * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function frame(now: number) {
  requestAnimationFrame(frame);
  if (!inGame && !anim) return;
  ctx.clearRect(0, 0, W, H);
  drawBoard();
  if (anim) {
    const A = anim;
    const el = Math.max(0, now - A.t0);
    A.moves.forEach((m, i) => {
      const d = A.durs[i];
      const u = d ? Math.min(1, el / d) : 1;
      const k = Math.pow(u, 1.7); // accelerate like gravity
      const a = center(m.from);
      const b = center(m.to);
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k;
      const col = skin.palette[m.c];
      if (u >= 1 && !A.played[i]) {
        A.played[i] = true;
        if (m.fate === 'sunk') {
          tone({ freq: 880, to: 330, duration: 0.22, volume: 0.45 });
          tone({ freq: pentatonic(m.c * 2 + 5), duration: 0.18, volume: 0.25, delay: 0.08 });
          haptic.medium();
        } else if (m.fate === 'pit') {
          tone({ freq: 300, to: 60, duration: 0.4, type: 'triangle', volume: 0.5 });
        } else if (d) {
          tone({ freq: 190 + m.c * 20, duration: 0.05, type: 'triangle', volume: 0.18 });
        }
      }
      if (m.fate === 'stay' || u < 1) drawMarble(x, y, col);
      else {
        const s = Math.max(0, 1 - (el - d) / 200);
        drawMarble(b.x, b.y, m.fate === 'pit' ? '#333' : col, s * 0.85, s);
      }
    });
    if (el >= A.end) A.done();
  } else {
    for (const m of marbles) {
      const c = center(m.p);
      drawMarble(c.x, c.y, skin.palette[m.c]);
    }
  }
  if (hintDir) {
    if (now > hintDir.until) hintDir = null;
    else drawArrow(hintDir.dir, now);
  }
}
requestAnimationFrame(frame);

// ───────────────────────── boot ─────────────────────────
trackSession('egim');
void initAds();
void initStore();
void setupNative({
  onBack: () => {
    if (meta.back()) return true;
    if (inGame && !meta.covering) {
      pause();
      return true;
    }
    return false;
  },
});
meta.showHome();

// Test / screenshot hooks.
(window as unknown as { __egim: unknown }).__egim = {
  get state() {
    return { n: level.n, marbles, tilts, par: level.par, w: level.w, h: level.h };
  },
  solve: () => solve(level, marbles),
  busy: () => anim !== null,
  board: () => ({ ox, oy, cs }),
  goto: (n: number) => startLevel(n),
  hint: (dir: Dir) => (hintDir = { dir, until: performance.now() + 1e9 }),
};
