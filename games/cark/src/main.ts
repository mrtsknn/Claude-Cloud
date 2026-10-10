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
import { LEVEL_COUNT, evaluate, generateLevel, isFreePeg, neighbors, rc, starsFor, type Evaluation, type Level } from './game';
import { t } from './i18n';
import { SKINS, skinById, type Metal, type Skin } from './skins';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/cark/PRIVACY.md';
declare const __APP_VERSION__: string;

const C = {
  jam: ['#ff9a8f', '#e0524f', '#8e2427'] as Metal,
  face: '#f4ecd8',
  ok: '#3ddc97',
  bad: '#ff6b5e',
};
let SKIN: Skin = SKINS[0];
let HOLE = 'rgba(18, 40, 46, 0.85)';
const TEETH = 12;
const STEP = (Math.PI * 2) / TEETH;
const SPEED = 1.3; // rad/s
const HINT_PRICE = 40;

// ───────────────────────── persistence ─────────────────────────
interface Snapshot { gears: number[]; locked: number[] }
interface Save extends Snapshot { level: number; history: Snapshot[]; hintsUsed: number }

const store = createStore('cark');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const clampLevel = (n: number) => Math.max(1, Math.min(LEVEL_COUNT, Math.floor(n) || 1));
const freshLevel = (level: number): Save => ({ level: clampLevel(level), gears: [], locked: [], history: [], hintsUsed: 0 });

/** A saved board for the current level (in-progress). Levels past 150 (v1.0 looped) are dropped. */
function loadSave(): Save | null {
  const s = store.get<Save | null>('save', null);
  if (!s || typeof s.level !== 'number' || s.level < 1 || s.level > LEVEL_COUNT || !Array.isArray(s.gears)) return null;
  return { level: s.level, gears: s.gears, locked: Array.isArray(s.locked) ? s.locked : [], history: Array.isArray(s.history) ? s.history : [], hintsUsed: Number(s.hintsUsed) || 0 };
}

let S: Save = loadSave() ?? freshLevel(1);
let lv: Level = generateLevel(S.level);
let ev: Evaluation = evaluate(lv, []);
let levelStartedAt = Date.now();
const save = () => store.set('save', S);

trackSession('cark');

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;

document.documentElement.lang = navigator.language.slice(0, 2) === 'tr' ? 'tr' : 'en';
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

const remaining = () => lv.tray - S.gears.length;
const starsHtml = (n: number) => [0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('');

function refreshHud() {
  $('level').textContent = String(S.level);
  $('stars').innerHTML = starsHtml(starsFor(Math.max(S.gears.length, lv.par), lv.par));
  const badge = $('hint-badge');
  badge.hidden = false;
  badge.className = S.hintsUsed === 0 ? 'badge free' : 'badge coin';
  badge.textContent = S.hintsUsed === 0 ? t('free') : String(HINT_PRICE);
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

// ───────────────────────── gear rotation ─────────────────────────
// Every node keeps its own phase: angle(T) = dir·SPEED·T + phi (+ a short easing correction).
// When a node starts or stops turning, phi is rebased so the gear continues from the angle it
// is at; a newly driven gear is aligned half a tooth against the driven neighbour it meshes
// with (θa + θb ≡ STEP/2 for any two touching gears), and the few degrees of difference are
// eased out over 250 ms instead of snapping.
interface Spin { dir: number; phi: number; corr: number; corrAt: number; fresh: boolean }
const spins = new Map<number, Spin>();
const CORR_S = 0.25;
const lattice = (cell: number) => {
  const [r, c] = rc(lv, cell);
  return ((r + c) % 2) * (STEP / 2);
};
const baseAngle = (s: Spin, T: number) => s.dir * SPEED * T + s.phi;
function angleAt(cell: number, T: number) {
  const s = spins.get(cell);
  if (!s) return lattice(cell);
  const k = Math.max(0, Math.min(1, (T - s.corrAt) / CORR_S));
  return baseAngle(s, T) + s.corr * (1 - k * k * (3 - 2 * k));
}

function syncSpins(T: number) {
  const partner = new Map<number, number>();
  for (const [a, b] of lv.belts) {
    partner.set(a, b);
    partner.set(b, a);
  }
  const nodes = [lv.motor, ...lv.clocks.map((c) => c.cell), ...lv.belts.flat(), ...S.gears];
  const nodeSet = new Set(nodes);
  for (const c of [...spins.keys()]) if (!nodeSet.has(c)) spins.delete(c);
  const settled = new Set<number>();
  const pending = new Set<number>();
  for (const c of nodes) {
    const d = ev.dir.get(c) ?? 0;
    let s = spins.get(c);
    if (!s) {
      s = { dir: 0, phi: lattice(c), corr: 0, corrAt: 0, fresh: true };
      spins.set(c, s);
    }
    if (s.dir === d && !s.fresh) {
      if (d) settled.add(c);
    } else if (d === 0) {
      const a = s.fresh ? s.phi : angleAt(c, T);
      Object.assign(s, { dir: 0, phi: a, corr: 0, fresh: false });
    } else pending.add(c);
  }
  const queue = [...settled];
  const start = (c: number, from: number | null) => {
    const s = spins.get(c)!;
    const d = ev.dir.get(c)!;
    const cur = s.fresh ? null : angleAt(c, T);
    const ref = cur ?? lattice(c);
    let target = ref;
    if (from !== null) {
      const want = STEP / 2 - baseAngle(spins.get(from)!, T);
      target = want + Math.round((ref - want) / STEP) * STEP;
    }
    Object.assign(s, { dir: d, phi: target - d * SPEED * T, corr: cur === null ? 0 : cur - target, corrAt: T, fresh: false });
    pending.delete(c);
    settled.add(c);
    queue.push(c);
  };
  const flood = () => {
    while (queue.length) {
      const q = queue.shift()!;
      for (const n of neighbors(lv, q)) if (pending.has(n)) start(n, q);
      const p = partner.get(q);
      if (p !== undefined && pending.has(p)) start(p, null); // a belt carries the turn, no teeth to align
    }
  };
  flood();
  // groups that just started as a whole (motor connected after a jam, level start): anchor the motor first
  while (pending.size) {
    start(pending.has(lv.motor) ? lv.motor : pending.values().next().value!, null);
    flood();
  }
}

// ───────────────────────── drawing ─────────────────────────
type Kind = 'gear' | 'motor' | 'fixed' | 'jam';
const metal = (kind: Kind): Metal => (kind === 'jam' ? C.jam : SKIN[kind]);

function gearSprite(kind: Kind) {
  let s = sprites.get(kind);
  if (s) return s;
  const size = Math.ceil(L.cell * 1.15 * dpr);
  s = document.createElement('canvas');
  s.width = s.height = size;
  const g = s.getContext('2d')!;
  g.translate(size / 2, size / 2);
  g.scale(dpr, dpr);
  const R = L.cell * 0.54;
  const r0 = L.cell * 0.43;
  g.beginPath();
  for (let k = 0; k < TEETH; k++) {
    const a = k * STEP;
    const pts: [number, number][] = [[a - 0.5 * STEP, r0], [a - 0.27 * STEP, r0], [a - 0.15 * STEP, R], [a + 0.15 * STEP, R], [a + 0.27 * STEP, r0]];
    for (const [ang, rad] of pts) g.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  g.closePath();
  const [hi, mid, lo] = metal(kind);
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
  g.fillStyle = HOLE;
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
  sprites.set(kind, s);
  return s;
}

function drawGear(kind: Kind, x: number, y: number, angle: number, alpha = 1) {
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
    ctx.fillStyle = i === hover ? SKIN.accent : 'rgba(255,255,255,0.13)';
    ctx.globalAlpha = i === hover ? 0.6 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const jammed = ev.jammed;
  const shake = (c: number) => {
    const p = (now - jamAt) / 450;
    return jammed.has(c) && p < 1 ? Math.sin(p * Math.PI * 8) * (1 - p) * cell * 0.08 : 0;
  };
  const angleOf = (c: number) => angleAt(c, T);

  // belts lie flat on the board: under rocks and every gear
  for (const [a, b] of lv.belts) {
    const [ax, ay] = center(a);
    const [bx, by] = center(b);
    ctx.lineCap = 'round';
    ctx.strokeStyle = jammed.has(a) ? '#5a2424' : SKIN.belt;
    ctx.lineWidth = cell * 0.42;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([cell * 0.1, cell * 0.14]);
    ctx.lineDashOffset = -angleOf(a) * cell * 0.45;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = cell * 0.3;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  lv.rocks.forEach(drawRock);

  // gears
  for (const g of S.gears) {
    const [x, y] = center(g);
    const born = placedAt.get(g);
    const k = born === undefined ? 1 : Math.min(1, (now - born) / 180);
    const kind = jammed.has(g) ? 'jam' : 'gear';
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
    drawGear(jammed.has(p) ? 'jam' : 'fixed', x + shake(p), y, angleOf(p));
  }
  // motor
  {
    const [x, y] = center(lv.motor);
    drawGear(jammed.has(lv.motor) ? 'jam' : 'motor', x + shake(lv.motor), y, angleOf(lv.motor));
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = SKIN.motor[2];
    ctx.fill();
    arrow(x, y, cell * 0.11, 1, SKIN.motor[0], cell * 0.04);
  }
  // clocks
  lv.clocks.forEach((ck, i) => {
    const [x0, y] = center(ck.cell);
    const x = x0 + shake(ck.cell);
    const d = ev.dir.get(ck.cell) ?? 0;
    const a = angleOf(ck.cell);
    drawGear(jammed.has(ck.cell) ? 'jam' : 'fixed', x, y, a);
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
    // hands follow the clock's own gear, so they never jump either
    for (const [len, w, speed, base] of [[0.15, 0.045, 0.35, 2.2], [0.23, 0.03, 2.2, 0]] as const) {
      const h = base + (a / SPEED) * speed - Math.PI / 2;
      ctx.lineWidth = cell * w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(h) * cell * len, y + Math.sin(h) * cell * len);
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
  if (left > 0) drawGear('gear', gx, L.trayY, drag ? 0 : Math.sin(T * 2) * 0.06, drag && left === 1 ? 0.3 : 1);
  else drawGear('gear', gx, L.trayY, 0, 0.25);
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
        drawGear('gear', hx, hy, 0, 0.45);
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
      drawGear('gear', x, y, 0, 0.4);
    }
    ctx.save();
    ctx.translate(drag.x, drag.y - drag.lift);
    ctx.scale(1.1, 1.1);
    drawGear('gear', 0, 0, 0);
    ctx.restore();
  }
  requestAnimationFrame(frame);
}

// ───────────────────────── game flow ─────────────────────────
function snapshot(): Snapshot {
  return { gears: [...S.gears], locked: [...S.locked] };
}

const nowT = () => (frozenAt ?? performance.now()) / 1000;

function update(prev: Evaluation) {
  ev = evaluate(lv, S.gears);
  syncSpins(nowT());
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
  if (!locked) profile.progress('gears');
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

const blocked = () => winPending || meta.covering || !$('hint-sheet').hidden || !$('done').hidden;

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (blocked() || drag) return;
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
  const level = S.level;
  const used = S.gears.length;
  const stars = starsFor(used, lv.par);
  [0, 2, 4, 7, 9].forEach((st, i) => tone({ freq: pentatonic(st), duration: 0.3, volume: 0.4, delay: i * 0.09 }));
  haptic.success();
  track('level_complete', {
    level,
    gears: used,
    par: lv.par,
    stars,
    hints: S.hintsUsed,
    duration_s: Math.round((Date.now() - levelStartedAt) / 1000),
  });
  profile.progress('clocks', lv.clocks.length);
  store.remove('save');
  meta.showWin({
    level,
    stars,
    coins: 10 + stars * 5,
    onNext: () => (level < LEVEL_COUNT ? play(level + 1) : allDone()),
    onMenu: () => (winPending = false),
  });
  maybeRequestReview(level, level >= 8);
}

/** Level 150 solved: back to the menu with a completion message (the map keeps every level replayable). */
function allDone() {
  winPending = false;
  track('all_levels_complete', { stars: profile.totalStars() });
  meta.showHome();
  $('done').hidden = false;
  [0, 2, 4, 7, 9, 12].forEach((st, i) => tone({ freq: pentatonic(st), duration: 0.35, volume: 0.4, delay: i * 0.1 }));
}
$('done-ok').addEventListener('click', () => ($('done').hidden = true));

function startLevel(state: Save) {
  S = state;
  lv = generateLevel(S.level);
  // keep only gears that still fit this board (old saves, corrupted data)
  const gears: number[] = [];
  for (const g of S.gears) if (gears.length < lv.tray && isFreePeg(lv, g, gears)) gears.push(g);
  S.gears = gears;
  S.locked = S.locked.filter((g) => gears.includes(g));
  ev = evaluate(lv, S.gears);
  spins.clear();
  syncSpins(nowT());
  save();
  drag = null;
  winPending = false;
  placedAt.clear();
  levelStartedAt = Date.now();
  layout();
  refreshHud();
  $('toast').hidden = true;
  track('level_start', { level: S.level, par: lv.par, resumed: S.gears.length > 0 });
}

/** Map / home entry point: resumes the saved board of that level, otherwise starts it fresh. */
function play(n: number) {
  n = clampLevel(n);
  const saved = loadSave();
  startLevel(saved && saved.level === n && !evaluate(generateLevel(n), saved.gears).won ? saved : freshLevel(n));
}

$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  if (blocked()) return;
  track('restart', { level: S.level, gears: S.gears.length });
  startLevel(freshLevel(S.level));
});

$('undo-btn').addEventListener('click', () => {
  unlockAudio();
  if (blocked()) return;
  const snap = S.history.pop();
  if (!snap) return toast(t('noUndo'));
  const prev = ev;
  S.gears = snap.gears;
  S.locked = snap.locked;
  haptic.light();
  tone({ freq: 600, to: 420, duration: 0.08, type: 'triangle', volume: 0.25 });
  update(prev);
});

// hints: the first on each level is free, then 40 coins or a rewarded video
function giveHint(via: 'free' | 'coins' | 'video') {
  const todo = lv.solution.filter((c) => !S.gears.includes(c));
  // Prefer a peg next to something already turning, so the hint grows the chain.
  const cell = todo.find((c) => neighbors(lv, c).some((n) => ev.dir.has(n))) ?? todo[0];
  S.hintsUsed++;
  place(cell, true);
  refreshHud();
  track('hint', { level: S.level, n: S.hintsUsed, via });
}
function closeHintSheet() {
  $('hint-sheet').hidden = true;
}
$('hint-btn').addEventListener('click', () => {
  unlockAudio();
  if (blocked()) return;
  const todo = lv.solution.filter((c) => !S.gears.includes(c));
  if (!todo.length || remaining() <= 0) return toast(t('noHint'), 3000);
  if (S.hintsUsed === 0) return giveHint('free');
  const coinsBtn = $<HTMLButtonElement>('hint-coins');
  coinsBtn.textContent = t('hintCoins', { n: HINT_PRICE });
  coinsBtn.disabled = profile.data.coins < HINT_PRICE;
  $('hint-video').hidden = !rewardedAvailable();
  $('hint-sheet').hidden = false;
});
$('hint-coins').addEventListener('click', () => {
  if (!profile.spend(HINT_PRICE)) return toast(t('notEnough'));
  closeHintSheet();
  giveHint('coins');
});
$('hint-video').addEventListener('click', async () => {
  const b = $<HTMLButtonElement>('hint-video');
  b.disabled = true;
  const ok = await showRewarded('hint');
  b.disabled = false;
  if (!ok) return;
  closeHintSheet();
  giveHint('video');
});
$('hint-cancel').addEventListener('click', closeHintSheet);
$('hint-sheet').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeHintSheet();
});

// ───────────────────────── meta (menu, map, missions, daily, shop) ─────────────────────────
function applySkin(id: string) {
  SKIN = skinById(id);
  const root = document.documentElement.style;
  const vars: Record<string, string> = {
    '--bg-top': SKIN.bgTop,
    '--bg-bottom': SKIN.bgBottom,
    '--accent': SKIN.accent,
    '--accent-dark': SKIN.accentDark,
    '--sheet': SKIN.sheet,
    '--g-hi': SKIN.gear[0],
    '--g-mid': SKIN.gear[1],
    '--g-lo': SKIN.gear[2],
    '--mo-hi': SKIN.motor[0],
    '--mo-mid': SKIN.motor[1],
    '--mo-lo': SKIN.motor[2],
  };
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
  HOLE = SKIN.bgBottom;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SKIN.bgBottom);
  sprites.clear();
}

// v1.0 players: read the old star map / save before the profile exists, then migrate once.
const legacy = { stars: store.get<Record<string, number> | null>('stars', null), hadProfile: store.get<unknown>('profile', null) !== null };
const profile = createProfile({
  game: 'cark',
  levelCount: LEVEL_COUNT,
  defaultSkin: SKINS[0].id,
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'gears', targets: [15, 25, 40], reward: (n) => 15 + n },
    { id: 'clocks', targets: [3, 5, 8], reward: (n) => 20 + n * 5 },
  ],
});
if (!legacy.hadProfile && (legacy.stars || store.get('save', null))) {
  let top = 0;
  for (const [k, v] of Object.entries(legacy.stars ?? {})) {
    const n = Number(k);
    if (n >= 1 && n <= LEVEL_COUNT) profile.data.stars[n - 1] = Math.max(profile.data.stars[n - 1], Math.min(3, Number(v) || 0));
    top = Math.max(top, n);
  }
  const old = store.get<{ level?: number } | null>('save', null);
  profile.data.unlocked = clampLevel(Math.max(top + 1, old?.level ?? 1));
  profile.data.firstRun = false;
  profile.save();
  store.remove('stars');
  if (!loadSave()) store.remove('save');
  track('migrated', { level: profile.data.unlocked, stars: profile.totalStars() });
}
applySkin(profile.data.skin);

/** Home-screen artwork: the motor meshing with a gear, both spinning in the current style. */
function heroArt() {
  const R = 54;
  const r0 = 43;
  let d = '';
  for (let k = 0; k < TEETH; k++) {
    const a = k * STEP;
    for (const [ang, rad] of [[a - 0.5 * STEP, r0], [a - 0.27 * STEP, r0], [a - 0.15 * STEP, R], [a + 0.15 * STEP, R], [a + 0.27 * STEP, r0]] as const)
      d += `${d ? 'L' : 'M'}${(Math.cos(ang) * rad).toFixed(2)} ${(Math.sin(ang) * rad).toFixed(2)}`;
  }
  d += 'Z';
  const holes = Array.from({ length: 5 }, (_, k) => {
    const a = (k * Math.PI * 2) / 5;
    return `<circle cx="${(Math.cos(a) * r0 * 0.5).toFixed(2)}" cy="${(Math.sin(a) * r0 * 0.5).toFixed(2)}" r="${(r0 * 0.15).toFixed(2)}" fill="rgba(0,0,0,.45)"/>`;
  }).join('');
  const gear = (x: number, fill: string, lo: string, cls: string) =>
    `<g transform="translate(${x} 75)"><g class="spin ${cls}"><path d="${d}" fill="url(#${fill})" stroke="var(${lo})" stroke-width="2"/>` +
    `<circle r="${r0 * 0.82}" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="3"/>${holes}<circle r="${r0 * 0.2}" fill="var(${lo})"/></g></g>`;
  const grad = (id: string, p: string) =>
    `<radialGradient id="${id}" cx="0.32" cy="0.28" r="0.8"><stop offset="0" style="stop-color:var(--${p}-hi)"/><stop offset="0.55" style="stop-color:var(--${p}-mid)"/><stop offset="1" style="stop-color:var(--${p}-lo)"/></radialGradient>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg class="hero" viewBox="0 0 240 150" aria-hidden="true"><defs>${grad('hero-mo', 'mo')}${grad('hero-g', 'g')}</defs>${gear(70, 'hero-mo', '--mo-lo', '')}${gear(170, 'hero-g', '--g-lo', 'ccw')}</svg>`;
  return wrap.firstElementChild as HTMLElement;
}

const meta = createMeta({
  title: document.documentElement.lang === 'tr' ? 'Çark' : 'Cogwork',
  hero: heroArt(),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  levels: { count: LEVEL_COUNT, play },
  missionText: (id, n) => t(`mission_${id}` as 'mission_levels', { n }),
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as 'skin_brass'), price: s.price, swatch: s.swatch })),
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
  if (blocked()) return;
  drag = null;
  meta.showPause({
    onResume: () => {},
    onRestart: () => {
      track('restart', { level: S.level, gears: S.gears.length });
      startLevel(freshLevel(S.level));
    },
    onMenu: save,
  });
}
$('settings-btn').addEventListener('click', pause);

// ───────────────────────── boot ─────────────────────────
if (S.level > profile.data.unlocked) S = freshLevel(profile.data.unlocked);
startLevel(S);
void initAds();
void initStore();
void setupNative({
  darkBackground: true,
  onPause: save,
  onBack: () => {
    if (!$('hint-sheet').hidden) return closeHintSheet(), true;
    if (!$('done').hidden) return ($('done').hidden = true), true;
    if (meta.back()) return true;
    if (!meta.covering && !winPending) {
      pause();
      return true;
    }
    return false;
  },
});
meta.showHome();
requestAnimationFrame(frame);
// Exposed for e2e/screenshot scripts.
(window as unknown as { __cark: unknown }).__cark = {
  get state() { return S; },
  get level() { return lv; },
  get eval() { return { jammed: [...ev.jammed], won: ev.won, powered: [...ev.dir.keys()] }; },
  get profile() { return profile.data; },
  angle: (cell: number) => angleAt(cell, nowT()),
  busy: () => winPending,
  goto: (level: number) => {
    meta.hideHome();
    startLevel(freshLevel(level));
  },
  load: (s: Save) => {
    meta.hideHome();
    startLevel(s);
  },
  /** Freeze animation `ms` after now (null resumes). */
  freeze: (ms: number | null) => (frozenAt = ms === null ? null : performance.now() + ms),
};
