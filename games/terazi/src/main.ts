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
import {
  canPlace,
  emptyPlacement,
  generateLevel,
  hintStep,
  isOpen,
  isSolved,
  pegs,
  solve,
  stars,
  torque,
  type Level,
  type Placement,
} from './game';
import { lang, t } from './i18n';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/terazi/PRIVACY.md';
declare const __APP_VERSION__: string;

const C = {
  ink: '#26333d',
  muted: '#6c7a86',
  stoneTop: '#f4f0e7',
  stoneBot: '#d8cfbe',
  stoneEdge: 'rgba(90, 80, 60, 0.28)',
  brassTop: '#ecd08d',
  brassBot: '#b88b37',
  brassInk: '#4a3713',
  slateTop: '#9aa7b2',
  slateBot: '#5f6e7a',
  green: '#4caf7d',
  amber: '#e9d48a',
  shadow: 'rgba(38, 51, 61, 0.22)',
};

// ───────────────────────── persistence ─────────────────────────
interface Snapshot { pos: Placement; locked: boolean[] }
interface Save extends Snapshot {
  level: number;
  history: Snapshot[];
  moves: number;
  hintsUsed: number;
}

const store = createStore('terazi');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

function freshLevel(level: number): Save {
  const lv = generateLevel(level);
  return { level, pos: emptyPlacement(lv), locked: lv.tray.map(() => false), history: [], moves: 0, hintsUsed: 0 };
}

let S: Save = store.get<Save | null>('save', null) ?? freshLevel(1);
let L: Level = generateLevel(S.level);
if (!Array.isArray(S.pos) || S.pos.length !== L.tray.length || !Array.isArray(S.history)) S = freshLevel(S.level || 1);
L = generateLevel(S.level);
let levelStartedAt = Date.now();
const save = () => store.set('save', S);

trackSession('terazi');
track('level_start', { level: S.level, weights: L.tray.length, resumed: S.moves > 0 });

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;

document.documentElement.lang = lang;
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
});
$('version').textContent = `v${__APP_VERSION__}`;

let toastTimer = 0;
function toast(text: string, ms = 2400) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

function setStars(el: HTMLElement, n: number) {
  el.querySelectorAll('i').forEach((s, k) => s.classList.toggle('off', k >= n));
}

function refreshHud() {
  $('level').textContent = String(S.level);
  setStars($('stars'), stars(S.moves, L.tray.length));
  $('hint-badge').textContent = S.hintsUsed > 0 ? 'AD' : '1';
}

// ───────────────────────── layout ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
const G = { cx: 0, py: 0, half: 0, unit: 0, thick: 0, baseY: 0, shelfY: 0, spacing: 0, tu: 0 };

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  G.cx = W / 2;
  G.py = H * 0.34;
  G.half = Math.min(W * 0.45, 300);
  G.unit = G.half / (L.n + 0.45);
  G.thick = Math.max(13, Math.min(20, G.unit * 0.36));
  G.shelfY = H - 20;
  const k = L.tray.length;
  G.spacing = Math.min(84, (W - 24) / k);
  G.tu = Math.min(G.unit * 1.3, (G.spacing * 0.92) / 0.9, 72);
  G.baseY = G.shelfY - dims(9, G.tu).total - 34;
}
window.addEventListener('resize', layout);

const dims = (w: number, u: number) => {
  const ring = u * 0.1;
  const bw = u * (0.58 + 0.035 * w);
  const bh = u * (0.48 + 0.068 * w);
  return { ring, bw, bh, total: ring * 2 + bh };
};

// ───────────────────────── animation state ─────────────────────────
let angle = 0;
let vel = 0;
const MAX_A = 0.2;
interface Drag { i: number; fromPeg: number | null; x: number; y: number; sx: number; sy: number; lift: number; moved: boolean }
let drag: Drag | null = null;
let target: number | null = null;
const swingAt = new Map<number, number>();
let winPending = false;
let winAt = 0;
let nextLevel: Save | null = null;
let shake: { i: number; t0: number } | null = null;

interface Hanger { i: number; d: number; w: number; x: number; top: number; fixed: boolean }

function pegPoint(d: number, a = angle) {
  const lx = d * G.unit;
  const ly = G.thick / 2;
  return { x: G.cx + lx * Math.cos(a) - ly * Math.sin(a), y: G.py + lx * Math.sin(a) + ly * Math.cos(a) };
}

/** Where every hanging weight is, bottom of each peg's stack included. */
function hangers(pos: Placement): { list: Hanger[]; bottom: Map<number, number> } {
  const list: Hanger[] = [];
  const bottom = new Map<number, number>();
  for (const d of pegs(L.n)) {
    const p = pegPoint(d);
    let y = p.y;
    const items: { i: number; w: number; fixed: boolean }[] = [];
    L.fixed.forEach((f, k) => f.d === d && items.push({ i: -1 - k, w: f.w, fixed: true }));
    pos.forEach((pd, i) => pd === d && items.push({ i, w: L.tray[i], fixed: false }));
    for (const it of items) {
      y += G.unit * 0.26;
      list.push({ i: it.i, d, w: it.w, x: p.x, top: y, fixed: it.fixed });
      y += dims(it.w, G.unit).total;
    }
    bottom.set(d, y);
  }
  return { list, bottom };
}

function trayPoint(i: number) {
  const k = L.tray.length;
  const x = W / 2 + (i - (k - 1) / 2) * G.spacing;
  const dm = dims(L.tray[i], G.tu);
  return { x, top: G.shelfY - dm.total, cy: G.shelfY - dm.total / 2 };
}

/** Positions while dragging a weight off the plank: it no longer counts. */
const livePos = (): Placement => (drag && drag.fromPeg !== null ? S.pos.map((d, k) => (k === drag!.i ? null : d)) : S.pos);

// ───────────────────────── drawing ─────────────────────────
function drawWeight(cx: number, top: number, w: number, u: number, kind: 'brass' | 'slate' | 'ghost', locked = false) {
  const { ring, bw, bh } = dims(w, u);
  const bodyTop = top + ring * 2;
  ctx.save();
  if (kind === 'ghost') ctx.globalAlpha = 0.38;
  // ring
  ctx.lineWidth = Math.max(1.5, ring * 0.7);
  ctx.strokeStyle = kind === 'slate' ? C.slateBot : C.brassBot;
  ctx.beginPath();
  ctx.arc(cx, top + ring, ring, 0, Math.PI * 2);
  ctx.stroke();
  // body: softly tapered block
  const tw = bw * 0.78;
  const r = Math.min(bw, bh) * 0.18;
  ctx.beginPath();
  ctx.moveTo(cx - tw / 2 + r, bodyTop);
  ctx.lineTo(cx + tw / 2 - r, bodyTop);
  ctx.quadraticCurveTo(cx + tw / 2, bodyTop, cx + tw / 2 + r * 0.2, bodyTop + r);
  ctx.lineTo(cx + bw / 2, bodyTop + bh - r);
  ctx.quadraticCurveTo(cx + bw / 2, bodyTop + bh, cx + bw / 2 - r, bodyTop + bh);
  ctx.lineTo(cx - bw / 2 + r, bodyTop + bh);
  ctx.quadraticCurveTo(cx - bw / 2, bodyTop + bh, cx - bw / 2, bodyTop + bh - r);
  ctx.lineTo(cx - tw / 2 - r * 0.2, bodyTop + r);
  ctx.quadraticCurveTo(cx - tw / 2, bodyTop, cx - tw / 2 + r, bodyTop);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx - bw / 2, bodyTop, cx + bw / 2, bodyTop + bh);
  g.addColorStop(0, kind === 'slate' ? C.slateTop : C.brassTop);
  g.addColorStop(1, kind === 'slate' ? C.slateBot : C.brassBot);
  if (kind !== 'ghost') {
    ctx.shadowColor = C.shadow;
    ctx.shadowBlur = u * 0.25;
    ctx.shadowOffsetY = u * 0.08;
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(cx - tw / 2 + r, bodyTop + 1.5);
  ctx.lineTo(cx + tw / 2 - r, bodyTop + 1.5);
  ctx.stroke();
  // number
  ctx.fillStyle = kind === 'slate' ? '#f4f6f8' : C.brassInk;
  ctx.font = `700 ${Math.round(Math.min(bw * 0.62, bh * 0.62, 30))}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(w), cx, bodyTop + bh * 0.55);
  if (locked) {
    ctx.fillStyle = '#3e5c6e';
    ctx.beginPath();
    ctx.arc(cx + bw / 2 - u * 0.08, bodyTop + u * 0.08, Math.max(3, u * 0.09), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlank(a: number, solved: boolean, now: number) {
  const { cx, py, half, thick, unit } = G;
  // pedestal: slim column + plinth, the fulcrum on top
  const colW = Math.min(unit * 0.42, 18);
  ctx.save();
  ctx.shadowColor = C.shadow;
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  const cg = ctx.createLinearGradient(cx - colW, 0, cx + colW, 0);
  cg.addColorStop(0, '#e6dfd1');
  cg.addColorStop(0.5, C.stoneTop);
  cg.addColorStop(1, '#cfc5b2');
  ctx.fillStyle = cg;
  ctx.fillRect(cx - colW / 2, py + thick, colW, G.baseY - py - thick);
  ctx.beginPath();
  ctx.roundRect(cx - colW * 1.6, G.baseY - 6, colW * 3.2, 14, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, py + thick * 0.45);
  ctx.lineTo(cx + colW * 1.05, py + thick * 1.9);
  ctx.lineTo(cx - colW * 1.05, py + thick * 1.9);
  ctx.closePath();
  ctx.fillStyle = C.brassBot;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, py);
  ctx.rotate(a);
  // beam
  ctx.shadowColor = C.shadow;
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  const g = ctx.createLinearGradient(0, -thick / 2, 0, thick / 2);
  g.addColorStop(0, C.stoneTop);
  g.addColorStop(1, C.stoneBot);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-half, -thick / 2, half * 2, thick, thick * 0.35);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = C.stoneEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
  // brass end caps + pivot pin
  ctx.fillStyle = C.brassBot;
  ctx.fillRect(-half + 3, -thick / 2, 4, thick);
  ctx.fillRect(half - 7, -thick / 2, 4, thick);
  ctx.beginPath();
  ctx.arc(0, 0, thick * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // pegs, distances, blocked slots
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(Math.min(11, thick * 0.62))}px system-ui, sans-serif`;
  for (const d of pegs(L.n)) {
    const x = d * unit;
    if (L.blocked.includes(d)) {
      ctx.fillStyle = '#7d8a96';
      ctx.beginPath();
      ctx.roundRect(x - unit * 0.3, thick / 2 - 2, unit * 0.6, 7, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(38,51,61,0.45)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x - 4, -4);
      ctx.lineTo(x + 4, 4);
      ctx.moveTo(x + 4, -4);
      ctx.lineTo(x - 4, 4);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = 'rgba(90, 80, 60, 0.55)';
    ctx.fillText(String(Math.abs(d)), x, 0.5);
    ctx.fillStyle = C.brassBot;
    ctx.beginPath();
    ctx.arc(x, thick / 2, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // bubble level on top of the beam
  const vw = Math.min(unit * 1.5, 74);
  const vh = 12;
  const vy = -thick / 2 - vh / 2 - 3;
  ctx.fillStyle = '#e8e2d4';
  ctx.beginPath();
  ctx.roundRect(-vw / 2 - 4, vy - vh / 2 - 3, vw + 8, vh + 6, 8);
  ctx.fill();
  ctx.fillStyle = solved ? C.green : C.amber;
  ctx.beginPath();
  ctx.roundRect(-vw / 2, vy - vh / 2, vw, vh, 6);
  ctx.fill();
  const bx = Math.max(-1, Math.min(1, -a / MAX_A)) * (vw / 2 - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(bx, vy, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(38,51,61,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-9, vy - vh / 2);
  ctx.lineTo(-9, vy + vh / 2);
  ctx.moveTo(9, vy - vh / 2);
  ctx.lineTo(9, vy + vh / 2);
  ctx.stroke();
  if (solved) {
    const k = Math.min(1, (now - winAt) / 900);
    ctx.strokeStyle = `rgba(76, 175, 125, ${0.5 * (1 - k)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, vy, vw / 2 + 10 + k * 60, vh + k * 30, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSides(pos: Placement) {
  let left = 0;
  let right = 0;
  for (const f of L.fixed) f.d < 0 ? (left += f.w * -f.d) : (right += f.w * f.d);
  pos.forEach((d, i) => {
    if (d === null) return;
    if (d < 0) left += L.tray[i] * -d;
    else right += L.tray[i] * d;
  });
  ctx.font = `700 15px Georgia, 'Times New Roman', serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.muted;
  const y = G.py - G.half * 0.25 - 28;
  ctx.textAlign = 'left';
  ctx.fillText(`◀ ${left}`, G.cx - G.half, y);
  ctx.textAlign = 'right';
  ctx.fillText(`${right} ▶`, G.cx + G.half, y);
}

let frozen = false; // screenshot hook: stop the spring
let last = performance.now();

function frame(now: number) {
  const dt = Math.min(50, now - last);
  last = now;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const pos = livePos();
  const solved = winPending;
  const T = torque(L, pos);
  if (!frozen) {
    const targetA = MAX_A * Math.tanh(T / 5);
    const f = dt / 16.67;
    vel += (targetA - angle) * 0.05 * f;
    vel *= Math.pow(0.86, f);
    angle += vel * f;
  }

  drawSides(pos);
  drawPlank(angle, solved, now);

  // hanging weights (strings first)
  const { list, bottom } = hangers(pos);
  ctx.strokeStyle = 'rgba(70, 60, 40, 0.55)';
  ctx.lineWidth = 1.4;
  for (const d of pegs(L.n)) {
    const items = list.filter((h) => h.d === d);
    if (!items.length) continue;
    const p = pegPoint(d);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(items[items.length - 1].x, items[items.length - 1].top);
    ctx.stroke();
  }
  for (const h of list) {
    let x = h.x;
    const sw = swingAt.get(h.i);
    if (sw !== undefined) {
      const e = now - sw;
      if (e > 1400) swingAt.delete(h.i);
      else x += Math.sin(e / 70) * Math.exp(-e / 280) * G.unit * 0.12;
    }
    if (shake && shake.i === h.i) {
      const e = (now - shake.t0) / 320;
      if (e >= 1) shake = null;
      else x += Math.sin(e * Math.PI * 6) * (1 - e) * 5;
    }
    drawWeight(x, h.top, h.w, G.unit, h.fixed ? 'slate' : 'brass', !h.fixed && S.locked[h.i]);
  }

  // ghost where the dragged weight would land
  if (drag && target !== null) {
    const p = pegPoint(target);
    drawWeight(p.x, (bottom.get(target) ?? p.y) + G.unit * 0.26, L.tray[drag.i], G.unit, 'ghost');
  }

  // tray shelf + weights
  ctx.save();
  ctx.shadowColor = C.shadow;
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  const sg = ctx.createLinearGradient(0, G.shelfY, 0, G.shelfY + 12);
  sg.addColorStop(0, C.stoneTop);
  sg.addColorStop(1, C.stoneBot);
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.roundRect(12, G.shelfY, W - 24, 12, 6);
  ctx.fill();
  ctx.restore();
  L.tray.forEach((w, i) => {
    const tp = trayPoint(i);
    if (S.pos[i] !== null || drag?.i === i) {
      const dm = dims(w, G.tu);
      ctx.strokeStyle = 'rgba(38,51,61,0.13)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(tp.x - dm.bw / 2, G.shelfY - dm.bh, dm.bw, dm.bh - 2, 6);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    drawWeight(tp.x, tp.top, w, G.tu, 'brass');
  });

  // dragged weight
  if (drag) {
    const u = target !== null ? G.unit * 1.1 : G.tu;
    const dm = dims(L.tray[drag.i], u);
    drawWeight(drag.x, drag.y - drag.lift - dm.total / 2, L.tray[drag.i], u, 'brass');
  }

  // first-level tutorial: a finger glides from the weight to its peg
  if (S.level === 1 && !drag && !winPending) {
    const h = hintStep(L, S.pos, S.locked);
    if (h && S.pos[h.i] === null) {
      const from = trayPoint(h.i);
      const p = pegPoint(h.d);
      const to = { x: p.x, y: (bottom.get(h.d) ?? p.y) + G.unit * 0.9 };
      const cyc = (now % 2000) / 2000;
      const k = cyc < 0.15 ? 0 : cyc > 0.8 ? 1 : (1 - Math.cos(((cyc - 0.15) / 0.65) * Math.PI)) / 2;
      const x = from.x + (to.x - from.x) * k;
      const y = from.cy + (to.y - from.cy) * k;
      const alpha = cyc > 0.9 ? (1 - cyc) * 10 : 1;
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.strokeStyle = 'rgba(62,92,110,0.9)';
      ctx.lineWidth = 3;
      ctx.shadowColor = C.shadow;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  requestAnimationFrame(frame);
}

// ───────────────────────── input ─────────────────────────
function pointer(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function findTarget(): number | null {
  if (!drag) return null;
  const pos = S.pos.map((d, k) => (k === drag!.i ? null : d));
  const { bottom } = hangers(pos);
  const x = drag.x;
  const y = drag.y - drag.lift;
  let best: number | null = null;
  let bestD = Infinity;
  for (const d of pegs(L.n)) {
    if (!canPlace(L, pos, drag.i, d)) continue;
    const p = pegPoint(d);
    const dx = Math.abs(x - p.x);
    if (dx > G.unit * 0.6 || y < p.y - G.unit * 2.6 || y > (bottom.get(d) ?? p.y) + G.unit * 3.5) continue;
    if (dx < bestD) {
      best = d;
      bestD = dx;
    }
  }
  return best;
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (winPending || drag) return;
  const { x, y } = pointer(e);
  const lift = e.pointerType === 'mouse' ? 0 : G.unit * 1.6 + 26;
  // tray
  for (let i = 0; i < L.tray.length; i++) {
    if (S.pos[i] !== null) continue;
    const tp = trayPoint(i);
    if (Math.abs(x - tp.x) < G.spacing / 2 && y > tp.top - 16 && y < G.shelfY + 24) {
      drag = { i, fromPeg: null, x, y, sx: x, sy: y, lift, moved: false };
      break;
    }
  }
  // plank
  if (!drag) {
    const { list } = hangers(S.pos);
    for (const h of list) {
      const dm = dims(h.w, G.unit);
      if (h.fixed || Math.abs(x - h.x) > Math.max(dm.bw / 2 + 6, 22) || y < h.top - 6 || y > h.top + dm.total + 6) continue;
      if (S.locked[h.i]) {
        shake = { i: h.i, t0: performance.now() };
        haptic.error();
        toast(t('locked'), 1600);
        return;
      }
      drag = { i: h.i, fromPeg: h.d, x, y, sx: x, sy: y, lift, moved: false };
      break;
    }
  }
  if (!drag) return;
  canvas.setPointerCapture(e.pointerId);
  haptic.light();
  tone({ freq: 520, to: 680, duration: 0.06, type: 'triangle', volume: 0.22 });
  target = findTarget();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = pointer(e);
  drag.x = p.x;
  drag.y = p.y;
  if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 8) drag.moved = true;
  const prev = target;
  target = findTarget();
  if (target !== null && target !== prev) haptic.light();
});

function endDrag() {
  if (!drag) return;
  const d = drag;
  const peg = d.moved ? findTarget() : null;
  drag = null;
  target = null;
  if (d.fromPeg !== null) {
    if (peg === d.fromPeg) return; // dropped back where it was
    commit(d.i, peg);
  } else if (peg !== null) {
    commit(d.i, peg);
  } else {
    tone({ freq: 300, to: 220, duration: 0.08, type: 'triangle', volume: 0.2 });
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ───────────────────────── game flow ─────────────────────────
function knock() {
  tone({ freq: 210, to: 130, duration: 0.1, type: 'triangle', volume: 0.55 });
  tone({ freq: 1300, to: 900, duration: 0.03, type: 'square', volume: 0.05 });
}

function pushHistory() {
  S.history.push({ pos: S.pos.slice(), locked: S.locked.slice() });
  if (S.history.length > 60) S.history.shift();
}

function commit(i: number, peg: number | null) {
  pushHistory();
  const next = S.pos.slice();
  next[i] = peg;
  S.pos = next;
  S.moves++;
  if (peg !== null) {
    swingAt.set(i, performance.now());
    knock();
    haptic.medium();
  } else {
    tone({ freq: 440, to: 330, duration: 0.08, type: 'triangle', volume: 0.25 });
    haptic.light();
  }
  save();
  refreshHud();
  checkWin();
}

function checkWin() {
  if (!isSolved(L, S.pos) || winPending) return;
  winPending = true;
  winAt = performance.now();
  [0, 2, 4, 7, 9, 12].forEach((s, k) => tone({ freq: pentatonic(s, 392), duration: 0.6, volume: 0.3, delay: 0.15 + k * 0.09 }));
  haptic.success();
  const st = stars(S.moves, L.tray.length);
  track('level_complete', {
    level: S.level,
    moves: S.moves,
    stars: st,
    hints: S.hintsUsed,
    duration_s: Math.round((Date.now() - levelStartedAt) / 1000),
  });
  $('win-title').textContent = t('levelN', { n: S.level });
  $('win-moves').textContent = t('moves', { n: S.moves, par: L.tray.length });
  setStars($('win-stars'), st);
  const completed = S.level;
  const best = store.get<Record<string, number>>('stars', {});
  best[completed] = Math.max(best[completed] ?? 0, st);
  store.set('stars', best);
  store.set('completed', Math.max(completed, store.get('completed', 0)));
  nextLevel = freshLevel(completed + 1);
  store.set('save', nextLevel);
  setTimeout(() => ($('win').hidden = false), 1100);
  maybeRequestReview(completed, completed >= 8);
}

function startLevel(state: Save) {
  S = state;
  L = generateLevel(S.level);
  save();
  drag = null;
  target = null;
  winPending = false;
  swingAt.clear();
  levelStartedAt = Date.now();
  layout();
  refreshHud();
  $('toast').hidden = true;
  $('win').hidden = true;
  if (S.level === 1) toast(t('tutorial'), 3600);
  if (S.level === 30) toast(t('stackTip'), 3600);
  track('level_start', { level: S.level, weights: L.tray.length, resumed: false });
}

$('next-btn').addEventListener('click', async () => {
  $('win').hidden = true;
  haptic.medium();
  const done = S.level;
  startLevel(nextLevel ?? freshLevel(S.level + 1));
  nextLevel = null;
  if (done >= 5) await interstitialMoment('next_level');
});

$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  if (winPending) return;
  track('restart', { level: S.level, moves: S.moves });
  startLevel(freshLevel(S.level));
});

$('undo-btn').addEventListener('click', () => {
  unlockAudio();
  if (winPending || drag) return;
  const prev = S.history.pop();
  if (!prev) return toast(t('noUndo'), 1600);
  S.pos = prev.pos;
  S.locked = prev.locked;
  save();
  refreshHud();
  haptic.light();
  tone({ freq: 500, to: 380, duration: 0.1, type: 'triangle', volume: 0.3 });
  track('undo', { level: S.level });
});

$('hint-btn').addEventListener('click', async () => {
  unlockAudio();
  if (winPending || drag) return;
  const h = hintStep(L, S.pos, S.locked);
  if (!h) return toast(t('noHint'), 1800);
  // First hint per level is free; more are behind a rewarded ad.
  if (S.hintsUsed > 0 && !(await showRewarded('hint'))) return;
  pushHistory();
  const next = S.pos.slice();
  for (const k of h.clear) next[k] = null;
  next[h.i] = h.d;
  S.pos = next;
  S.locked = S.locked.slice();
  S.locked[h.i] = true;
  S.hintsUsed++;
  swingAt.set(h.i, performance.now());
  knock();
  haptic.medium();
  track('hint', { level: S.level, n: S.hintsUsed });
  save();
  refreshHud();
  checkWin();
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
angle = MAX_A * Math.tanh(torque(L, S.pos) / 5);
if (S.level === 1 && S.moves === 0) toast(t('tutorial'), 3600);
void setupNative({
  darkBackground: false,
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

// Exposed for e2e/screenshot scripts (canvas-relative coordinates).
(window as unknown as { __terazi: unknown }).__terazi = {
  get state() { return S; },
  get level() { return L; },
  solution: () => solve(L, S.pos.map((d, k) => (S.locked[k] ? d : null))),
  trayPoint: (i: number) => { const p = trayPoint(i); return { x: p.x, y: p.cy }; },
  dropPoint: (d: number) => { const p = pegPoint(d); return { x: p.x, y: p.y + G.unit * 0.8 }; },
  placedPoint: (i: number) => { const h = hangers(S.pos).list.find((x) => x.i === i)!; return { x: h.x, y: h.top + dims(h.w, G.unit).total / 2 }; },
  busy: () => winPending || !!drag,
  open: (d: number) => isOpen(L, d),
  goto: (level: number) => startLevel(freshLevel(level)),
  load: (s: Save) => startLevel(s),
  freeze: (on: boolean) => { frozen = on; if (on) { angle = MAX_A * Math.tanh(torque(L, S.pos) / 5); vel = 0; } },
};
