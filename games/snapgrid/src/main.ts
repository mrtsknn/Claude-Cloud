import './style.css';
import {
  createMeta,
  createProfile,
  createStore,
  initAds,
  initStore,
  haptic,
  maybeRequestReview,
  pentatonic,
  setupNative,
  setHapticsEnabled,
  setSoundEnabled,
  tone,
  track,
  trackSession,
  unlockAudio,
} from '@studio/kit';
import {
  SIZE,
  canPlace,
  fitsAnywhere,
  isGameOver,
  newGame,
  place,
  previewLines,
  rescueTray,
  suggestPlacement,
  type GameState,
  type Piece,
} from './game';
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
declare const __APP_VERSION__: string;

let LIGHT = PALETTE.map((c) => shade(c, 0.35));
let DARK = PALETTE.map((c) => shade(c, -0.28));

// ───────────────────────── persistence & settings ─────────────────────────
const store = createStore('snapgrid');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

let best = store.get('best', 0);
let game: GameState = store.get<GameState | null>('save', null) ?? newGame(Math.random);
const resumed = game.moves > 0;
let startedAt = Date.now();
let bestAnnounced = false;
let resumedBestBaseline = best;
let over = false;
let overAt = 0;
let revived = false;
let gamesPlayed = store.get('gamesPlayed', 0);
let tutorialDone = store.get('tutorialDone', false);

trackSession('snapgrid');
track('game_start', { resumed });

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
const scoreEl = $('score');
const bestEl = $('best');

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
  L.by = Math.max(6, (H - total) * 0.45);
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

// ───────────────────────── animation state ─────────────────────────
interface Clearing { idx: number; color: number; t0: number }
interface Particle { x: number; y: number; vx: number; vy: number; color: number; t0: number; life: number; size: number }
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
  // body + bottom bevel
  ctx.fillStyle = DARK[c];
  roundRect(x + g, y + g, size, size, r);
  ctx.fill();
  ctx.fillStyle = PALETTE[c];
  roundRect(x + g, y + g, size, size - size * 0.12, r);
  ctx.fill();
  // glossy top
  ctx.fillStyle = LIGHT[c];
  ctx.globalAlpha = alpha * 0.55;
  roundRect(x + g + size * 0.14, y + g + size * 0.1, size * 0.72, size * 0.16, size * 0.08);
  ctx.fill();
  ctx.globalAlpha = 1;
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

  const glowRows = new Set(hover?.rows);
  const glowCols = new Set(hover?.cols);
  const previewColor = drag?.piece.color ?? 0;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const x = bx + c * cell;
      const y = by + r * cell;
      ctx.fillStyle = 'rgba(255,255,255,0.055)';
      roundRect(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.18);
      ctx.fill();

      const v = game.board[r * SIZE + c];
      if (!v) continue;
      const lit = glowRows.has(r) || glowCols.has(c);
      const pop = pops.find((p) => p.idx === r * SIZE + c);
      if (pop) {
        const k = 1 + 0.12 * (1 - ease((now - pop.t0) / 180));
        const s = cell * k;
        drawBlock(x - (s - cell) / 2, y - (s - cell) / 2, s, v);
      } else {
        drawBlock(x, y, cell, lit ? previewColor : v);
      }
      if (over) {
        const k = ease((now - overAt - (SIZE - 1 - r) * 55) / 260);
        if (k > 0) {
          ctx.fillStyle = `rgba(16,20,42,${0.62 * k})`;
          roundRect(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.2);
          ctx.fill();
        }
      }
    }
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
    if (p < 0) {
      drawBlock(bx + (cl.idx % SIZE) * cell, by + Math.floor(cl.idx / SIZE) * cell, cell, cl.color);
      continue;
    }
    const k = 1 - ease(p);
    const x = bx + (cl.idx % SIZE) * cell + cell / 2;
    const y = by + Math.floor(cl.idx / SIZE) * cell + cell / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p * 0.8);
    drawBlock((-cell * k) / 2, (-cell * k) / 2, cell * k, cl.color, Math.max(0, k));
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
    drawPiece(piece, x, y, trayCell(piece) * k, fits || over ? 1 : 0.28);
  }
}

function drawDrag() {
  if (!drag) return;
  drawPiece(drag.piece, drag.x, drag.y - drag.lift, L.cell * 0.98);
}

function drawFx(now: number) {
  particles = particles.filter((p) => now - p.t0 < p.life);
  for (const p of particles) {
    const tt = (now - p.t0) / 1000;
    const x = p.x + p.vx * tt;
    const y = p.y + p.vy * tt + 900 * tt * tt;
    ctx.globalAlpha = 1 - (now - p.t0) / p.life;
    ctx.fillStyle = PALETTE[p.color - 1];
    roundRect(x - p.size / 2, y - p.size / 2, p.size, p.size, p.size * 0.25);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  floaters = floaters.filter((f) => now - f.t0 < 1100);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of floaters) {
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
  if (tutorialDone || drag || over) return;
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

  if (displayScore !== game.score) {
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

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (over || drag || meta.covering) return;
  const { x, y } = pointerPos(e);
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
  if (!drag) return;
  const p = pointerPos(e);
  drag.x = p.x;
  drag.y = p.y;
  updateHover();
});

function endDrag() {
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
canvas.addEventListener('pointercancel', endDrag);

// ───────────────────────── game flow ─────────────────────────
function commit(slot: number, row: number, col: number) {
  const piece = game.tray[slot]!;
  const res = place(game, slot, row, col, Math.random);
  if (!res) return;
  const now = performance.now();
  const prevTray = game.tray;
  if (!tutorialDone) {
    tutorialDone = true;
    store.set('tutorialDone', true);
    track('tutorial_complete');
  }
  game = res.state;

  for (const [dr, dc] of piece.cells) pops.push({ idx: (row + dr) * SIZE + col + dc, t0: now });
  const pcx = L.bx + (col + piece.w / 2) * L.cell;
  const pcy = L.by + (row + piece.h / 2) * L.cell;

  if (res.lineCount === 0) {
    haptic.light();
    tone({ freq: 340, to: 260, duration: 0.09, type: 'triangle', volume: 0.45 });
  } else {
    res.clearedCells.forEach((idx, i) => {
      const r = Math.floor(idx / SIZE);
      const c = idx % SIZE;
      const dist = Math.abs(r - (row + piece.h / 2)) + Math.abs(c - (col + piece.w / 2));
      const t0 = now + dist * 22;
      clearing.push({ idx, color: res.clearedColors[i], t0 });
      for (let k = 0; k < 3; k++) {
        particles.push({
          x: L.bx + (c + 0.5) * L.cell,
          y: L.by + (r + 0.5) * L.cell,
          vx: (Math.random() - 0.5) * 420,
          vy: -Math.random() * 420 - 80,
          color: res.clearedColors[i],
          t0,
          life: 650 + Math.random() * 300,
          size: L.cell * (0.16 + Math.random() * 0.14),
        });
      }
    });
    const n = res.lineCount;
    profile.progress('lines', n);
    if (game.streak >= 2) profile.progress('combo');
    for (let i = 0; i < n + 2; i++) {
      tone({ freq: pentatonic(i + game.streak - 1), duration: 0.18, type: 'sine', volume: 0.5, delay: i * 0.06 });
    }
    if (n >= 3 || res.boardCleared) haptic.success();
    else if (n === 2) haptic.heavy();
    else haptic.medium();
    shakeMag = Math.min(14, 3 + n * 3);
    shakeUntil = now + 250;

    const praise = res.boardCleared ? t('perfect') : n >= 2 ? t(`praise${Math.min(5, n)}` as 'praise2') : null;
    const combo = game.streak >= 2 ? t('combo', { n: game.streak }) : null;
    if (!praise && !combo) {
      floaters.push({ text: `+${res.gained}`, x: pcx, y: pcy, t0: now, size: L.cell * 0.55, color: '#fff' });
    } else {
      // Celebration stack in the board centre: praise, points, combo — never overlapping.
      let y = L.by + L.bs * 0.36;
      if (praise) {
        floaters.push({ text: praise, x: W / 2, y, t0: now + 80, size: L.cell * 0.9, color: '#ffcf5c' });
        y += L.cell * 1.0;
      }
      floaters.push({ text: `+${res.gained}`, x: W / 2, y, t0: now + 140, size: L.cell * 0.6, color: '#fff' });
      y += L.cell * 0.8;
      if (combo) floaters.push({ text: combo, x: W / 2, y, t0: now + 200, size: L.cell * 0.5, color: '#3dd9a4' });
    }
  }
  bumpScore();

  if (prevTray.filter(Boolean).length === 1) trayDealtAt = now + 120;

  if (game.score > best) {
    best = game.score;
    bestEl.textContent = String(best);
    store.set('best', best);
    if (!bestAnnounced && best > 0 && resumedBestBaseline > 0) {
      bestAnnounced = true;
      floaters.push({ text: t('newBest'), x: W / 2, y: L.by - 4 + L.cell * 0.5, t0: now + 300, size: L.cell * 0.5, color: '#ffcf5c' });
      track('new_best', { score: best });
    }
  }

  if (isGameOver(game)) {
    over = true;
    overAt = now + 300;
    store.set('save', game);
    setTimeout(showGameOver, 1100);
  } else {
    store.set('save', game);
  }
}

function bumpScore() {
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bump');
  setTimeout(() => scoreEl.classList.remove('bump'), 150);
}

function showGameOver() {
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
  game = { ...game, tray: rescueTray(game.board, Math.random) };
  trayDealtAt = performance.now();
  store.set('save', game);
  haptic.success();
  [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.16, delay: i * 0.07 }));
  track('revive', { score: game.score });
}

function restart() {
  game = newGame(Math.random);
  over = false;
  revived = false;
  bestAnnounced = false;
  resumedBestBaseline = best;
  displayScore = 0;
  scoreEl.textContent = '0';
  startedAt = Date.now();
  trayDealtAt = performance.now();
  clearing = [];
  particles = [];
  floaters = [];
  store.remove('save');
  track('game_start', { resumed: false });
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
  levelCount: 0,
  defaultSkin: SKINS[0].id,
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'games', targets: [2, 3, 5], reward: (n) => 15 + n * 8 },
    { id: 'lines', targets: [10, 20, 35], reward: (n) => 20 + n * 2 },
    { id: 'combo', targets: [2, 3, 5], reward: (n) => 25 + n * 10 },
    { id: 'points', targets: [500, 1500, 3000], reward: (n) => 20 + Math.round(n / 50) },
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
  endless: {
    title: t('classic'),
    play: () => {
      if (over || isGameOver(game)) restart();
      unlockAudio();
    },
  },
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

$('settings-btn').addEventListener('click', () => {
  unlockAudio();
  if (over) return;
  meta.showPause({
    onResume: () => {},
    onRestart: () => {
      if (game.moves > 0) track('game_abandon', { score: game.score, moves: game.moves });
      restart();
    },
  });
});

// ───────────────────────── boot ─────────────────────────
scoreEl.textContent = String(game.score);
bestEl.textContent = String(best);
if (isGameOver(game)) restart();

void initAds();
void initStore();
void setupNative({
  onPause: () => !over && game.moves > 0 && store.set('save', game),
  onBack: () => {
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
