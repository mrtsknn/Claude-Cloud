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
  CASTLE,
  COLS,
  N,
  ROCK,
  ROWS,
  SEA,
  castlesLeft,
  colOf,
  continueGame,
  flood,
  greedyDefend,
  isOver,
  neighbours,
  newGame,
  rowOf,
  runWave,
  seaDepths,
  threatened,
  toggleWall,
  type GameState,
  type WaveResult,
} from './game';
import { t } from './i18n';
import { SKINS, swatchOf, type Palette } from './skins';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/gelgit/PRIVACY.md';
declare const __APP_VERSION__: string;

let C: Palette = SKINS[0];

// ───────────────────────── persistence & settings ─────────────────────────
const store = createStore('gelgit');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
const loaded = store.get<GameState | null>('save', null);
let game: GameState = loaded && loaded.terrain?.length === N ? loaded : newGame(randomSeed());
// ───────────────────────── profile (coins, missions, skins, best) ─────────────────────────
const profile = createProfile({
  game: 'gelgit',
  levelCount: 0,
  defaultSkin: SKINS[0].id,
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'games', targets: [2, 3, 5], reward: (n) => 15 + n * 8 },
    { id: 'castles', targets: [10, 20, 35], reward: (n) => 20 + n * 2 },
    { id: 'rounds', targets: [5, 10, 15], reward: (n) => 20 + n * 4 },
    { id: 'walls', targets: [10, 20, 40], reward: (n) => 15 + n * 2 },
  ],
});
// Players from v1.0 keep their best score.
const legacyBest = store.get('best', 0);
if (profile.data.best < legacyBest) {
  profile.data.best = legacyBest;
  profile.save();
}
store.remove('best');
/** Best shown in the HUD; the profile records it for real at game over (meta lose sheet). */
let best = profile.data.best;
let bestAtStart = best;
let gamesPlayed = store.get('gamesPlayed', 0);
let tutorialDone = store.get('tutorialDone', false);
let startedAt = Date.now();
let over = false;
const save = () => store.set('save', game);
save();

trackSession('gelgit');

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
const waveBtn = $<HTMLButtonElement>('wave-btn');
const hand = $('hand');

document.documentElement.lang = navigator.language.slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
});

let toastTimer = 0;
function toast(text: string, ms = 1800) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

function refreshHud() {
  $('round').textContent = t('round', { n: game.round });
  $('score').textContent = String(game.score);
  $('best').textContent = String(Math.max(best, game.score));
  $('buckets').textContent = String(game.buckets);
  $('bucket-chip').classList.toggle('empty', game.buckets === 0);
  $('castles').textContent = String(castlesLeft(game));
  waveBtn.disabled = !!anim || over;
}

function bump(id: string) {
  const el = $(id);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 140);
}

// ───────────────────────── local audio: filtered-noise surf ─────────────────────────
let actx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let surfOut: GainNode | null = null;
function audio() {
  if (!settings.sound) return null;
  if (!actx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
    surfOut = actx.createGain();
    surfOut.connect(actx.destination);
    noise = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (actx.state === 'suspended') void actx.resume();
  return actx;
}

/**
 * The surf synth runs on its own AudioContext (the kit only synthesizes tones), so the kit/meta
 * sound toggle is mirrored here: muting silences anything still ringing and suspends the context.
 */
function applySound(on: boolean) {
  settings.sound = on;
  setSoundEnabled(on);
  if (!actx || !surfOut) return;
  surfOut.gain.cancelScheduledValues(actx.currentTime);
  surfOut.gain.value = on ? 1 : 0;
  if (on) void actx.resume();
  else void actx.suspend();
}

/** Band-passed noise with a swept centre frequency: surf, sand, crumbles. */
function noiseSweep(dur: number, f0: number, f1: number, f2: number, vol: number, delay = 0, q = 0.9) {
  const a = audio();
  if (!a || !noise || !surfOut || !settings.sound) return;
  const t0 = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t0);
  bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur * 0.35);
  bp.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(surfOut);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
}

const sfx = {
  build() {
    noiseSweep(0.14, 1800, 2400, 900, 0.12, 0, 1.4);
    tone({ freq: 330, to: 250, duration: 0.09, type: 'triangle', volume: 0.35 });
  },
  remove() {
    noiseSweep(0.12, 900, 1600, 2200, 0.08, 0, 1.4);
    tone({ freq: 250, to: 330, duration: 0.08, type: 'triangle', volume: 0.25 });
  },
  wave() {
    noiseSweep(1.5, 220, 900, 260, 0.5);
    noiseSweep(1.2, 2600, 3800, 1800, 0.06, 0.25, 2); // fizzing foam
  },
  castleLost() {
    noiseSweep(0.5, 700, 300, 120, 0.25, 0, 1.2);
    tone({ freq: 392, to: 294, duration: 0.35, type: 'sine', volume: 0.35, delay: 0.05 });
  },
  erode() {
    noiseSweep(0.25, 500, 300, 200, 0.12, 0, 1.6);
  },
  saved(n: number) {
    for (let i = 0; i < n + 2; i++) tone({ freq: pentatonic(i, 440), duration: 0.18, volume: 0.35, delay: 0.05 + i * 0.07 });
  },
  denied() {
    tone({ freq: 200, to: 160, duration: 0.12, type: 'triangle', volume: 0.3 });
  },
};

// ───────────────────────── layout ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
const L = { bx: 0, by: 0, cell: 0 };
let sandLayer: HTMLCanvasElement | null = null;

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const top = document.querySelector('.hud')!.getBoundingClientRect().bottom + 4;
  const bottom = document.querySelector('.bar')!.getBoundingClientRect().top - 6;
  const cell = Math.floor(Math.min((W - 12) / COLS, (bottom - top) / ROWS, 64));
  L.cell = cell;
  L.bx = Math.round((W - cell * COLS) / 2);
  L.by = Math.round(top + (bottom - top - cell * ROWS) / 2);
  canvas.dataset.layout = JSON.stringify(L);
  sandLayer = null;
}
window.addEventListener('resize', layout);
layout();

const cx = (i: number) => L.bx + (colOf(i) + 0.5) * L.cell;
const cy = (i: number) => L.by + (rowOf(i) + 0.5) * L.cell;

/** Static sand: gradient, speckles and faint build cells. Re-rendered on resize / new beach. */
function renderSand() {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, C.sandTop);
  grad.addColorStop(1, C.sandBottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  let s = game.seed || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = C.speck;
  for (let k = 0; k < (W * H) / 90; k++) {
    g.beginPath();
    g.arc(rnd() * W, rnd() * H, 0.5 + rnd() * 1.1, 0, Math.PI * 2);
    g.fill();
  }
  const { cell } = L;
  g.fillStyle = C.cell;
  for (let i = 0; i < N; i++) {
    g.beginPath();
    g.roundRect(L.bx + colOf(i) * cell + cell * 0.07, L.by + rowOf(i) * cell + cell * 0.07, cell * 0.86, cell * 0.86, cell * 0.2);
    g.fill();
  }
  sandLayer = c;
}

// ───────────────────────── animation state ─────────────────────────
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const easeBack = (x: number) => {
  x = Math.min(1, Math.max(0, x)) - 1;
  return 1 + 2.7 * x * x * x + 1.7 * x * x;
};

interface Particle { x: number; y: number; vx: number; vy: number; t0: number; life: number; size: number; color: string; g: number }
interface Floater { text: string; x: number; y: number; t0: number; size: number; color: string }
interface WaveAnim {
  res: WaveResult;
  t0: number;
  stepMs: number;
  floodMs: number;
  washedFx: Set<number>;
  eroded: boolean;
}

let particles: Particle[] = [];
let floaters: Floater[] = [];
const pops = new Map<number, number>(); // idx → t0 (walls/castles popping in)
const crumbles = new Map<number, { t0: number; hp: number }>(); // removed / collapsed walls
let wetUntil = new Float64Array(N);
let anim: WaveAnim | null = null;
let frozenAt: number | null = null;

// Live preview of this round's wave, recomputed only when the walls change.
let previewKey = '';
let preview: Int16Array = new Int16Array(N);
function getPreview() {
  const key = game.walls.join('') + game.terrain.join('') + game.reach;
  if (key !== previewKey) {
    previewKey = key;
    preview = flood(game.terrain, game.walls, game.reach);
  }
  return preview;
}

function sandBurst(i: number, n: number, color = C.wallTop, speed = 160) {
  const now = performance.now();
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    particles.push({
      x: cx(i) + Math.cos(a) * L.cell * 0.2,
      y: cy(i) + Math.sin(a) * L.cell * 0.15,
      vx: Math.cos(a) * speed * (0.4 + Math.random()),
      vy: -Math.random() * speed * 1.4 - 40,
      t0: now,
      life: 450 + Math.random() * 300,
      size: L.cell * (0.05 + Math.random() * 0.07),
      color,
      g: 900,
    });
  }
}

// ───────────────────────── drawing ─────────────────────────
function shorePath(now: number, depths: number[]) {
  const { bx, by, cell } = L;
  const pts: [number, number][] = [];
  const wob = (c: number, k: number) => Math.sin(now / 650 + c * 1.3 + k) * cell * 0.05;
  pts.push([0, by + depths[0] * cell + wob(-1, 0)]);
  for (let c = 0; c < COLS; c++) {
    const y = by + depths[c] * cell;
    pts.push([bx + c * cell + cell * 0.18, y + wob(c, 0)]);
    pts.push([bx + (c + 1) * cell - cell * 0.18, y + wob(c, 1.7)]);
  }
  pts.push([W, by + depths[COLS - 1] * cell + wob(COLS, 0)]);
  return pts;
}

function tracePts(pts: [number, number][], dy = 0, join = false) {
  if (join) ctx.lineTo(pts[0][0], pts[0][1] + dy);
  else ctx.moveTo(pts[0][0], pts[0][1] + dy);
  for (let k = 1; k < pts.length - 1; k++) {
    const mx = (pts[k][0] + pts[k + 1][0]) / 2;
    const my = (pts[k][1] + pts[k + 1][1]) / 2 + dy;
    ctx.quadraticCurveTo(pts[k][0], pts[k][1] + dy, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1] + dy);
}

function drawSea(now: number, foamAlpha: number) {
  const depths = seaDepths(game.terrain);
  const pts = shorePath(now, depths);
  const shoreY = L.by + Math.max(...depths) * L.cell;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(W, 0);
  ctx.lineTo(0, 0);
  tracePts(pts, 0, true);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, shoreY);
  grad.addColorStop(0, C.seaDeep);
  grad.addColorStop(1, C.seaLight);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.clip();
  // gentle swells drifting sideways
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = L.cell * 0.09;
  ctx.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    const y = (shoreY * (k + 0.6)) / 6;
    ctx.beginPath();
    for (let x = -20; x <= W + 20; x += 12) {
      const yy = y + Math.sin(x / 38 + now / 900 + k * 2.1) * L.cell * 0.1;
      if (x === -20) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.setLineDash([L.cell * 0.9, L.cell * 1.6]);
    ctx.lineDashOffset = -now / 40 - k * 31;
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  // foam: a crisp edge and a softer wash line that slides up and down the sand
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const wash = (Math.sin(now / 1100) + 1) * 0.5;
  ctx.globalAlpha = 0.35 * foamAlpha * (1 - wash * 0.5);
  ctx.strokeStyle = C.foam;
  ctx.lineWidth = L.cell * 0.07;
  ctx.beginPath();
  tracePts(pts, L.cell * (0.1 + wash * 0.16));
  ctx.stroke();
  ctx.globalAlpha = 0.95 * foamAlpha;
  ctx.lineWidth = L.cell * 0.13;
  ctx.beginPath();
  tracePts(pts);
  ctx.stroke();
  ctx.restore();
}

function drawPreview(now: number) {
  const dist = getPreview();
  const { cell } = L;
  const pulse = 0.16 + 0.05 * Math.sin(now / 400);
  ctx.fillStyle = `rgba(${C.preview},${pulse})`;
  for (let i = 0; i < N; i++) {
    if (dist[i] < 1) continue;
    ctx.beginPath();
    ctx.roundRect(L.bx + colOf(i) * cell + 1, L.by + rowOf(i) * cell + 1, cell - 2, cell - 2, cell * 0.16);
    ctx.fill();
  }
  // dashed reach line: where the wave will stop although it could flow further
  ctx.save();
  ctx.strokeStyle = C.reachLine;
  ctx.lineWidth = Math.max(2, cell * 0.07);
  ctx.lineCap = 'round';
  ctx.setLineDash([cell * 0.18, cell * 0.16]);
  ctx.lineDashOffset = -now / 60;
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    if (dist[i] < 1) continue;
    const x = L.bx + colOf(i) * cell;
    const y = L.by + rowOf(i) * cell;
    for (const n of neighbours(i)) {
      if (dist[n] >= 0 || game.terrain[n] === ROCK || game.walls[n] > 0) continue;
      if (n === i + COLS) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
      else if (n === i - COLS) { ctx.moveTo(x, y); ctx.lineTo(x + cell, y); }
      else if (n === i + 1) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
      else { ctx.moveTo(x, y); ctx.lineTo(x, y + cell); }
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawWet(now: number) {
  const { cell } = L;
  for (let i = 0; i < N; i++) {
    const left = wetUntil[i] - now;
    if (left <= 0) continue;
    ctx.fillStyle = `rgba(${C.wet},${0.28 * Math.min(1, left / 1200)})`;
    ctx.fillRect(L.bx + colOf(i) * cell, L.by + rowOf(i) * cell, cell, cell);
  }
}

function drawFlood(e: number) {
  if (!anim) return 1;
  const { res, stepMs, floodMs } = anim;
  const s = e / stepMs;
  const alpha = e < floodMs + 350 ? 1 : Math.max(0, 1 - (e - floodMs - 350) / 650);
  const { cell } = L;
  for (let i = 0; i < N; i++) {
    const d = res.dist[i];
    if (d < 1) continue;
    const f = Math.min(1, Math.max(0, s - (d - 1)));
    if (f <= 0) continue;
    const x = L.bx + colOf(i) * cell;
    const y = L.by + rowOf(i) * cell;
    ctx.globalAlpha = 0.92 * alpha;
    ctx.fillStyle = C.water;
    if (f >= 1) {
      ctx.fillRect(x - 0.5, y - 0.5, cell + 1, cell + 1);
    } else {
      const k = 0.35 + 0.65 * ease(f);
      ctx.beginPath();
      ctx.roundRect(x + (cell * (1 - k)) / 2, y + (cell * (1 - k)) / 2, cell * k, cell * k, cell * 0.4 * (1 - k) + 2);
      ctx.fill();
      // foam front: a white rim around the growing water
      ctx.globalAlpha = 0.85 * alpha;
      ctx.strokeStyle = C.foam;
      ctx.lineWidth = cell * 0.1;
      ctx.stroke();
    }
  }
  // lingering foam on the outer edge of the flood
  if (s >= 1) {
    ctx.fillStyle = C.foam;
    for (let i = 0; i < N; i++) {
      const d = res.dist[i];
      if (d < 1 || s < d) continue;
      if (!neighbours(i).some((n) => res.dist[n] < 0 && res.before.terrain[n] !== SEA)) continue;
      ctx.globalAlpha = 0.55 * alpha;
      ctx.beginPath();
      ctx.arc(cx(i) + Math.sin(e / 200 + i) * cell * 0.12, cy(i), cell * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return 1 - alpha;
}

function drawRock(i: number) {
  const { cell } = L;
  const x = cx(i);
  const y = cy(i);
  ctx.fillStyle = 'rgba(90,70,40,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + cell * 0.3, cell * 0.42, cell * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  const r = cell * 0.42;
  const pts = 7;
  ctx.beginPath();
  for (let k = 0; k < pts; k++) {
    const a = (k / pts) * Math.PI * 2 + i;
    const rr = r * (0.82 + 0.18 * Math.abs(Math.sin(i * 3.7 + k * 1.9)));
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.85;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = C.rock;
  ctx.fill();
  ctx.strokeStyle = C.rockDark;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = C.rockLight;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y - r * 0.35, r * 0.4, r * 0.18, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawWall(i: number, hp: number, scale = 1, alpha = 1) {
  const { cell } = L;
  const w = cell * 0.86 * scale;
  const hgt = (hp >= 2 ? 0.5 : 0.24) * cell * scale;
  const x = cx(i) - w / 2;
  const base = cy(i) + cell * 0.36;
  const topH = cell * 0.4 * scale;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(90,70,40,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx(i), base + 1, w * 0.55, cell * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // front face
  ctx.fillStyle = C.wallSide;
  ctx.beginPath();
  ctx.roundRect(x, base - hgt - topH * 0.5, w, hgt + topH * 0.5, cell * 0.12);
  ctx.fill();
  // top face
  ctx.fillStyle = C.wallTop;
  ctx.beginPath();
  ctx.roundRect(x, base - hgt - topH, w, topH, cell * 0.14);
  ctx.fill();
  ctx.strokeStyle = C.wallEdge;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(x, base - hgt - topH, w, hgt + topH, cell * 0.14);
  ctx.stroke();
  if (hp < 2) {
    // crack
    ctx.beginPath();
    ctx.moveTo(x + w * 0.35, base - hgt - topH * 0.6);
    ctx.lineTo(x + w * 0.5, base - hgt * 0.5);
    ctx.lineTo(x + w * 0.42, base);
    ctx.stroke();
  } else {
    // pat marks from the bucket
    ctx.fillStyle = 'rgba(169,122,62,0.25)';
    ctx.beginPath();
    ctx.arc(x + w * 0.3, base - hgt - topH * 0.5, cell * 0.05, 0, Math.PI * 2);
    ctx.arc(x + w * 0.68, base - hgt - topH * 0.45, cell * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCastle(i: number, now: number, scale = 1, alpha = 1, danger = 0) {
  const { cell } = L;
  const x = cx(i);
  const base = cy(i) + cell * 0.38;
  if (danger > 0) {
    ctx.fillStyle = `rgba(255,110,80,${danger})`;
    ctx.beginPath();
    ctx.ellipse(x, base - cell * 0.02, cell * 0.5, cell * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, base);
  ctx.scale(scale, scale);
  const u = cell / 10;
  ctx.fillStyle = 'rgba(90,70,40,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 4.6 * u, 1.2 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = C.castleEdge;
  // flag
  const wv = Math.sin(now / 180 + i) * 0.9 * u;
  ctx.strokeStyle = C.castleEdge;
  ctx.beginPath();
  ctx.moveTo(0, -8 * u);
  ctx.lineTo(0, -11.6 * u);
  ctx.stroke();
  ctx.fillStyle = C.flag;
  ctx.beginPath();
  ctx.moveTo(0, -11.6 * u);
  ctx.quadraticCurveTo(1.6 * u, -11.6 * u + wv * 0.5, 3.4 * u, -10.8 * u + wv);
  ctx.quadraticCurveTo(1.6 * u, -10 * u + wv * 0.5, 0, -10 * u);
  ctx.fill();
  // side walls with battlements
  const body = (x0: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, -h);
    const teeth = 3;
    const tw = w / (teeth * 2 - 1);
    for (let k = 0; k < teeth * 2 - 1; k++) {
      const up = k % 2 === 0;
      ctx.lineTo(x0 + k * tw, -h - (up ? 1.1 * u : 0));
      ctx.lineTo(x0 + (k + 1) * tw, -h - (up ? 1.1 * u : 0));
    }
    ctx.lineTo(x0 + w, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  body(-4.4 * u, 3 * u, 4 * u, C.castleSide);
  body(1.4 * u, 3 * u, 4 * u, C.castleSide);
  body(-2.4 * u, 4.8 * u, 7 * u, C.castle);
  // door
  ctx.fillStyle = C.door;
  ctx.beginPath();
  ctx.moveTo(-0.9 * u, 0);
  ctx.lineTo(-0.9 * u, -1.8 * u);
  ctx.arc(0, -1.8 * u, 0.9 * u, Math.PI, 0);
  ctx.lineTo(0.9 * u, 0);
  ctx.fill();
  // window
  ctx.beginPath();
  ctx.arc(0, -4.8 * u, 0.55 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawObjects(now: number, e: number) {
  const src = anim ? anim.res.before : game;
  const walls = anim && anim.eroded ? anim.res.state.walls : src.walls;
  const threats = anim ? new Set<number>() : new Set(threatened(game, getPreview()));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const t = src.terrain[i];
      if (t === ROCK) drawRock(i);
      else if (t === CASTLE) {
        const washT = anim && anim.res.washed.includes(i) ? anim.res.dist[i] * anim.stepMs : -1;
        const pop = pops.get(i);
        const pk = pop ? easeBack((now - pop) / 400) : 1;
        if (washT >= 0 && e >= washT) {
          const k = (e - washT) / 650;
          if (k < 1) drawCastle(i, now, 1 - ease(k) * 0.6, 1 - k);
        } else {
          const danger = threats.has(i) ? 0.35 + 0.25 * Math.sin(now / 160) : 0;
          drawCastle(i, now, pk, 1, danger);
        }
      }
      if (walls[i] > 0) {
        const pop = pops.get(i);
        const k = pop ? easeBack((now - pop) / 260) : 1;
        drawWall(i, walls[i], Math.max(0.01, k));
      }
      const cr = crumbles.get(i);
      if (cr) {
        const k = (now - cr.t0) / 320;
        if (k >= 1) crumbles.delete(i);
        else drawWall(i, cr.hp, 1 - ease(k) * 0.7, 1 - k);
      }
    }
  }
}

function drawFx(now: number) {
  particles = particles.filter((p) => now - p.t0 < p.life);
  for (const p of particles) {
    const tt = (now - p.t0) / 1000;
    ctx.globalAlpha = Math.max(0, 1 - (now - p.t0) / p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x + p.vx * tt, p.y + p.vy * tt + 0.5 * p.g * tt * tt, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  floaters = floaters.filter((f) => now - f.t0 < 1300);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of floaters) {
    const p = (now - f.t0) / 1300;
    if (p < 0) continue;
    const s = easeBack(p * 4);
    ctx.save();
    ctx.translate(f.x, f.y - 30 * ease(p));
    ctx.scale(s, s);
    ctx.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
    ctx.font = `800 ${f.size}px ui-rounded, system-ui, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = f.size * 0.2;
    ctx.strokeStyle = 'rgba(20,80,90,0.85)';
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function frame(now: number) {
  if (!sandLayer) renderSand();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(sandLayer!, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const e = anim ? (frozenAt ?? now) - anim.t0 : 0;
  drawWet(now);
  if (!anim && !over) drawPreview(now);
  const t = frozenAt ?? now;
  drawSea(t, 1);
  if (anim) {
    drawFlood(e);
    stepAnim(e, now);
  }
  drawObjects(now, e);
  drawFx(now);
  requestAnimationFrame(frame);
}

// ───────────────────────── wave flow ─────────────────────────
function startWave() {
  if (anim || over) return;
  unlockAudio();
  const res = runWave(game);
  let maxD = 1;
  for (let i = 0; i < N; i++) maxD = Math.max(maxD, res.dist[i]);
  const stepMs = Math.max(70, Math.min(170, 950 / maxD));
  anim = { res, t0: performance.now(), stepMs, floodMs: maxD * stepMs, washedFx: new Set(), eroded: false };
  // Persist the outcome immediately: killing the app mid-animation must not undo the wave.
  game = res.state;
  save();
  refreshHud();
  $('castles').textContent = String(castlesLeft(res.before));
  $('score').textContent = String(res.before.score);
  $('best').textContent = String(Math.max(best, res.before.score));
  $('round').textContent = t('round', { n: res.before.round });
  haptic.medium();
  sfx.wave();
  if (!tutorialDone) finishTutorial();
  hand.hidden = true;
  track('round_end', {
    round: res.before.round,
    castles: castlesLeft(res.state),
    lost: res.washed.length,
    buckets: res.before.buckets,
    reach: res.before.reach,
    walls_built: res.before.fresh.length,
  });
}

function stepAnim(e: number, now: number) {
  if (!anim || frozenAt != null) return;
  const { res, stepMs, floodMs } = anim;
  for (const i of res.washed) {
    if (!anim.washedFx.has(i) && e >= res.dist[i] * stepMs) {
      anim.washedFx.add(i);
      sandBurst(i, 18, C.castle, 200);
      sandBurst(i, 8, '#ffffff', 140);
      sfx.castleLost();
      haptic.heavy();
      $('castles').textContent = String(castlesLeft(res.before) - anim.washedFx.size);
    }
  }
  if (!anim.eroded && e >= floodMs + 150) {
    anim.eroded = true;
    for (const i of res.eroded) sandBurst(i, 4, C.wallSide, 90);
    for (const i of res.broken) crumbles.set(i, { t0: now, hp: 1 });
    if (res.eroded.length) sfx.erode();
  }
  if (e >= floodMs + 1000) finishWave(now);
}

function finishWave(now: number) {
  if (!anim) return;
  const { res } = anim;
  for (let i = 0; i < N; i++) if (res.dist[i] >= 1) wetUntil[i] = now + 2600;
  anim = null;
  refreshHud();
  bump('score');
  const midX = L.bx + (COLS * L.cell) / 2;
  const midY = L.by + L.cell * 6;
  if (res.gained > 0) floaters.push({ text: `+${res.gained}`, x: midX, y: midY, t0: now, size: L.cell * 0.9, color: '#ffffff' });
  if (res.perfect) {
    floaters.push({ text: t('perfect'), x: midX, y: midY - L.cell * 1.1, t0: now + 80, size: L.cell * 0.75, color: '#ffe08a' });
    sfx.saved(castlesLeft(game));
    haptic.success();
  }
  if (game.score > best) best = game.score;
  const standing = castlesLeft(game);
  if (standing > 0) profile.progress('castles', standing);
  if (res.before.fresh.length) profile.progress('walls', res.before.fresh.length);
  if (!isOver(game)) profile.progress('rounds');
  if (isOver(game)) {
    over = true;
    refreshHud();
    setTimeout(showGameOver, 500);
    return;
  }
  toast(`${t('round', { n: game.round })} · ${t('reachUp', { n: game.reach })}`);
}

// ───────────────────────── input ─────────────────────────
function cellAt(x: number, y: number) {
  const c = Math.floor((x - L.bx) / L.cell);
  const r = Math.floor((y - L.by) / L.cell);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
  return r * COLS + c;
}

function tapCell(i: number) {
  if (anim || over || i < 0) return;
  const was = game.fresh.includes(i);
  const next = toggleWall(game, i);
  const now = performance.now();
  if (!next) {
    if (game.terrain[i] !== SEA && game.terrain[i] !== CASTLE && game.terrain[i] !== ROCK && game.walls[i] === 0 && game.buckets === 0) {
      toast(t('noBuckets'));
      const chip = $('bucket-chip');
      chip.classList.remove('shake');
      void chip.offsetWidth;
      chip.classList.add('shake');
      haptic.error();
    }
    sfx.denied();
    return;
  }
  game = next;
  if (was) {
    crumbles.set(i, { t0: now, hp: 2 });
    sandBurst(i, 6);
    sfx.remove();
  } else {
    pops.set(i, now);
    sandBurst(i, 10);
    sfx.build();
  }
  haptic.light();
  save();
  refreshHud();
  bump('buckets');
  if (!tutorialDone && tutStep === 0 && !was) setTutStep(1);
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  audio();
  const rect = canvas.getBoundingClientRect();
  tapCell(cellAt(e.clientX - rect.left, e.clientY - rect.top));
});
waveBtn.addEventListener('click', () => {
  audio();
  startWave();
});

// ───────────────────────── tutorial (wordless hand) ─────────────────────────
let tutStep = 0;
let tutTimer = 0;
function placeHand(x: number, y: number, mode: 'tap' | 'look') {
  hand.hidden = false;
  hand.className = `hand ${mode}`;
  // the fingertip sits ~(0.45, 0.06) inside the 54px glyph
  hand.style.left = `${x - 24}px`;
  hand.style.top = `${y - 3}px`;
}
function setTutStep(step: number) {
  tutStep = step;
  clearTimeout(tutTimer);
  if (tutorialDone || over) {
    hand.hidden = true;
    return;
  }
  if (step === 0) {
    const target = greedyDefend(game, 1)[0];
    if (target == null) return setTutStep(2);
    placeHand(cx(target), cy(target), 'tap');
  } else if (step === 1) {
    // look at the dashed reach line next to a threatened castle (or the deepest preview cell)
    const dist = getPreview();
    let pick = -1;
    for (let i = 0; i < N; i++) if (dist[i] >= 1 && (pick < 0 || dist[i] > dist[pick])) pick = i;
    if (pick < 0) return setTutStep(2);
    placeHand(cx(pick) - L.cell * 0.6, cy(pick) + L.cell * 0.4, 'look');
    tutTimer = window.setTimeout(() => setTutStep(2), 2600);
  } else {
    const r = waveBtn.getBoundingClientRect();
    placeHand(r.left + r.width * 0.62, r.top + r.height * 0.55, 'tap');
  }
}
function finishTutorial() {
  tutorialDone = true;
  store.set('tutorialDone', true);
  hand.hidden = true;
  clearTimeout(tutTimer);
  track('tutorial_complete');
}

// ───────────────────────── game over / continue / restart ─────────────────────────
function showGameOver() {
  haptic.error();
  [392, 330, 262].forEach((f, i) => tone({ freq: f, duration: 0.3, type: 'sine', volume: 0.35, delay: i * 0.15 }));
  track('game_over', {
    score: game.score,
    rounds: game.round - 1,
    duration_s: Math.round((Date.now() - startedAt) / 1000),
    continued: game.continued,
    best: Math.max(best, profile.data.best),
  });
  if (game.score > bestAtStart && game.score > 0) track('new_best', { score: game.score });
  // A continue rebuilds the castles the last wave took, so it needs a fresh loss to undo.
  const canContinue = !game.continued && game.lastLost.length > 0;
  meta.showLose({
    score: game.score,
    label: t('tideWon'),
    coins: Math.round(game.score / 2),
    continuesUsed: game.continued ? 1 : 0,
    canContinue,
    onContinue: revive,
    onRetry: () => {
      finishGame();
      restart();
    },
    onMenu: () => {
      finishGame();
      restart();
    },
  });
}

function finishGame() {
  gamesPlayed++;
  store.set('gamesPlayed', gamesPlayed);
  // From now on the home screen offers the daily reward on its own (kept quiet on the very first visit).
  if (profile.data.firstRun) profile.finishFirstRun();
  maybeRequestReview(gamesPlayed, game.score > bestAtStart && game.score > 0);
}

/** Continue after game over (paid on the meta lose sheet with coins or a video). */
function revive() {
  const restored = game.lastLost;
  game = continueGame(game);
  over = false;
  const now = performance.now();
  for (const i of restored) {
    pops.set(i, now);
    sandBurst(i, 12);
  }
  save();
  refreshHud();
  haptic.success();
  [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.16, delay: i * 0.07 }));
  track('continue', { round: game.round, score: game.score });
}

function restart() {
  game = newGame(randomSeed());
  over = false;
  anim = null;
  best = Math.max(best, profile.data.best);
  bestAtStart = best;
  startedAt = Date.now();
  particles = [];
  floaters = [];
  crumbles.clear();
  pops.clear();
  wetUntil = new Float64Array(N);
  sandLayer = null;
  save();
  refreshHud();
  track('game_start', { mode: 'classic', resumed: false });
}

// ───────────────────────── meta (menu, missions, daily, shop) ─────────────────────────
function applySkin(id: string) {
  C = SKINS.find((s) => s.id === id) ?? SKINS[0];
  sandLayer = null;
  document.documentElement.style.setProperty('--m-bg', C.bg);
  document.documentElement.style.setProperty('--sand', C.sandTop);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', C.seaDeep);
}
applySkin(profile.data.skin);

/** Home-screen artwork: a little sand castle on its beach, a wave rolling in and out. */
function heroArt() {
  const el = document.createElement('div');
  el.className = 'hero';
  const paint = () => {
    const p = C;
    el.innerHTML = `<svg viewBox="0 0 200 150" aria-hidden="true">
      <defs><clipPath id="hero-clip"><rect width="200" height="150" rx="28"/></clipPath></defs>
      <g clip-path="url(#hero-clip)">
        <rect width="200" height="150" fill="${p.sandBottom}"/>
        <path d="M0 96 Q100 84 200 96 V150 H0z" fill="${p.sandTop}"/>
        <g class="hero-wave">
          <path d="M-40 -30 H240 V58 Q215 50 190 58 T140 58 T90 58 T40 58 T-10 58 T-40 58z" fill="${p.seaLight}"/>
          <path d="M-40 -30 H240 V40 Q215 33 190 40 T140 40 T90 40 T40 40 T-10 40 T-40 40z" fill="${p.seaDeep}" opacity="0.8"/>
          <path d="M-40 58 Q-15 66 10 58 T60 58 T110 58 T160 58 T210 58 T240 58" fill="none" stroke="${p.foam}" stroke-width="5" stroke-linecap="round"/>
        </g>
        <g class="hero-castle" stroke="${p.castleEdge}" stroke-width="2" stroke-linejoin="round">
          <ellipse cx="100" cy="130" rx="46" ry="8" fill="rgba(90,70,40,0.2)" stroke="none"/>
          <path d="M56 130 V104 h6 v-5 h6 v5 h6 v-5 h6 v5 h4 V130z" fill="${p.castleSide}"/>
          <path d="M112 130 V104 h4 v-5 h6 v5 h6 v-5 h6 v5 h6 V130z" fill="${p.castleSide}"/>
          <path d="M80 130 V82 h7 v-6 h8 v6 h10 v-6 h8 v6 h7 V130z" fill="${p.castle}"/>
          <path d="M94 130 v-12 a6 6 0 0 1 12 0 v12z" fill="${p.door}" stroke="none"/>
          <circle cx="100" cy="96" r="3.6" fill="${p.door}" stroke="none"/>
          <path d="M100 76 V58" fill="none"/>
          <path class="hero-flag" d="M100 58 q8 2 16 6 q-8 3 -16 4z" fill="${p.flag}" stroke="none"/>
          <path d="M28 136 h22 v-8 h-22z M150 136 h22 v-8 h-22z" fill="${p.wallTop}"/>
        </g>
      </g>
    </svg>`;
  };
  paint();
  profile.onChange(paint);
  return el;
}

const meta = createMeta({
  title: 'Gelgit',
  hero: heroArt(),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  endless: {
    title: t('beach'),
    play: () => {
      unlockAudio();
      audio();
      if (over || isOver(game)) {
        finishGame();
        restart();
      } else {
        track('game_start', { mode: 'classic', resumed: game.round > 1 || game.fresh.length > 0 });
      }
      layout();
      refreshHud();
      if (!tutorialDone) setTimeout(() => setTutStep(game.fresh.length > 0 ? 2 : 0), 400);
    },
  },
  missionText: (id, n) => t(`mission_${id}` as 'mission_games', { n }),
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as 'skin_classic'), price: s.price, swatch: swatchOf(s) })),
  onSkin: applySkin,
  settings,
  onSettings: (s) => {
    applySound(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', { sound: s.sound, haptics: s.haptics });
  },
});

function pause() {
  unlockAudio();
  if (over || meta.covering) return;
  meta.showPause({
    onResume: () => {},
    onRestart: () => {
      if (game.round > 1) track('game_abandon', { score: game.score, rounds: game.round - 1 });
      hand.hidden = true;
      restart();
      if (!tutorialDone) setTimeout(() => setTutStep(0), 400);
    },
    onMenu: () => (hand.hidden = true),
  });
}
$('pause-btn').addEventListener('click', pause);

// ───────────────────────── boot ─────────────────────────
refreshHud();
if (isOver(game)) over = true;

void initAds();
void initStore();
void setupNative({
  darkBackground: false,
  onPause: () => {
    save();
    if (actx && actx.state === 'running') void actx.suspend();
  },
  onBack: () => {
    if (meta.back()) return true;
    if (!meta.covering && !over) {
      pause();
      return true;
    }
    return false;
  },
});
meta.showHome();
requestAnimationFrame(frame);

// Test hook for scripts/e2e.mjs and scripts/screenshots.mjs.
(window as unknown as { __gelgit: unknown }).__gelgit = {
  get state() {
    return game;
  },
  get over() {
    return over;
  },
  busy: () => !!anim,
  center: (i: number) => ({ x: cx(i), y: cy(i) }),
  plan: () => greedyDefend(game),
  preview: () => Array.from(getPreview()),
  tap: tapCell,
  wave: startWave,
  /** Freeze the running wave `ms` after it started (hero screenshot). */
  freeze: (ms: number | null) => (frozenAt = ms == null || !anim ? null : anim.t0 + ms),
  load: (s: GameState) => {
    game = s;
    over = isOver(s);
    anim = null;
    sandLayer = null;
    save();
    refreshHud();
  },
  skipTutorial: () => finishTutorial(),
  /** Surf synth state: proves the meta sound toggle reaches the separate AudioContext. */
  surf: () => (actx && surfOut ? { state: actx.state, gain: surfOut.gain.value } : null),
  beach: (seed: number) => {
    game = newGame(seed);
    over = false;
    anim = null;
    sandLayer = null;
    save();
    refreshHud();
  },
};
