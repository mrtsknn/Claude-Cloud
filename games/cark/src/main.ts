import './style.css';
import {
  createStore,
  haptic,
  interstitialMoment,
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
import { LEVEL_COUNT, evaluate, generateLevel, isFreePeg, neighbors, rc, starsFor, type Evaluation, type Level } from './game';
import { t } from './i18n';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/cark/PRIVACY.md';
declare const __APP_VERSION__: string;

const C = {
  brass: ['#f6d47e', '#d9a441', '#9c6b1f'],
  copper: ['#f2a67a', '#c8693c', '#7d3a1c'],
  steel: ['#dfe9ec', '#9fb3bd', '#5d7480'],
  jam: ['#ff9a8f', '#e0524f', '#8e2427'],
  hole: 'rgba(18, 40, 46, 0.85)',
  face: '#f4ecd8',
  ok: '#3ddc97',
  bad: '#ff6b5e',
  belt: '#1d2a2e',
};
const TEETH = 12;
const SPEED = 1.3; // rad/s

// ───────────────────────── persistence ─────────────────────────
interface Snapshot { gears: number[]; locked: number[] }
interface Save extends Snapshot { level: number; history: Snapshot[]; hintsUsed: number }

const store = createStore('cark');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const freshLevel = (level: number): Save => ({ level, gears: [], locked: [], history: [], hintsUsed: 0 });
const levelData = (n: number) => generateLevel(((n - 1) % LEVEL_COUNT) + 1);

let S: Save = store.get<Save | null>('save', null) ?? freshLevel(1);
let lv: Level = levelData(S.level);
let ev: Evaluation = evaluate(lv, S.gears);
let levelStartedAt = Date.now();
const save = () => store.set('save', S);

trackSession('cark');
track('level_start', { level: S.level, par: lv.par, resumed: S.gears.length > 0 });

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;

document.documentElement.lang = navigator.language.slice(0, 2) === 'tr' ? 'tr' : 'en';
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
});
$('version').textContent = `v${__APP_VERSION__}`;

let toastTimer = 0;
function toast(text: string, ms = 2200) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

const remaining = () => lv.tray - S.gears.length;
const starsHtml = (n: number) => [0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('');

function refreshHud() {
  $('level').textContent = String(S.level);
  $('stars').innerHTML = starsHtml(starsFor(Math.max(S.gears.length, lv.par), lv.par));
  $('hint-badge').hidden = S.hintsUsed === 0;
}

// ───────────────────────── layout ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
const L = { cell: 40, bx: 0, by: 0, trayX: 0, trayY: 0, trayW: 0, trayH: 0 };
const sprites = new Map<string, HTMLCanvasElement>();

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  L.trayH = Math.min(96, H * 0.16);
  const cell = Math.min((W - 36) / lv.cols, (H - L.trayH - 36) / lv.rows, 74);
  L.cell = cell;
  L.bx = (W - cell * lv.cols) / 2;
  L.by = Math.max(12, (H - L.trayH - 12 - cell * lv.rows) / 2);
  L.trayW = Math.min(W - 40, 260);
  L.trayX = W / 2;
  L.trayY = H - L.trayH / 2 - 6;
  sprites.clear();
  canvas.dataset.layout = JSON.stringify({ ...L, cols: lv.cols, rows: lv.rows });
}
window.addEventListener('resize', layout);

const center = (cell: number) => {
  const [r, c] = rc(lv, cell);
  return [L.bx + (c + 0.5) * L.cell, L.by + (r + 0.5) * L.cell] as const;
};
function cellAt(x: number, y: number) {
  const c = Math.floor((x - L.bx) / L.cell);
  const r = Math.floor((y - L.by) / L.cell);
  return c < 0 || r < 0 || c >= lv.cols || r >= lv.rows ? -1 : r * lv.cols + c;
}
const inTray = (x: number, y: number) => Math.abs(x - L.trayX) < L.trayW / 2 && Math.abs(y - L.trayY) < L.trayH / 2 + 8;

// ───────────────────────── drawing ─────────────────────────
function gearSprite(kind: 'brass' | 'copper' | 'steel' | 'jam') {
  const key = kind;
  let s = sprites.get(key);
  if (s) return s;
  const size = Math.ceil(L.cell * 1.15 * dpr);
  s = document.createElement('canvas');
  s.width = s.height = size;
  const g = s.getContext('2d')!;
  g.translate(size / 2, size / 2);
  g.scale(dpr, dpr);
  const R = L.cell * 0.54;
  const r0 = L.cell * 0.43;
  const step = (Math.PI * 2) / TEETH;
  g.beginPath();
  for (let k = 0; k < TEETH; k++) {
    const a = k * step;
    const pts: [number, number][] = [[a - 0.5 * step, r0], [a - 0.27 * step, r0], [a - 0.15 * step, R], [a + 0.15 * step, R], [a + 0.27 * step, r0]];
    for (const [ang, rad] of pts) g.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  g.closePath();
  const [hi, mid, lo] = C[kind];
  const grad = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
  grad.addColorStop(0, hi);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, lo);
  g.fillStyle = grad;
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = L.cell * 0.08;
  g.shadowOffsetY = L.cell * 0.04;
  g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = lo;
  g.lineWidth = Math.max(1, L.cell * 0.02);
  g.stroke();
  // rim + lightening holes + hub (the holes make the spin readable)
  g.beginPath();
  g.arc(0, 0, r0 * 0.82, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = L.cell * 0.03;
  g.stroke();
  g.fillStyle = C.hole;
  for (let k = 0; k < 5; k++) {
    const a = (k * Math.PI * 2) / 5;
    g.beginPath();
    g.arc(Math.cos(a) * r0 * 0.5, Math.sin(a) * r0 * 0.5, r0 * 0.15, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, r0 * 0.2, 0, Math.PI * 2);
  g.fillStyle = lo;
  g.fill();
  sprites.set(key, s);
  return s;
}

function drawGear(kind: 'brass' | 'copper' | 'steel' | 'jam', x: number, y: number, angle: number, alpha = 1) {
  const s = gearSprite(kind);
  const size = s.width / dpr;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(s, -size / 2, -size / 2, size, size);
  ctx.restore();
}

/** Small curved arrow (clockwise when dir = 1). */
function arrow(x: number, y: number, r: number, dir: number, color: string, width: number) {
  const a0 = -Math.PI * 0.85;
  const a1 = Math.PI * 0.35;
  ctx.save();
  ctx.translate(x, y);
  if (dir < 0) ctx.scale(-1, 1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, r, a0, a1);
  ctx.stroke();
  const ex = Math.cos(a1) * r;
  const ey = Math.sin(a1) * r;
  const h = width * 2.2;
  const tx = -Math.sin(a1);
  const ty = Math.cos(a1);
  ctx.beginPath();
  ctx.moveTo(ex + tx * h, ey + ty * h);
  ctx.lineTo(ex - ty * h * 0.8, ey + tx * h * 0.8);
  ctx.lineTo(ex + ty * h * 0.8, ey - tx * h * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRock(cell: number) {
  const [x, y] = center(cell);
  const r = L.cell * 0.36;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + cell;
    const rr = r * (0.82 + 0.18 * Math.abs(Math.sin(cell * 3.1 + k * 1.7)));
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(x, y - r, x, y + r);
  g.addColorStop(0, '#5b6e72');
  g.addColorStop(1, '#2c3a3e');
  ctx.fillStyle = g;
  ctx.fill();
}

interface Drag { x: number; y: number; lift: number }
let drag: Drag | null = null;
let winPending = false;
let nextLevel: Save | null = null;
let jamAt = -1e9;
const placedAt = new Map<number, number>();
let frozenAt: number | null = null; // screenshot hook

function hoverCell() {
  if (!drag) return -1;
  const cell = cellAt(drag.x, drag.y - drag.lift);
  return cell >= 0 && isFreePeg(lv, cell, S.gears) ? cell : -1;
}

function frame(now: number) {
  if (frozenAt !== null) now = frozenAt;
  const T = now / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const cell = L.cell;

  // board plate + pegs
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.beginPath();
  ctx.roundRect(L.bx - 8, L.by - 8, cell * lv.cols + 16, cell * lv.rows + 16, 18);
  ctx.fill();
  const hover = hoverCell();
  for (let i = 0; i < lv.cols * lv.rows; i++) {
    const [x, y] = center(i);
    ctx.beginPath();
    ctx.arc(x, y, cell * (i === hover ? 0.16 : 0.09), 0, Math.PI * 2);
    ctx.fillStyle = i === hover ? 'rgba(226,172,67,0.6)' : 'rgba(255,255,255,0.13)';
    ctx.fill();
  }
  lv.rocks.forEach(drawRock);

  const jammed = ev.jammed;
  const shake = (c: number) => {
    const p = (now - jamAt) / 450;
    return jammed.has(c) && p < 1 ? Math.sin(p * Math.PI * 8) * (1 - p) * cell * 0.08 : 0;
  };
  const angleOf = (c: number) => {
    const [r, col] = rc(lv, c);
    const phase = ((r + col) % 2) * (Math.PI / TEETH);
    const d = ev.dir.get(c) ?? 0;
    return d * SPEED * T + phase;
  };

  // belts under everything
  for (const [a, b] of lv.belts) {
    const [ax, ay] = center(a);
    const [bx, by] = center(b);
    const d = ev.dir.get(a) ?? 0;
    ctx.lineCap = 'round';
    ctx.strokeStyle = jammed.has(a) ? '#5a2424' : C.belt;
    ctx.lineWidth = cell * 0.42;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([cell * 0.1, cell * 0.14]);
    ctx.lineDashOffset = -d * T * SPEED * cell * 0.45;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = cell * 0.3;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // gears
  for (const g of S.gears) {
    const [x, y] = center(g);
    const born = placedAt.get(g);
    const k = born === undefined ? 1 : Math.min(1, (now - born) / 180);
    const kind = jammed.has(g) ? 'jam' : 'brass';
    ctx.save();
    ctx.translate(x + shake(g), y);
    ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
    drawGear(kind, 0, 0, angleOf(g), ev.dir.has(g) || jammed.has(g) ? 1 : 0.82);
    ctx.restore();
    if (S.locked.includes(g)) {
      ctx.beginPath();
      ctx.arc(x + shake(g), y, cell * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = C.ok;
      ctx.fill();
    }
  }
  // pulleys
  for (const p of lv.belts.flat()) {
    const [x, y] = center(p);
    drawGear(jammed.has(p) ? 'jam' : 'steel', x + shake(p), y, angleOf(p));
  }
  // motor
  {
    const [x, y] = center(lv.motor);
    drawGear(jammed.has(lv.motor) ? 'jam' : 'copper', x + shake(lv.motor), y, angleOf(lv.motor));
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#3a1d10';
    ctx.fill();
    arrow(x, y, cell * 0.11, 1, '#ffd7a8', cell * 0.04);
  }
  // clocks
  lv.clocks.forEach((ck, i) => {
    const [x0, y] = center(ck.cell);
    const x = x0 + shake(ck.cell);
    const d = ev.dir.get(ck.cell) ?? 0;
    drawGear(jammed.has(ck.cell) ? 'jam' : 'steel', x, y, angleOf(ck.cell));
    const ok = ev.clockOk[i];
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = C.face;
    ctx.fill();
    ctx.lineWidth = cell * 0.05;
    ctx.strokeStyle = ok ? C.ok : d ? C.bad : '#4b5f66';
    ctx.stroke();
    ctx.strokeStyle = '#2b3438';
    ctx.lineCap = 'round';
    const handT = d * T;
    for (const [len, w, speed, base] of [[0.15, 0.045, 0.35, 2.2], [0.23, 0.03, 2.2, 0]] as const) {
      const a = base + handT * speed - Math.PI / 2;
      ctx.lineWidth = cell * w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * cell * len, y + Math.sin(a) * cell * len);
      ctx.stroke();
    }
    // required direction badge
    const bxp = x + cell * 0.3;
    const byp = y - cell * 0.3;
    ctx.beginPath();
    ctx.arc(bxp, byp, cell * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = ok ? C.ok : d ? C.bad : '#e2ac43';
    ctx.fill();
    arrow(bxp, byp, cell * 0.1, ck.dir, '#14262b', cell * 0.045);
  });

  // tray
  const left = remaining();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.roundRect(L.trayX - L.trayW / 2, L.trayY - L.trayH / 2, L.trayW, L.trayH, 22);
  ctx.fill();
  const gx = L.trayX - cell * 0.45;
  if (left > 0) drawGear('brass', gx, L.trayY, drag ? 0 : Math.sin(T * 2) * 0.06, drag && left === 1 ? 0.3 : 1);
  else drawGear('brass', gx, L.trayY, 0, 0.25);
  ctx.fillStyle = '#eef4f2';
  ctx.font = `800 ${Math.round(cell * 0.5)}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`× ${left}`, gx + cell * 0.7, L.trayY + 1);

  // tutorial hand: tray -> next solution peg, until level 1 is solved
  if (S.level === 1 && !winPending && !drag) {
    const target = lv.solution.find((c) => !S.gears.includes(c));
    if (target !== undefined) {
      const [tx, ty] = center(target);
      const p = ((now / 1600) % 1) * 1.3;
      const k = p < 0.15 ? 0 : p > 0.9 ? 1 : (1 - Math.cos(((p - 0.15) / 0.75) * Math.PI)) / 2;
      const hx = gx + (tx - gx) * k;
      const hy = L.trayY + (ty - L.trayY) * k;
      if (p <= 1) {
        drawGear('brass', hx, hy, 0, 0.45);
        ctx.font = `${Math.round(cell * 0.8)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('👆', hx + cell * 0.1, hy + cell * 0.1);
      }
    }
  }

  // dragged gear + ghost
  if (drag) {
    if (hover >= 0) {
      const [x, y] = center(hover);
      drawGear('brass', x, y, 0, 0.4);
    }
    ctx.save();
    ctx.translate(drag.x, drag.y - drag.lift);
    ctx.scale(1.1, 1.1);
    drawGear('brass', 0, 0, 0);
    ctx.restore();
  }
  requestAnimationFrame(frame);
}

// ───────────────────────── game flow ─────────────────────────
function snapshot(): Snapshot {
  return { gears: [...S.gears], locked: [...S.locked] };
}

function update(prev: Evaluation) {
  ev = evaluate(lv, S.gears);
  save();
  refreshHud();
  if (ev.jammed.size && [...ev.jammed].some((c) => !prev.jammed.has(c))) {
    jamAt = performance.now();
    haptic.error();
    tone({ freq: 140, to: 70, duration: 0.28, type: 'sawtooth', volume: 0.25 });
    toast(t('jam'));
    track('jam', { level: S.level, gears: S.gears.length });
  }
  ev.clockOk.forEach((ok, i) => {
    if (ok && !prev.clockOk[i] && !ev.won) {
      tone({ freq: pentatonic(4 + i), duration: 0.25, volume: 0.35 });
      haptic.medium();
    }
  });
  if (ev.won && !winPending) {
    winPending = true;
    setTimeout(win, 1100);
  }
}

function tick() {
  tone({ freq: 1500, to: 1100, duration: 0.03, type: 'square', volume: 0.12 });
  tone({ freq: 900, to: 700, duration: 0.04, type: 'square', volume: 0.1, delay: 0.05 });
}

function place(cell: number, locked = false) {
  if (!isFreePeg(lv, cell, S.gears) || remaining() <= 0) return false;
  const prev = ev;
  S.history.push(snapshot());
  if (S.history.length > 80) S.history.shift();
  S.gears.push(cell);
  if (locked) S.locked.push(cell);
  placedAt.set(cell, performance.now());
  haptic.light();
  tick();
  update(prev);
  return true;
}

function pickUp(cell: number) {
  if (S.locked.includes(cell)) {
    toast(t('locked'));
    haptic.error();
    return;
  }
  const prev = ev;
  S.history.push(snapshot());
  S.gears = S.gears.filter((g) => g !== cell);
  haptic.light();
  tone({ freq: 500, to: 760, duration: 0.06, type: 'triangle', volume: 0.22 });
  update(prev);
}

function pointerPos(e: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (winPending || drag) return;
  const { x, y } = pointerPos(e);
  if (inTray(x, y)) {
    if (remaining() <= 0) {
      toast(t('noGears'));
      haptic.error();
      return;
    }
    drag = { x, y, lift: e.pointerType === 'mouse' ? 0 : L.cell * 0.9 };
    canvas.setPointerCapture(e.pointerId);
    haptic.light();
    tone({ freq: 700, to: 900, duration: 0.05, type: 'triangle', volume: 0.18 });
    return;
  }
  const cell = cellAt(x, y);
  if (cell >= 0 && S.gears.includes(cell)) pickUp(cell);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = pointerPos(e);
  drag.x = p.x;
  drag.y = p.y;
});
const endDrag = () => {
  if (!drag) return;
  const target = hoverCell();
  drag = null;
  if (target >= 0) place(target);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => (drag = null));

function win() {
  const used = S.gears.length;
  const stars = starsFor(used, lv.par);
  [0, 2, 4, 7, 9].forEach((st, i) => tone({ freq: pentatonic(st), duration: 0.3, volume: 0.4, delay: i * 0.09 }));
  haptic.success();
  track('level_complete', {
    level: S.level,
    gears: used,
    par: lv.par,
    stars,
    hints: S.hintsUsed,
    duration_s: Math.round((Date.now() - levelStartedAt) / 1000),
  });
  $('win-title').textContent = t('levelN', { n: S.level });
  $('win-stars').innerHTML = starsHtml(stars);
  $('win-gears').textContent = t('gears', { n: used, p: lv.par });
  const completed = S.level;
  const best = store.get<Record<number, number>>('stars', {});
  best[completed] = Math.max(best[completed] ?? 0, stars);
  store.set('stars', best);
  nextLevel = freshLevel(completed + 1);
  store.set('save', nextLevel);
  $('win').hidden = false;
  maybeRequestReview(completed, completed >= 8);
}

function startLevel(state: Save) {
  S = state;
  lv = levelData(S.level);
  ev = evaluate(lv, S.gears);
  save();
  drag = null;
  winPending = false;
  placedAt.clear();
  levelStartedAt = Date.now();
  layout();
  refreshHud();
  $('toast').hidden = true;
  track('level_start', { level: S.level, par: lv.par, resumed: false });
}

$('next-btn').addEventListener('click', async () => {
  $('win').hidden = true;
  haptic.medium();
  startLevel(nextLevel ?? freshLevel(S.level + 1));
  nextLevel = null;
  if (S.level > 6) await interstitialMoment('next_level');
});

$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  if (winPending) return;
  track('restart', { level: S.level, gears: S.gears.length });
  startLevel(freshLevel(S.level));
});

$('undo-btn').addEventListener('click', () => {
  unlockAudio();
  if (winPending) return;
  const snap = S.history.pop();
  if (!snap) return toast(t('noUndo'));
  const prev = ev;
  S.gears = snap.gears;
  S.locked = snap.locked;
  haptic.light();
  tone({ freq: 600, to: 420, duration: 0.08, type: 'triangle', volume: 0.25 });
  update(prev);
});

$('hint-btn').addEventListener('click', async () => {
  unlockAudio();
  if (winPending) return;
  const todo = lv.solution.filter((c) => !S.gears.includes(c));
  if (!todo.length || remaining() <= 0) return toast(t('noHint'), 3000);
  // First hint per level is free; more are behind a rewarded ad.
  if (S.hintsUsed > 0 && !(await showRewarded('hint'))) return;
  // Prefer a peg next to something already turning, so the hint grows the chain.
  const cell = todo.find((c) => neighbors(lv, c).some((n) => ev.dir.has(n))) ?? todo[0];
  S.hintsUsed++;
  place(cell, true);
  refreshHud();
  track('hint', { level: S.level, n: S.hintsUsed });
});

// settings
for (const [id, k] of [['opt-sound', 'sound'], ['opt-haptics', 'haptics']] as const) {
  const el = $<HTMLInputElement>(id);
  el.checked = settings[k];
  el.addEventListener('change', () => {
    settings[k] = el.checked;
    setSoundEnabled(settings.sound);
    setHapticsEnabled(settings.haptics);
    store.set('settings', settings);
    if (k === 'haptics') haptic.medium();
  });
}
$('settings-btn').addEventListener('click', () => {
  unlockAudio();
  $('settings').hidden = false;
});
$('close-settings').addEventListener('click', () => ($('settings').hidden = true));
$('settings').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) $('settings').hidden = true;
});
$('privacy-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.open(PRIVACY_URL, '_blank');
});

// ───────────────────────── boot ─────────────────────────
layout();
refreshHud();
void setupNative({
  darkBackground: true,
  onPause: save,
  onBack: () => {
    if (!$('settings').hidden) {
      $('settings').hidden = true;
      return true;
    }
    return false;
  },
});
requestAnimationFrame(frame);
// Exposed for e2e/screenshot scripts.
(window as unknown as { __cark: unknown }).__cark = {
  get state() { return S; },
  get level() { return lv; },
  get eval() { return { jammed: [...ev.jammed], won: ev.won }; },
  busy: () => winPending,
  goto: (level: number) => startLevel(freshLevel(level)),
  load: (s: Save) => startLevel(s),
  freeze: (ms: number | null) => (frozenAt = ms),
};
