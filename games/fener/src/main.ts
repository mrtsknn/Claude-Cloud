import './style.css';
import {
  createMeta,
  createProfile,
  createStore,
  haptic,
  initAds,
  initStore,
  maybeRequestReview,
  rewardedAvailable,
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
  PATTERNS,
  STREET,
  WALL,
  WINDOW,
  LEVEL_COUNT,
  applyHint,
  canPlace,
  evaluate,
  generateLevel,
  hintMove,
  patternCells,
  starsFor,
  type Evaluation,
  type Level,
  type Pattern,
  type Placement,
  type Pos,
  type HintMove,
} from './game';
import { t } from './i18n';
import { SKINS, mix, rgb } from './skins';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/fener/PRIVACY.md';
declare const __APP_VERSION__: string;

/** Canvas colours; recomputed from the equipped lamp-light / sky theme by `applySkin`. */
const theme = {
  board: '#121839',
  street: '#1a2152',
  streetDot: 'rgba(255,255,255,0.09)',
  house: '#2b336f',
  houseLit: '#3a3a6e',
  roof: '#1f2659',
  pane: '#0a0e2c',
  amber: '#ffc861',
  amberHi: '#fff1c9',
  glow: '255,190,90',
  mullion: 'rgba(120,70,20,0.55)',
  base: '#0d1233',
  red: '#ff5a6e',
  tree: '#1c4651',
  treeHi: '#286069',
  trunk: '#3b3049',
  tile: '#1b2156',
  tileLine: 'rgba(255,255,255,0.09)',
};

function applySkin(id: string) {
  const s = SKINS.find((k) => k.id === id) ?? SKINS[0];
  theme.board = mix(s.bottom, s.top, 0.35);
  theme.street = mix(s.bottom, s.top, 0.85);
  theme.house = mix(s.top, '#ffffff', 0.08);
  theme.houseLit = mix(theme.house, s.light, 0.14);
  theme.roof = mix(s.top, '#ffffff', 0.015);
  theme.pane = mix(s.bottom, '#000000', 0.12);
  theme.amber = s.light;
  theme.amberHi = s.hi;
  theme.glow = rgb(mix(s.light, s.hi, 0.1));
  theme.mullion = `rgba(${rgb(mix(s.light, '#000000', 0.6))},0.55)`;
  theme.base = mix(s.bottom, s.top, 0.15);
  theme.tile = mix(s.bottom, s.top, 0.92);
  const root = document.documentElement.style;
  root.setProperty('--bg-top', s.top);
  root.setProperty('--bg-bottom', s.bottom);
  root.setProperty('--amber', s.light);
  root.setProperty('--amber-dark', mix(s.light, '#000000', 0.3));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.bottom);
}

// ───────────────────────── persistence ─────────────────────────
interface Snapshot { p: Placement; l: boolean[] }
interface Save {
  level: number;
  placement: Placement;
  locked: boolean[];
  history: Snapshot[];
  moves: number;
  hints: number;
  undos: number;
}

const store = createStore('fener');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const HINT_COST = 40;
/** Levels whose free hint was already used (restarting a level does not refill it). */
const freeHintUsed = new Set(store.get<number[]>('freeHints', []));

function freshLevel(level: number): Save {
  const n = generateLevel(level).tray.length;
  return { level, placement: new Array(n).fill(null), locked: new Array(n).fill(false), history: [], moves: 0, hints: 0, undos: 0 };
}

let S: Save = store.get<Save | null>('save', null) ?? freshLevel(1);
let lvl: Level = generateLevel(S.level);
if (S.placement.length !== lvl.tray.length) S = freshLevel(S.level); // corrupt/old save
let ev: Evaluation = evaluate(lvl, S.placement);
let levelStartedAt = Date.now();
const save = () => store.set('save', S);

trackSession('fener');

// ───────────────────────── profile (coins, stars, missions, skins) ─────────────────────────
const hadProfile = (() => {
  try {
    return localStorage.getItem('fener.profile') !== null;
  } catch {
    return true;
  }
})();
const profile = createProfile({
  game: 'fener',
  levelCount: LEVEL_COUNT,
  defaultSkin: SKINS[0].id,
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'windows', targets: [25, 50, 80], reward: (n) => 20 + Math.round(n / 2) },
    { id: 'lamps', targets: [10, 20, 35], reward: (n) => 20 + n },
  ],
});

/** v1.0 kept stars in `fener.stars` and the reached level in `fener.completed`/`fener.save`. */
if (!hadProfile) {
  const oldStars = store.get<Record<string, number> | null>('stars', null);
  const completed = store.get<number | null>('completed', null);
  if (oldStars || completed !== null) {
    let migrated = 0;
    for (const [k, v] of Object.entries(oldStars ?? {})) {
      const n = Number(k);
      if (Number.isInteger(n) && n >= 1 && n <= LEVEL_COUNT && typeof v === 'number' && v > 0) {
        profile.data.stars[n - 1] = Math.max(profile.data.stars[n - 1], Math.min(3, Math.floor(v)));
        migrated++;
      }
    }
    const reached = Math.max((completed ?? 0) + 1, S.level);
    profile.data.unlocked = Math.min(LEVEL_COUNT, Math.max(profile.data.unlocked, reached));
    profile.data.firstRun = false;
    track('progress_migrated', { levels: migrated, reached });
    store.remove('stars');
    store.remove('completed');
  }
  profile.save(); // from now on the profile exists, so migration never runs twice
}
applySkin(profile.data.skin);

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

const COIN_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffc83d" stroke="#b57d10" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#e0a21c" stroke-width="1.6"/></svg>';
const AD_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9v6l5-3z" fill="currentColor"/></svg>';

function refreshHud() {
  $('level').textContent = String(S.level);
  const badge = $('hint-badge');
  const free = !freeHintUsed.has(S.level);
  badge.className = `badge ${free ? 'free' : 'paid'}`;
  badge.innerHTML = free ? t('free') : `${COIN_SVG}${HINT_COST}`;
}

// ───────────────────────── layout ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
const L = { bx: 0, by: 0, bs: 0, cell: 0, slot: 0, gap: 10, perRow: 1, ty: 0, slots: [] as { x: number; y: number }[] };

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const n = lvl.tray.length;
  const perRow = n <= 5 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / perRow);
  const usableW = Math.min(W - 32, 520);
  const gap = 10;
  let slot = Math.min(72, (usableW - gap * (Math.max(perRow, 4) - 1)) / Math.max(perRow, 4));
  const between = 22;
  let trayH = rows * slot + (rows - 1) * gap;
  let bs = Math.floor(Math.min(usableW, H - trayH - between - 16, 560));
  if (bs < usableW * 0.82 && slot > 50) {
    // short screens: shrink the tray a little before the board
    slot = Math.max(50, slot - (usableW * 0.82 - bs) / rows);
    trayH = rows * slot + (rows - 1) * gap;
    bs = Math.floor(Math.min(usableW, H - trayH - between - 16, 560));
  }
  const total = bs + between + trayH;
  L.bs = bs;
  L.cell = bs / lvl.size;
  L.bx = (W - bs) / 2;
  L.by = Math.max(8, (H - total) * 0.42);
  L.ty = L.by + bs + between;
  L.slot = slot;
  L.gap = gap;
  L.perRow = perRow;
  L.slots = lvl.tray.map((_, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const col = i - row * perRow;
    return { x: W / 2 + (col - (inRow - 1) / 2) * (slot + gap), y: L.ty + slot / 2 + row * (slot + gap) };
  });
  // Exposed for the e2e/screenshot scripts so they never duplicate layout maths.
  canvas.dataset.layout = JSON.stringify({ bx: L.bx, by: L.by, cell: L.cell, size: lvl.size, slots: L.slots, slot });
}
window.addEventListener('resize', layout);
layout();

const cellCenter = (r: number, c: number) => ({ x: L.bx + (c + 0.5) * L.cell, y: L.by + (r + 0.5) * L.cell });

// ───────────────────────── animation state ─────────────────────────
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const easeBack = (x: number) => {
  x = Math.min(1, Math.max(0, x));
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

interface Drag { idx: number; from: 'tray' | 'board'; x: number; y: number; sx: number; sy: number; lift: number; liftTarget: number; moved: boolean; touch: boolean }
let drag: Drag | null = null;
let hover: Pos | null = null;
const litAt = new Map<number, number>();
const flickerAt = new Map<number, number>();
const placedAt = new Map<number, number>();
const flying = new Map<number, { x: number; y: number; t0: number }>();
const shakeAt = new Map<number, number>();
let winAt = 0;
let winPending = false;
let trayDealtAt = performance.now();
let frozenAt: number | null = null; // screenshot hook

function syncLit(now: number) {
  litAt.clear();
  ev.counts.forEach((n, i) => n === 1 && litAt.set(i, now - 1000));
}
syncLit(0);

// Sky: fixed pseudo-random stars.
const stars = Array.from({ length: 70 }, (_, i) => {
  const r = (k: number) => {
    const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return { x: r(1), y: r(2), s: 0.6 + r(3) * 1.4, p: r(4) * Math.PI * 2, f: 0.6 + r(5) * 1.6 };
});

// ───────────────────────── drawing ─────────────────────────
function rr(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function glow(x: number, y: number, radius: number, color: string, alpha: number) {
  if (alpha <= 0.01) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color.replace('A', String(alpha)));
  g.addColorStop(1, color.replace('A', '0'));
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** A lamp's light pattern on a 5x5 mini grid around a glowing centre. */
function drawMini(x: number, y: number, size: number, type: Pattern, alpha = 1, grid = true) {
  const m = size / 5;
  const set = new Set(PATTERNS[type].map(([dr, dc]) => `${dr},${dc}`));
  ctx.globalAlpha = alpha;
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const cx = x + dc * m;
      const cy = y + dr * m;
      if (dr === 0 && dc === 0) {
        ctx.fillStyle = theme.amberHi;
        ctx.beginPath();
        ctx.arc(cx, cy, m * 0.42, 0, Math.PI * 2);
        ctx.fill();
      } else if (set.has(`${dr},${dc}`)) {
        ctx.fillStyle = theme.amber;
        rr(cx - m * 0.34, cy - m * 0.34, m * 0.68, m * 0.68, m * 0.18);
        ctx.fill();
      } else if (grid) {
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        ctx.beginPath();
        ctx.arc(cx, cy, m * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** Lamp standing on a board cell: dark round base with its pattern, warm halo. */
function drawLamp(x: number, y: number, c: number, type: Pattern, alpha = 1, scale = 1, locked = false) {
  const s = c * scale;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(x, y, s * 1.05, `rgba(${theme.glow},A)`, 0.32 * alpha);
  ctx.restore();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = theme.base;
  ctx.beginPath();
  ctx.arc(x, y, s * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, s * 0.045);
  ctx.strokeStyle = locked ? 'rgba(255,255,255,0.75)' : `rgba(${theme.glow},0.55)`;
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawMini(x, y, s * 0.72, type, alpha, false);
}

function drawHouse(x: number, y: number, c: number, count: number, i: number, now: number) {
  const g = c * 0.07;
  const lit = count === 1;
  const hot = count >= 2;
  // roof
  ctx.fillStyle = theme.roof;
  ctx.beginPath();
  ctx.moveTo(x + g * 0.6, y + c * 0.4);
  ctx.lineTo(x + c / 2, y + g);
  ctx.lineTo(x + c - g * 0.6, y + c * 0.4);
  ctx.closePath();
  ctx.fill();
  // body
  ctx.fillStyle = lit ? theme.houseLit : theme.house;
  rr(x + g * 1.5, y + c * 0.36, c - g * 3, c * 0.58, c * 0.06);
  ctx.fill();
  // window
  const ww = c * 0.36;
  const wh = c * 0.3;
  const wx = x + c / 2 - ww / 2;
  const wy = y + c * 0.5;
  let k = 0;
  if (lit) k = ease((now - (litAt.get(i) ?? now - 1000)) / 320);
  if (hot) {
    const f = flickerAt.get(i) ?? 0;
    const e = now - f;
    const flick = e < 600 ? (Math.sin(e / 28) > 0 ? 1 : 0.45) : 0.75 + 0.25 * Math.sin(now / 160);
    ctx.fillStyle = theme.red;
    ctx.globalAlpha = flick;
    rr(wx, wy, ww, wh, c * 0.04);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = theme.pane;
    rr(wx, wy, ww, wh, c * 0.04);
    ctx.fill();
    if (k > 0) {
      const grad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
      grad.addColorStop(0, theme.amberHi);
      grad.addColorStop(1, theme.amber);
      ctx.fillStyle = grad;
      ctx.globalAlpha = k;
      rr(wx, wy, ww, wh, c * 0.04);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // mullions
  ctx.strokeStyle = lit ? theme.mullion : 'rgba(255,255,255,0.08)';
  ctx.lineWidth = Math.max(1, c * 0.03);
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy);
  ctx.lineTo(wx + ww / 2, wy + wh);
  ctx.moveTo(wx, wy + wh / 2);
  ctx.lineTo(wx + ww, wy + wh / 2);
  ctx.stroke();
  return k;
}

function drawTree(x: number, y: number, c: number) {
  ctx.fillStyle = theme.trunk;
  rr(x + c * 0.45, y + c * 0.6, c * 0.1, c * 0.28, c * 0.03);
  ctx.fill();
  ctx.fillStyle = theme.tree;
  ctx.beginPath();
  ctx.arc(x + c / 2, y + c * 0.44, c * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.treeHi;
  ctx.beginPath();
  ctx.arc(x + c * 0.42, y + c * 0.36, c * 0.13, 0, Math.PI * 2);
  ctx.fill();
}

function drawSky(now: number) {
  const boost = winAt ? Math.min(1, (now - winAt) / 800) : 0;
  for (const s of stars) {
    const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(now / (700 / s.f) + s.p)) + boost * 0.4 * Math.max(0, Math.sin(now / 150 + s.p));
    ctx.fillStyle = `rgba(230,234,255,${Math.min(1, a)})`;
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function placedIndexAt(r: number, c: number): number {
  return S.placement.findIndex((p, i) => p && p.r === r && p.c === c && !(drag && drag.idx === i));
}

function drawBoard(now: number) {
  const { bx, by, bs, cell } = L;
  const n = lvl.size;
  ctx.fillStyle = theme.board;
  rr(bx - 6, by - 6, bs + 12, bs + 12, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const winOrder = winAt ? winRank : null;
  const glows: { x: number; y: number; k: number; hot: boolean; bloom: number }[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      const x = bx + c * cell;
      const y = by + r * cell;
      const type = lvl.cells[i];
      ctx.fillStyle = theme.street;
      rr(x + 1.5, y + 1.5, cell - 3, cell - 3, cell * 0.16);
      ctx.fill();
      if (type === STREET) {
        if (placedIndexAt(r, c) < 0) {
          ctx.fillStyle = theme.streetDot;
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, cell * 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (type === WALL) {
        drawTree(x, y, cell);
      } else {
        const count = ev.counts[i];
        const k = drawHouse(x, y, cell, count, i, now);
        let bloom = 0;
        if (winOrder) {
          const e = now - winAt - (winOrder.get(i) ?? 0) * 70;
          if (e > 0) bloom = Math.max(0, 1 - e / 700) * ease(e / 120);
        }
        if (k > 0 || count >= 2 || bloom > 0) glows.push({ x: x + cell / 2, y: y + cell * 0.65, k, hot: count >= 2, bloom });
      }
    }
  }

  // light pass
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const g of glows) {
    if (g.hot) glow(g.x, g.y, cell * 0.9, 'rgba(255,70,90,A)', 0.3 + 0.12 * Math.sin(now / 120));
    else glow(g.x, g.y, cell * (0.85 + g.bloom * 0.6), `rgba(${theme.glow},A)`, 0.3 * g.k + 0.45 * g.bloom);
  }
  if (winAt) {
    const k = ease((now - winAt) / 1200);
    glow(bx + bs / 2, by + bs / 2, bs * 0.8, `rgba(${theme.glow},A)`, 0.12 * k);
  }
  ctx.restore();

  // lamps on the board
  S.placement.forEach((p, i) => {
    if (!p || drag?.idx === i) return;
    const { x, y } = cellCenter(p.r, p.c);
    const pop = placedAt.get(i);
    const scale = pop !== undefined ? 0.7 + 0.3 * easeBack((now - pop) / 260) : 1;
    let dx = 0;
    const sh = shakeAt.get(i);
    if (sh !== undefined && now - sh < 320) dx = Math.sin(((now - sh) / 320) * Math.PI * 6) * (1 - (now - sh) / 320) * cell * 0.12;
    drawLamp(x + dx, y, cell, lvl.tray[i], 1, scale, S.locked[i]);
  });

  // drop preview: which windows this lamp would light, and which would get too bright
  if (drag && hover) {
    const type = lvl.tray[drag.idx];
    const pulse = 0.5 + 0.5 * Math.sin(now / 140);
    const own = drag.from === 'board' ? S.placement[drag.idx] : null;
    const ownCells = own ? new Set(patternCells(n, type, own.r, own.c)) : new Set<number>();
    for (const k of patternCells(n, type, hover.r, hover.c)) {
      const x = bx + (k % n) * cell;
      const y = by + Math.floor(k / n) * cell;
      if (lvl.cells[k] !== WINDOW) {
        ctx.fillStyle = `rgba(${theme.glow},0.18)`;
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.1, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const base = ev.counts[k] - (ownCells.has(k) ? 1 : 0);
      ctx.lineWidth = Math.max(2, cell * 0.07);
      ctx.strokeStyle = base >= 1 ? `rgba(255,90,110,${0.6 + 0.4 * pulse})` : `rgba(${theme.glow},${0.55 + 0.35 * pulse})`;
      rr(x + 3, y + 3, cell - 6, cell - 6, cell * 0.18);
      ctx.stroke();
    }
    const c = cellCenter(hover.r, hover.c);
    drawLamp(c.x, c.y, cell, type, 0.45);
  }
}

function drawTray(now: number) {
  const s = L.slot;
  lvl.tray.forEach((type, i) => {
    const { x, y } = L.slots[i];
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    rr(x - s / 2, y - s / 2, s, s, s * 0.24);
    ctx.stroke();
    ctx.setLineDash([]);
    if (S.placement[i] || drag?.idx === i) return;
    let px = x;
    let py = y;
    let k = easeBack((now - trayDealtAt - i * 60) / 320);
    const f = flying.get(i);
    if (f) {
      const p = ease((now - f.t0) / 240);
      if (p >= 1) flying.delete(i);
      px = f.x + (x - f.x) * p;
      py = f.y + (y - f.y) * p;
      k = 1;
    }
    if (k <= 0) return;
    const sz = s * k;
    ctx.fillStyle = theme.tile;
    rr(px - sz / 2, py - sz / 2, sz, sz, sz * 0.24);
    ctx.fill();
    ctx.strokeStyle = theme.tileLine;
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(px, py, sz * 0.45, `rgba(${theme.glow},A)`, 0.18);
    ctx.restore();
    drawMini(px, py, sz * 0.74, type);
  });
}

function drawDrag() {
  if (!drag) return;
  const type = lvl.tray[drag.idx];
  drawLamp(drag.x, drag.y - drag.lift, Math.max(L.cell, 40) * 1.05, type, 1);
}

function drawTutorial(now: number) {
  if (S.level !== 1 || drag || winPending) return;
  const i = S.placement.findIndex((p, k) => !p && !flying.has(k));
  if (i < 0) return;
  const target = lvl.solution[i];
  if (placedIndexAt(target.r, target.c) >= 0) return;
  const from = L.slots[i];
  const to = cellCenter(target.r, target.c);
  const cyc = ((now - trayDealtAt) % 2400) / 2400;
  if (now - trayDealtAt < 700) return;
  const move = ease((cyc - 0.15) / 0.55);
  const x = from.x + (to.x - from.x) * move;
  const y = from.y + (to.y - from.y) * move;
  const fade = cyc < 0.08 ? cyc / 0.08 : cyc > 0.85 ? Math.max(0, 1 - (cyc - 0.85) / 0.15) : 1;
  if (cyc > 0.15) drawLamp(x, y, L.cell * 0.9, lvl.tray[i], 0.55 * fade);
  // finger
  const press = cyc > 0.1 && cyc < 0.75 ? 0.85 : 1;
  ctx.globalAlpha = fade * 0.9;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(x + 10, y + 16, 22 * press, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x + 10, y + 16, 12 * press, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function frame(now: number) {
  if (frozenAt !== null) now = frozenAt;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (drag) drag.lift += (drag.liftTarget - drag.lift) * 0.35;
  drawSky(now);
  drawBoard(now);
  drawTray(now);
  drawTutorial(now);
  drawDrag();
  requestAnimationFrame(frame);
}

// ───────────────────────── game flow ─────────────────────────
let winRank = new Map<number, number>();

/** Commits a new placement: history, save, sound/haptic feedback for what changed. */
function commit(next: Placement, opts: { locked?: boolean[]; record?: boolean } = {}) {
  if (opts.record !== false) {
    S.history.push({ p: S.placement, l: S.locked });
    if (S.history.length > 80) S.history.shift();
    S.moves++;
  }
  const before = ev.counts;
  S.placement = next;
  if (opts.locked) S.locked = opts.locked;
  ev = evaluate(lvl, S.placement);
  save();
  const now = performance.now();
  const newlyLit: number[] = [];
  let newlyHot = 0;
  ev.counts.forEach((n, i) => {
    if (lvl.cells[i] !== WINDOW) return;
    if (n === 1 && before[i] !== 1) {
      if (before[i] === 0) newlyLit.push(i);
      litAt.set(i, before[i] === 0 ? now : now - 1000);
    }
    if (n !== 1) litAt.delete(i);
    if (n >= 2 && before[i] < 2) {
      flickerAt.set(i, now);
      newlyHot++;
    }
  });
  newlyLit.sort((a, b) => a - b);
  newlyLit.forEach((_, k) => tone({ freq: pentatonic(k + 2), duration: 0.3, volume: 0.32, delay: k * 0.07 }));
  if (newlyHot) {
    tone({ freq: 196, duration: 0.28, type: 'sawtooth', volume: 0.16 });
    tone({ freq: 208, duration: 0.28, type: 'sawtooth', volume: 0.16 });
    haptic.error();
  } else if (newlyLit.length) haptic.light();
  if (ev.solved) {
    winPending = true;
    setTimeout(win, 380);
  } else if (ev.allPlaced && newlyHot === 0) {
    toast(t('allPlaced'), 2600);
  }
}

function placeLamp(idx: number, pos: Pos | null) {
  const next = S.placement.slice();
  next[idx] = pos;
  if (pos) placedAt.set(idx, performance.now());
  commit(next);
}

function win() {
  const now = performance.now();
  winAt = now;
  const mid = (lvl.size - 1) / 2;
  const windows = lvl.cells.map((_, i) => i).filter((i) => lvl.cells[i] === WINDOW);
  windows.sort((a, b) => Math.hypot(Math.floor(a / lvl.size) - mid, (a % lvl.size) - mid) - Math.hypot(Math.floor(b / lvl.size) - mid, (b % lvl.size) - mid));
  winRank = new Map(windows.map((w, k) => [w, k]));
  windows.slice(0, 12).forEach((_, k) => tone({ freq: pentatonic(k), duration: 0.35, volume: 0.28, delay: 0.1 + k * 0.07 }));
  haptic.success();
  const stars = starsFor(S.hints, S.undos);
  track('level_complete', {
    level: S.level,
    moves: S.moves,
    hints: S.hints,
    undos: S.undos,
    stars,
    duration_s: Math.round((Date.now() - levelStartedAt) / 1000),
  });
  const completed = S.level;
  profile.progress('windows', windows.length);
  profile.progress('lamps', lvl.tray.length);
  if (profile.data.firstRun) profile.finishFirstRun();
  // Persist the next board now so quitting on the win screen never loses the level.
  const next = freshLevel(completed + 1);
  store.set('save', next);
  const delay = Math.min(1500, 500 + windows.length * 60);
  setTimeout(() => {
    meta.showWin({
      level: completed,
      stars,
      coins: 10 + stars * 5,
      onNext: () => {
        haptic.medium();
        startLevel(next);
      },
      // Back on the home screen the board behind it is already the next level.
      onMenu: () => startLevel(next, false, true),
    });
  }, delay);
  maybeRequestReview(completed, stars === 3 && completed >= 5);
}

function startLevel(state: Save, resumed = false, quiet = false) {
  S = state;
  lvl = generateLevel(S.level);
  ev = evaluate(lvl, S.placement);
  save();
  drag = null;
  hover = null;
  winPending = false;
  winAt = 0;
  placedAt.clear();
  flying.clear();
  flickerAt.clear();
  levelStartedAt = Date.now();
  trayDealtAt = performance.now();
  layout();
  syncLit(performance.now());
  refreshHud();
  $('toast').hidden = true;
  if (!quiet) track('level_start', { level: S.level, size: lvl.size, lamps: lvl.tray.length, resumed });
}

/** Meta entry point (play card / level map): resume an unfinished board, else start fresh. */
function playLevel(n: number) {
  unlockAudio();
  const resume = S.level === n && !ev.solved;
  startLevel(resume ? S : freshLevel(n), resume && S.moves > 0);
}

function restartLevel() {
  track('level_restart', { level: S.level, moves: S.moves });
  const back = S.placement.map((p) => p && cellCenter(p.r, p.c));
  startLevel(freshLevel(S.level), true);
  back.forEach((c, i) => c && sendBack(i, c.x, c.y));
  haptic.medium();
}

// ───────────────────────── input ─────────────────────────
function pointerPos(e: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function cellAt(x: number, y: number): Pos | null {
  const c = Math.floor((x - L.bx) / L.cell);
  const r = Math.floor((y - L.by) / L.cell);
  return r >= 0 && c >= 0 && r < lvl.size && c < lvl.size ? { r, c } : null;
}

function updateHover() {
  if (!drag) return;
  const cell = cellAt(drag.x, drag.y - drag.lift);
  const prev = hover;
  hover = cell && canPlace(lvl, S.placement, drag.idx, cell.r, cell.c) ? cell : null;
  if (hover && (!prev || prev.r !== hover.r || prev.c !== hover.c)) {
    tone({ freq: 880, duration: 0.03, type: 'triangle', volume: 0.08 });
  }
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (drag || winPending || meta.covering || !hintSheet.hidden) return;
  const { x, y } = pointerPos(e);
  const touch = e.pointerType !== 'mouse';
  const liftBy = touch ? Math.max(L.cell, 40) * 1.25 : 0;
  // tray lamp?
  const half = L.slot / 2 + L.gap / 2;
  const idx = L.slots.findIndex((s, i) => !S.placement[i] && Math.abs(x - s.x) <= half && Math.abs(y - s.y) <= half);
  if (idx >= 0) {
    flying.delete(idx);
    drag = { idx, from: 'tray', x, y, sx: x, sy: y, lift: 0, liftTarget: liftBy, moved: false, touch };
  } else {
    const cell = cellAt(x, y);
    const at = cell ? placedIndexAt(cell.r, cell.c) : -1;
    if (at < 0) return;
    if (S.locked[at]) {
      shakeAt.set(at, performance.now());
      tone({ freq: 160, to: 120, duration: 0.12, type: 'triangle', volume: 0.25 });
      toast(t('locked'), 1600);
      return;
    }
    drag = { idx: at, from: 'board', x, y, sx: x, sy: y, lift: 0, liftTarget: 0, moved: false, touch };
    hover = { ...S.placement[at]! };
  }
  canvas.setPointerCapture(e.pointerId);
  haptic.light();
  tone({ freq: 520, to: 660, duration: 0.07, type: 'triangle', volume: 0.22 });
  updateHover();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = pointerPos(e);
  drag.x = p.x;
  drag.y = p.y;
  if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 8) {
    drag.moved = true;
    if (drag.from === 'board' && drag.touch) drag.liftTarget = Math.max(L.cell, 40) * 1.25;
  }
  updateHover();
});

function sendBack(idx: number, x: number, y: number) {
  flying.set(idx, { x, y, t0: performance.now() });
  tone({ freq: 340, to: 240, duration: 0.09, type: 'triangle', volume: 0.2 });
}

function endDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  const target = hover;
  hover = null;
  if (d.from === 'board') {
    const own = S.placement[d.idx]!;
    if (!d.moved || !target) {
      // tap (or drop off the board): back to the tray
      const c = d.moved ? { x: d.x, y: d.y - d.lift } : cellCenter(own.r, own.c);
      sendBack(d.idx, c.x, c.y);
      placeLamp(d.idx, null);
    } else if (target.r !== own.r || target.c !== own.c) {
      placeLamp(d.idx, target);
    }
    return;
  }
  if (target) placeLamp(d.idx, target);
  else sendBack(d.idx, d.x, d.y - d.lift);
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ───────────────────────── buttons ─────────────────────────
$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  if (winPending || meta.covering) return;
  restartLevel();
});

$('undo-btn').addEventListener('click', () => {
  unlockAudio();
  if (winPending || drag || meta.covering) return;
  const prev = S.history.pop();
  if (!prev) return toast(t('noUndo'));
  S.undos++;
  commit(prev.p, { locked: prev.l, record: false });
  S.moves++;
  save();
  haptic.light();
  tone({ freq: 500, to: 380, duration: 0.1, type: 'triangle', volume: 0.25 });
  track('undo', { level: S.level });
});

function useHint(move: HintMove, paid: 'free' | 'coins' | 'video') {
  S.hints++;
  if (paid === 'free') {
    freeHintUsed.add(S.level);
    store.set('freeHints', [...freeHintUsed]);
  }
  for (const i of move.evict) {
    const p = S.placement[i]!;
    sendBack(i, cellCenter(p.r, p.c).x, cellCenter(p.r, p.c).y);
  }
  const locked = S.locked.slice();
  locked[move.idx] = true;
  placedAt.set(move.idx, performance.now());
  commit(applyHint(S.placement, move), { locked });
  refreshHud();
  track('hint', { level: S.level, n: S.hints, paid });
}

// Paid hint sheet, styled with the kit meta classes: 40 coins or a rewarded video.
const hintSheet = document.createElement('div');
hintSheet.className = 'meta-root hint-sheet';
hintSheet.hidden = true;
hintSheet.innerHTML = `<div class="m-overlay"><div class="m-sheet"><div>
  <h2>${t('hintTitle')}</h2><p class="m-note">${t('hintNote')}</p>
  <p class="m-note m-have">${COIN_SVG}<b data-hint-coins></b></p>
  <button class="m-btn" data-hint="coins">${COIN_SVG} ${t('hintCoins', { n: HINT_COST })}</button>
  <button class="m-btn alt" data-hint="video">${AD_SVG} ${t('hintVideo')}</button>
  <button class="m-btn ghost" data-hint="close">${t('close')}</button></div></div></div>`;
document.body.appendChild(hintSheet);
let pendingHint: HintMove | null = null;
function closeHintSheet() {
  hintSheet.hidden = true;
  pendingHint = null;
}
hintSheet.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains('m-overlay')) return closeHintSheet();
  const btn = target.closest<HTMLButtonElement>('[data-hint]');
  if (!btn || !pendingHint) return;
  const move = pendingHint;
  haptic.light();
  if (btn.dataset.hint === 'close') return closeHintSheet();
  if (btn.dataset.hint === 'coins') {
    if (!profile.spend(HINT_COST)) return meta.toast(t('notEnough'));
    closeHintSheet();
    return useHint(move, 'coins');
  }
  btn.disabled = true;
  const ok = await showRewarded('hint');
  btn.disabled = false;
  if (!ok || pendingHint !== move) return;
  closeHintSheet();
  useHint(move, 'video');
});

$('hint-btn').addEventListener('click', () => {
  unlockAudio();
  if (winPending || drag || meta.covering) return;
  const move = hintMove(lvl, S.placement, S.locked);
  if (!move) return toast(t('hintDone'));
  // The first hint of every level is free; more cost coins or a rewarded video.
  if (!freeHintUsed.has(S.level)) return useHint(move, 'free');
  pendingHint = move;
  hintSheet.querySelector('[data-hint-coins]')!.textContent = String(profile.data.coins);
  (hintSheet.querySelector('[data-hint="video"]') as HTMLElement).hidden = !rewardedAvailable();
  hintSheet.hidden = false;
});

// ───────────────────────── meta (home, map, missions, daily, shop, pause, win) ─────────────────────────
/** Home artwork: a lamp post and a row of little houses whose windows light up one by one. */
function heroArt() {
  const el = document.createElement('div');
  el.className = 'hero';
  let shown = '';
  const paint = () => {
    const s = SKINS.find((k) => k.id === profile.data.skin) ?? SKINS[0];
    if (shown === s.id) return;
    shown = s.id;
    const body = mix(s.top, '#ffffff', 0.12);
    const roof = mix(s.top, '#ffffff', 0.04);
    const pane = mix(s.bottom, '#000000', 0.25);
    const iron = mix(s.top, '#ffffff', 0.3);
    // [x, width, height] per house; the lamp post stands in the gap at x=150
    const houses: [number, number, number][] = [[8, 60, 60], [74, 62, 86], [164, 62, 70], [232, 60, 92]];
    let k = 0;
    const parts = houses.map(([x, w, h]) => {
      const y = 160 - h;
      const rows = h > 75 ? 2 : 1;
      let win = '';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 2; c++) {
          const wx = x + 12 + c * (w - 36);
          const wy = y + 14 + r * 32;
          win += `<rect x="${wx}" y="${wy}" width="12" height="16" rx="2" fill="${pane}"/>`;
          win += `<rect class="win" style="animation-delay:${400 + k++ * 170}ms" x="${wx}" y="${wy}" width="12" height="16" rx="2" fill="url(#hero-w)"/>`;
        }
      }
      return `<path d="M${x - 5} ${y + 2}L${x + w / 2} ${y - 22}L${x + w + 5} ${y + 2}Z" fill="${roof}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${body}"/>${win}`;
    });
    el.innerHTML = `<svg viewBox="0 0 300 170" aria-hidden="true">
      <defs>
        <radialGradient id="hero-h"><stop offset="0" stop-color="${s.light}" stop-opacity=".6"/><stop offset="1" stop-color="${s.light}" stop-opacity="0"/></radialGradient>
        <linearGradient id="hero-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.hi}"/><stop offset="1" stop-color="${s.light}"/></linearGradient>
      </defs>
      <circle class="halo" cx="150" cy="52" r="74" fill="url(#hero-h)"/>
      ${parts.join('')}
      <rect x="0" y="158" width="300" height="6" rx="3" fill="${mix(s.bottom, s.top, 0.5)}"/>
      <rect x="147" y="60" width="6" height="100" rx="3" fill="${iron}"/>
      <path d="M137 40h26l-4 22h-18z" fill="url(#hero-w)" stroke="${iron}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M132 41h36l-9-11h-18z" fill="${iron}"/>
      <circle cx="150" cy="26" r="4" fill="${iron}"/>
    </svg>`;
  };
  paint();
  profile.onChange(paint);
  return el;
}

const meta = createMeta({
  title: 'Fener',
  hero: heroArt(),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  levels: { count: LEVEL_COUNT, play: playLevel },
  missionText: (id, n) => t(`mission_${id}` as 'mission_levels', { n }),
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as 'skin_amber'), price: s.price, swatch: s.swatch })),
  onSkin: applySkin,
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});

function pause() {
  unlockAudio();
  if (winPending || meta.covering) return;
  closeHintSheet();
  track('pause', { level: S.level });
  meta.showPause({ onResume: () => {}, onRestart: restartLevel, onMenu: save });
}
$('pause-btn').addEventListener('click', pause);

// ───────────────────────── boot ─────────────────────────
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
    if (!meta.covering) {
      pause();
      return true;
    }
    return false;
  },
});
meta.showHome();
requestAnimationFrame(frame);

// Exposed for e2e/screenshot scripts.
(window as unknown as { __fener: unknown }).__fener = {
  get state() { return S; },
  get level() { return lvl; },
  get eval() { return ev; },
  busy: () => winPending || !!drag,
  evaluate: (p: Placement) => evaluate(lvl, p),
  goto: (level: number) => {
    meta.hideHome();
    startLevel(freshLevel(level));
  },
  load: (s: Save) => {
    meta.hideHome();
    startLevel(s);
  },
  freeze: (ms: number | null) => (frozenAt = ms === null ? null : performance.now() + ms),
  dragTo: (idx: number, pos: Pos) => {
    hover = pos;
    drag = { idx, from: 'tray', x: cellCenter(pos.r, pos.c).x + 6, y: cellCenter(pos.r, pos.c).y + L.cell * 1.3, sx: 0, sy: 0, lift: L.cell * 1.3, liftTarget: L.cell * 1.3, moved: true, touch: true };
  },
};
