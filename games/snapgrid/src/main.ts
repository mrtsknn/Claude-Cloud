import './style.css';
import {
  createMeta,
  createProfile,
  createStore,
  dayKey,
  initAds,
  initStore,
  haptic,
  maybeRequestReview,
  pentatonic,
  scheduleReminders,
  setupNative,
  setHapticsEnabled,
  setSoundEnabled,
  shareResult,
  tone,
  track,
  trackSession,
  unlockAudio,
} from '@studio/kit';
import {
  DOT,
  SIZE,
  applyPiece,
  bomb,
  canPlace,
  countPlacements,
  fitsAnywhere,
  isGameOver,
  newGame,
  place,
  previewLines,
  rescueTray,
  suggestPlacement,
  type GameState,
  type Piece,
  type PlaceResult,
} from './game';
import {
  LEVEL_COUNT,
  addPieces,
  botMove,
  completeDaily,
  dailyReward,
  goalValue,
  goalsMet,
  liveStreak,
  loadDaily,
  piecesLeft,
  runPlace,
  runStuck,
  starsFor,
  startRun,
  track as trackRun,
  type GoalType,
  type LevelDef,
  type Run,
} from './adventure';
import { getLevel, dailyLevel } from './levels';
import { BOOSTERS, buyBooster, claimFree, freeAvailable, loadInventory, priceOf, shuffleTray, useBooster, type BoosterId } from './boosters';
import { t } from './i18n';
import { SKINS } from './skins';

// ───────────────────────── palette ─────────────────────────
let PALETTE = SKINS[0].colors;

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  const r = mix(n >> 16);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
}
// TODO(mağaza): gizlilik politikasını (docs/PRIVACY.md) yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/snapgrid/PRIVACY.md';
// TODO(mağaza): yayından sonra gerçek mağaza bağlantısı (veya akıllı yönlendirme sayfası).
const STORE_URL = 'https://play.google.com/store/apps/details?id=com.indiestudio.snapgrid';
declare const __APP_VERSION__: string;

let LIGHT = PALETTE.map((c) => shade(c, 0.35));
let DARK = PALETTE.map((c) => shade(c, -0.28));

// ───────────────────────── icons ─────────────────────────
const ICON = {
  gems: '<svg viewBox="0 0 24 24"><path d="M6 3.5h12l4 5.5-10 12.5L2 9z" fill="#5ee7ff" stroke="#178aa8" stroke-width="1.4" stroke-linejoin="round"/><path d="M2 9h20M8.5 3.5L12 9l3.5-5.5M12 9v12" fill="none" stroke="#178aa8" stroke-width="1.2"/><path d="M6 3.5h6L8.5 9H2z" fill="#c4f8ff" stroke="none"/></svg>',
  ice: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" fill="#cdeeff" stroke="#7cc6ea" stroke-width="1.5"/><path d="M7 9l3-3M7 14l7-7M10 18l8-8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  lines: '<svg viewBox="0 0 24 24"><rect x="2" y="9" width="20" height="6" rx="2" fill="#ffcf5c" stroke="none"/><rect x="2" y="3" width="6" height="4.5" rx="1.5" fill="rgba(255,255,255,.3)" stroke="none"/><rect x="9" y="3" width="6" height="4.5" rx="1.5" fill="rgba(255,255,255,.3)" stroke="none"/><rect x="9" y="16.5" width="6" height="4.5" rx="1.5" fill="rgba(255,255,255,.3)" stroke="none"/></svg>',
  score: '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17l-5.7 3.1 1.2-6.3L2.9 9.4l6.3-.8z" fill="#ffcf5c" stroke="none"/></svg>',
  bomb: '<svg viewBox="0 0 24 24"><circle cx="11" cy="14" r="7" fill="currentColor" stroke="none"/><path d="M15.5 8.5l2-2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M19 2.5v2M22 5.5h-2M21.2 3.3l-1.3 1.3" fill="none" stroke="#ff9f43" stroke-width="1.8" stroke-linecap="round"/><circle cx="8.6" cy="11.6" r="1.8" fill="rgba(255,255,255,.45)" stroke="none"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M3 7h3.5c4.5 0 6.5 10 11 10H21M3 17h3.5c1.6 0 2.8-1.4 3.8-3.2M13.7 10.2C14.7 8.4 15.9 7 17.5 7H21M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  single: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="4" fill="currentColor" stroke="none"/><rect x="8" y="7.5" width="8" height="2.4" rx="1.2" fill="rgba(255,255,255,.5)" stroke="none"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#ffc83d" stroke="#b57d10" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#e0a21c" stroke-width="1.6"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18M12 9v12M12 9S10 4 7.5 5 8 9 12 9zM12 9s2-5 4.5-4S16 9 12 9z"/></svg>',
};

// ───────────────────────── persistence & settings ─────────────────────────
const store = createStore('snapgrid');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const today = () => dayKey();
const yesterday = () => dayKey(new Date(Date.now() - 86_400_000));

type Mode = 'endless' | 'level' | 'daily';
interface SavedRun {
  mode: 'level' | 'daily';
  level: number;
  day: string;
  game: GameState;
  prog: Run['prog'];
  used: number;
  limit: number;
  seqPos: number;
  continues: number;
}

let best = store.get('best', 0);
let endless: GameState = store.get<GameState | null>('save', null) ?? newGame(Math.random);
let mode: Mode = 'endless';
let run: Run | null = null;
let game: GameState = endless;
let inventory = loadInventory(store.get<unknown>('boosters', null));
store.set('boosters', inventory);
let daily = loadDaily(store.get<unknown>('daily', null));

let startedAt = Date.now();
let bestAnnounced = false;
let resumedBestBaseline = best;
let over = false;
let overAt = 0;
/** Result is pending (win/lose animation playing): ignore input. */
let ending = false;
let revived = false;
let stuck = false;
let danger = false;
let gamesPlayed = store.get('gamesPlayed', 0);
let tutorialDone = store.get('tutorialDone', false);

trackSession('snapgrid');

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
const scoreEl = $('score');
const scoreSub = $('score-sub');
const bestEl = $('best');
const bestWrap = $('best-wrap');
const lvlEl = $('lvl');
const goalsEl = $('goals');
const boostersEl = $('boosters');
const subbar = document.querySelector('.subbar') as HTMLElement;
const aimEl = $('aim');
const stuckEl = $('stuck');
const introEl = $('intro');
const flashEl = $('flash');
const confettiEl = $('confetti');

document.documentElement.lang = navigator.language.slice(0, 2) === 'tr' ? 'tr' : 'en';
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
});

// ───────────────────────── layout ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
const L = { bx: 0, by: 0, bs: 0, cell: 0, ty: 0, th: 0 };

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const pad = 16;
  const bs = Math.floor(Math.min(W - pad * 2, (H - 24) / 1.5, 560));
  // Tall phones: give the spare height to the tray (more room to grab pieces) not to gaps.
  const th = Math.max(bs * 0.46, Math.min(bs * 0.62, H - bs - 20 - 48));
  const total = bs + 20 + th;
  L.bs = bs;
  L.cell = bs / SIZE;
  L.bx = (W - bs) / 2;
  L.by = Math.max(10, (H - total) * 0.45);
  L.ty = L.by + bs + 20;
  L.th = th;
  // Exposed for the screenshot/e2e scripts so they never duplicate layout maths.
  canvas.dataset.layout = JSON.stringify(L);
}
window.addEventListener('resize', layout);
layout();

/** Tray pieces are scaled per piece so small ones read clearly and long bars still fit. */
function trayCell(piece: Piece) {
  const sw = L.bs / 3;
  return Math.min(L.cell * 0.62, (sw * 0.88) / piece.w, (L.th * 0.82) / piece.h);
}

function slotCenter(slot: number) {
  const sw = L.bs / 3;
  return { x: L.bx + sw * slot + sw / 2, y: L.ty + L.th / 2 };
}

const cellCenter = (idx: number) => ({ x: L.bx + ((idx % SIZE) + 0.5) * L.cell, y: L.by + (Math.floor(idx / SIZE) + 0.5) * L.cell });

// ───────────────────────── animation state ─────────────────────────
interface Clearing { idx: number; color: number; t0: number; ice: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; color: string; t0: number; life: number; size: number }
interface Floater { text: string; x: number; y: number; t0: number; size: number; color: string }

let clearing: Clearing[] = [];
let pops: { idx: number; t0: number }[] = [];
let particles: Particle[] = [];
let floaters: Floater[] = [];
let trayDealtAt = performance.now();
let shakeUntil = 0;
let shakeMag = 0;
let displayScore = game.score;
const returning: ({ fromX: number; fromY: number; t0: number } | null)[] = [null, null, null];

interface Drag { slot: number; piece: Piece; x: number; y: number; lift: number }
let drag: Drag | null = null;
let hover: { row: number; col: number; rows: number[]; cols: number[] } | null = null;
/** Booster waiting for a board tap (bomb / single block) and the cell being aimed at. */
let aim: { id: 'bomb' | 'single'; cell: number | null } | null = null;

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const easeBack = (x: number) => {
  const c = 1.7;
  x = Math.min(1, Math.max(0, x)) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

// ───────────────────────── drawing ─────────────────────────
function roundRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawBlock(x: number, y: number, s: number, color: number, alpha = 1) {
  const c = color - 1;
  const g = s * 0.06;
  const size = s - g * 2;
  const r = size * 0.22;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = DARK[c];
  roundRect(x + g, y + g, size, size, r);
  ctx.fill();
  ctx.fillStyle = PALETTE[c];
  roundRect(x + g, y + g, size, size - size * 0.12, r);
  ctx.fill();
  ctx.fillStyle = LIGHT[c];
  ctx.globalAlpha = alpha * 0.55;
  roundRect(x + g + size * 0.14, y + g + size * 0.1, size * 0.72, size * 0.16, size * 0.08);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Ice block: frosted cube; `hp` 1 shows cracks. */
function drawIce(x: number, y: number, s: number, hp: number, alpha = 1) {
  const g = s * 0.06;
  const size = s - g * 2;
  const r = size * 0.22;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = hp > 1 ? '#8fcfee' : '#a9dbf2';
  roundRect(x + g, y + g, size, size, r);
  ctx.fill();
  ctx.fillStyle = hp > 1 ? '#d4f1ff' : '#e2f6ff';
  roundRect(x + g, y + g, size, size - size * 0.12, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.26, y + s * 0.42);
  ctx.lineTo(x + s * 0.42, y + s * 0.26);
  ctx.moveTo(x + s * 0.3, y + s * 0.66);
  ctx.lineTo(x + s * 0.66, y + s * 0.3);
  ctx.stroke();
  if (hp <= 1) {
    ctx.strokeStyle = '#4f97bd';
    ctx.lineWidth = Math.max(1.2, s * 0.04);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.5, y + s * 0.12);
    ctx.lineTo(x + s * 0.44, y + s * 0.38);
    ctx.lineTo(x + s * 0.6, y + s * 0.52);
    ctx.lineTo(x + s * 0.48, y + s * 0.86);
    ctx.moveTo(x + s * 0.6, y + s * 0.52);
    ctx.lineTo(x + s * 0.84, y + s * 0.6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawGem(cx: number, cy: number, s: number, now: number) {
  const g = s * 0.36;
  ctx.beginPath();
  ctx.moveTo(cx - g * 0.55, cy - g * 0.62);
  ctx.lineTo(cx + g * 0.55, cy - g * 0.62);
  ctx.lineTo(cx + g * 0.95, cy - g * 0.12);
  ctx.lineTo(cx, cy + g * 0.92);
  ctx.lineTo(cx - g * 0.95, cy - g * 0.12);
  ctx.closePath();
  ctx.fillStyle = '#5ee7ff';
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, s * 0.04);
  ctx.strokeStyle = '#0f6f8a';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - g * 0.55, cy - g * 0.62);
  ctx.lineTo(cx, cy - g * 0.62);
  ctx.lineTo(cx - g * 0.3, cy - g * 0.12);
  ctx.lineTo(cx - g * 0.95, cy - g * 0.12);
  ctx.closePath();
  ctx.fillStyle = '#d2faff';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - g * 0.95, cy - g * 0.12);
  ctx.lineTo(cx + g * 0.95, cy - g * 0.12);
  ctx.moveTo(cx - g * 0.3, cy - g * 0.12);
  ctx.lineTo(cx, cy + g * 0.92);
  ctx.lineTo(cx + g * 0.3, cy - g * 0.12);
  ctx.strokeStyle = 'rgba(15,111,138,0.6)';
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.stroke();
  // sparkle
  const k = (Math.sin(now / 380 + cx * 0.05) + 1) / 2;
  if (k > 0.6) {
    ctx.globalAlpha = (k - 0.6) / 0.4;
    ctx.fillStyle = '#fff';
    const sx = cx + g * 0.45;
    const sy = cy - g * 0.55;
    const ss = s * 0.09;
    ctx.beginPath();
    ctx.moveTo(sx, sy - ss);
    ctx.lineTo(sx + ss * 0.3, sy - ss * 0.3);
    ctx.lineTo(sx + ss, sy);
    ctx.lineTo(sx + ss * 0.3, sy + ss * 0.3);
    ctx.lineTo(sx, sy + ss);
    ctx.lineTo(sx - ss * 0.3, sy + ss * 0.3);
    ctx.lineTo(sx - ss, sy);
    ctx.lineTo(sx - ss * 0.3, sy - ss * 0.3);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawPiece(piece: Piece, cx: number, cy: number, cell: number, alpha = 1, colorOverride?: number) {
  const ox = cx - (piece.w * cell) / 2;
  const oy = cy - (piece.h * cell) / 2;
  for (const [r, c] of piece.cells) drawBlock(ox + c * cell, oy + r * cell, cell, colorOverride ?? piece.color, alpha);
}

function drawBoard(now: number) {
  const { bx, by, bs, cell } = L;
  ctx.fillStyle = 'rgba(5, 8, 25, 0.35)';
  roundRect(bx - 8, by - 8, bs + 16, bs + 16, 22);
  ctx.fill();
  if (danger && !over) {
    const k = 0.5 + 0.5 * Math.sin(now / 260);
    ctx.strokeStyle = `rgba(255, 90, 106, ${0.25 + 0.4 * k})`;
    ctx.lineWidth = 3;
    roundRect(bx - 8, by - 8, bs + 16, bs + 16, 22);
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 90, 106, ${0.04 + 0.04 * k})`;
    ctx.fill();
  }

  const glowRows = new Set(hover?.rows);
  const glowCols = new Set(hover?.cols);
  const previewColor = drag?.piece.color ?? 0;
  const aimArea = new Set<number>();
  if (aim?.cell != null) {
    const ar = Math.floor(aim.cell / SIZE);
    const ac = aim.cell % SIZE;
    if (aim.id === 'bomb') {
      for (let r = ar - 1; r <= ar + 1; r++) for (let c = ac - 1; c <= ac + 1; c++) if (r >= 0 && c >= 0 && r < SIZE && c < SIZE) aimArea.add(r * SIZE + c);
    }
  }

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const idx = r * SIZE + c;
      const x = bx + c * cell;
      const y = by + r * cell;
      ctx.fillStyle = 'rgba(255,255,255,0.055)';
      roundRect(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.18);
      ctx.fill();

      const v = game.board[idx];
      if (v) {
        const lit = glowRows.has(r) || glowCols.has(c);
        const iceHp = game.ice?.[idx] ?? 0;
        const pop = pops.find((p) => p.idx === idx);
        const k = pop ? 1 + 0.12 * (1 - ease((now - pop.t0) / 180)) : 1;
        const s = cell * k;
        const ox = x - (s - cell) / 2;
        const oy = y - (s - cell) / 2;
        if (iceHp > 0) drawIce(ox, oy, s, iceHp);
        else drawBlock(ox, oy, s, lit ? previewColor : v);
        if (game.gems?.[idx]) drawGem(x + cell / 2, y + cell / 2, cell, now);
        if (lit && iceHp > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          roundRect(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.2);
          ctx.fill();
        }
        if (over) {
          const kk = ease((now - overAt - (SIZE - 1 - r) * 55) / 260);
          if (kk > 0) {
            ctx.fillStyle = `rgba(16,20,42,${0.62 * kk})`;
            roundRect(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.2);
            ctx.fill();
          }
        }
      }
      if (aimArea.has(idx)) {
        ctx.fillStyle = `rgba(255, 159, 67, ${0.16 + 0.08 * Math.sin(now / 90)})`;
        roundRect(x + cell * 0.04, y + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.2);
        ctx.fill();
      }
    }
  }
  if (aim?.id === 'bomb' && aim.cell != null) {
    // Blast outline (clipped to the board) with a pulsing edge.
    const r0 = Math.max(0, Math.floor(aim.cell / SIZE) - 1);
    const c0 = Math.max(0, (aim.cell % SIZE) - 1);
    const r1 = Math.min(SIZE - 1, Math.floor(aim.cell / SIZE) + 1);
    const c1 = Math.min(SIZE - 1, (aim.cell % SIZE) + 1);
    ctx.strokeStyle = `rgba(255, 159, 67, ${0.75 + 0.25 * Math.sin(now / 90)})`;
    ctx.lineWidth = 3;
    roundRect(bx + c0 * cell + 1, by + r0 * cell + 1, (c1 - c0 + 1) * cell - 2, (r1 - r0 + 1) * cell - 2, cell * 0.24);
    ctx.stroke();
  }

  if (aim?.id === 'single' && aim.cell != null && !game.board[aim.cell]) {
    drawBlock(bx + (aim.cell % SIZE) * cell, by + Math.floor(aim.cell / SIZE) * cell, cell, 4, 0.55);
  }

  // ghost of the dragged piece where it would land
  if (drag && hover) {
    for (const [dr, dc] of drag.piece.cells) {
      drawBlock(bx + (hover.col + dc) * cell, by + (hover.row + dr) * cell, cell, drag.piece.color, 0.38);
    }
    const pulse = 0.08 + 0.06 * Math.sin(now / 90);
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    for (const r of hover.rows) {
      roundRect(bx + 2, by + r * cell + 2, bs - 4, cell - 4, cell * 0.2);
      ctx.fill();
    }
    for (const c of hover.cols) {
      roundRect(bx + c * cell + 2, by + 2, cell - 4, bs - 4, cell * 0.2);
      ctx.fill();
    }
  }

  // clearing blocks shrink & spin out
  clearing = clearing.filter((cl) => now - cl.t0 < 420);
  for (const cl of clearing) {
    const p = (now - cl.t0) / 380;
    const bxx = bx + (cl.idx % SIZE) * cell;
    const byy = by + Math.floor(cl.idx / SIZE) * cell;
    if (p < 0) {
      if (cl.ice) drawIce(bxx, byy, cell, 1);
      else drawBlock(bxx, byy, cell, cl.color);
      continue;
    }
    const k = 1 - ease(p);
    ctx.save();
    ctx.translate(bxx + cell / 2, byy + cell / 2);
    ctx.rotate(p * 0.8);
    if (cl.ice) drawIce((-cell * k) / 2, (-cell * k) / 2, cell * k, 1, Math.max(0, k));
    else drawBlock((-cell * k) / 2, (-cell * k) / 2, cell * k, cl.color, Math.max(0, k));
    ctx.globalAlpha = Math.max(0, 0.7 - p);
    ctx.fillStyle = '#fff';
    roundRect((-cell * k) / 2, (-cell * k) / 2, cell * k, cell * k, cell * 0.2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

function drawTray(now: number) {
  for (let slot = 0; slot < 3; slot++) {
    const piece = game.tray[slot];
    if (!piece || drag?.slot === slot) continue;
    const { x, y } = slotCenter(slot);
    const fits = fitsAnywhere(game.board, piece);
    const back = returning[slot];
    if (back) {
      const p = ease((now - back.t0) / 220);
      if (p >= 1) returning[slot] = null;
      const cell = L.cell + (trayCell(piece) - L.cell) * p;
      drawPiece(piece, back.fromX + (x - back.fromX) * p, back.fromY + (y - back.fromY) * p, cell);
      continue;
    }
    const k = easeBack((now - trayDealtAt - slot * 70) / 320);
    if (k <= 0) continue;
    drawPiece(piece, x, y, trayCell(piece) * k, (fits || over) && !aim ? 1 : 0.28);
  }
}

function drawDrag() {
  if (!drag) return;
  drawPiece(drag.piece, drag.x, drag.y - drag.lift, L.cell * 0.98);
}

function drawFx(now: number) {
  particles = particles.filter((p) => now - p.t0 < p.life);
  for (const p of particles) {
    if (now < p.t0) continue;
    const tt = (now - p.t0) / 1000;
    const x = p.x + p.vx * tt;
    const y = p.y + p.vy * tt + 900 * tt * tt;
    ctx.globalAlpha = 1 - (now - p.t0) / p.life;
    ctx.fillStyle = p.color;
    roundRect(x - p.size / 2, y - p.size / 2, p.size, p.size, p.size * 0.25);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  floaters = floaters.filter((f) => now - f.t0 < 1100);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of floaters) {
    if (now < f.t0) continue;
    const p = (now - f.t0) / 1100;
    const scale = easeBack(p * 4) * (1 - Math.max(0, p - 0.75) * 0.6);
    ctx.save();
    ctx.translate(f.x, f.y - 40 * ease(p));
    ctx.scale(scale, scale);
    ctx.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
    ctx.font = `800 ${f.size}px ui-rounded, system-ui, sans-serif`;
    ctx.lineWidth = f.size * 0.16;
    ctx.strokeStyle = 'rgba(10,12,30,0.75)';
    ctx.lineJoin = 'round';
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** First-run hint: a finger drags the first piece onto the board until the player does it. */
function drawHint(now: number) {
  if (tutorialDone || drag || over || ending || aim) return;
  const slot = game.tray.findIndex((p) => p && fitsAnywhere(game.board, p));
  const piece = game.tray[slot];
  if (!piece) return;
  const target = suggestPlacement(game.board, piece);
  if (!target) return;
  const from = slotCenter(slot);
  const to = { x: L.bx + (target.col + piece.w / 2) * L.cell, y: L.by + (target.row + piece.h / 2) * L.cell };
  const cycle = ((now - trayDealtAt) % 2200) / 2200;
  if (now - trayDealtAt < 900) return;
  const p = ease((cycle - 0.15) / 0.55);
  const alpha = cycle < 0.1 ? cycle / 0.1 : cycle > 0.85 ? (1 - cycle) / 0.15 : 1;
  const x = from.x + (to.x - from.x) * p;
  const y = from.y + (to.y - from.y) * p;
  const cell = trayCell(piece) + (L.cell - trayCell(piece)) * p;
  drawPiece(piece, x, y, cell, 0.5 * alpha);
  ctx.globalAlpha = alpha;
  ctx.font = `${L.cell * 0.9}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('👆', x + L.cell * 0.2, y + (piece.h * cell) / 2 - L.cell * 0.1);
  ctx.globalAlpha = 1;
}

function frame(now: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (now < shakeUntil) {
    const m = shakeMag * ((shakeUntil - now) / 250);
    ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
  }
  pops = pops.filter((p) => now - p.t0 < 180);
  drawBoard(now);
  drawTray(now);
  drawHint(now);
  drawDrag();
  drawFx(now);

  if (mode === 'endless' && displayScore !== game.score) {
    displayScore += Math.max(1, Math.ceil((game.score - displayScore) * 0.18));
    if (displayScore > game.score) displayScore = game.score;
    scoreEl.textContent = String(displayScore);
  }
  requestAnimationFrame(frame);
}

// ───────────────────────── input ─────────────────────────
function pointerPos(e: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function cellAt(x: number, y: number): number | null {
  const c = Math.floor((x - L.bx) / L.cell);
  const r = Math.floor((y - L.by) / L.cell);
  return r >= 0 && c >= 0 && r < SIZE && c < SIZE ? r * SIZE + c : null;
}

function updateHover() {
  if (!drag) return;
  const { piece } = drag;
  const left = drag.x - (piece.w * L.cell) / 2;
  const top = drag.y - drag.lift - (piece.h * L.cell) / 2;
  const col = Math.round((left - L.bx) / L.cell);
  const row = Math.round((top - L.by) / L.cell);
  if (canPlace(game.board, piece, row, col)) {
    const changed = !hover || hover.row !== row || hover.col !== col;
    hover = { row, col, ...previewLines(game.board, piece, row, col) };
    if (changed && (hover.rows.length || hover.cols.length)) haptic.light();
  } else {
    hover = null;
  }
}

const inputBlocked = () => over || ending || meta.covering || sheetOpen;

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (inputBlocked() || drag) return;
  const { x, y } = pointerPos(e);
  if (aim) {
    aim.cell = cellAt(x, y);
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (y < L.ty - L.cell * 0.5) return;
  const slot = Math.max(0, Math.min(2, Math.floor((x - L.bx) / (L.bs / 3))));
  const piece = game.tray[slot];
  if (!piece || x < L.bx - 20 || x > L.bx + L.bs + 20) return;
  const lift = e.pointerType === 'mouse' ? 0 : (piece.h * L.cell) / 2 + L.cell * 1.1;
  drag = { slot, piece, x, y, lift };
  returning[slot] = null;
  canvas.setPointerCapture(e.pointerId);
  haptic.light();
  tone({ freq: 520, to: 640, duration: 0.06, type: 'triangle', volume: 0.25 });
  updateHover();
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointerPos(e);
  if (aim && aim.cell !== null) {
    aim.cell = cellAt(p.x, p.y);
    return;
  }
  if (!drag) return;
  drag.x = p.x;
  drag.y = p.y;
  updateHover();
});

function endDrag() {
  if (aim) {
    if (aim.cell !== null) fireAim(aim.cell);
    return;
  }
  if (!drag) return;
  const d = drag;
  drag = null;
  if (hover) {
    commit(d.slot, hover.row, hover.col);
  } else {
    returning[d.slot] = { fromX: d.x, fromY: d.y - d.lift, t0: performance.now() };
    tone({ freq: 300, to: 220, duration: 0.08, type: 'triangle', volume: 0.2 });
  }
  hover = null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => {
  if (aim) aim.cell = null;
  else endDrag();
});

// ───────────────────────── effects ─────────────────────────
function flash(strength: number) {
  flashEl.style.setProperty('--flash', String(strength));
  flashEl.classList.remove('go');
  void flashEl.offsetWidth;
  flashEl.classList.add('go');
}

function confetti(n = 70) {
  const colors = [...PALETTE, '#ffffff', '#ffcf5c'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('i');
    el.style.left = `${Math.random() * 100}%`;
    el.style.background = colors[i % colors.length];
    el.style.setProperty('--x', `${(Math.random() - 0.5) * 240}px`);
    el.style.setProperty('--r', `${(Math.random() - 0.5) * 1440}deg`);
    el.style.setProperty('--d', `${1.6 + Math.random() * 1.2}s`);
    el.style.animationDelay = `${Math.random() * 350}ms`;
    if (Math.random() < 0.4) el.style.borderRadius = '50%';
    confettiEl.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }
}

/** A gem/ice icon flies from the board cell to its goal chip. */
function flyToGoal(idx: number, type: 'gems' | 'ice', delay: number) {
  const chip = goalsEl.querySelector<HTMLElement>(`[data-goal="${type}"]`);
  if (!chip) return;
  const rect = canvas.getBoundingClientRect();
  const from = cellCenter(idx);
  const to = chip.querySelector('svg')!.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'flyer';
  el.innerHTML = ICON[type];
  el.style.left = '0';
  el.style.top = '0';
  document.body.appendChild(el);
  const x0 = rect.left + from.x;
  const y0 = rect.top + from.y;
  const x1 = to.left + to.width / 2;
  const y1 = to.top + to.height / 2;
  const anim = el.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
      { transform: `translate(${x0 + (x1 - x0) * 0.3}px, ${y0 - 40}px) scale(1.5)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.8)`, opacity: 0.9 },
    ],
    { duration: 700, delay, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'both' },
  );
  anim.onfinish = () => {
    el.remove();
    bumpChip(type);
    tone({ freq: 1180, to: 1560, duration: 0.08, type: 'sine', volume: 0.25 });
  };
}

function bumpChip(type: GoalType) {
  const chip = goalsEl.querySelector<HTMLElement>(`[data-goal="${type}"]`);
  if (!chip) return;
  chip.classList.remove('bump');
  void chip.offsetWidth;
  chip.classList.add('bump');
  setTimeout(() => chip.classList.remove('bump'), 160);
}

/** Particles, clear animations, sounds, praise — shared by pieces and boosters. */
function playResultFx(res: PlaceResult, origin: { row: number; col: number; w: number; h: number }, kind: 'piece' | 'bomb' | 'single') {
  const now = performance.now();
  const pcx = L.bx + (origin.col + origin.w / 2) * L.cell;
  const pcy = L.by + (origin.row + origin.h / 2) * L.cell;
  const n = res.lineCount;
  const big = kind === 'bomb' ? 2 : n;

  const burst = (idx: number, color: string, t0: number, count: number) => {
    const { x, y } = cellCenter(idx);
    const power = 1 + Math.min(1.2, (big - 1) * 0.35);
    for (let k = 0; k < count; k++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 420 * power,
        vy: (-Math.random() * 420 - 80) * power,
        color,
        t0,
        life: 650 + Math.random() * 300 + big * 60,
        size: L.cell * (0.16 + Math.random() * 0.14) * (1 + Math.min(0.6, (big - 1) * 0.2)),
      });
    }
  };

  res.clearedCells.forEach((idx, i) => {
    const r = Math.floor(idx / SIZE);
    const c = idx % SIZE;
    const dist = Math.abs(r - (origin.row + origin.h / 2)) + Math.abs(c - (origin.col + origin.w / 2));
    const t0 = now + dist * 22;
    const wasIce = res.state.ice !== undefined && game.ice?.[idx] === 1 && res.state.ice[idx] === 0;
    clearing.push({ idx, color: res.clearedColors[i], t0, ice: wasIce });
    burst(idx, wasIce ? '#d4f1ff' : PALETTE[res.clearedColors[i] - 1], t0, 3 + Math.min(6, (big - 1) * 2));
  });
  res.crackedCells.forEach((idx) => {
    pops.push({ idx, t0: now + 60 });
    burst(idx, '#e2f6ff', now + 60, 5);
  });
  res.gemCells.forEach((idx, i) => flyToGoal(idx, 'gems', 120 + i * 70));
  res.clearedCells.forEach((idx, i) => {
    if (game.ice?.[idx] === 1 && res.state.ice?.[idx] === 0) flyToGoal(idx, 'ice', 160 + i * 20);
  });
  if (res.gemCells.length) profile.progress('gems', res.gemCells.length);

  if (kind === 'bomb') {
    haptic.heavy();
    tone({ freq: 140, to: 50, duration: 0.35, type: 'sawtooth', volume: 0.5 });
    tone({ freq: 900, to: 200, duration: 0.25, type: 'triangle', volume: 0.25, delay: 0.03 });
    shakeMag = 14;
    shakeUntil = now + 320;
    flash(0.3);
    return;
  }
  if (n === 0) {
    haptic.light();
    tone({ freq: 340, to: 260, duration: 0.09, type: 'triangle', volume: 0.45 });
    if (res.crackedCells.length) tone({ freq: 1500, to: 900, duration: 0.08, type: 'square', volume: 0.12 });
    return;
  }
  profile.progress('lines', n);
  const streak = res.state.streak;
  if (streak >= 2) profile.progress('combo');
  for (let i = 0; i < n + 2; i++) {
    tone({ freq: pentatonic(i + streak - 1), duration: 0.18, type: 'sine', volume: 0.5, delay: i * 0.06 });
  }
  if (res.crackedCells.length) tone({ freq: 1500, to: 900, duration: 0.08, type: 'square', volume: 0.12, delay: 0.05 });
  if (n >= 3 || res.boardCleared) haptic.success();
  else if (n === 2) haptic.heavy();
  else haptic.medium();
  shakeMag = Math.min(18, 3 + n * 3.5);
  shakeUntil = now + 250 + n * 30;
  if (n >= 2 || res.boardCleared) flash(Math.min(0.5, 0.14 + n * 0.08 + (res.boardCleared ? 0.15 : 0)));

  const praise = res.boardCleared ? t('perfect') : n >= 2 ? t(`praise${Math.min(5, n)}` as 'praise2') : null;
  const combo = streak >= 2 ? t('combo', { n: streak }) : null;
  if (!praise && !combo) {
    floaters.push({ text: `+${res.gained}`, x: pcx, y: pcy, t0: now, size: L.cell * 0.55, color: '#fff' });
  } else {
    // Celebration stack in the board centre: praise, points, combo — never overlapping.
    const grow = 1 + Math.min(0.5, (n - 1) * 0.12);
    const comboGrow = 1 + Math.min(0.6, (streak - 2) * 0.12);
    let y = L.by + L.bs * 0.34;
    if (praise) {
      floaters.push({ text: praise, x: W / 2, y, t0: now + 80, size: L.cell * 0.9 * grow, color: '#ffcf5c' });
      y += L.cell * 1.0 * grow;
    }
    floaters.push({ text: `+${res.gained}`, x: W / 2, y, t0: now + 140, size: L.cell * 0.6, color: '#fff' });
    y += L.cell * 0.85;
    if (combo) floaters.push({ text: combo, x: W / 2, y, t0: now + 200, size: L.cell * 0.5 * comboGrow, color: '#3dd9a4' });
  }
}

// ───────────────────────── game flow ─────────────────────────
function setGame(next: GameState) {
  game = next;
  if (run) run.game = next;
  else endless = next;
}

function commit(slot: number, row: number, col: number) {
  const piece = game.tray[slot]!;
  const prevTray = game.tray;
  const prev = game;
  const res = run ? runPlace(run, slot, row, col) : place(game, slot, row, col, Math.random);
  if (!res) return;
  if (!tutorialDone) {
    tutorialDone = true;
    store.set('tutorialDone', true);
    track('tutorial_complete');
  }
  const now = performance.now();
  for (const [dr, dc] of piece.cells) pops.push({ idx: (row + dr) * SIZE + col + dc, t0: now });
  // effects compare against the pre-move ice layer, still in `game` (runPlace updated run.game only)
  game = prev;
  playResultFx(res, { row, col, w: piece.w, h: piece.h }, 'piece');
  setGame(res.state);
  if (prevTray.filter(Boolean).length === 1) trayDealtAt = now + 120;
  afterMove();
}

function afterMove() {
  if (mode === 'endless') {
    bumpScore();
    if (game.score > best) {
      best = game.score;
      bestEl.textContent = String(best);
      store.set('best', best);
      if (!bestAnnounced && resumedBestBaseline > 0) {
        bestAnnounced = true;
        floaters.push({ text: t('newBest'), x: W / 2, y: L.by + L.cell * 0.6, t0: performance.now() + 300, size: L.cell * 0.62, color: '#ffcf5c' });
        confetti(60);
        haptic.success();
        track('new_best', { score: best });
      }
    }
  }
  refreshHud();
  checkState();
  persist();
}

/** Decides what happens after any change: win, fail, stuck-with-boosters or keep playing. */
function checkState() {
  const wasDanger = danger;
  danger = false;
  if (run) {
    if (goalsMet(run)) return finishRun(true);
    if (piecesLeft(run) <= 0) return finishRun(false, 'outOfPieces');
    if (runStuck(run)) return enterStuck();
  } else if (isGameOver(game)) {
    return enterStuck();
  }
  leaveStuck();
  danger = countPlacements(game.board, game.tray, 3) < 3;
  if (danger && !wasDanger) haptic.light();
}

const ownsAnyBooster = () => BOOSTERS.some((b) => inventory[b.id] > 0 || freeAvailable(inventory, b.id, today()));

function enterStuck() {
  if (!ownsAnyBooster()) {
    if (run) finishRun(false, 'noMoves');
    else endEndless();
    return;
  }
  if (stuck) return;
  stuck = true;
  placeBanners();
  stuckEl.hidden = false;
  haptic.medium();
  tone({ freq: 330, to: 262, duration: 0.2, type: 'triangle', volume: 0.3 });
  renderBoosters();
}

function leaveStuck() {
  if (!stuck) return;
  stuck = false;
  stuckEl.hidden = true;
  renderBoosters();
}

$('give-up').addEventListener('click', () => {
  leaveStuck();
  if (run) finishRun(false, 'noMoves');
  else endEndless();
});

function persist() {
  if (run && !ending) {
    const saved: SavedRun = {
      mode: run.def.id === 0 ? 'daily' : 'level',
      level: run.def.id,
      day: run.def.id === 0 ? today() : '',
      game: run.game,
      prog: run.prog,
      used: run.used,
      limit: run.limit,
      seqPos: run.seqPos,
      continues: run.continues,
    };
    store.set('run', saved);
  } else if (!run && endless.moves > 0) {
    store.set('save', endless);
  }
}

function bumpScore() {
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bump');
  setTimeout(() => scoreEl.classList.remove('bump'), 150);
}

// ── endless ──
function endEndless() {
  over = true;
  overAt = performance.now() + 300;
  ending = true;
  store.set('save', endless);
  setTimeout(showGameOver, 1100);
}

function showGameOver() {
  ending = false;
  haptic.error();
  [392, 330, 262].forEach((f, i) => tone({ freq: f, duration: 0.25, type: 'triangle', volume: 0.4, delay: i * 0.14 }));
  track('game_over', {
    revived,
    score: game.score,
    lines: game.lines,
    moves: game.moves,
    duration_s: Math.round((Date.now() - startedAt) / 1000),
    best,
  });
  const isBest = game.score > profile.data.best && game.score > 0;
  meta.showLose({
    score: game.score,
    label: t('noMoves'),
    coins: Math.floor(game.score / 40),
    continuesUsed: revived ? 1 : 0,
    canContinue: !revived,
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
  if (isBest) confetti(90);
  addShareButton(t('shareScore', { n: game.score }));
  afterFirstResult();
}

function finishGame() {
  gamesPlayed++;
  store.set('gamesPlayed', gamesPlayed);
  store.remove('save');
  profile.progress('points', game.score);
  maybeRequestReview(gamesPlayed, game.score >= best && game.score > 0);
}

/** Continue after game over (paid by the meta screen with coins or a video). */
function revive() {
  revived = true;
  over = false;
  setGame({ ...game, tray: rescueTray(game.board, Math.random) });
  trayDealtAt = performance.now();
  store.set('save', endless);
  haptic.success();
  [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.16, delay: i * 0.07 }));
  track('revive', { score: game.score });
  checkState();
}

function resetFx() {
  clearing = [];
  particles = [];
  floaters = [];
  pops = [];
  drag = null;
  hover = null;
  setAim(null);
  over = false;
  ending = false;
  stuck = false;
  stuckEl.hidden = true;
  introEl.hidden = true;
  danger = false;
  trayDealtAt = performance.now();
}

function restart() {
  endless = newGame(Math.random);
  game = endless;
  revived = false;
  bestAnnounced = false;
  resumedBestBaseline = best;
  displayScore = 0;
  scoreEl.textContent = '0';
  startedAt = Date.now();
  resetFx();
  store.remove('save');
  track('game_start', { resumed: false, mode: 'endless' });
  refreshHud();
  checkState();
}

function playEndless() {
  mode = 'endless';
  run = null;
  game = endless;
  resetFx();
  if (isGameOver(game)) restart();
  displayScore = game.score;
  scoreEl.textContent = String(game.score);
  resumedBestBaseline = best;
  bestAnnounced = false;
  startedAt = Date.now();
  track('game_start', { resumed: game.moves > 0, mode: 'endless' });
  refreshHud();
  checkState();
}

// ── adventure & daily ──
function loadSavedRun(def: LevelDef, kind: 'level' | 'daily'): Run | null {
  const s = store.get<SavedRun | null>('run', null);
  if (!s || s.mode !== kind || s.level !== def.id || (kind === 'daily' && s.day !== today())) return null;
  if (!Array.isArray(s.game?.board) || s.game.board.length !== SIZE * SIZE) return null;
  return { def, game: s.game, prog: s.prog, used: s.used, limit: s.limit, seqPos: s.seqPos, continues: s.continues };
}

function beginRun(def: LevelDef, kind: 'level' | 'daily', fresh = false) {
  mode = kind;
  resetFx();
  const saved = fresh ? null : loadSavedRun(def, kind);
  run = saved ?? startRun(def);
  game = run.game;
  startedAt = Date.now();
  track(kind === 'daily' ? 'daily_challenge_start' : 'level_start', { level: def.id, resumed: !!saved });
  refreshHud();
  showIntro();
  checkState();
  persist();
}

function startLevel(n: number, fresh = false) {
  beginRun(getLevel(Math.min(n, LEVEL_COUNT)), 'level', fresh);
}

function startDaily(fresh = false) {
  beginRun(dailyLevel(today()), 'daily', fresh);
}

function goalText(type: GoalType, target: number) {
  return t(`goal_${type}` as 'goal_lines', { n: target });
}

function showIntro() {
  if (!run) return;
  const title = run.def.id === 0 ? t('daily') : t('level', { n: run.def.id });
  const lines = run.def.goals.map((g) => `<p>${ICON[g.type]}<span>${goalText(g.type, g.target)}</span></p>`).join('');
  // First levels with a new mechanic explain it once, in one line.
  const has = (type: GoalType) => run!.def.goals.some((g) => g.type === type);
  const early = run.def.id > 0 && run.def.id <= 12;
  const note = early && has('ice') ? `<small>${t('iceHint')}</small>` : early && has('gems') ? `<small>${t('gemsHint')}</small>` : '';
  introEl.innerHTML = `<h3>${title}</h3>${lines}${note}`;
  introEl.hidden = false;
  introEl.style.animation = 'none';
  void introEl.offsetWidth;
  introEl.style.animation = '';
  clearTimeout(introTimer);
  introTimer = window.setTimeout(() => (introEl.hidden = true), 2300);
}
let introTimer = 0;

function finishRun(won: boolean, reason?: 'outOfPieces' | 'noMoves') {
  if (!run || ending) return;
  const r = run;
  ending = true;
  leaveStuck();
  danger = false;
  setTimeout(() => (won ? showRunWin(r) : showRunFail(r, reason ?? 'noMoves')), won ? 950 : 700);
}

function showRunWin(r: Run) {
  ending = false;
  over = false;
  store.remove('run');
  const stars = starsFor(r);
  confetti(stars === 3 ? 110 : 70);
  track(r.def.id === 0 ? 'daily_challenge_complete' : 'level_complete', { level: r.def.id, stars, used: r.used, limit: r.limit, continues: r.continues });
  if (r.def.id === 0) {
    const res = completeDaily(daily, today(), yesterday());
    daily = res.state;
    store.set('daily', daily);
    meta.showWin({ level: 0, stars, coins: res.reward || 5, onNext: () => meta.showHome() });
    const sheet = document.querySelector('.meta-root .m-result');
    if (sheet) {
      sheet.querySelector('.m-eyebrow')!.textContent = t('dailyStreak', { n: daily.streak });
      sheet.querySelector('h2')!.textContent = t('dailyWin');
      sheet.querySelector('[data-next]')!.textContent = t('ok');
      sheet.querySelector('[data-menu]')?.remove();
    }
    addShareButton(t('shareDaily', { n: daily.streak }));
  } else {
    const n = r.def.id;
    meta.showWin({
      level: n,
      stars,
      coins: 10 + stars * 5,
      onNext: () => (n < LEVEL_COUNT ? startLevel(n + 1, true) : meta.showHome()),
    });
    addShareButton(t('shareLevel', { n, s: stars }));
  }
  refreshDailyCard();
  afterFirstResult();
}

function showRunFail(r: Run, reason: 'outOfPieces' | 'noMoves') {
  ending = false;
  const again = () => (r.def.id === 0 ? startDaily(true) : startLevel(r.def.id, true));
  meta.showFail({
    level: r.def.id,
    reason: t(reason),
    continuesUsed: r.continues,
    onContinue: () => {
      addPieces(r);
      if (runStuck(r)) r.game = { ...r.game, tray: rescueTray(r.game.board, Math.random) };
      game = r.game;
      trayDealtAt = performance.now();
      haptic.success();
      [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.16, delay: i * 0.07 }));
      track('level_continue', { level: r.def.id, continues: r.continues });
      refreshHud();
      checkState();
      persist();
    },
    onRetry: again,
    onMenu: () => store.remove('run'),
  });
  if (r.def.id === 0) {
    const eb = document.querySelector('.meta-root .m-result .m-eyebrow');
    if (eb) eb.textContent = t('daily');
  }
  afterFirstResult();
}

// ───────────────────────── HUD ─────────────────────────
function refreshHud() {
  const inRun = !!run;
  bestWrap.hidden = inRun;
  lvlEl.hidden = !inRun;
  scoreSub.hidden = !inRun;
  subbar.classList.toggle('endless', !inRun);
  if (run) {
    lvlEl.textContent = run.def.id === 0 ? t('dailyShort') : t('level', { n: run.def.id });
    const left = piecesLeft(run);
    scoreEl.textContent = String(left);
    scoreSub.textContent = t('pieces');
    scoreEl.classList.toggle('low', left <= 3 && !goalsMet(run));
    renderGoals();
  } else {
    scoreEl.classList.remove('low');
    goalsEl.innerHTML = '';
    bestEl.textContent = String(best);
  }
  renderBoosters();
}

function renderGoals() {
  if (!run) return;
  const r = run;
  const html = r.def.goals
    .map((g) => {
      const v = goalValue(g, r.prog);
      const done = v >= g.target;
      return `<div class="goal ${done ? 'done' : ''}" data-goal="${g.type}">${ICON[g.type]}<b>${done ? '✓' : `${v}<small>/${g.target}</small>`}</b></div>`;
    })
    .join('');
  if (goalsEl.innerHTML !== html) goalsEl.innerHTML = html;
}

function renderBoosters() {
  boostersEl.innerHTML = BOOSTERS.map(({ id }) => {
    const n = inventory[id];
    const on = aim?.id === id;
    return `<button class="boost ${on ? 'on' : ''} ${stuck ? 'nudge' : ''}" data-boost="${id}" aria-label="${t(`booster_${id}` as 'booster_bomb')}">${ICON[id]}<i class="${n ? '' : 'buy'}">${n || '+'}</i></button>`;
  }).join('');
}

boostersEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-boost]');
  if (!btn || over || ending || meta.covering || sheetOpen || drag) return;
  unlockAudio();
  const id = btn.dataset.boost as BoosterId;
  haptic.light();
  if (aim?.id === id) return setAim(null);
  setAim(null);
  if (inventory[id] <= 0) return openBoosterSheet(id);
  if (id === 'shuffle') return fireShuffle();
  setAim(id);
});

/** Banners sit over the tray: it is greyed out while they show. */
function placeBanners() {
  const top = `${L.ty + L.th / 2 - 22}px`;
  aimEl.style.top = top;
  stuckEl.style.top = top;
}

function setAim(id: 'bomb' | 'single' | null) {
  aim = id ? { id, cell: null } : null;
  placeBanners();
  aimEl.hidden = !aim;
  if (aim) aimEl.textContent = t(`aim_${aim.id}`);
  renderBoosters();
}

function saveInventory() {
  store.set('boosters', inventory);
}

function fireShuffle() {
  if (!useBooster(inventory, 'shuffle')) return;
  saveInventory();
  setGame({ ...game, tray: shuffleTray(game.board, game.tray, Math.random, !!run) });
  trayDealtAt = performance.now();
  tone({ freq: 400, to: 900, duration: 0.18, type: 'triangle', volume: 0.35 });
  haptic.medium();
  track('booster_use', { id: 'shuffle', mode });
  refreshHud();
  checkState();
  persist();
}

function fireAim(cell: number) {
  if (!aim) return;
  const id = aim.id;
  const row = Math.floor(cell / SIZE);
  const col = cell % SIZE;
  let res: PlaceResult | null = null;
  if (id === 'single') {
    if (game.board[cell]) {
      aim.cell = null;
      tone({ freq: 300, to: 220, duration: 0.08, type: 'triangle', volume: 0.2 });
      return;
    }
    res = applyPiece(game, { ...DOT, color: 1 + Math.floor(Math.random() * 7) }, row, col);
  } else {
    let any = false;
    for (let r = row - 1; r <= row + 1; r++)
      for (let c = col - 1; c <= col + 1; c++) if (r >= 0 && c >= 0 && r < SIZE && c < SIZE && game.board[r * SIZE + c]) any = true;
    if (!any) {
      aim.cell = null;
      return;
    }
    res = bomb(game, row, col);
  }
  if (!res || !useBooster(inventory, id)) return;
  saveInventory();
  setAim(null);
  track('booster_use', { id, mode });
  if (id === 'single') pops.push({ idx: cell, t0: performance.now() });
  playResultFx(res, { row: id === 'bomb' ? row - 1 : row, col: id === 'bomb' ? col - 1 : col, w: id === 'bomb' ? 3 : 1, h: id === 'bomb' ? 3 : 1 }, id);
  if (run) trackRun(run, res);
  setGame(res.state);
  afterMove();
}

// ── booster purchase sheet ──
const bstRoot = document.createElement('div');
bstRoot.className = 'meta-root';
bstRoot.innerHTML = '<div class="m-overlay" hidden><div class="m-sheet"></div></div>';
document.body.appendChild(bstRoot);
const bstOverlay = bstRoot.querySelector('.m-overlay') as HTMLElement;
const bstSheet = bstRoot.querySelector('.m-sheet') as HTMLElement;
let sheetOpen = false;

function closeBoosterSheet() {
  bstOverlay.hidden = true;
  sheetOpen = false;
  renderBoosters();
}
bstOverlay.addEventListener('click', (e) => e.target === bstOverlay && closeBoosterSheet());

function openBoosterSheet(id: BoosterId) {
  const free = freeAvailable(inventory, id, today());
  const price = priceOf(id);
  bstSheet.innerHTML = `<div>
    <div class="bst-head"><div class="bst-ico">${ICON[id]}</div><h2>${t(`booster_${id}` as 'booster_bomb')}</h2><p>${t(`boosterDesc_${id}` as 'boosterDesc_bomb')}</p></div>
    <p class="m-note">${t('have', { n: inventory[id] })} · ${ICON.coin} ${profile.data.coins}</p>
    ${free ? `<button class="m-btn alt" data-free>${ICON.gift} ${t('freeToday')}</button>` : ''}
    <button class="m-btn" data-buy ${profile.data.coins < price ? 'disabled' : ''}>${t('buyFor')} · ${ICON.coin}${price}</button>
    <button class="m-btn ghost" data-close>${t('resume')}</button></div>`;
  bstSheet.querySelector('[data-free]')?.addEventListener('click', () => {
    if (claimFree(inventory, id, today())) {
      saveInventory();
      track('booster_buy', { id, free: true });
      gotBooster(id);
    }
  });
  bstSheet.querySelector('[data-buy]')!.addEventListener('click', () => {
    if (buyBooster(inventory, id, (n) => profile.spend(n))) {
      saveInventory();
      track('booster_buy', { id, free: false, price });
      gotBooster(id);
    } else meta.toast(t('notEnough'));
  });
  bstSheet.querySelector('[data-close]')!.addEventListener('click', closeBoosterSheet);
  bstOverlay.hidden = false;
  sheetOpen = true;
}

function gotBooster(id: BoosterId) {
  [0, 2, 4, 7].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.14, volume: 0.3, delay: i * 0.05 }));
  haptic.success();
  closeBoosterSheet();
  if (id !== 'shuffle') setAim(id);
}

// ───────────────────────── sharing & reminders ─────────────────────────
function addShareButton(text: string) {
  const sheet = document.querySelector('.meta-root .m-result');
  if (!sheet) return;
  const btn = document.createElement('button');
  btn.className = 'm-btn ghost';
  btn.dataset.share = '';
  btn.innerHTML = `${ICON.share} ${t('share')}`;
  btn.addEventListener('click', async () => {
    const native = 'share' in navigator;
    const ok = await shareResult({ title: 'Snapgrid', text, url: STORE_URL });
    if (ok && !native) meta.toast(t('copied'));
  });
  const menu = sheet.querySelector('[data-menu]');
  if (menu) sheet.insertBefore(btn, menu);
  else sheet.appendChild(btn);
}

/** After the first finished game: ask for notifications and set the 19:00 daily reminder. */
function afterFirstResult() {
  if (store.get('remindersAsked', false)) return;
  store.set('remindersAsked', true);
  setTimeout(() => void scheduleReminders([{ id: 1, title: t('reminderTitle'), body: t('reminderBody'), dailyHour: 19 }]), 900);
}

// ───────────────────────── meta (menu, missions, daily, shop) ─────────────────────────
function applySkin(id: string) {
  const skin = SKINS.find((s) => s.id === id) ?? SKINS[0];
  PALETTE = skin.colors;
  LIGHT = PALETTE.map((c) => shade(c, 0.35));
  DARK = PALETTE.map((c) => shade(c, -0.28));
}

const profile = createProfile({
  game: 'snapgrid',
  levelCount: LEVEL_COUNT,
  defaultSkin: SKINS[0].id,
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'games', targets: [2, 3, 5], reward: (n) => 15 + n * 8 },
    { id: 'lines', targets: [10, 20, 35], reward: (n) => 20 + n * 2 },
    { id: 'combo', targets: [2, 3, 5], reward: (n) => 25 + n * 10 },
    { id: 'points', targets: [500, 1500, 3000], reward: (n) => 20 + Math.round(n / 50) },
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'gems', targets: [8, 15, 25], reward: (n) => 20 + n * 2 },
  ],
});
applySkin(profile.data.skin);
// Players from v1.0 keep their best score.
if (profile.data.best < best) {
  profile.data.best = best;
  profile.save();
}

/** Home-screen artwork: a little board of the current palette with blocks dropping in. */
function heroArt() {
  const el = document.createElement('div');
  el.className = 'hero';
  const pattern = [1, 1, 0, 2, 3, 3, 4, 0, 5, 0, 6, 6, 7, 7, 0, 2];
  el.innerHTML = pattern.map((c, i) => `<i data-c="${c}" style="animation-delay:${i * 70}ms"></i>`).join('');
  const paint = () =>
    el.querySelectorAll<HTMLElement>('i').forEach((cell) => {
      const c = Number(cell.dataset.c);
      cell.style.background = c ? PALETTE[c - 1] : 'rgba(255,255,255,0.07)';
      cell.style.boxShadow = c ? `inset 0 -5px 0 ${DARK[c - 1]}` : 'none';
    });
  paint();
  profile.onChange(paint);
  return el;
}

const meta = createMeta({
  title: 'Snapgrid',
  hero: heroArt(),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  levels: { count: LEVEL_COUNT, play: (n) => startLevel(n) },
  endless: { title: t('classic'), play: playEndless },
  missionText: (id, n) => t(`mission_${id}` as 'mission_games', { n }),
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as 'skin_classic'), price: s.price, swatch: s.swatch })),
  onSkin: applySkin,
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});

// Daily challenge card next to the kit's mode cards.
const dailyCard = document.createElement('button');
dailyCard.className = 'm-card';
dailyCard.dataset.daily = '';
const cardsEl = document.querySelector('.meta-root .m-cards');
cardsEl?.insertBefore(dailyCard, cardsEl.children[1] ?? null);
function refreshDailyCard() {
  const done = daily.last === today();
  const streak = liveStreak(daily, today(), yesterday());
  dailyCard.classList.toggle('daily-done', done);
  dailyCard.innerHTML = `<span class="m-card-ico daily">${ICON.calendar}</span><span class="m-card-body"><b>${t('daily')}</b><small>${
    done ? t('dailyDone', { n: streak }) : streak ? t('dailySub', { n: streak }) : t('dailyNew')
  }</small></span>${done ? `<span class="m-streak">${ICON.flame}${streak}</span>` : `<span class="m-streak">${ICON.coin}${dailyReward(streak + 1)}</span>`}`;
}
refreshDailyCard();
profile.onChange(refreshDailyCard);
document.addEventListener('visibilitychange', () => !document.hidden && refreshDailyCard());
dailyCard.addEventListener('click', () => {
  unlockAudio();
  haptic.light();
  meta.hideHome();
  startDaily();
});

$('settings-btn').addEventListener('click', () => {
  unlockAudio();
  if (over || ending) return;
  setAim(null);
  meta.showPause({
    onResume: () => {},
    onRestart: () => {
      if (run) {
        track('level_restart', { level: run.def.id });
        if (run.def.id === 0) startDaily(true);
        else startLevel(run.def.id, true);
        return;
      }
      if (game.moves > 0) track('game_abandon', { score: game.score, moves: game.moves });
      restart();
    },
  });
});

// Debug/e2e hook (only with ?e2e in the URL): the bot's next move for the current tray.
if (location.search.includes('e2e')) {
  (window as unknown as Record<string, unknown>).__snapgrid = {
    botMove: () => (run ? botMove(run) : null),
    state: () => ({ mode, game, run: run && { used: run.used, limit: run.limit, prog: run.prog, goals: run.def.goals }, inventory, stuck, danger }),
  };
}

// ───────────────────────── boot ─────────────────────────
scoreEl.textContent = String(game.score);
bestEl.textContent = String(best);
if (isGameOver(endless)) restart();
refreshHud();

void initAds();
void initStore();
void setupNative({
  onPause: () => persist(),
  onBack: () => {
    if (sheetOpen) {
      closeBoosterSheet();
      return true;
    }
    if (aim) {
      setAim(null);
      return true;
    }
    if (meta.back()) return true;
    if (!meta.covering) {
      $('settings-btn').click();
      return true;
    }
    return false;
  },
});
meta.showHome();
requestAnimationFrame(frame);
// Warm up today's daily puzzle off the critical path.
setTimeout(() => dailyLevel(today()), 1500);
