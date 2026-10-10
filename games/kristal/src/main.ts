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
import { cellCopies, cellCount, generateLevel, press, pressMask, solve, stars, type Level } from './game';
import { t } from './i18n';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/kristal/PRIVACY.md';
declare const __APP_VERSION__: string;

// ───────────────────────── persistence ─────────────────────────
interface Save {
  level: number;
  state: number; // wedge bitmask
  history: number[]; // previous states; taps = history.length
  hintsUsed: number;
}

const store = createStore('kristal');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const fresh = (level: number): Save => ({ level, state: 0, history: [], hintsUsed: 0 });
let S: Save = store.get<Save | null>('save', null) ?? fresh(1);
let lv: Level = generateLevel(S.level);
let levelStartedAt = Date.now();
const save = () => store.set('save', S);
const taps = () => S.history.length;

trackSession('kristal');
track('level_start', { level: S.level, par: lv.par, resumed: taps() > 0 });

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;

document.documentElement.lang = navigator.language.slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
});
$('version').textContent = `v${__APP_VERSION__}`;

let toastTimer = 0;
function toast(text: string, ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

const starHtml = (n: number) => '★'.repeat(n) + `<i>${'★'.repeat(3 - n)}</i>`;
function refreshHud() {
  $('level').textContent = String(S.level);
  $('stars').innerHTML = starHtml(stars(taps(), lv.par));
  $('taps').textContent = t('tapsShort', { n: taps(), p: lv.par });
  const badge = $('hint-badge');
  badge.textContent = S.hintsUsed === 0 ? '1' : 'AD';
  badge.classList.toggle('ad', S.hintsUsed > 0);
}

// ───────────────────────── layout ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
let sp = 40; // lattice spacing
let R = 20; // hex radius
let cx = 0;
let cy = 0;
let pv = 100; // target preview size
let pos: { x: number; y: number }[][] = []; // pos[class][copy]

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const n = lv.n;
  pv = Math.min(W * 0.27, 112);
  const top = pv + 14;
  sp = Math.min((W - 28) / (2 * (0.866 * n + 0.8)), (H - top - 12) / (2 * (n + 0.62)));
  R = (sp / Math.sqrt(3)) * 0.93;
  cx = W / 2;
  cy = top + (H - top) / 2;
  pos = Array.from({ length: cellCount(n) }, (_, i) => cellCopies(i, n).map((p) => ({ x: cx + p.x * sp, y: cy + p.y * sp })));
  canvas.dataset.layout = JSON.stringify(pos.map((c) => [c[0].x, c[0].y]));
}
window.addEventListener('resize', layout);
layout();

// ───────────────────────── animation state ─────────────────────────
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
interface Ripple { x: number; y: number; t0: number; big: boolean }
let ripples: Ripple[] = [];
const flipAt = new Map<number, number>();
let hint: { cell: number; until: number } | null = null;
let showOutline = false;
let winAt: number | null = null;
let shownAt = 0;
let nextSave: Save | null = null;
let frozenAt: number | null = null; // screenshot hook: pins the animation clock

interface Flake { x: number; y: number; r: number; vy: number; ph: number }
const snow: Flake[] = Array.from({ length: 46 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: 0.6 + Math.random() * 1.8,
  vy: 0.012 + Math.random() * 0.03,
  ph: Math.random() * 6.28,
}));

// ───────────────────────── drawing ─────────────────────────
function hexPath(x: number, y: number, r: number) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function drawCell(x: number, y: number, r: number, on: boolean, pop: number) {
  if (!on) {
    hexPath(x, y, r);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,215,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    return;
  }
  const rr = r * (0.82 + 0.18 * pop);
  ctx.save();
  ctx.shadowColor = 'rgba(170,205,255,0.85)';
  ctx.shadowBlur = r * 0.7;
  hexPath(x, y, rr);
  const g = ctx.createLinearGradient(x - rr, y - rr, x + rr, y + rr);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#d6e6ff');
  g.addColorStop(1, '#b6b0f5');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // crystalline facets
  ctx.strokeStyle = 'rgba(120,130,210,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    ctx.moveTo(x + Math.cos(a) * rr * 0.86, y + Math.sin(a) * rr * 0.86);
    ctx.lineTo(x - Math.cos(a) * rr * 0.86, y - Math.sin(a) * rr * 0.86);
  }
  ctx.stroke();
}

function drawSparkle(x: number, y: number, s: number, a: number) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
  ctx.restore();
}

function drawPreview() {
  const x0 = W - pv - 12;
  const y0 = 6;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.roundRect(x0, y0, pv, pv, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(214,224,255,0.7)';
  ctx.font = '800 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(t('target').toUpperCase(), x0 + 10, y0 + 8);
  const n = lv.n;
  const s = (pv * 0.4) / (n + 0.6);
  const pcx = x0 + pv / 2;
  const pcy = y0 + pv / 2 + 6;
  hexPath(pcx, pcy, (s / Math.sqrt(3)) * 0.9);
  ctx.fillStyle = '#cbbcff';
  ctx.fill();
  for (let i = 0; i < cellCount(n); i++) {
    const on = (lv.target >> i) & 1;
    for (const p of cellCopies(i, n)) {
      hexPath(pcx + p.x * s, pcy + p.y * s, (s / Math.sqrt(3)) * 0.9);
      ctx.fillStyle = on ? '#eef4ff' : 'rgba(255,255,255,0.08)';
      ctx.fill();
    }
  }
}

function drawHand(x: number, y: number, now: number) {
  const bob = Math.sin(now / 220) * 6;
  ctx.font = `${Math.round(Math.max(30, R * 1.4))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('👆', x + 6, y + R * 0.4 + bob);
}

let last = 0;
function frame(now: number) {
  if (frozenAt !== null) now = frozenAt;
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // gentle snowfall
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const f of snow) {
    f.y += f.vy * dt;
    if (f.y > 1.02) {
      f.y = -0.02;
      f.x = Math.random();
    }
    const x = f.x * W + Math.sin(now / 1800 + f.ph) * 10;
    ctx.globalAlpha = 0.25 + f.r * 0.15;
    ctx.beginPath();
    ctx.arc(x, f.y * H, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawPreview();

  // flake transform: fade in on new level, rotate and fall on win
  ctx.save();
  let alpha = ease((now - shownAt) / 450);
  if (winAt !== null) {
    const e = now - winAt;
    const fall = Math.max(0, e - 700) / 1600;
    ctx.translate(cx, cy + fall * fall * H * 1.1);
    ctx.rotate((e / 1000) * 0.5 + fall * fall * 1.5);
    ctx.translate(-cx, -cy);
    alpha = 1 - Math.max(0, fall - 0.6) / 0.4;
  }
  ctx.globalAlpha = Math.max(0, alpha);

  // centre ornament
  hexPath(cx, cy, R * 0.9);
  ctx.fillStyle = '#cbbcff';
  ctx.fill();

  for (let i = 0; i < pos.length; i++) {
    const on = ((S.state >> i) & 1) === 1;
    const ft = flipAt.get(i);
    const pop = ft === undefined ? 1 : ease((now - ft) / 220);
    for (const p of pos[i]) drawCell(p.x, p.y, R, on, pop);
  }
  if (showOutline && winAt === null) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(222,200,255,0.9)';
    ctx.lineWidth = 2;
    for (let i = 0; i < pos.length; i++) {
      if (!((lv.target >> i) & 1)) continue;
      for (const p of pos[i]) {
        hexPath(p.x, p.y, R * 0.98);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }
  if (winAt !== null) {
    for (let i = 0; i < pos.length; i++) {
      if (!((S.state >> i) & 1)) continue;
      pos[i].forEach((p, k) => {
        const a = Math.max(0, Math.sin((now - winAt!) / 260 + i * 1.7 + k * 2.3));
        drawSparkle(p.x + R * 0.3, p.y - R * 0.3, R * 0.55 * a, a);
      });
    }
  }
  ctx.restore();

  // ripples
  ripples = ripples.filter((r) => now - r.t0 < 480);
  for (const r of ripples) {
    const k = (now - r.t0) / 480;
    ctx.strokeStyle = `rgba(210,225,255,${(1 - k) * (r.big ? 0.8 : 0.45)})`;
    ctx.lineWidth = r.big ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, R * (0.6 + k * (r.big ? 1.2 : 0.7)), 0, Math.PI * 2);
    ctx.stroke();
  }

  // hint / tutorial
  if (winAt === null) {
    if (S.level === 1 && !hint) {
      const sol = solve(S.state, lv.target, lv);
      if (sol && sol.length) hint = { cell: sol[0], until: Infinity };
    }
    if (hint) {
      if (now > hint.until) hint = null;
      else {
        const pulse = 0.5 + 0.5 * Math.sin(now / 180);
        ctx.strokeStyle = `rgba(255,231,163,${0.45 + 0.5 * pulse})`;
        ctx.lineWidth = 3;
        for (const p of pos[hint.cell]) {
          hexPath(p.x, p.y, R * (1.12 + 0.08 * pulse));
          ctx.stroke();
        }
        if (S.level === 1) drawHand(pos[hint.cell][0].x, pos[hint.cell][0].y, now);
      }
    }
  }
  requestAnimationFrame(frame);
}

// ───────────────────────── game flow ─────────────────────────
function tapCell(i: number) {
  if (winAt !== null || i < 0 || i >= pos.length) return;
  const now = performance.now();
  const mask = pressMask(i, lv);
  S.history.push(S.state);
  S.state = press(S.state, i, lv);
  save();
  if (hint && hint.cell === i) hint = null;
  for (let c = 0; c < pos.length; c++) {
    if (!((mask >> c) & 1)) continue;
    flipAt.set(c, now);
    for (const p of pos[c]) ripples.push({ x: p.x, y: p.y, t0: now, big: c === i });
  }
  const f = pentatonic(i % 10);
  tone({ freq: f, duration: 0.35, type: 'sine', volume: 0.32 });
  tone({ freq: f * 2.01, duration: 0.22, type: 'sine', volume: 0.1 });
  haptic.light();
  refreshHud();
  if (S.state === lv.target) win();
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  let best = -1;
  let bestD = R * 1.05;
  pos.forEach((copies, i) =>
    copies.forEach((p) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    }),
  );
  if (best >= 0) tapCell(best);
});

function win() {
  winAt = performance.now();
  hint = null;
  const st = stars(taps(), lv.par);
  [0, 2, 4, 7].forEach((s, k) => tone({ freq: pentatonic(s), duration: 0.9, volume: 0.28, delay: k * 0.07 }));
  tone({ freq: pentatonic(9), duration: 1.2, volume: 0.2, delay: 0.35 });
  haptic.success();
  track('level_complete', {
    level: S.level,
    taps: taps(),
    par: lv.par,
    stars: st,
    hints: S.hintsUsed,
    duration_s: Math.round((Date.now() - levelStartedAt) / 1000),
  });
  const completed = S.level;
  const best = store.get<Record<number, number>>('stars', {});
  best[completed] = Math.max(best[completed] ?? 0, st);
  store.set('stars', best);
  $('win-title').textContent = t('levelN', { n: completed });
  $('win-stars').innerHTML = starHtml(st);
  $('win-taps').textContent = t('taps', { n: taps(), p: lv.par });
  // Persist progress right away so quitting during the win animation never loses the level.
  nextSave = fresh(completed + 1);
  store.set('save', nextSave);
  setTimeout(() => ($('win').hidden = false), 1700);
  maybeRequestReview(completed, completed >= 8);
}

function startLevel(state: Save, isNew = true) {
  S = state;
  lv = generateLevel(S.level);
  save();
  winAt = null;
  hint = null;
  ripples = [];
  flipAt.clear();
  shownAt = performance.now();
  levelStartedAt = Date.now();
  layout();
  refreshHud();
  $('toast').hidden = true;
  if (isNew) track('level_start', { level: S.level, par: lv.par, resumed: false });
  if (S.level === 1) toast(t('tutorial'), 4000);
  if (S.level === 15) toast(t('neighbours'), 4000);
  if (S.level === 40) toast(t('mirror'), 4000);
}

$('next-btn').addEventListener('click', async () => {
  $('win').hidden = true;
  haptic.medium();
  const completed = S.level;
  startLevel(nextSave ?? fresh(S.level + 1));
  nextSave = null;
  if (completed >= 5) await interstitialMoment('next_level');
});

$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  if (winAt !== null) return;
  track('restart', { level: S.level, taps: taps() });
  startLevel(fresh(S.level), false);
  haptic.light();
});

$('undo-btn').addEventListener('click', () => {
  unlockAudio();
  if (winAt !== null) return;
  if (!S.history.length) return toast(t('noUndo'));
  const prev = S.history.pop()!;
  const now = performance.now();
  for (let c = 0; c < pos.length; c++) if (((prev ^ S.state) >> c) & 1) flipAt.set(c, now);
  S.state = prev;
  save();
  refreshHud();
  haptic.light();
  tone({ freq: 660, to: 520, duration: 0.14, type: 'sine', volume: 0.22 });
});

$('hint-btn').addEventListener('click', async () => {
  unlockAudio();
  if (winAt !== null) return;
  // First hint in a level is free; more are behind a rewarded ad.
  if (S.hintsUsed > 0 && !(await showRewarded('hint'))) return;
  const sol = solve(S.state, lv.target, lv);
  if (!sol || !sol.length) return;
  S.hintsUsed++;
  save();
  refreshHud();
  hint = { cell: sol[0], until: performance.now() + 4000 };
  haptic.light();
  track('hint', { level: S.level, hints: S.hintsUsed });
});

$('outline-btn').addEventListener('click', () => {
  showOutline = !showOutline;
  $('outline-btn').classList.toggle('on', showOutline);
  haptic.light();
});

// settings
const opts: [string, 'sound' | 'haptics'][] = [
  ['opt-sound', 'sound'],
  ['opt-haptics', 'haptics'],
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
if (S.level === 1 && taps() === 0) toast(t('tutorial'), 4000);
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
(window as unknown as { __kristal: unknown }).__kristal = {
  get state() { return S; },
  get level() { return lv; },
  solve: () => solve(S.state, lv.target, lv),
  tap: tapCell,
  busy: () => winAt !== null,
  goto: (level: number) => startLevel(fresh(level)),
  load: (s: Save) => startLevel(s),
  outline: (on: boolean) => { showOutline = on; $('outline-btn').classList.toggle('on', on); },
  hint: (cell: number) => (hint = { cell, until: Infinity }),
  freeze: (at: number | null) => (frozenAt = at),
  win: () => win(),
};
