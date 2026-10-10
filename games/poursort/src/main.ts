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
  CAPACITY,
  canPour,
  colorsForLevel,
  generateLevel,
  hasMoves,
  isComplete,
  isSolved,
  pour,
  solve,
  type Move,
  type Tube,
  type Tubes,
} from './game';
import { t } from './i18n';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/poursort/PRIVACY.md';
declare const __APP_VERSION__: string;

// 12 liquids, ordered so the colours that appear together in early levels are the most
// distinct (blue/yellow, then red, green…); similar hues only meet in later levels.
const LIQUIDS = [
  '#2563eb', '#facc15', '#ef4444', '#16a34a', '#7c3aed', '#f97316',
  '#14b8a6', '#f472b6', '#84cc16', '#38bdf8', '#d946ef', '#8b5a2b',
];
const UNDOS_PER_LEVEL = 5;

// ───────────────────────── persistence ─────────────────────────
interface Save {
  level: number;
  tubes: Tubes;
  history: Tubes[];
  undos: number;
  extraUsed: boolean;
  moves: number;
  hintsUsed: number;
}

const store = createStore('poursort');
const settings = store.get('settings', { sound: true, haptics: true, symbols: false });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

function freshLevel(level: number): Save {
  return { level, tubes: generateLevel(level), history: [], undos: UNDOS_PER_LEVEL, extraUsed: false, moves: 0, hintsUsed: 0 };
}

let S: Save = store.get<Save | null>('save', null) ?? freshLevel(1);
let levelStartedAt = Date.now();
const save = () => store.set('save', S);

trackSession('poursort');
track('level_start', { level: S.level, colors: colorsForLevel(S.level), resumed: S.moves > 0 });

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

function refreshHud() {
  $('level').textContent = String(S.level);
  $('undo-count').textContent = S.undos > 0 ? String(S.undos) : '+';
  $<HTMLButtonElement>('tube-btn').disabled = S.extraUsed;
  $('tube-badge').hidden = S.extraUsed;
}

// ───────────────────────── layout ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
interface Slot { x: number; y: number; w: number; h: number }
let slots: Slot[] = [];

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const n = S.tubes.length;
  const rows = n <= 6 ? 1 : 2;
  const perRow = rows === 1 ? n : Math.ceil(n / 2);
  const colW = Math.min((W - 24) / perRow, 96);
  let w = Math.min(62, colW * 0.64);
  let h = w * 3.5;
  const rowGap = 0.32;
  const maxH = (H * 0.8) / (rows + (rows - 1) * rowGap);
  if (h > maxH) {
    h = maxH;
    w = h / 3.5;
  }
  const total = rows * h + (rows - 1) * h * rowGap;
  const y0 = (H - total) / 2 + h * 0.08;
  slots = S.tubes.map((_, i) => {
    const row = i < perRow ? 0 : 1;
    const inRow = row === 0 ? Math.min(perRow, n) : n - perRow;
    const col = row === 0 ? i : i - perRow;
    return { x: W / 2 + (col - (inRow - 1) / 2) * colW, y: y0 + row * h * (1 + rowGap), w, h };
  });
  canvas.dataset.layout = JSON.stringify(slots);
}
window.addEventListener('resize', layout);
layout();

// ───────────────────────── animation state ─────────────────────────
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const easeInOut = (x: number) => {
  x = Math.min(1, Math.max(0, x));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

interface PourAnim {
  from: number;
  to: number;
  amount: number;
  color: number;
  t0: number;
  a: number; // move-in duration
  b: number; // flow duration
  c: number; // return duration
  completedTo: boolean;
}
let anim: PourAnim | null = null;
let selected = -1;
let lift: number[] = [];
const shakes = new Map<number, number>();
const caps = new Map<number, number>(); // tube index -> time its cap appeared
interface Particle { x: number; y: number; vx: number; vy: number; color: string; t0: number; life: number; size: number; spin: number }
let particles: Particle[] = [];
let hint: { move: Move; until: number } | null = null;
let winPending = false;
let nextLevel: Save | null = null;

function syncCaps(now: number) {
  caps.clear();
  S.tubes.forEach((tube, i) => isComplete(tube) && caps.set(i, now - 1000));
}
syncCaps(0);

// ───────────────────────── drawing ─────────────────────────
function tubePath(x: number, y: number, w: number, h: number) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x - r, y + h - r);
  ctx.arc(x, y + h - r, r, Math.PI, 0, true);
  ctx.lineTo(x + r, y);
  ctx.closePath();
}

function drawSymbol(kind: number, cx: number, cy: number, s: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = s * 0.22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (kind % 12) {
    case 0: ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2); ctx.fill(); break;
    case 1: ctx.moveTo(cx, cy - s * 0.5); ctx.lineTo(cx + s * 0.5, cy + s * 0.4); ctx.lineTo(cx - s * 0.5, cy + s * 0.4); ctx.fill(); break;
    case 2: ctx.rect(cx - s * 0.4, cy - s * 0.4, s * 0.8, s * 0.8); ctx.fill(); break;
    case 3: ctx.moveTo(cx, cy - s * 0.55); ctx.lineTo(cx + s * 0.45, cy); ctx.lineTo(cx, cy + s * 0.55); ctx.lineTo(cx - s * 0.45, cy); ctx.fill(); break;
    case 4:
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? s * 0.24 : s * 0.55;
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.fill();
      break;
    case 5: ctx.moveTo(cx - s * 0.45, cy); ctx.lineTo(cx + s * 0.45, cy); ctx.moveTo(cx, cy - s * 0.45); ctx.lineTo(cx, cy + s * 0.45); ctx.stroke(); break;
    case 6: ctx.arc(cx, cy, s * 0.38, 0, Math.PI * 2); ctx.stroke(); break;
    case 7: ctx.moveTo(cx - s * 0.36, cy - s * 0.36); ctx.lineTo(cx + s * 0.36, cy + s * 0.36); ctx.moveTo(cx + s * 0.36, cy - s * 0.36); ctx.lineTo(cx - s * 0.36, cy + s * 0.36); ctx.stroke(); break;
    case 8:
      for (let i = 0; i < 6; i++) ctx.lineTo(cx + Math.cos((i * Math.PI) / 3) * s * 0.48, cy + Math.sin((i * Math.PI) / 3) * s * 0.48);
      ctx.fill();
      break;
    case 9: ctx.arc(cx, cy, s * 0.45, Math.PI, 0); ctx.fill(); break;
    case 10: ctx.arc(cx - s * 0.25, cy, s * 0.17, 0, Math.PI * 2); ctx.arc(cx + s * 0.25, cy, s * 0.17, 0, Math.PI * 2); ctx.fill(); break;
    default: ctx.rect(cx - s * 0.5, cy - s * 0.14, s, s * 0.28); ctx.fill();
  }
}

/** Draws one tube at its local origin (mouth centre = 0,0) so it can be moved and tilted. */
function drawTube(tube: Tube, extra: { color: number; units: number } | null, slot: Slot, capAt: number | undefined, now: number) {
  const { w, h } = slot;
  const x = 0;
  const y = 0;
  // glass body
  tubePath(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();

  // liquid
  const pad = w * 0.09;
  const innerW = w - pad * 2;
  const bottom = y + h - pad;
  const uh = (h - w * 0.32 - pad) / CAPACITY;
  ctx.save();
  tubePath(x, y, innerW + 0.01, h - pad);
  ctx.translate(0, 0);
  ctx.clip();
  const layers: { color: number; units: number }[] = [];
  for (const c of tube) {
    const last = layers[layers.length - 1];
    if (last && last.color === c) last.units++;
    else layers.push({ color: c, units: 1 });
  }
  if (extra && extra.units > 0.001) {
    const last = layers[layers.length - 1];
    if (last && last.color === extra.color) last.units += extra.units;
    else layers.push({ color: extra.color, units: extra.units });
  }
  let level = 0;
  for (const layer of layers) {
    const yTop = bottom - (level + layer.units) * uh;
    const yBot = bottom - level * uh;
    const color = LIQUIDS[layer.color - 1];
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, yTop, w, yBot - yTop + (level === 0 ? pad + 2 : 1));
    if (settings.symbols) {
      for (let u = 0; u < Math.floor(layer.units + 0.001); u++) drawSymbol(layer.color - 1, x, bottom - (level + u + 0.5) * uh, uh * 0.42);
    }
    level += layer.units;
  }
  if (level > 0) {
    // glossy surface line
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x - w / 2, bottom - level * uh, w, Math.max(2, uh * 0.08));
  }
  ctx.restore();

  // glass highlights and outline
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.roundRect(x - w * 0.32, y + h * 0.08, w * 0.1, h * 0.62, w * 0.05);
  ctx.fill();
  tubePath(x, y, w, h);
  ctx.lineWidth = Math.max(2, w * 0.06);
  ctx.strokeStyle = 'rgba(52, 64, 110, 0.28)';
  ctx.stroke();
  // lip
  ctx.fillStyle = 'rgba(52, 64, 110, 0.22)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2 - w * 0.08, y - w * 0.06, w * 1.16, w * 0.14, w * 0.07);
  ctx.fill();

  // cork on finished tubes
  if (capAt !== undefined) {
    const k = ease((now - capAt) / 260);
    const cw = w * 0.86;
    const ch = w * 0.42;
    ctx.save();
    ctx.translate(x, y - ch * 0.35 - (1 - k) * h * 0.25);
    ctx.globalAlpha = k;
    ctx.fillStyle = '#c08a57';
    ctx.beginPath();
    ctx.roundRect(-cw / 2, -ch / 2, cw, ch, ch * 0.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-cw / 2 + cw * 0.12, -ch / 2 + ch * 0.18, cw * 0.76, ch * 0.16);
    ctx.restore();
  }
}

function drawHand(x: number, y: number, now: number) {
  const bob = Math.sin(now / 220) * 6;
  ctx.font = `${Math.round(slots[0].w * 0.9)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('👆', x + 6, y + bob);
}

let frozenAt: number | null = null; // screenshot hook: pins the animation clock

function frame(now: number) {
  if (frozenAt !== null) now = frozenAt;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (lift.length !== S.tubes.length) lift = S.tubes.map(() => 0);

  let flow = 0; // eased 0..1 progress of liquid transfer
  if (anim) {
    const e = now - anim.t0;
    flow = e < anim.a ? 0 : e < anim.a + anim.b ? easeInOut((e - anim.a) / anim.b) : 1;
    if (e >= anim.a + anim.b && !anim.completedTo) {
      anim.completedTo = true;
      onPourLanded(anim, now);
    }
    if (e >= anim.a + anim.b + anim.c) anim = null;
  }

  const drawOrder = S.tubes.map((_, i) => i).sort((a, b) => (a === anim?.from ? 1 : 0) - (b === anim?.from ? 1 : 0));
  for (const i of drawOrder) {
    const slot = slots[i];
    if (!slot) continue;
    const target = i === selected ? 1 : 0;
    lift[i] += (target - lift[i]) * 0.3;
    let x = slot.x;
    let y = slot.y - lift[i] * slot.w * 0.45;
    let angle = 0;
    let tube = S.tubes[i];
    let extra: { color: number; units: number } | null = null;

    const shakeT = shakes.get(i);
    if (shakeT !== undefined) {
      const p = (now - shakeT) / 320;
      if (p >= 1) shakes.delete(i);
      else x += Math.sin(p * Math.PI * 6) * (1 - p) * slot.w * 0.14;
    }

    if (anim && i === anim.from) {
      const e = now - anim.t0;
      const dest = slots[anim.to];
      // The tilted body extends away from the target, so pour from whichever side has room.
      const dir = dest.x >= W / 2 ? 1 : -1;
      const px = dest.x - dir * slot.w * 0.42;
      const py = dest.y - slot.h * 0.38;
      // Past 90° so the bottom rises above the mouth, the way you actually pour.
      const tiltMax = dir * 1.75;
      const homeY = slot.y - slot.w * 0.45;
      let k: number;
      if (e < anim.a) k = easeInOut(e / anim.a);
      else if (e < anim.a + anim.b) k = 1;
      else k = 1 - easeInOut((e - anim.a - anim.b) / anim.c);
      x = slot.x + (px - slot.x) * k;
      y = homeY + (py - homeY) * k;
      angle = tiltMax * k;
      tube = tube.slice();
      extra = { color: anim.color, units: anim.amount * (1 - flow) };
      // stream from the mouth down into the target
      if (e >= anim.a * 0.85 && e < anim.a + anim.b) {
        const targetTube = S.tubes[anim.to];
        const tSlot = slots[anim.to];
        const pad = tSlot.w * 0.09;
        const uh = (tSlot.h - tSlot.w * 0.32 - pad) / CAPACITY;
        const surface = tSlot.y + tSlot.h - pad - (targetTube.length - anim.amount * (1 - flow)) * uh;
        ctx.strokeStyle = LIQUIDS[anim.color - 1];
        ctx.lineWidth = tSlot.w * 0.16 * (1 - Math.max(0, flow - 0.85) / 0.15);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px + dir * slot.w * 0.06, py + slot.w * 0.04);
        ctx.lineTo(dest.x, surface);
        ctx.stroke();
      }
    } else if (anim && i === anim.to) {
      const base = tube.slice(0, tube.length - anim.amount);
      extra = { color: anim.color, units: anim.amount * flow };
      tube = base;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    drawTube(tube, extra, slot, caps.get(i), now);
    ctx.restore();
  }

  // hint: pulsing ring on the source, arrow over the target
  const tutorial = S.level === 1 && !winPending;
  if (tutorial && !anim && !hint) {
    const m = solve(S.tubes, 5000);
    if (m && m.length) hint = { move: m[0], until: Infinity };
  }
  if (hint && !anim) {
    if (now > hint.until) hint = null;
    else {
      const [a, b] = hint.move;
      const focus = selected === a ? b : a;
      const s = slots[focus];
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.strokeStyle = `rgba(47,107,255,${0.35 + 0.4 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(s.x - s.w * 0.75, s.y - s.w * 0.75 - (focus === selected ? s.w * 0.45 : 0), s.w * 1.5, s.h + s.w * 1.0, s.w * 0.5);
      ctx.stroke();
      if (tutorial) drawHand(s.x, s.y + s.h + s.w * 0.1, now);
    }
  }

  particles = particles.filter((p) => now - p.t0 < p.life);
  for (const p of particles) {
    const tt = (now - p.t0) / 1000;
    const k = 1 - (now - p.t0) / p.life;
    ctx.save();
    ctx.translate(p.x + p.vx * tt, p.y + p.vy * tt + 600 * tt * tt);
    ctx.rotate(p.spin * tt);
    ctx.globalAlpha = Math.min(1, k * 1.5);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(frame);
}

// ───────────────────────── game flow ─────────────────────────
function burst(x: number, y: number, colors: string[], count: number, spread: number, up: number) {
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * spread,
      vy: -Math.random() * up - 60,
      color: colors[i % colors.length],
      t0: now + Math.random() * 120,
      life: 900 + Math.random() * 700,
      size: 6 + Math.random() * 6,
      spin: (Math.random() - 0.5) * 14,
    });
  }
}

function onPourLanded(a: PourAnim, now: number) {
  const target = S.tubes[a.to];
  if (isComplete(target)) {
    caps.set(a.to, now);
    const s = slots[a.to];
    burst(s.x, s.y, [LIQUIDS[a.color - 1], '#ffffff'], 26, 320, 380);
    [0, 2, 4, 7].forEach((st, i) => tone({ freq: pentatonic(st), duration: 0.16, volume: 0.45, delay: i * 0.06 }));
    haptic.success();
  }
  if (isSolved(S.tubes)) {
    winPending = true;
    setTimeout(win, 450);
  } else if (!hasMoves(S.tubes)) {
    toast(t('noMoves'), 4000);
    haptic.error();
    track('stuck', { level: S.level, moves: S.moves });
  }
}

function doPour(from: number, to: number) {
  const before = S.tubes;
  const res = pour(before, from, to);
  if (!res) return;
  const color = before[from][before[from].length - 1];
  S.history.push(before);
  if (S.history.length > 60) S.history.shift();
  S.tubes = res.tubes;
  S.moves++;
  save();
  selected = -1;
  hint = null;
  const fill = before[to].length;
  anim = { from, to, amount: res.amount, color, t0: performance.now(), a: 210, b: 170 + res.amount * 110, c: 200, completedTo: false };
  haptic.light();
  for (let i = 0; i < res.amount; i++) {
    tone({ freq: 240 + (fill + i) * 70, to: 300 + (fill + i) * 80, duration: 0.12, type: 'sine', volume: 0.35, delay: 0.21 + i * 0.11 });
  }
}

function invalid(i: number) {
  shakes.set(i, performance.now());
  haptic.error();
  tone({ freq: 150, to: 110, duration: 0.14, type: 'triangle', volume: 0.3 });
}

function tapTube(i: number) {
  if (anim || winPending) return;
  const tube = S.tubes[i];
  if (selected === -1) {
    if (tube.length === 0 || isComplete(tube)) return invalid(i);
    selected = i;
    haptic.light();
    tone({ freq: 620, to: 760, duration: 0.06, type: 'triangle', volume: 0.25 });
    return;
  }
  if (selected === i) {
    selected = -1;
    tone({ freq: 520, to: 420, duration: 0.06, type: 'triangle', volume: 0.2 });
    return;
  }
  if (canPour(S.tubes, selected, i)) return doPour(selected, i);
  // Can't pour here: shake the target, then pick it up instead if it can be picked up.
  invalid(i);
  selected = tube.length && !isComplete(tube) ? i : -1;
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  let best = -1;
  let bestD = Infinity;
  slots.forEach((s, i) => {
    const inX = Math.abs(x - s.x) < Math.max(s.w * 0.9, 30);
    const inY = y > s.y - s.w * 1.2 && y < s.y + s.h + s.w * 0.4;
    const d = Math.abs(x - s.x);
    if (inX && inY && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  if (best >= 0) tapTube(best);
  else if (selected >= 0) selected = -1;
});

function win() {
  const colors = LIQUIDS.slice(0, colorsForLevel(S.level));
  burst(W * 0.25, H * 0.2, colors, 60, 600, 500);
  burst(W * 0.75, H * 0.2, colors, 60, 600, 500);
  [0, 2, 4, 5, 7, 9].forEach((st, i) => tone({ freq: pentatonic(st), duration: 0.22, volume: 0.45, delay: i * 0.08 }));
  haptic.success();
  track('level_complete', {
    level: S.level,
    moves: S.moves,
    undos_used: UNDOS_PER_LEVEL - Math.min(UNDOS_PER_LEVEL, S.undos),
    hints_used: S.hintsUsed,
    extra_tube: S.extraUsed,
    duration_s: Math.round((Date.now() - levelStartedAt) / 1000),
  });
  $('win-title').textContent = t('levelN', { n: S.level });
  $('win-moves').textContent = t('moves', { n: S.moves });
  // Persist progress immediately so quitting on the win screen never loses the level;
  // the solved board stays on screen until "Next level".
  const completed = S.level;
  nextLevel = freshLevel(completed + 1);
  store.set('save', nextLevel);
  store.set('completed', completed);
  setTimeout(() => ($('win').hidden = false), 500);
  maybeRequestReview(completed, completed >= 5);
}

function startLevel(state: Save) {
  S = state;
  save();
  selected = -1;
  anim = null;
  hint = null;
  winPending = false;
  levelStartedAt = Date.now();
  layout();
  lift = S.tubes.map(() => 0);
  syncCaps(performance.now());
  refreshHud();
  $('toast').hidden = true;
  track('level_start', { level: S.level, colors: colorsForLevel(S.level), resumed: false });
}

$('next-btn').addEventListener('click', async () => {
  $('win').hidden = true;
  haptic.medium();
  startLevel(nextLevel ?? freshLevel(S.level + 1));
  nextLevel = null;
  if (S.level > 4) await interstitialMoment('next_level');
});

$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  if (anim || winPending) return;
  track('level_restart', { level: S.level, moves: S.moves });
  startLevel(freshLevel(S.level));
});

$('undo-btn').addEventListener('click', async () => {
  unlockAudio();
  if (anim || winPending) return;
  if (!S.history.length) return toast(t('noUndo'));
  if (S.undos <= 0) {
    if (!(await showRewarded('undo'))) return;
    S.undos = UNDOS_PER_LEVEL;
    toast(t('undoRefill'));
  }
  S.tubes = S.history.pop()!;
  S.undos--;
  S.moves++;
  selected = -1;
  hint = null;
  save();
  syncCaps(performance.now() - 1000);
  refreshHud();
  $('toast').hidden = true;
  haptic.light();
  tone({ freq: 500, to: 380, duration: 0.1, type: 'triangle', volume: 0.3 });
  track('undo', { level: S.level });
});

$('hint-btn').addEventListener('click', async () => {
  unlockAudio();
  if (anim || winPending) return;
  // First hint in a level is free; more are behind a rewarded ad.
  if (S.hintsUsed > 0 && !(await showRewarded('hint'))) return;
  const moves = solve(S.tubes, 40_000);
  if (!moves || !moves.length) {
    toast(t('noHint'), 3000);
    return;
  }
  S.hintsUsed++;
  save();
  selected = -1;
  hint = { move: moves[0], until: performance.now() + 4000 };
  haptic.light();
  track('hint', { level: S.level });
});

$('tube-btn').addEventListener('click', async () => {
  unlockAudio();
  if (anim || winPending) return;
  if (S.extraUsed) return toast(t('tubeUsed'));
  if (!(await showRewarded('extra_tube'))) return;
  S.extraUsed = true;
  S.tubes = [...S.tubes, []];
  S.history = S.history.map((h) => [...h, []]);
  save();
  layout();
  lift = S.tubes.map(() => 0);
  refreshHud();
  toast(t('tubeAdded'));
  haptic.success();
  track('extra_tube', { level: S.level });
});

// settings
const opts: [string, 'sound' | 'haptics' | 'symbols'][] = [
  ['opt-sound', 'sound'],
  ['opt-haptics', 'haptics'],
  ['opt-symbols', 'symbols'],
];
for (const [id, k] of opts) {
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
refreshHud();
void setupNative({
  darkBackground: false,
  onPause: save,
  onBack: () => {
    if (!$('settings').hidden) {
      $('settings').hidden = true;
      return true;
    }
    if (selected >= 0) {
      selected = -1;
      return true;
    }
    return false;
  },
});
requestAnimationFrame(frame);
// Exposed for e2e/screenshot scripts.
(window as unknown as { __poursort: unknown }).__poursort = { get state() { return S; }, tap: tapTube, solve, busy: () => !!anim || winPending, goto: (level: number) => startLevel(freshLevel(level)), load: (s: Save) => startLevel(s),
  freezePour: (ms: number) => (frozenAt = anim ? anim.t0 + ms : null),
};
