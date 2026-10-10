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
import { LEVELS, cellCopies, cellCount, generateLevel, press, pressMask, solve, stars, type Level } from './game';
import { t } from './i18n';
import { SKINS, type Skin } from './skins';

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

const HINT_COINS = 40;
const fresh = (level: number): Save => ({ level: Math.max(1, Math.min(LEVELS, level)), state: 0, history: [], hintsUsed: 0 });
let S: Save = store.get<Save | null>('save', null) ?? fresh(1);
if (!Number.isFinite(S.level) || !Array.isArray(S.history)) S = fresh(1);
let lv: Level = generateLevel(S.level);
// A save from an older level set may hold a state that can no longer reach the target.
if (!solve(S.state, lv.target, lv)) S = fresh(S.level);
let levelStartedAt = Date.now();
const save = () => store.set('save', S);
const taps = () => S.history.length;
let skin: Skin = SKINS[0];

trackSession('kristal');

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;

document.documentElement.lang = navigator.language.slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
});

let toastTimer = 0;
function toast(text: string, ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

const starHtml = (n: number) => '★'.repeat(n) + `<i>${'★'.repeat(3 - n)}</i>`;
const COIN_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffc83d" stroke="#b57d10" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#e0a21c" stroke-width="1.6"/></svg>';
function refreshHud() {
  $('level').textContent = String(S.level);
  $('stars').innerHTML = starHtml(stars(taps(), lv.par));
  $('taps').textContent = t('tapsShort', { n: taps(), p: lv.par });
  const badge = $('hint-badge');
  const free = S.hintsUsed === 0;
  badge.innerHTML = free ? '1' : `${COIN_SVG}${HINT_COINS}`;
  badge.classList.toggle('paid', !free);
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
let py = 6; // target preview top
let pos: { x: number; y: number }[][] = []; // pos[class][copy]

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const n = lv.n;
  const pad = 10;
  pv = Math.round(Math.max(84, Math.min(W * 0.3, 132, H * 0.2)));
  cx = W / 2;
  // The flake is a hexagon with a pointy top, so the target preview can tuck into the empty
  // top-right corner of its bounding box. Grow the flake as wide as the screen allows, then
  // place it as close under the preview as that corner permits, and centre the pair.
  const halfW = 0.866 * n + 0.62;
  const halfH = n + 0.62;
  let top = 0;
  const fit = () => {
    sp = Math.min((W - pad * 2) / (2 * halfW), (H - pad * 2) / (2 * halfH));
    for (let k = 0; k < 40; k++) {
      const ro = sp * halfH;
      const px = W - pv - 12; // preview left edge
      // upper-right flake edge: y = cy - ro + (x - cx)·tan30 must pass below the preview corner
      top = Math.max(ro + pad, pv + 6 + 10 + ro - Math.max(0, px - 8 - cx) * 0.577);
      if (top + ro + pad <= H) break;
      sp *= 0.97;
    }
    return Math.max(0, H - pad - (top + sp * halfH));
  };
  let slack = fit();
  // Tall screens: spend spare height on a bigger, easier to read target rather than on gaps.
  if (slack > 40 && pv < 156) {
    pv = Math.round(Math.min(156, pv + slack * 0.35));
    slack = fit();
  }
  py = Math.round(6 + slack * 0.42);
  cy = top + slack * 0.42;
  R = (sp / Math.sqrt(3)) * 0.93;
  pos = Array.from({ length: cellCount(n) }, (_, i) => cellCopies(i, n).map((p) => ({ x: cx + p.x * sp, y: cy + p.y * sp })));
  canvas.dataset.layout = JSON.stringify(pos.map((c) => [c[0].x, c[0].y]));
  canvas.dataset.preview = JSON.stringify({ x: W - pv - 12, y: py, s: pv });
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
  ctx.shadowColor = `rgba(${skin.glow},0.85)`;
  ctx.shadowBlur = r * 0.7;
  hexPath(x, y, rr);
  const g = ctx.createLinearGradient(x - rr, y - rr, x + rr, y + rr);
  g.addColorStop(0, skin.hi);
  g.addColorStop(0.55, skin.mid);
  g.addColorStop(1, skin.lo);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // crystalline facets
  ctx.strokeStyle = skin.facet;
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
  const y0 = py;
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
  ctx.fillStyle = skin.core;
  ctx.fill();
  for (let i = 0; i < cellCount(n); i++) {
    const on = (lv.target >> i) & 1;
    for (const p of cellCopies(i, n)) {
      hexPath(pcx + p.x * s, pcy + p.y * s, (s / Math.sqrt(3)) * 0.9);
      ctx.fillStyle = on ? skin.mid : 'rgba(255,255,255,0.08)';
      ctx.fill();
    }
  }
}

/** Tutorial pointer: a solid white hand shape (an emoji renders faint on some devices). */
function drawHand(x: number, y: number, now: number) {
  const cycle = (now % 1200) / 1200;
  const press = cycle < 0.18 ? cycle / 0.18 : cycle < 0.36 ? 1 - (cycle - 0.18) / 0.18 : 0;
  const u = Math.max(4, R * 0.17); // the hand is ~10u tall
  const tipY = y + R * 0.25 + (1 - press) * u * 1.6;
  if (press > 0.6) {
    ctx.strokeStyle = `rgba(255,255,255,${(press - 0.6) * 1.6})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, R * (0.55 + press * 0.25), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(x + u * 0.2, tipY);
  ctx.rotate(-0.22);
  const shapes = () => {
    ctx.beginPath();
    ctx.roundRect(-1.1 * u, 0, 2.2 * u, 6.2 * u, 1.1 * u); // index finger
    ctx.roundRect(-1.5 * u, 3.9 * u, 5.4 * u, 5.0 * u, [1.4 * u, 1.6 * u, 2.2 * u, 2.2 * u]); // palm + curled fingers
    ctx.roundRect(-3.0 * u, 5.0 * u, 3.2 * u, 1.9 * u, 0.95 * u); // thumb
    ctx.roundRect(-0.9 * u, 8.4 * u, 4.4 * u, 1.9 * u, 0.6 * u); // wrist
  };
  // dark outline first (thick stroke under the fill), so overlapping parts read as one shape
  ctx.shadowColor = 'rgba(8,10,30,0.45)';
  ctx.shadowBlur = u * 1.4;
  ctx.shadowOffsetY = u * 0.4;
  shapes();
  ctx.lineJoin = 'round';
  ctx.lineWidth = u * 0.9;
  ctx.strokeStyle = '#1b2142';
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  shapes();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // knuckle creases and nail
  ctx.strokeStyle = 'rgba(27,33,66,0.35)';
  ctx.lineWidth = u * 0.32;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const kx of [1.45, 2.7]) {
    ctx.moveTo(kx * u, 4.4 * u);
    ctx.lineTo(kx * u, 5.6 * u);
  }
  ctx.moveTo(-0.45 * u, 1.2 * u);
  ctx.lineTo(0.45 * u, 1.2 * u);
  ctx.stroke();
  ctx.restore();
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
  ctx.fillStyle = skin.core;
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
  profile.progress('taps');
  if (S.state === lv.target) win();
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (meta.covering || hintCovering()) return;
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

interface PendingWin { level: number; stars: number }

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
  // Persist right away so quitting during the win animation never loses the level: the next
  // level becomes the saved one and the result is replayed into the profile on the next boot.
  const pending: PendingWin = { level: completed, stars: st };
  store.set('pendingWin', pending);
  store.set('save', fresh(Math.min(LEVELS, completed + 1)));
  setTimeout(() => showResult(pending), 1700);
  maybeRequestReview(completed, completed >= 8);
}

function showResult(p: PendingWin) {
  store.remove('pendingWin');
  profile.progress('flakes');
  if (profile.data.firstRun) profile.finishFirstRun();
  meta.showWin({
    level: p.level,
    stars: p.stars,
    coins: 10 + p.stars * 5,
    onNext: () => {
      if (p.level >= LEVELS) return meta.showHome();
      startLevel(fresh(p.level + 1));
    },
    onMenu: () => {
      // keep the saved next level so the home "play" card resumes from it
      S = store.get<Save>('save', fresh(Math.min(LEVELS, p.level + 1)));
      startLevel(S, false);
    },
  });
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
  if (isNew) track('level_start', { level: S.level, par: lv.par, resumed: taps() > 0 });
  if (!isNew || meta.covering) return;
  if (S.level === 1) toast(t('tutorial'), 4000);
  if (S.level === 15) toast(t('neighbours'), 4000);
  if (S.level === 40) toast(t('mirror'), 4000);
}

/** Meta "play": resume the saved board when it is that level, otherwise start it fresh. */
function playLevel(n: number) {
  unlockAudio();
  const resume = S.level === n && winAt === null;
  startLevel(resume ? S : fresh(n));
}

function restartLevel() {
  if (winAt !== null) return;
  track('restart', { level: S.level, taps: taps() });
  startLevel(fresh(S.level), false);
  haptic.light();
}

$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  restartLevel();
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

// ───────────────────────── hints: first per level free, then coins or a video ─────────────────────────
function giveHint(paid: 'free' | 'coins' | 'video') {
  const sol = solve(S.state, lv.target, lv);
  if (!sol || !sol.length) return;
  S.hintsUsed++;
  save();
  refreshHud();
  hint = { cell: sol[0], until: performance.now() + 4000 };
  haptic.light();
  track('hint', { level: S.level, hints: S.hintsUsed, paid });
}

const hintSheet = document.createElement('div');
hintSheet.className = 'meta-root';
hintSheet.hidden = true;
hintSheet.innerHTML = `<div class="m-overlay"><div class="m-sheet"><div>
  <h2></h2><p class="m-note" data-note></p>
  <button class="m-btn" data-coins></button>
  <button class="m-btn alt" data-video></button>
  <button class="m-btn ghost" data-close></button></div></div></div>`;
document.body.appendChild(hintSheet);
const hs = <T extends HTMLElement>(sel: string) => hintSheet.querySelector(sel) as T;
hs('h2').textContent = t('hintTitle');
hs('[data-note]').textContent = t('hintNote');
hs('[data-coins]').innerHTML = `${COIN_SVG} ${t('hintCoins', { n: HINT_COINS })}`;
hs('[data-video]').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9v6l5-3z" fill="currentColor"/></svg> ${t('hintVideo')}`;
hs('[data-close]').textContent = t('close');
const hintCovering = () => !hintSheet.hidden;
const closeHintSheet = () => (hintSheet.hidden = true);
hs('.m-overlay').addEventListener('click', (e) => e.target === e.currentTarget && closeHintSheet());
hs('[data-close]').addEventListener('click', closeHintSheet);
hs('[data-coins]').addEventListener('click', () => {
  if (!profile.spend(HINT_COINS)) {
    haptic.error();
    meta.toast(t('notEnough'));
    return;
  }
  closeHintSheet();
  giveHint('coins');
});
hs('[data-video]').addEventListener('click', async () => {
  if (!rewardedAvailable()) return meta.toast(t('noVideo'));
  if (!(await showRewarded('hint'))) return;
  closeHintSheet();
  giveHint('video');
});

$('hint-btn').addEventListener('click', () => {
  unlockAudio();
  if (winAt !== null) return;
  if (S.hintsUsed === 0) return giveHint('free');
  hs('[data-coins]').toggleAttribute('data-short', profile.data.coins < HINT_COINS);
  hintSheet.hidden = false;
  haptic.light();
});

$('outline-btn').addEventListener('click', () => {
  showOutline = !showOutline;
  $('outline-btn').classList.toggle('on', showOutline);
  haptic.light();
});

// ───────────────────────── meta (home, map, missions, daily, shop) ─────────────────────────
function applySkin(id: string) {
  skin = SKINS.find((s) => s.id === id) ?? SKINS[0];
  paintHero();
}

const profile = createProfile({
  game: 'kristal',
  levelCount: LEVELS,
  defaultSkin: SKINS[0].id,
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'taps', targets: [30, 60, 100], reward: (n) => 15 + Math.round(n / 3) },
    { id: 'flakes', targets: [4, 6, 8], reward: (n) => 25 + n * 6 },
  ],
});

// v1.0 kept stars as { level: stars } and the current level in the save: move them into the profile.
if (!store.get('migrated', false)) {
  const old = store.get<Record<string, number>>('stars', {});
  let top = 0;
  for (const [k, v] of Object.entries(old)) {
    const i = Number(k) - 1;
    if (!(i >= 0 && i < LEVELS) || typeof v !== 'number') continue;
    profile.data.stars[i] = Math.max(profile.data.stars[i], Math.max(0, Math.min(3, Math.floor(v))));
    top = Math.max(top, i + 1);
  }
  const reached = Math.min(LEVELS, Math.max(top + 1, S.level));
  if (reached > profile.data.unlocked) profile.data.unlocked = reached;
  if (top > 0) profile.data.firstRun = false;
  profile.save();
  store.remove('stars');
  store.set('migrated', true);
}
// A win whose result screen never showed (app closed mid-animation) still counts.
const pendingWin = store.get<PendingWin | null>('pendingWin', null);
if (pendingWin && pendingWin.level >= 1 && pendingWin.level <= LEVELS) {
  profile.recordLevel(pendingWin.level, Math.max(1, Math.min(3, pendingWin.stars)));
  store.remove('pendingWin');
}

/** Home-screen artwork: a glowing snowflake in the current crystal theme, slowly turning. */
const hero = document.createElement('canvas');
hero.className = 'hero';
const HERO_N = 4;
const HERO_ON = [0, 1, 2, 3, 6, 7, 9]; // wedge cells lit: spokes, an inner ring and forked tips
function paintHero() {
  const size = 200;
  const d = Math.min(window.devicePixelRatio || 1, 3);
  hero.width = size * d;
  hero.height = size * d;
  const g = hero.getContext('2d')!;
  g.setTransform(d, 0, 0, d, 0, 0);
  g.clearRect(0, 0, size, size);
  const s = size / (2 * (HERO_N + 0.9));
  const r = (s / Math.sqrt(3)) * 0.9;
  const hex = (x: number, y: number, rr: number) => {
    g.beginPath();
    for (let k = 0; k < 6; k++) g.lineTo(x + Math.cos((k * Math.PI) / 3) * rr, y + Math.sin((k * Math.PI) / 3) * rr);
    g.closePath();
  };
  const c = size / 2;
  g.shadowColor = `rgba(${skin.glow},0.9)`;
  g.shadowBlur = r * 1.1;
  hex(c, c, r);
  g.fillStyle = skin.core;
  g.fill();
  for (let i = 0; i < cellCount(HERO_N); i++) {
    for (const p of cellCopies(i, HERO_N)) {
      const x = c + p.x * s;
      const y = c + p.y * s;
      if (!HERO_ON.includes(i)) continue;
      g.shadowBlur = r * 0.9;
      hex(x, y, r);
      const gr = g.createLinearGradient(x - r, y - r, x + r, y + r);
      gr.addColorStop(0, skin.hi);
      gr.addColorStop(0.55, skin.mid);
      gr.addColorStop(1, skin.lo);
      g.fillStyle = gr;
      g.fill();
    }
  }
}

const meta = createMeta({
  title: 'Kristal',
  hero,
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  levels: { count: LEVELS, play: playLevel },
  missionText: (id, n) => t(`mission_${id}` as 'mission_levels', { n }),
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as 'skin_ice'), price: s.price, swatch: s.swatch })),
  onSkin: applySkin,
  settings,
  onSettings: (st) => {
    setSoundEnabled(st.sound);
    setHapticsEnabled(st.haptics);
    store.set('settings', st);
  },
});
applySkin(profile.data.skin);

function pause() {
  unlockAudio();
  if (winAt !== null || meta.covering) return;
  closeHintSheet();
  meta.showPause({
    onResume: () => {},
    onRestart: restartLevel,
    onMenu: () => save(),
  });
}
$('pause-btn').addEventListener('click', pause);

// ───────────────────────── boot ─────────────────────────
refreshHud();
void initAds();
void initStore();
void setupNative({
  darkBackground: true,
  onPause: save,
  onBack: () => {
    if (hintCovering()) {
      closeHintSheet();
      return true;
    }
    if (meta.back()) return true;
    if (!meta.covering) {
      pause();
      return true;
    }
    return false;
  },
});
meta.showHome();
requestAnimationFrame(frame);
// Exposed for e2e/screenshot scripts.
(window as unknown as { __kristal: unknown }).__kristal = {
  get state() { return S; },
  get level() { return lv; },
  get profile() { return profile.data; },
  solve: () => solve(S.state, lv.target, lv),
  tap: tapCell,
  busy: () => winAt !== null,
  goto: (level: number) => {
    meta.hideHome();
    startLevel(fresh(level));
  },
  load: (s: Save) => startLevel(s),
  outline: (on: boolean) => { showOutline = on; $('outline-btn').classList.toggle('on', on); },
  hint: (cell: number) => (hint = { cell, until: Infinity }),
  freeze: (at: number | null) => (frozenAt = at),
  win: () => win(),
};
