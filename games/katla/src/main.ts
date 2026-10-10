import './style.css';
import {
  createMeta,
  createProfile,
  createStore,
  haptic,
  initAds,
  initStore,
  maybeRequestReview,
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
  deadEnd,
  dims,
  fold,
  LEVEL_COUNT,
  moving,
  solve,
  starsFor,
  topColor,
  underColor,
  unpackLevel,
  visibleKey,
  type Level,
  type Move,
  type PackedLevel,
  type Sheet,
} from './game';
import LEVELS from './levels.json';
import { lang, t, type Key } from './i18n';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/katla/PRIVACY.md';
declare const __APP_VERSION__: string;

// ───────────────────────── skins (paper patterns) ─────────────────────────
type Pattern = 'plain' | 'graph' | 'kraft' | 'dots' | 'notebook' | 'washi';
interface Skin {
  id: Pattern;
  price: number;
  /** front A, front B, back A, back B */
  colors: [string, string, string, string];
}
const SKINS: Skin[] = [
  { id: 'plain', price: 0, colors: ['#e07a5f', '#3d5a80', '#f2e8cf', '#81b29a'] },
  { id: 'graph', price: 150, colors: ['#5b8fb9', '#f4a259', '#fbfbf6', '#bc4b51'] },
  { id: 'kraft', price: 250, colors: ['#b8763f', '#2f4858', '#ead9b9', '#7d9c6a'] },
  { id: 'dots', price: 400, colors: ['#ef6f6c', '#465775', '#fff4e0', '#88c9a1'] },
  { id: 'notebook', price: 600, colors: ['#4062bb', '#f45b69', '#fdfdf9', '#ffd166'] },
  { id: 'washi', price: 900, colors: ['#8e7dbe', '#2a9d8f', '#f7ede2', '#f6bd60'] },
];
const swatch = (s: Skin) =>
  `linear-gradient(135deg, ${s.colors[0]} 0 50%, ${s.colors[2]} 50% 100%)`;
let skin = SKINS[0];

// ───────────────────────── profile + meta ─────────────────────────
const store = createStore('katla');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const profile = createProfile({
  game: 'katla',
  levelCount: LEVEL_COUNT,
  defaultSkin: 'plain',
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'folds', targets: [10, 20, 30], reward: (n) => 15 + n },
  ],
});

document.documentElement.lang = lang;
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Key);
});

function applySkin(id: string) {
  skin = SKINS.find((s) => s.id === id) ?? SKINS[0];
  document.body.dataset.skin = skin.id;
  drawTarget();
}

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as Key), price: s.price, swatch: swatch(s) })),
  onSkin: applySkin,
  levels: { count: LEVEL_COUNT, play: (n) => startLevel(n, S.level === n && !winPending ? S : undefined) },
  missionText: (id, n) => t(`mission_${id}` as Key, { n }),
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});

// ───────────────────────── play state ─────────────────────────
interface Play {
  level: number;
  sheet: Sheet;
  ox: number; // world position of the normalized sheet's (0,0)
  oy: number;
  moves: Move[];
  history: { sheet: Sheet; ox: number; oy: number }[];
  folds: number; // every fold made, undone ones included
  hintsUsed: number;
}
const levelCache = new Map<number, Level>();
const getLevel = (n: number) => {
  let l = levelCache.get(n);
  if (!l) levelCache.set(n, (l = unpackLevel(n, (LEVELS as PackedLevel[])[n - 1])));
  return l;
};
let L: Level = getLevel(1);
let S: Play = fresh(1);
let targetKey = visibleKey(L.target);
let winPending = false;
let startedAt = Date.now();

function fresh(level: number): Play {
  return { level, sheet: getLevel(level).sheet, ox: 0, oy: 0, moves: [], history: [], folds: 0, hintsUsed: 0 };
}
const save = () => {
  if (!winPending) store.set('play', S);
};

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
const tcanvas = $<HTMLCanvasElement>('target');
const tctx = tcanvas.getContext('2d')!;

let toastTimer = 0;
function toast(text: string, ms = 2400) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

function refreshHud() {
  $('level').textContent = String(S.level);
  $('folds').textContent = t('folds', { n: S.folds });
  $('par').textContent = t('par', { n: L.par });
  $('hint-badge').textContent = S.hintsUsed === 0 ? '1' : 'AD';
  $('coach').classList.toggle('off', S.level > 2 || S.folds > 0);
}

// ───────────────────────── drawing ─────────────────────────
const shadeHex = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(Math.max(0, Math.min(255, k < 0 ? c * (1 + k) : c + (255 - c) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

function paper(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: number, shade = 0, seed = 0) {
  const base = skin.colors[color];
  c.fillStyle = shade ? shadeHex(base, shade) : base;
  c.fillRect(x, y, w, h);
  const s = Math.max(Math.abs(w), Math.abs(h));
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  const light = color >= 2; // backs are pale: darker ink for patterns
  const ink = light ? 'rgba(60,50,40,0.13)' : 'rgba(255,255,255,0.2)';
  c.strokeStyle = ink;
  c.fillStyle = ink;
  c.lineWidth = Math.max(1, s * 0.018);
  switch (skin.id) {
    case 'graph':
      c.beginPath();
      for (let i = 1; i < 4; i++) {
        c.moveTo(x + (w * i) / 4, y);
        c.lineTo(x + (w * i) / 4, y + h);
        c.moveTo(x, y + (h * i) / 4);
        c.lineTo(x + w, y + (h * i) / 4);
      }
      c.stroke();
      break;
    case 'kraft': {
      let r = (seed * 9301 + 49297) % 233280;
      for (let i = 0; i < 9; i++) {
        r = (r * 9301 + 49297) % 233280;
        const px = x + (r / 233280) * w;
        r = (r * 9301 + 49297) % 233280;
        const py = y + (r / 233280) * h;
        c.fillRect(px, py, s * 0.09, s * 0.018);
      }
      break;
    }
    case 'dots':
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          c.beginPath();
          c.arc(x + (w * (i + 0.5 + (j % 2) * 0.25)) / 3, y + (h * (j + 0.5)) / 3, s * 0.07, 0, Math.PI * 2);
          c.fill();
        }
      break;
    case 'notebook':
      c.beginPath();
      for (let i = 1; i < 5; i++) {
        c.moveTo(x, y + (h * i) / 5);
        c.lineTo(x + w, y + (h * i) / 5);
      }
      c.stroke();
      break;
    case 'washi':
      c.beginPath();
      for (let i = -4; i < 5; i++) {
        c.moveTo(x + (w * i) / 4, y);
        c.lineTo(x + (w * (i + 4)) / 4, y + h);
      }
      c.lineWidth = Math.max(1, s * 0.05);
      c.stroke();
      break;
    default:
      c.fillStyle = light ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.1)';
      c.fillRect(x, y, w, h * 0.12);
  }
  c.restore();
}

function drawSheetCells(c: CanvasRenderingContext2D, sheet: Sheet, px: (x: number) => number, py: (y: number) => number, cs: number, skip?: (cell: Sheet[number]) => boolean) {
  // soft drop shadow, stack edges, then faces
  c.fillStyle = 'rgba(90,70,40,0.12)';
  for (const cell of sheet) if (!skip?.(cell)) c.fillRect(px(cell.x) + cs * 0.04, py(cell.y) + cs * 0.07, cs, cs);
  for (const cell of sheet) {
    if (skip?.(cell)) continue;
    const depth = Math.min(3, cell.s.length - 1);
    for (let k = depth; k >= 1; k--) {
      c.fillStyle = k % 2 ? '#d8ccb8' : '#e8dfcf';
      c.fillRect(px(cell.x) + k * cs * 0.025, py(cell.y) + k * cs * 0.025, cs, cs);
    }
  }
  for (const cell of sheet) {
    if (skip?.(cell)) continue;
    paper(c, px(cell.x), py(cell.y), cs, cs, topColor(cell), 0, cell.x * 7 + cell.y * 13);
  }
  // creases between cells
  c.strokeStyle = 'rgba(60,50,40,0.1)';
  c.lineWidth = 1;
  c.beginPath();
  for (const cell of sheet) {
    if (skip?.(cell)) continue;
    c.rect(px(cell.x) + 0.5, py(cell.y) + 0.5, cs - 1, cs - 1);
  }
  c.stroke();
}

function drawTarget() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const size = tcanvas.clientWidth || 104;
  tcanvas.width = Math.round(size * dpr);
  tcanvas.height = Math.round(size * dpr);
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  tctx.clearRect(0, 0, size, size);
  const { w, h } = dims(L.target);
  const cs = Math.min((size - 16) / w, (size - 16) / h, 30);
  const x0 = (size - w * cs) / 2;
  const y0 = (size - h * cs) / 2;
  drawSheetCells(tctx, L.target, (x) => x0 + x * cs, (y) => y0 + y * cs, cs);
}

// ───────────────────────── board camera ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
const cam = { x: 0, y: 0, cs: 40 };
let camReady = false;

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  drawTarget();
}
window.addEventListener('resize', layout);

function camGoal() {
  let x0 = S.ox;
  let y0 = S.oy;
  const d = dims(S.sheet);
  let x1 = S.ox + d.w;
  let y1 = S.oy + d.h;
  if (anim) {
    const p = dims(anim.prev);
    x0 = Math.min(x0, anim.ox);
    y0 = Math.min(y0, anim.oy);
    x1 = Math.max(x1, anim.ox + p.w);
    y1 = Math.max(y1, anim.oy + p.h);
  }
  const bw = x1 - x0;
  const bh = y1 - y0;
  const cs = Math.min((W - 56) / Math.max(bw, 2.2), (H - 70) / Math.max(bh, 2.2), 96);
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, cs };
}
const sx = (wx: number) => W / 2 + (wx - cam.x) * cam.cs;
const sy = (wy: number) => H / 2 + (wy - cam.y) * cam.cs;

// ───────────────────────── animation + input state ─────────────────────────
const easeInOut = (x: number) => {
  x = Math.min(1, Math.max(0, x));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
interface FoldAnim {
  m: Move;
  prev: Sheet;
  ox: number;
  oy: number;
  t0: number;
  dur: number;
  landed: boolean;
}
let anim: FoldAnim | null = null;
let preview: Move | null = null;
let hint: { m: Move; until: number } | null = null;
interface Bit { x: number; y: number; vx: number; vy: number; c: number; t0: number; life: number; size: number; spin: number }
let bits: Bit[] = [];

function lineOf(m: Move, ox: number, oy: number) {
  return m.axis === 'v' ? ox + m.at : oy + m.at;
}

function drawFoldLines(sheet: Sheet, ox: number, oy: number, now: number) {
  const { w, h } = dims(sheet);
  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(59,53,48,0.18)';
  ctx.beginPath();
  for (let i = 1; i < w; i++) {
    ctx.moveTo(sx(ox + i), sy(oy) - 14);
    ctx.lineTo(sx(ox + i), sy(oy + h) + 14);
  }
  for (let j = 1; j < h; j++) {
    ctx.moveTo(sx(ox) - 14, sy(oy + j));
    ctx.lineTo(sx(ox + w) + 14, sy(oy + j));
  }
  ctx.stroke();
  ctx.restore();
  const show = preview ?? hint?.m;
  if (!show) return;
  const pulse = preview ? 1 : 0.55 + 0.45 * Math.sin(now / 160);
  // flap tint
  ctx.fillStyle = `rgba(217,115,78,${0.16 * pulse})`;
  for (const c of sheet) if (moving(c, show)) ctx.fillRect(sx(ox + c.x), sy(oy + c.y), cam.cs, cam.cs);
  // crease
  const L0 = lineOf(show, ox, oy);
  ctx.strokeStyle = `rgba(217,115,78,${0.5 + 0.5 * pulse})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  if (show.axis === 'v') {
    ctx.moveTo(sx(L0), sy(oy) - 22);
    ctx.lineTo(sx(L0), sy(oy + h) + 22);
  } else {
    ctx.moveTo(sx(ox) - 22, sy(L0));
    ctx.lineTo(sx(ox + w) + 22, sy(L0));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // arrow showing the swipe
  const k = preview ? 1 : (now / 900) % 1;
  const along = (show.axis === 'v' ? oy + h / 2 : ox + w / 2);
  const a0 = L0 - show.dir * 0.9;
  const a1 = a0 + show.dir * 1.8 * easeInOut(k);
  const P = (u: number) => (show.axis === 'v' ? [sx(u), sy(along)] : [sx(along), sy(u)]);
  const [x0, y0] = P(a0);
  const [x1, y1] = P(a1);
  ctx.strokeStyle = 'rgba(59,53,48,0.75)';
  ctx.fillStyle = 'rgba(59,53,48,0.75)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const ang = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1 + Math.cos(ang) * 10, y1 + Math.sin(ang) * 10);
  ctx.lineTo(x1 + Math.cos(ang + 2.4) * 12, y1 + Math.sin(ang + 2.4) * 12);
  ctx.lineTo(x1 + Math.cos(ang - 2.4) * 12, y1 + Math.sin(ang - 2.4) * 12);
  ctx.fill();
}

function drawFlap(a: FoldAnim, p: number) {
  const th = Math.PI * easeInOut(p);
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const L0 = lineOf(a.m, a.ox, a.oy);
  const cs = cam.cs;
  const flap = a.prev.filter((c) => moving(c, a.m));
  // shadow the flap casts while lifted
  ctx.fillStyle = `rgba(90,70,40,${0.16 * sin})`;
  for (const c of flap) {
    const u0 = (a.m.axis === 'v' ? a.ox + c.x : a.oy + c.y) - L0;
    const lo = L0 + Math.min(u0 * cos, (u0 + 1) * cos);
    const len = Math.abs(cos) * 1;
    if (a.m.axis === 'v') ctx.fillRect(sx(lo) + cs * 0.12 * sin, sy(a.oy + c.y) + cs * 0.18 * sin, len * cs, cs);
    else ctx.fillRect(sx(a.ox + c.x) + cs * 0.12 * sin, sy(lo) + cs * 0.18 * sin, cs, len * cs);
  }
  const lift = 1 + 0.07 * sin;
  for (const c of flap) {
    const u0 = (a.m.axis === 'v' ? a.ox + c.x : a.oy + c.y) - L0;
    const e0 = L0 + u0 * cos;
    const e1 = L0 + (u0 + 1) * cos;
    const lo = Math.min(e0, e1);
    const len = Math.abs(e1 - e0);
    const color = th < Math.PI / 2 ? topColor(c) : underColor(c);
    const shade = th < Math.PI / 2 ? -0.28 * sin : 0.12 * sin - 0.08 * sin;
    if (a.m.axis === 'v') {
      const cy = sy(a.oy + c.y + 0.5);
      paper(ctx, sx(lo), cy - (cs * lift) / 2, len * cs, cs * lift, color, shade, c.x * 7 + c.y * 13);
    } else {
      const cx = sx(a.ox + c.x + 0.5);
      paper(ctx, cx - (cs * lift) / 2, sy(lo), cs * lift, len * cs, color, shade, c.x * 7 + c.y * 13);
    }
  }
}

let frozenAt: number | null = null; // screenshot hook: pins the animation clock

function frame(now: number) {
  if (frozenAt !== null) now = frozenAt;
  const goal = camGoal();
  if (!camReady) {
    Object.assign(cam, goal);
    camReady = true;
  } else {
    cam.x += (goal.x - cam.x) * 0.12;
    cam.y += (goal.y - cam.y) * 0.12;
    cam.cs += (goal.cs - cam.cs) * 0.12;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const cs = cam.cs;

  if (anim) {
    const p = (now - anim.t0) / anim.dur;
    const a = anim;
    drawSheetCells(ctx, a.prev, (x) => sx(a.ox + x), (y) => sy(a.oy + y), cs, (c) => moving(c, a.m));
    drawFlap(a, Math.min(1, p));
    if (p >= 1 && !a.landed) {
      a.landed = true;
      anim = null;
      landed();
    }
  }
  if (!anim) {
    drawSheetCells(ctx, S.sheet, (x) => sx(S.ox + x), (y) => sy(S.oy + y), cs);
    if (!winPending) {
      if (hint && now > hint.until) hint = null;
      if (!hint && S.level === 1 && !meta.covering) {
        const next = L.solution[S.moves.length];
        if (next && onPath()) hint = { m: next, until: Infinity };
      }
      drawFoldLines(S.sheet, S.ox, S.oy, now);
    }
  }

  bits = bits.filter((b) => now - b.t0 < b.life);
  for (const b of bits) {
    const tt = Math.max(0, (now - b.t0) / 1000);
    ctx.save();
    ctx.translate(b.x + b.vx * tt, b.y + b.vy * tt + 500 * tt * tt);
    ctx.rotate(b.spin * tt);
    ctx.globalAlpha = Math.min(1, (1 - (now - b.t0) / b.life) * 1.5);
    paper(ctx, -b.size / 2, -b.size / 2, b.size, b.size * 0.7, b.c);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(frame);
}

// ───────────────────────── game flow ─────────────────────────
const sameMove = (a: Move, b: Move) => a.axis === b.axis && a.at === b.at && a.dir === b.dir;
const onPath = () => S.moves.every((m, i) => L.solution[i] && sameMove(m, L.solution[i]));
const busy = () => !!anim || winPending || meta.covering;

function doFold(m: Move) {
  if (busy()) return;
  const res = fold(S.sheet, m);
  anim = { m, prev: S.sheet, ox: S.ox, oy: S.oy, t0: performance.now(), dur: 460, landed: false };
  S.history.push({ sheet: S.sheet, ox: S.ox, oy: S.oy });
  S.sheet = res.sheet;
  S.ox += res.dx;
  S.oy += res.dy;
  S.moves.push(m);
  S.folds++;
  hint = null;
  preview = null;
  profile.progress('folds');
  save();
  refreshHud();
  haptic.light();
  tone({ freq: 420, to: 260, duration: 0.22, type: 'triangle', volume: 0.22 });
  track('fold', { level: S.level, folds: S.folds });
}

function landed() {
  tone({ freq: 180, to: 140, duration: 0.08, type: 'sine', volume: 0.3 });
  haptic.medium();
  if (visibleKey(S.sheet) === targetKey) return win();
  if (deadEnd(S.sheet, L.target)) {
    toast(t('deadEnd'), 3000);
    haptic.error();
    $('undo-btn').classList.remove('pulse');
    void $('undo-btn').offsetWidth;
    $('undo-btn').classList.add('pulse');
    track('stuck', { level: S.level, folds: S.folds });
  }
}

function confetti() {
  const now = performance.now();
  for (let i = 0; i < 70; i++) {
    bits.push({
      x: W * (0.2 + Math.random() * 0.6),
      y: H * 0.35,
      vx: (Math.random() - 0.5) * 520,
      vy: -Math.random() * 520 - 120,
      c: i % 4,
      t0: now + Math.random() * 150,
      life: 1100 + Math.random() * 700,
      size: 9 + Math.random() * 7,
      spin: (Math.random() - 0.5) * 12,
    });
  }
}

function win() {
  winPending = true;
  const level = S.level;
  const stars = starsFor(S.folds, L.par);
  confetti();
  haptic.success();
  track('level_complete', { level, folds: S.folds, par: L.par, stars, hints_used: S.hintsUsed, duration_s: Math.round((Date.now() - startedAt) / 1000) });
  store.set('play', null);
  if (profile.data.firstRun) profile.finishFirstRun();
  setTimeout(() => {
    meta.showWin({
      level,
      stars,
      coins: 10 + stars * 5,
      onNext: () => {
        if (level < LEVEL_COUNT) startLevel(level + 1);
        else {
          toast(t('last'));
          meta.showHome();
        }
      },
    });
    maybeRequestReview(level, stars === 3 && level >= 5);
  }, 750);
}

function startLevel(n: number, resume?: Play) {
  n = Math.max(1, Math.min(LEVEL_COUNT, n));
  L = getLevel(n);
  targetKey = visibleKey(L.target);
  S = resume && resume.level === n ? resume : fresh(n);
  winPending = false;
  anim = null;
  hint = null;
  preview = null;
  camReady = false;
  startedAt = Date.now();
  $('toast').hidden = true;
  meta.hideHome();
  layout();
  refreshHud();
  save();
  track('level_start', { level: n, par: L.par, resumed: !!resume });
}

function restart() {
  if (anim || winPending) return;
  track('level_restart', { level: S.level, folds: S.folds });
  const keep = { folds: S.folds, hintsUsed: S.hintsUsed };
  startLevel(S.level);
  // restarting rewinds the sheet, not the fold count (stars stay honest)
  S.folds = keep.folds;
  S.hintsUsed = keep.hintsUsed;
  refreshHud();
  save();
}

function undo() {
  if (anim || winPending) return;
  const prev = S.history.pop();
  if (!prev) return toast(t('noUndo'));
  S.sheet = prev.sheet;
  S.ox = prev.ox;
  S.oy = prev.oy;
  S.moves.pop();
  hint = null;
  $('toast').hidden = true;
  save();
  refreshHud();
  haptic.light();
  tone({ freq: 500, to: 380, duration: 0.1, type: 'triangle', volume: 0.25 });
  track('undo', { level: S.level });
}

async function useHint() {
  if (anim || winPending) return;
  let next: Move | undefined;
  if (onPath()) next = L.solution[S.moves.length];
  else if (!deadEnd(S.sheet, L.target)) next = solve(S.sheet, L.target, 6, 60_000)?.path[0];
  if (!next) {
    toast(t('offTrack'), 3000);
    $('undo-btn').classList.add('pulse');
    return;
  }
  // First hint in a level is free; more are behind a rewarded video.
  if (S.hintsUsed > 0 && !(await showRewarded('hint'))) return;
  S.hintsUsed++;
  save();
  refreshHud();
  hint = { m: next, until: performance.now() + 4500 };
  haptic.light();
  track('hint', { level: S.level });
}

// ───────────────────────── swipe input ─────────────────────────
function toGrid(px: number, py: number) {
  return { x: (px - W / 2) / cam.cs + cam.x - S.ox, y: (py - H / 2) / cam.cs + cam.y - S.oy };
}
function swipeMove(a: { x: number; y: number }, b: { x: number; y: number }): Move | null {
  const g0 = toGrid(a.x, a.y);
  const g1 = toGrid(b.x, b.y);
  const dx = g1.x - g0.x;
  const dy = g1.y - g0.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.35) return null;
  const { w, h } = dims(S.sheet);
  const v = Math.abs(dx) >= Math.abs(dy);
  const n = v ? w : h;
  if (n < 2) return null;
  const mid = v ? (g0.x + g1.x) / 2 : (g0.y + g1.y) / 2;
  const at = Math.max(1, Math.min(n - 1, Math.round(mid)));
  return { axis: v ? 'v' : 'h', at, dir: (v ? dx : dy) > 0 ? 1 : -1 };
}
/** Screen-space swipe (canvas CSS px) that performs `m` — used by e2e and screenshots. */
function swipeFor(m: Move) {
  const { w, h } = dims(S.sheet);
  const L0 = lineOf(m, S.ox, S.oy);
  const along = m.axis === 'v' ? S.oy + h / 2 : S.ox + w / 2;
  const a = L0 - m.dir * 0.8;
  const b = L0 + m.dir * 0.8;
  return m.axis === 'v' ? { x0: sx(a), y0: sy(along), x1: sx(b), y1: sy(along) } : { x0: sx(along), y0: sy(a), x1: sx(along), y1: sy(b) };
}

let down: { x: number; y: number; id: number } | null = null;
const local = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (busy()) return;
  down = { ...local(e), id: e.pointerId };
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!down || down.id !== e.pointerId || busy()) return;
  const m = swipeMove(down, local(e));
  if ((m && !preview) || (m && preview && !sameMove(m, preview))) haptic.light();
  preview = m;
});
const end = (e: PointerEvent) => {
  if (!down || down.id !== e.pointerId) return;
  const m = swipeMove(down, local(e));
  down = null;
  preview = null;
  if (m) doFold(m);
};
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', () => {
  down = null;
  preview = null;
});

// ───────────────────────── buttons ─────────────────────────
function pause() {
  if (winPending) return;
  meta.showPause({ onResume: () => {}, onRestart: restart, onMenu: save });
}
$('pause-btn').addEventListener('click', () => {
  unlockAudio();
  pause();
});
$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  restart();
});
$('undo-btn').addEventListener('click', () => {
  unlockAudio();
  $('undo-btn').classList.remove('pulse');
  undo();
});
$('hint-btn').addEventListener('click', () => {
  unlockAudio();
  void useHint();
});

// ───────────────────────── boot ─────────────────────────
trackSession('katla');
applySkin(profile.data.skin);
layout();
const saved = store.get<Play | null>('play', null);
if (saved && saved.level >= 1 && saved.level <= LEVEL_COUNT) {
  L = getLevel(saved.level);
  S = saved;
  targetKey = visibleKey(L.target);
}
meta.showHome();
refreshHud();
drawTarget();
void initAds();
void initStore();
void setupNative({
  darkBackground: false,
  onPause: save,
  onBack: () => {
    if (meta.back()) return true;
    if (meta.covering) return false; // on the home screen: let Android minimize
    pause();
    return true;
  },
});
requestAnimationFrame(frame);

// Exposed for e2e/screenshot scripts.
(window as unknown as { __katla: unknown }).__katla = {
  get state() {
    return S;
  },
  get level() {
    return L;
  },
  busy,
  swipeFor,
  fold: doFold,
  goto: (n: number) => startLevel(n),
  freeze: (ms: number | null) => (frozenAt = ms === null ? null : anim ? anim.t0 + ms : null),
};
