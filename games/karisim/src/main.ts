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
  ALMOST,
  LEVEL_COUNT,
  MAX_DROPS,
  PIGMENTS,
  closeness,
  generateLevel,
  hexToOklab,
  hexToRgb,
  hintDrop,
  isMatch,
  mix,
  oklabToRgb,
  solution,
  stars,
  type Lab,
  type Level,
} from './game';
import { t, type Key } from './i18n';
import { SKINS, skinById, type Skin } from './skins';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/karisim/PRIVACY.md';
declare const __APP_VERSION__: string;
type RGB = [number, number, number];
/** Coins for a hint after the free one in each level. */
const HINT_PRICE = 40;
const COIN_SVG =
  '<svg class="coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffc83d" stroke="#b57d10" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#e0a21c" stroke-width="1.6"/></svg>';

// ───────────────────────── persistence ─────────────────────────
interface Save {
  level: number;
  /** Tube index of every drop currently in the bowl, in order. */
  seq: number[];
  /** Every drop ever added this level (undo does not refund). */
  used: number;
  hints: number;
  startedAt: number;
}

const store = createStore('karisim');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const fresh = (level: number, hints = 0): Save => ({ level, seq: [], used: 0, hints, startedAt: Date.now() });
let S: Save = store.get<Save | null>('save', null) ?? fresh(1);
if (!(S.level >= 1 && S.level <= LEVEL_COUNT) || !Array.isArray(S.seq)) S = fresh(1);
let L: Level = generateLevel(S.level);
let labs: Lab[] = L.tubes.map((p) => hexToOklab(PIGMENTS[p].hex));
if (S.seq.some((i) => !(i >= 0 && i < L.tubes.length))) S = fresh(S.level);
let winPending = false;
// Never persist a finished board: after a win the next level is already saved.
const save = () => !winPending && store.set('save', S);

trackSession('karisim');

const counts = () => {
  const c = L.tubes.map(() => 0);
  S.seq.forEach((i) => c[i]++);
  return c;
};
const mixLab = () => mix(counts(), labs);
const solved = () => isMatch(mixLab(), L.target, L.tol);
const toRgb = (lab: Lab | null): RGB | null => (lab ? oklabToRgb(lab) : null);
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
// A bowl that already matches (app killed mid-win) restarts that level cleanly.
if (S.seq.length && solved()) S = fresh(S.level);

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;

document.documentElement.lang = navigator.language.slice(0, 2) === 'tr' ? 'tr' : 'en';
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Key);
});

let toastTimer = 0;
function toast(text: string, ms = 2400) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

function tubeSvg(hex: string) {
  return `<svg viewBox="0 0 44 84" aria-hidden="true">
    <rect x="16" y="1" width="12" height="11" rx="2.5" fill="#2a2e36"/>
    <rect x="14" y="11" width="16" height="6" rx="1.5" fill="#c9ced6"/>
    <path d="M8 22 Q8 17 13 17 H31 Q36 17 36 22 L39 72 H5 Z" fill="#f4f5f7" stroke="#d5d9df"/>
    <path d="M7.4 34 H36.6 L38 60 H6 Z" fill="${hex}" stroke="rgba(0,0,0,.08)"/>
    <path d="M11 22 L10 68" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
    <rect x="4" y="71" width="36" height="10" rx="2" fill="#d5d9df"/>
    <path d="M10 73v6M16 73v6M22 73v6M28 73v6M34 73v6" stroke="#bcc2ca" stroke-width="1.4"/>
  </svg>`;
}

function buildTubes() {
  const wrap = $('tubes');
  wrap.innerHTML = '';
  L.tubes.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'tube';
    b.dataset.i = String(i);
    b.innerHTML = `${tubeSvg(PIGMENTS[p].hex)}<span>${t(`pigment_${PIGMENTS[p].id}` as Key)}</span>`;
    b.addEventListener('click', () => {
      unlockAudio();
      addDrop(i);
    });
    wrap.appendChild(b);
  });
}

let wasAlmost = false;
function refreshHud() {
  $('level').textContent = String(S.level);
  $('target').style.background = css(toRgb(L.target)!);
  const c = closeness(mixLab(), L.target, L.tol);
  const pct = Math.floor(c * 100);
  const done = c === 1;
  const almost = !done && c >= ALMOST;
  $('pct').textContent = `${pct}%`;
  const label = $('bowl-pct');
  label.classList.toggle('done', done);
  label.classList.toggle('near', almost);
  $('almost').hidden = !almost;
  if (almost && !wasAlmost) haptic.light();
  wasAlmost = almost;
  const fill = $('meter-fill');
  fill.style.width = `${pct}%`;
  fill.classList.toggle('done', done);
  fill.classList.toggle('near', almost);
  $('drops').textContent = t('drops', { n: S.used });
  $('par').textContent = t('par', { n: L.par });
  const badge = $('hint-badge');
  badge.innerHTML = S.hints === 0 ? t('free') : `${COIN_SVG}${HINT_PRICE}`;
  badge.classList.toggle('free', S.hints === 0);
  placeHand();
}

function placeHand() {
  const hand = $('hand');
  const show = S.level === 1 && !winPending && !solved() && !meta.covering;
  hand.hidden = !show;
  if (!show) return;
  const i = hintDrop(counts(), L.recipe);
  const el = document.querySelector<HTMLElement>(`.tube[data-i="${i}"]`);
  if (!el) return (hand.hidden = true);
  const r = el.getBoundingClientRect();
  hand.style.left = `${r.left + r.width / 2 - 14}px`;
  hand.style.top = `${r.top + r.height * 0.45}px`;
}

// ───────────────────────── skin (bowl + studio) ─────────────────────────
let skin: Skin = SKINS[0];
function applySkin(id: string) {
  skin = skinById(id);
  const root = document.documentElement.style;
  root.setProperty('--bg-top', skin.bg[0]);
  root.setProperty('--bg-bottom', skin.bg[1]);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', skin.bg[0]);
}

// ───────────────────────── canvas ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const { cy, R } = geometry();
  // The match % sits right under the bowl, where the eye already is.
  $('bowl-pct').style.top = `${Math.min(H - 46, cy + R * 0.86)}px`;
  placeHand();
}
window.addEventListener('resize', layout);

const EMPTY: RGB = [236, 238, 242];
let shown: RGB | null = toRgb(mixLab()); // colour currently painted in the bowl
interface Swirl { from: RGB | null; to: RGB | null; ink: RGB | null; t0: number }
let swirl: Swirl | null = null;
interface Drop { tube: number; color: RGB; after: RGB | null; t0: number; x: number }
let drops: Drop[] = [];
interface Splash { x: number; y: number; vx: number; vy: number; color: RGB; t0: number; r: number }
let splashes: Splash[] = [];
let winShown = false;
let frozenAt: number | null = null; // screenshot hook

const FALL = 480;
const SWIRL = 900;
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const lerp = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

function geometry() {
  const R = Math.min(W * 0.42, H * 0.47, 200);
  const cx = W / 2;
  const cy = H * 0.43;
  return { R, cx, cy, rx: R * 0.86, ry: R * 0.26 };
}

function startSwirl(to: RGB | null, ink: RGB | null, now: number) {
  swirl = { from: currentColor(now), to, ink, t0: now };
}

function currentColor(now: number): RGB | null {
  if (!swirl) return shown;
  const k = ease((now - swirl.t0) / SWIRL);
  const a = swirl.from ?? EMPTY;
  const b = swirl.to ?? EMPTY;
  return lerp(a, b, k);
}

function drawDropShape(x: number, y: number, s: number, color: RGB) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.5);
  ctx.bezierCurveTo(s * 0.5, -s * 0.7, s, -s * 0.2, s, s * 0.25);
  ctx.arc(0, s * 0.25, s, 0, Math.PI);
  ctx.bezierCurveTo(-s, -s * 0.2, -s * 0.5, -s * 0.7, 0, -s * 1.5);
  const g = ctx.createRadialGradient(-s * 0.35, -s * 0.1, s * 0.1, 0, s * 0.2, s * 1.3);
  g.addColorStop(0, css(lerp(color, [255, 255, 255], 0.35)));
  g.addColorStop(0.6, css(color));
  g.addColorStop(1, css(lerp(color, [0, 0, 0], 0.25)));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.38, -s * 0.05, s * 0.16, s * 0.3, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function bowlPath(cx: number, cy: number, R: number) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, R, R * 0.3, 0, Math.PI, 0, true);
  ctx.bezierCurveTo(cx + R, cy + R * 0.55, cx + R * 0.55, cy + R * 0.76, cx, cy + R * 0.76);
  ctx.bezierCurveTo(cx - R * 0.55, cy + R * 0.76, cx - R, cy + R * 0.55, cx - R, cy);
}

/** Skin decoration on the bowl body (clipped to it). */
function drawPattern(cx: number, cy: number, R: number) {
  if (skin.pattern === 'none') return;
  ctx.save();
  bowlPath(cx, cy, R);
  ctx.clip();
  ctx.lineCap = 'round';
  if (skin.pattern === 'band') {
    ctx.strokeStyle = skin.ink;
    ctx.lineWidth = R * 0.08;
    ctx.beginPath();
    ctx.ellipse(cx, cy + R * 0.2, R * 0.98, R * 0.3, 0, 0.05, Math.PI - 0.05);
    ctx.stroke();
    ctx.lineWidth = R * 0.025;
    ctx.beginPath();
    ctx.ellipse(cx, cy + R * 0.33, R * 0.92, R * 0.3, 0, 0.1, Math.PI - 0.1);
    ctx.stroke();
  } else if (skin.pattern === 'grain') {
    ctx.strokeStyle = skin.ink;
    for (let i = 0; i < 7; i++) {
      ctx.globalAlpha = 0.18 + (i % 3) * 0.06;
      ctx.lineWidth = R * (0.012 + (i % 2) * 0.01);
      const y = cy + R * (0.1 + i * 0.09);
      ctx.beginPath();
      ctx.moveTo(cx - R, y);
      ctx.bezierCurveTo(cx - R * 0.4, y + R * 0.06 * Math.sin(i), cx + R * 0.3, y - R * 0.05, cx + R, y + R * 0.03 * Math.cos(i * 2));
      ctx.stroke();
    }
  } else if (skin.pattern === 'veins') {
    ctx.strokeStyle = skin.ink;
    const veins = [
      [-0.9, 0.1, -0.3, 0.35, 0.2, 0.3, 0.7, 0.62],
      [-0.6, 0.55, -0.2, 0.45, 0.1, 0.7, 0.4, 0.66],
      [0.2, 0.08, 0.45, 0.3, 0.55, 0.2, 0.95, 0.4],
    ];
    veins.forEach((v, i) => {
      ctx.globalAlpha = 0.35 - i * 0.07;
      ctx.lineWidth = R * (0.014 - i * 0.003);
      ctx.beginPath();
      ctx.moveTo(cx + v[0] * R, cy + v[1] * R);
      ctx.bezierCurveTo(cx + v[2] * R, cy + v[3] * R, cx + v[4] * R, cy + v[5] * R, cx + v[6] * R, cy + v[7] * R);
      ctx.stroke();
    });
  } else if (skin.pattern === 'glass' || skin.pattern === 'metal') {
    const g = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    g.addColorStop(0.15, 'rgba(255,255,255,0)');
    g.addColorStop(0.28, skin.pattern === 'metal' ? 'rgba(255,241,226,0.75)' : 'rgba(255,255,255,0.8)');
    g.addColorStop(0.36, 'rgba(255,255,255,0)');
    g.addColorStop(0.78, 'rgba(255,255,255,0)');
    g.addColorStop(0.84, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.88, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, cy - R * 0.3, R * 2, R * 1.1);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function frame(now: number) {
  if (frozenAt !== null) now = frozenAt;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const { R, cx, cy, rx, ry } = geometry();

  // soft floor shadow
  ctx.fillStyle = 'rgba(27,30,36,0.10)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + R * 0.8, R * 0.62, R * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  // bowl body in the equipped material
  bowlPath(cx, cy, R);
  const body = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
  body.addColorStop(0, skin.body[0]);
  body.addColorStop(0.55, skin.body[1]);
  body.addColorStop(1, skin.body[2]);
  ctx.fillStyle = body;
  ctx.fill();
  drawPattern(cx, cy, R);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(cx - R * 0.62, cy + R * 0.28, R * 0.06, R * 0.2, 0.5, 0, Math.PI * 2);
  ctx.fill();

  // rim + inner wall
  ctx.beginPath();
  ctx.ellipse(cx, cy, R, R * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = skin.rim;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = skin.rimLine;
  ctx.stroke();

  // paint surface
  const col = currentColor(now);
  if (swirl && now - swirl.t0 > SWIRL) {
    shown = swirl.to;
    swirl = null;
  }
  const sy = cy + R * 0.04;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, sy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  const base = col ?? EMPTY;
  const sg = ctx.createLinearGradient(0, sy - ry, 0, sy + ry);
  sg.addColorStop(0, css(lerp(base, [0, 0, 0], col ? 0.12 : 0.04)));
  sg.addColorStop(1, css(lerp(base, [255, 255, 255], col ? 0.08 : 0.3)));
  ctx.fillStyle = sg;
  ctx.fillRect(cx - rx, sy - ry, rx * 2, ry * 2);
  if (swirl?.ink) {
    // a ribbon of the new drop spiralling into the mix and fading
    const p = (now - swirl.t0) / SWIRL;
    ctx.strokeStyle = css(swirl.ink, 0.85 * (1 - p));
    ctx.lineWidth = R * 0.07 * (1 - p * 0.6);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 3.2; a += 0.12) {
      const rr = (a / (Math.PI * 3.2)) * (0.25 + p * 0.75);
      const ang = a + p * 5;
      const x = cx + Math.cos(ang) * rx * rr;
      const y = sy + Math.sin(ang) * ry * rr;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // glossy reflection
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.35, sy - ry * 0.45, rx * 0.32, ry * 0.18, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // falling drops
  drops = drops.filter((d) => {
    const k = (now - d.t0) / FALL;
    if (k >= 1) {
      land(d, now, sy);
      return false;
    }
    const y = -20 + (sy - -20) * k * k;
    const s = R * 0.12;
    drawDropShape(d.x + (cx - d.x) * k, y, s * (0.9 + 0.1 * k), d.color);
    return true;
  });
  if (winPending && !winShown && !drops.length) {
    winShown = true;
    setTimeout(win, 650);
  }

  // splash droplets and ripple
  splashes = splashes.filter((p) => now - p.t0 < 500);
  for (const p of splashes) {
    const tt = (now - p.t0) / 1000;
    const k = 1 - (now - p.t0) / 500;
    if (p.r < 0) {
      ctx.strokeStyle = css([255, 255, 255], 0.7 * k);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx * 0.5 * (1 - k) + 4, ry * 0.5 * (1 - k) + 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = css(p.color, Math.min(1, k * 1.5));
    ctx.beginPath();
    ctx.arc(p.x + p.vx * tt, p.y + p.vy * tt + 900 * tt * tt, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  requestAnimationFrame(frame);
}

function land(d: Drop, now: number, sy: number) {
  const { cx } = geometry();
  startSwirl(d.after, d.color, now);
  splashes.push({ x: cx, y: sy, vx: 0, vy: 0, color: d.color, t0: now, r: -1 });
  for (let i = 0; i < 7; i++) {
    splashes.push({ x: cx, y: sy, vx: (Math.random() - 0.5) * 220, vy: -120 - Math.random() * 160, color: d.color, t0: now, r: 2 + Math.random() * 3 });
  }
  const f = pentatonic(d.tube + 3, 660);
  tone({ freq: f, to: f * 0.55, duration: 0.11, type: 'sine', volume: 0.45 });
  tone({ freq: f * 1.5, duration: 0.05, type: 'sine', volume: 0.12, delay: 0.02 });
  haptic.light();
  refreshHud();
}

// ───────────────────────── actions ─────────────────────────
function addDrop(i: number) {
  if (winPending || meta.covering || !$('hint-sheet').hidden) return;
  if (S.seq.length >= MAX_DROPS) {
    haptic.error();
    return toast(t('full'));
  }
  S.seq.push(i);
  S.used++;
  save();
  profile.progress('drops');
  const el = document.querySelector<HTMLElement>(`.tube[data-i="${i}"]`);
  if (el) {
    el.classList.remove('squeeze');
    void el.offsetWidth;
    el.classList.add('squeeze');
  }
  const r = el?.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 - c.left : W / 2;
  drops.push({ tube: i, color: hexToRgb(PIGMENTS[L.tubes[i]].hex), after: toRgb(mixLab()), t0: performance.now(), x: W / 2 + (x - W / 2) * 0.5 });
  $('drops').textContent = t('drops', { n: S.used });
  if (solved()) winPending = true;
  placeHand();
}

function setBowl(seq: number[]) {
  S.seq = seq;
  save();
  drops = [];
  startSwirl(toRgb(mixLab()), null, performance.now());
  refreshHud();
}

function win() {
  const st = stars(S.used, L.par);
  const completed = S.level;
  [0, 2, 4, 7, 9].forEach((s, i) => tone({ freq: pentatonic(s, 523.25), duration: 0.24, volume: 0.4, delay: i * 0.08 }));
  track('level_complete', {
    level: completed,
    drops: S.used,
    par: L.par,
    stars: st,
    hints: S.hints,
    duration_s: Math.round((Date.now() - S.startedAt) / 1000),
  });
  // Persist progress right away so quitting on the win sheet never loses the level.
  if (completed < LEVEL_COUNT) store.set('save', fresh(completed + 1));
  if (S.hints === 0) profile.progress('matches');
  // From now on the home screen offers the daily reward on its own.
  if (profile.data.firstRun) profile.finishFirstRun();
  const streak = st === 3 ? store.get('streak', 0) + 1 : 0;
  store.set('streak', streak);
  meta.showWin({
    level: completed,
    stars: st,
    coins: 10 + st * 5,
    onNext: () => (completed < LEVEL_COUNT ? startLevel(fresh(completed + 1)) : meta.showHome()),
  });
  decorateWin(st);
  if (streak >= 3) maybeRequestReview(completed, true);
}

/** Adds the matched colour and the drop count to the kit's win sheet. */
function decorateWin(st: number) {
  const head = document.querySelector('.meta-root .m-result h2');
  if (!head) return;
  const sw = document.createElement('div');
  sw.className = 'win-swatch';
  sw.style.background = css(toRgb(L.target)!);
  const p = document.createElement('p');
  p.className = 'win-drops';
  p.textContent = t('winDrops', { n: S.used, p: L.par });
  if (st === 3) p.classList.add('par');
  head.after(sw, p);
}

function startLevel(state: Save) {
  meta.hideHome();
  S = state;
  L = generateLevel(S.level);
  labs = L.tubes.map((p) => hexToOklab(PIGMENTS[p].hex));
  winPending = false;
  winShown = false;
  wasAlmost = false;
  save();
  drops = [];
  splashes = [];
  swirl = null;
  shown = toRgb(mixLab());
  buildTubes();
  refreshHud();
  $('toast').hidden = true;
  if (S.level === 1 && !S.used) toast(t('tutorial'), 3500);
  track('level_start', { level: S.level, par: L.par, tubes: L.tubes.length, resumed: S.used > 0 });
}

/** From the home screen or the map: resume the bowl in progress, else start clean. */
function play(n: number) {
  unlockAudio();
  if (S.level === n && !winPending && !solved()) startLevel(S);
  else startLevel(fresh(n));
}

$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  if (winPending || !S.seq.length) return;
  track('restart', { level: S.level, drops: S.used });
  setBowl([]);
  haptic.medium();
  tone({ freq: 420, to: 220, duration: 0.22, type: 'sine', volume: 0.3 });
});

$('undo-btn').addEventListener('click', () => {
  unlockAudio();
  if (winPending) return;
  if (!S.seq.length) return toast(t('noUndo'));
  setBowl(S.seq.slice(0, -1));
  haptic.light();
  tone({ freq: 500, to: 380, duration: 0.1, type: 'triangle', volume: 0.3 });
  track('undo', { level: S.level });
});

// ───────────────────────── hints ─────────────────────────
function giveHint() {
  let i = hintDrop(counts(), L.recipe);
  if (i < 0) {
    setBowl([]);
    toast(t('decoy'));
    i = hintDrop(counts(), L.recipe);
  }
  S.hints++;
  track('hint', { level: S.level, n: S.hints });
  addDrop(i);
  refreshHud();
}

/** First hint per level is free; after that the player pays coins or watches a video. */
function openHintSheet() {
  const sheet = $('hint-sheet');
  const coins = $<HTMLButtonElement>('hint-coins');
  const enough = profile.data.coins >= HINT_PRICE;
  coins.disabled = !enough;
  coins.innerHTML = enough ? `${COIN_SVG} ${t('hintCoins', { n: HINT_PRICE })}` : t('notEnough', { n: profile.data.coins });
  const video = $<HTMLButtonElement>('hint-video');
  video.hidden = !rewardedAvailable();
  video.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9v6l5-3z" fill="currentColor"/></svg> ${t('hintVideo')}`;
  sheet.hidden = false;
}
const closeHintSheet = () => ($('hint-sheet').hidden = true);

$('hint-btn').addEventListener('click', () => {
  unlockAudio();
  if (winPending) return;
  if (S.hints === 0) return giveHint();
  openHintSheet();
});
$('hint-coins').addEventListener('click', () => {
  if (!profile.spend(HINT_PRICE)) return;
  closeHintSheet();
  track('hint_coins', { level: S.level });
  giveHint();
});
$('hint-video').addEventListener('click', async () => {
  const b = $<HTMLButtonElement>('hint-video');
  b.disabled = true;
  const ok = await showRewarded('hint');
  b.disabled = false;
  if (!ok) return;
  closeHintSheet();
  giveHint();
});
$('hint-cancel').addEventListener('click', closeHintSheet);
$('hint-sheet').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeHintSheet();
});

// ───────────────────────── meta (menu, map, missions, daily, shop) ─────────────────────────
const profile = createProfile({
  game: 'karisim',
  levelCount: LEVEL_COUNT,
  defaultSkin: SKINS[0].id,
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'drops', targets: [20, 40, 60], reward: (n) => 20 + Math.round(n / 2) },
    { id: 'matches', targets: [2, 3, 4], reward: (n) => 25 + n * 10 },
  ],
});

// v1.0 saved only `completed` + the bowl; carry that progress into the profile once.
if (!store.get('migrated', false)) {
  const completed = Math.min(LEVEL_COUNT, store.get('completed', 0));
  if (completed > 0 && profile.data.unlocked <= completed) {
    for (let i = 0; i < completed; i++) profile.data.stars[i] = Math.max(profile.data.stars[i], 3);
    profile.data.unlocked = Math.min(LEVEL_COUNT, Math.max(completed + 1, S.level));
    profile.data.firstRun = false;
    profile.save();
    track('progress_migrated', { completed });
  }
  store.set('migrated', true);
}
applySkin(profile.data.skin);

/** Home artwork: three paint drops falling into a bowl of the equipped material. */
function heroArt() {
  const el = document.createElement('div');
  el.className = 'hero';
  const paint = () => {
    const s = skin;
    el.innerHTML = `<svg viewBox="0 -30 240 240" aria-hidden="true">
      <defs>
        <linearGradient id="hb" x1="0" x2="1"><stop offset="0" stop-color="${s.body[0]}"/><stop offset=".55" stop-color="${s.body[1]}"/><stop offset="1" stop-color="${s.body[2]}"/></linearGradient>
        <clipPath id="hc"><path d="M30 120 A90 27 0 0 0 210 120 C210 170 170 190 120 190 C70 190 30 170 30 120Z"/></clipPath>
      </defs>
      <ellipse cx="120" cy="197" rx="62" ry="8" fill="rgba(0,0,0,.28)"/>
      <path d="M30 120 A90 27 0 0 0 210 120 C210 170 170 190 120 190 C70 190 30 170 30 120Z" fill="url(#hb)"/>
      <g clip-path="url(#hc)" fill="none" stroke="${s.ink}" stroke-linecap="round">${heroPattern(s)}</g>
      <ellipse cx="120" cy="120" rx="90" ry="27" fill="${s.rim}" stroke="${s.rimLine}" stroke-width="2"/>
      <ellipse class="hero-paint" cx="120" cy="124" rx="77" ry="21" fill="#8d6fc7"/>
      <ellipse class="hero-ripple" cx="120" cy="124" rx="30" ry="8" fill="none" stroke="#fff" stroke-width="2"/>
      <ellipse cx="92" cy="116" rx="24" ry="4" fill="rgba(255,255,255,.3)"/>
      ${['#00a6d6', '#d6247a', '#ffd21f']
        .map(
          (c, i) =>
            `<g class="hero-drop" style="animation-delay:${i * 0.8}s"><path d="M120 0 C127 11 134 18 134 26 A14 14 0 0 1 106 26 C106 18 113 11 120 0Z" fill="${c}"/><ellipse cx="114" cy="24" rx="2.6" ry="5" fill="rgba(255,255,255,.7)" transform="rotate(-20 114 24)"/></g>`,
        )
        .join('')}
    </svg>`;
  };
  paint();
  return { el, paint };
}
function heroPattern(s: Skin) {
  switch (s.pattern) {
    case 'band':
      return `<path d="M30 140 A90 27 0 0 0 210 140" stroke-width="7"/><path d="M34 154 A86 26 0 0 0 206 154" stroke-width="2"/>`;
    case 'grain':
      return [132, 145, 158, 171].map((y, i) => `<path d="M28 ${y} C80 ${y + 6} 150 ${y - 5} 212 ${y + 2}" stroke-width="${1.4 + (i % 2)}" opacity=".3"/>`).join('');
    case 'veins':
      return `<path d="M36 128 C70 150 110 140 170 182" stroke-width="1.6" opacity=".4"/><path d="M140 125 C160 140 175 132 208 150" stroke-width="1.2" opacity=".3"/>`;
    case 'glass':
    case 'metal':
      return `<path d="M62 130 L58 172" stroke="#fff" stroke-width="9" opacity=".55"/><path d="M186 132 L182 160" stroke="#fff" stroke-width="4" opacity=".3"/>`;
    default:
      return '';
  }
}

const hero = heroArt();
const meta = createMeta({
  title: t('title'),
  hero: hero.el,
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  levels: { count: LEVEL_COUNT, play },
  missionText: (id, n) => t(`mission_${id}` as Key, { n }),
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as Key), price: s.price, swatch: s.swatch })),
  onSkin: (id) => {
    applySkin(id);
    hero.paint();
  },
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});

function pause() {
  unlockAudio();
  closeHintSheet();
  meta.showPause({
    onResume: placeHand,
    onRestart: () => {
      track('restart', { level: S.level, drops: S.used, full: true });
      // Keep the hint count so restarting never re-arms the free hint.
      startLevel(fresh(S.level, S.hints));
    },
    onMenu: save,
  });
  placeHand();
}
$('settings-btn').addEventListener('click', () => {
  if (winPending) return;
  pause();
});

// ───────────────────────── boot ─────────────────────────
buildTubes();
layout();
refreshHud();
void initAds();
void initStore();
void setupNative({
  darkBackground: false,
  onPause: save,
  onBack: () => {
    if (!$('hint-sheet').hidden) {
      closeHintSheet();
      return true;
    }
    if (meta.back()) return true;
    if (!meta.covering && !winPending) {
      pause();
      return true;
    }
    return false;
  },
});
meta.showHome();
placeHand();
requestAnimationFrame(frame);
// Exposed for e2e/screenshot scripts.
(window as unknown as { __karisim: unknown }).__karisim = {
  get state() { return S; },
  get level() { return L; },
  solution: () => solution(L.recipe),
  /** Meter value (0..1) a hypothetical bowl would show on the current level. */
  meter: (seq: number[]) => {
    const c = L.tubes.map(() => 0);
    seq.forEach((i) => c[i]++);
    return closeness(mix(c, labs), L.target, L.tol);
  },
  busy: () => drops.length > 0 || winPending,
  goto: (n: number) => startLevel(fresh(n)),
  load: (s: Save) => startLevel(s),
  freeze: (ms: number | null) => (frozenAt = ms === null ? null : performance.now() + ms),
};
