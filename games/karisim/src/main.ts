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

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/karisim/PRIVACY.md';
declare const __APP_VERSION__: string;
type RGB = [number, number, number];

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

const fresh = (level: number): Save => ({ level, seq: [], used: 0, hints: 0, startedAt: Date.now() });
let S: Save = store.get<Save | null>('save', null) ?? fresh(1);
let L: Level = generateLevel(S.level);
let labs: Lab[] = L.tubes.map((p) => hexToOklab(PIGMENTS[p].hex));
let nextSave: Save | null = null;
// After a win the next level is already saved; never overwrite it with the finished board.
const save = () => store.set('save', nextSave ?? S);

trackSession('karisim');
track('level_start', { level: S.level, par: L.par, tubes: L.tubes.length, resumed: S.used > 0 });

const counts = () => {
  const c = L.tubes.map(() => 0);
  S.seq.forEach((i) => c[i]++);
  return c;
};
const mixLab = () => mix(counts(), labs);
const solved = () => isMatch(mixLab(), L.target, L.tol);
const toRgb = (lab: Lab | null): RGB | null => (lab ? oklabToRgb(lab) : null);
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;

document.documentElement.lang = navigator.language.slice(0, 2) === 'tr' ? 'tr' : 'en';
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Key);
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

function refreshHud() {
  $('level').textContent = String(S.level);
  $('target').style.background = css(toRgb(L.target)!);
  const c = closeness(mixLab(), L.target, L.tol);
  const pct = Math.round(c * 100);
  $('pct').textContent = `${pct}%`;
  const fill = $('meter-fill');
  fill.style.width = `${pct}%`;
  fill.classList.toggle('done', pct === 100);
  $('drops').textContent = t('drops', { n: S.used });
  $('par').textContent = t('par', { n: L.par });
  const badge = $('hint-badge');
  badge.textContent = S.hints === 0 ? t('free') : t('ad');
  badge.classList.toggle('free', S.hints === 0);
  placeHand();
}

function placeHand() {
  const hand = $('hand');
  const show = S.level === 1 && !winPending && !solved();
  hand.hidden = !show;
  if (!show) return;
  const i = hintDrop(counts(), L.recipe);
  const el = document.querySelector<HTMLElement>(`.tube[data-i="${i}"]`);
  if (!el) return (hand.hidden = true);
  const r = el.getBoundingClientRect();
  hand.style.left = `${r.left + r.width / 2 - 14}px`;
  hand.style.top = `${r.top + r.height * 0.45}px`;
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
let winPending = false;
let winShown = false;
let frozenAt: number | null = null; // screenshot hook

const FALL = 480;
const SWIRL = 900;
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const lerp = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

function geometry() {
  const R = Math.min(W * 0.42, H * 0.55, 210);
  const cx = W / 2;
  const cy = H * 0.48;
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

  // bowl body: lower half-ellipse in glazed white
  ctx.beginPath();
  ctx.ellipse(cx, cy, R, R * 0.3, 0, Math.PI, 0, true);
  ctx.bezierCurveTo(cx + R, cy + R * 0.55, cx + R * 0.55, cy + R * 0.76, cx, cy + R * 0.76);
  ctx.bezierCurveTo(cx - R * 0.55, cy + R * 0.76, cx - R, cy + R * 0.55, cx - R, cy);
  const body = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.55, '#f3f5f8');
  body.addColorStop(1, '#d6dbe2');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.ellipse(cx - R * 0.62, cy + R * 0.28, R * 0.06, R * 0.2, 0.5, 0, Math.PI * 2);
  ctx.fill();

  // rim + inner wall
  ctx.beginPath();
  ctx.ellipse(cx, cy, R, R * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e6e9ee';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
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
  if (winPending || !$('win').hidden) return;
  if (S.seq.length >= MAX_DROPS) {
    haptic.error();
    return toast(t('full'));
  }
  S.seq.push(i);
  S.used++;
  save();
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
  [0, 2, 4, 7, 9].forEach((s, i) => tone({ freq: pentatonic(s, 523.25), duration: 0.24, volume: 0.4, delay: i * 0.08 }));
  haptic.success();
  track('level_complete', {
    level: S.level,
    drops: S.used,
    par: L.par,
    stars: st,
    hints: S.hints,
    duration_s: Math.round((Date.now() - S.startedAt) / 1000),
  });
  $('win-title').textContent = t('levelN', { n: S.level });
  $('win-drops').textContent = t('winDrops', { n: S.used, p: L.par });
  $('win-swatch').style.background = css(toRgb(L.target)!);
  $('stars').querySelectorAll('i').forEach((el, k) => el.classList.toggle('on', k < st));
  // Persist progress right away so quitting on the win sheet never loses the level.
  const completed = S.level;
  nextSave = fresh(completed + 1);
  store.set('save', nextSave);
  store.set('completed', Math.max(completed, store.get('completed', 0)));
  const streak = st === 3 ? store.get('streak', 0) + 1 : 0;
  store.set('streak', streak);
  $('win').hidden = false;
  if (streak >= 3) maybeRequestReview(completed, true);
}

function startLevel(state: Save) {
  S = state;
  L = generateLevel(S.level);
  labs = L.tubes.map((p) => hexToOklab(PIGMENTS[p].hex));
  save();
  drops = [];
  splashes = [];
  swirl = null;
  shown = toRgb(mixLab());
  winPending = false;
  winShown = false;
  buildTubes();
  refreshHud();
  $('toast').hidden = true;
  if (S.level === 1 && !S.used) toast(t('tutorial'), 3500);
  track('level_start', { level: S.level, par: L.par, tubes: L.tubes.length, resumed: false });
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

$('hint-btn').addEventListener('click', async () => {
  unlockAudio();
  if (winPending) return;
  // First hint per level is free; more are behind a rewarded ad.
  if (S.hints > 0 && !(await showRewarded('hint'))) return;
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
buildTubes();
layout();
refreshHud();
if (S.level === 1 && !S.used) toast(t('tutorial'), 3500);
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
// Exposed for e2e/screenshot scripts.
(window as unknown as { __karisim: unknown }).__karisim = {
  get state() { return S; },
  get level() { return L; },
  solution: () => solution(L.recipe),
  busy: () => drops.length > 0 || winPending,
  goto: (n: number) => startLevel(fresh(n)),
  load: (s: Save) => startLevel(s),
  freeze: (ms: number | null) => (frozenAt = ms === null ? null : performance.now() + ms),
};
