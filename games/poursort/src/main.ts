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
  starsFor,
  type Move,
  type Tube,
  type Tubes,
} from './game';
import { t } from './i18n';
import { SKINS, type Skin } from './skins';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/poursort/PRIVACY.md';
declare const __APP_VERSION__: string;

// Current skin: 12 liquids (see skins.ts for the ordering rule) + glass style.
let SKIN: Skin = SKINS[0];
let LIQUIDS = SKIN.liquids;
let repaintHero = () => {};
const UNDOS_PER_LEVEL = 5;
const LEVELS = 500;
const MAX_EXTRA_TUBES = 2;
// Helps beyond the free ones are paid with coins or a rewarded video.
const PRICE = { hint: 30, tube: 50, undo: 20 };

// ───────────────────────── persistence ─────────────────────────
interface Save {
  level: number;
  tubes: Tubes;
  history: Tubes[];
  /** Undos left before the next refill. */
  undos: number;
  undosUsed: number;
  /** Extra empty tubes added this level (first free, second paid). */
  extra: number;
  moves: number;
  hintsUsed: number;
}

/** Accepts saves from v1.0 (`extraUsed`, no `undosUsed`) and anything half-written. */
function normalize(raw: unknown): Save | null {
  const r = raw as Partial<Save> & { extraUsed?: boolean };
  if (!r || typeof r !== 'object' || !Array.isArray(r.tubes) || typeof r.level !== 'number' || r.level < 1) return null;
  const undos = typeof r.undos === 'number' ? r.undos : UNDOS_PER_LEVEL;
  return {
    level: Math.floor(r.level),
    tubes: r.tubes,
    history: Array.isArray(r.history) ? r.history : [],
    undos,
    undosUsed: typeof r.undosUsed === 'number' ? r.undosUsed : UNDOS_PER_LEVEL - Math.min(UNDOS_PER_LEVEL, undos),
    extra: typeof r.extra === 'number' ? r.extra : r.extraUsed ? 1 : 0,
    moves: typeof r.moves === 'number' ? r.moves : 0,
    hintsUsed: typeof r.hintsUsed === 'number' ? r.hintsUsed : 0,
  };
}

const store = createStore('poursort');
const settings = store.get('settings', { sound: true, haptics: true, symbols: false });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

function freshLevel(level: number): Save {
  return { level, tubes: generateLevel(level), history: [], undos: UNDOS_PER_LEVEL, undosUsed: 0, extra: 0, moves: 0, hintsUsed: 0 };
}

let S: Save = normalize(store.get<unknown>('save', null)) ?? freshLevel(1);
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
const COIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffc83d" stroke="#b57d10" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#e0a21c" stroke-width="1.6"/></svg>';

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
  const price = (el: HTMLElement, free: boolean, cost: number) => {
    el.classList.toggle('free', free);
    el.classList.toggle('coin', !free);
    el.innerHTML = free ? t('free') : `${COIN}${cost}`;
  };
  price($('hint-badge'), S.hintsUsed === 0, PRICE.hint);
  price($('tube-badge'), S.extra === 0, PRICE.tube);
  $<HTMLButtonElement>('tube-btn').disabled = S.extra >= MAX_EXTRA_TUBES;
  $('tube-badge').hidden = S.extra >= MAX_EXTRA_TUBES;
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
  ctx.fillStyle = SKIN.glass;
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
  ctx.fillStyle = SKIN.shine;
  ctx.beginPath();
  ctx.roundRect(x - w * 0.32, y + h * 0.08, w * 0.1, h * 0.62, w * 0.05);
  ctx.fill();
  tubePath(x, y, w, h);
  ctx.lineWidth = Math.max(2, w * 0.06);
  ctx.strokeStyle = SKIN.rim;
  ctx.stroke();
  // lip
  ctx.fillStyle = SKIN.rim;
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
    ctx.fillStyle = SKIN.cork;
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
    profile.progress('tubes');
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
  profile.progress('pours');
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
  if (meta.covering || paying) return;
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
  const stars = starsFor(S);
  track('level_complete', {
    level: S.level,
    stars,
    moves: S.moves,
    undos_used: S.undosUsed,
    hints_used: S.hintsUsed,
    extra_tubes: S.extra,
    duration_s: Math.round((Date.now() - levelStartedAt) / 1000),
  });
  // Persist progress immediately so quitting on the win screen never loses the level;
  // the solved board stays on screen behind the win sheet until "Next".
  const completed = S.level;
  nextLevel = freshLevel(completed + 1);
  store.set('save', nextLevel);
  const advance = () => {
    startLevel(nextLevel ?? freshLevel(completed + 1));
    nextLevel = null;
  };
  setTimeout(() => {
    meta.showWin({
      level: completed,
      stars,
      coins: 10 + stars * 5,
      onNext: () => {
        haptic.medium();
        advance();
      },
      onMenu: advance,
    });
    if (profile.data.firstRun) profile.finishFirstRun();
  }, 500);
  maybeRequestReview(completed, completed >= 5);
}

function startLevel(state: Save, resumed = false) {
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
  track('level_start', { level: S.level, colors: colorsForLevel(S.level), resumed });
}

function restartLevel() {
  if (anim || winPending) return;
  track('level_restart', { level: S.level, moves: S.moves });
  startLevel(freshLevel(S.level));
}

// ───────────────────────── paid helps (coins or video) ─────────────────────────
let paying: ((ok: boolean) => void) | null = null;

/** Offers a help for coins or a rewarded video; resolves true once it is paid for. */
function pay(title: string, price: number, placement: string): Promise<boolean> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'meta-root pay';
    root.innerHTML = `<div class="m-overlay"><div class="m-sheet"><div class="m-result">
      <h2></h2><p class="m-note"></p>
      <button class="m-btn" data-coins>${COIN}<span></span></button>
      <button class="m-btn alt" data-video><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9v6l5-3z" fill="currentColor"/></svg><span></span></button>
      <button class="m-btn ghost" data-cancel></button></div></div></div>`;
    root.querySelector('h2')!.textContent = title;
    root.querySelector('.m-note')!.textContent = t('buyNote', { n: profile.data.coins });
    root.querySelector('[data-coins] span')!.textContent = t('payCoins', { n: price });
    root.querySelector('[data-video] span')!.textContent = t('payVideo');
    root.querySelector('[data-cancel]')!.textContent = t('cancel');
    const coinBtn = root.querySelector<HTMLButtonElement>('[data-coins]')!;
    coinBtn.classList.toggle('short', profile.data.coins < price);
    (root.querySelector('[data-video]') as HTMLElement).hidden = !rewardedAvailable();
    document.body.appendChild(root);
    const done = (ok: boolean) => {
      paying = null;
      root.remove();
      resolve(ok);
    };
    paying = done;
    coinBtn.addEventListener('click', () => {
      if (!profile.spend(price)) {
        haptic.error();
        meta.toast(t('notEnough'));
        return;
      }
      track('coins_spend', { placement, price });
      done(true);
    });
    root.querySelector('[data-video]')!.addEventListener('click', async () => {
      if (await showRewarded(placement)) done(true);
      else meta.toast(t('noVideo'));
    });
    root.querySelector('[data-cancel]')!.addEventListener('click', () => done(false));
    root.querySelector('.m-overlay')!.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) done(false);
    });
  });
}

$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  restartLevel();
});

$('undo-btn').addEventListener('click', async () => {
  unlockAudio();
  if (anim || winPending) return;
  if (!S.history.length) return toast(t('noUndo'));
  if (S.undos <= 0) {
    if (!(await pay(t('buyUndo'), PRICE.undo, 'undo'))) return;
    S.undos = UNDOS_PER_LEVEL;
    toast(t('undoRefill'));
  }
  S.tubes = S.history.pop()!;
  S.undos--;
  S.undosUsed++;
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
  // Never charge for a hint that cannot help.
  const moves = solve(S.tubes, 40_000);
  if (!moves || !moves.length) {
    toast(t('noHint'), 3000);
    return;
  }
  // First hint in a level is free; more cost coins or a video.
  if (S.hintsUsed > 0 && !(await pay(t('buyHint'), PRICE.hint, 'hint'))) return;
  S.hintsUsed++;
  save();
  refreshHud();
  selected = -1;
  hint = { move: moves[0], until: performance.now() + 4000 };
  haptic.light();
  track('hint', { level: S.level, paid: S.hintsUsed > 1 });
});

$('tube-btn').addEventListener('click', async () => {
  unlockAudio();
  if (anim || winPending) return;
  if (S.extra >= MAX_EXTRA_TUBES) return toast(t('tubeMax'));
  if (S.extra > 0 && !(await pay(t('buyTube'), PRICE.tube, 'extra_tube'))) return;
  S.extra++;
  S.tubes = [...S.tubes, []];
  S.history = S.history.map((h) => [...h, []]);
  save();
  layout();
  lift = S.tubes.map(() => 0);
  refreshHud();
  toast(t('tubeAdded'));
  haptic.success();
  track('extra_tube', { level: S.level, paid: S.extra > 1 });
});

// ───────────────────────── meta (menu, map, missions, daily, shop) ─────────────────────────
function applySkin(id: string) {
  SKIN = SKINS.find((s) => s.id === id) ?? SKINS[0];
  LIQUIDS = SKIN.liquids;
  const root = document.documentElement.style;
  root.setProperty('--bg-top', SKIN.bg[0]);
  root.setProperty('--bg-bottom', SKIN.bg[1]);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SKIN.bg[1]);
  repaintHero();
}

// Was there a v1.0 player before the meta layer existed? Their reached level is migrated below.
const hadProfile = (() => {
  try {
    return localStorage.getItem('poursort.profile') !== null;
  } catch {
    return true;
  }
})();

const profile = createProfile({
  game: 'poursort',
  levelCount: LEVELS,
  defaultSkin: SKINS[0].id,
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'pours', targets: [40, 80, 150], reward: (n) => 20 + Math.round(n / 4) },
    { id: 'tubes', targets: [10, 20, 40], reward: (n) => 20 + n },
  ],
});
applySkin(profile.data.skin);
{
  // The save always holds the level the player has reached (a solved level is saved as the next one).
  const reached = Math.min(LEVELS, Math.max(S.level, store.get('completed', 0) + 1));
  if (!hadProfile && reached > 1) {
    // v1.0 players: every level they passed counts as cleared (1 star) on the new map.
    for (let i = 0; i < reached - 1; i++) profile.data.stars[i] = Math.max(1, profile.data.stars[i]);
    profile.data.firstRun = false;
  }
  if (profile.data.unlocked < reached) profile.data.unlocked = reached;
  profile.save();
}

/** Home-screen artwork: a rack of tubes in the current skin, one sealed. Repainted by applySkin. */
function heroArt() {
  const el = document.createElement('div');
  el.className = 'hero';
  const rack = [[1, 1, 1, 1], [3, 2, 3], [2, 4, 2, 3], [4, 4]];
  const paint = () => {
    const w = 34;
    const h = 128;
    const gap = 22;
    const uh = 27;
    const parts = rack.map((tube, i) => {
      const x = 14 + i * (w + gap);
      const y = 30;
      const body = `M${x} ${y} V${y + h - w / 2} A${w / 2} ${w / 2} 0 0 0 ${x + w} ${y + h - w / 2} V${y} Z`;
      const liquid = tube
        .map((c, k) => `<rect x="${x}" y="${y + h - 4 - (k + 1) * uh}" width="${w}" height="${uh + (k === 0 ? 6 : 0.5)}" fill="${LIQUIDS[c - 1]}"/>`)
        .join('');
      const sealed = tube.length === 4 && tube.every((c) => c === tube[0]);
      const cork = sealed ? `<rect x="${x + 2}" y="${y - 13}" width="${w - 4}" height="15" rx="4" fill="${SKIN.cork}"/>` : '';
      return `<g class="hero-tube" style="animation-delay:${i * 160}ms">
        <clipPath id="hc${i}"><path d="${body}"/></clipPath>
        <path d="${body}" fill="${SKIN.glass}"/>
        <g clip-path="url(#hc${i})">${liquid}<rect x="${x}" y="${y + h - 4 - tube.length * uh}" width="${w}" height="3" fill="rgba(255,255,255,0.35)"/></g>
        <rect x="${x + 6}" y="${y + 10}" width="4" height="${h * 0.6}" rx="2" fill="${SKIN.shine}"/>
        <path d="${body}" fill="none" stroke="${SKIN.rim}" stroke-width="2.5"/>
        <rect x="${x - 3}" y="${y - 2}" width="${w + 6}" height="5" rx="2.5" fill="${SKIN.rim}"/>${cork}</g>`;
    });
    el.innerHTML = `<svg viewBox="0 0 230 172" width="230" height="172" aria-hidden="true">${parts.join('')}</svg>`;
  };
  paint();
  repaintHero = paint;
  return el;
}

const symbolsRow = document.createElement('label');
symbolsRow.className = 'm-row';
symbolsRow.innerHTML = `<span></span><input type="checkbox" class="m-switch">`;
symbolsRow.querySelector('span')!.textContent = t('symbols');
const symbolsInput = symbolsRow.querySelector('input')!;
symbolsInput.checked = settings.symbols;
symbolsInput.addEventListener('change', () => {
  settings.symbols = symbolsInput.checked;
  store.set('settings', settings);
});

const meta = createMeta({
  title: 'Pour Sort',
  hero: heroArt(),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  levels: {
    count: LEVELS,
    play: (n) => {
      unlockAudio();
      // Same level as the saved one (or the open-ended run past the map): resume it.
      if (S.level === n || (n === LEVELS && S.level > LEVELS)) {
        if (winPending && nextLevel) {
          startLevel(nextLevel);
          nextLevel = null;
        } else track('level_start', { level: S.level, colors: colorsForLevel(S.level), resumed: S.moves > 0 });
        return;
      }
      startLevel(freshLevel(n));
    },
  },
  missionText: (id, n) => t(`mission_${id}` as 'mission_levels', { n }),
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as 'skin_classic'), price: s.price, swatch: s.swatch })),
  onSkin: applySkin,
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', settings);
  },
  extraSettings: symbolsRow,
});
profile.onChange(refreshHud);

function openPause() {
  unlockAudio();
  if (winPending || meta.covering) return;
  selected = -1;
  meta.showPause({ onResume: () => {}, onRestart: () => startLevel(freshLevel(S.level)) });
}
$('settings-btn').addEventListener('click', openPause);

// ───────────────────────── boot ─────────────────────────
refreshHud();
void initAds();
void initStore();
void setupNative({
  darkBackground: false,
  onPause: save,
  onBack: () => {
    if (paying) {
      paying(false);
      return true;
    }
    if (meta.back()) return true;
    if (meta.covering) return false;
    if (selected >= 0) {
      selected = -1;
      return true;
    }
    openPause();
    return true;
  },
});
meta.showHome();
requestAnimationFrame(frame);
// Exposed for e2e/screenshot scripts.
(window as unknown as { __poursort: unknown }).__poursort = {
  get state() {
    return S;
  },
  tap: tapTube,
  solve,
  busy: () => !!anim || winPending,
  goto: (level: number) => startLevel(freshLevel(level)),
  load: (s: unknown) => startLevel(normalize(s)!),
  freezePour: (ms: number) => (frozenAt = anim ? anim.t0 + ms : null),
};
