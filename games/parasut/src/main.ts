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
  setHapticsEnabled,
  setSoundEnabled,
  setupNative,
  tone,
  track,
  trackSession,
  unlockAudio,
} from '@studio/kit';
import {
  DT,
  LEVEL_COUNT,
  START_Y,
  W,
  bullRadius,
  generateJump,
  landing,
  levelGoal,
  levelJump,
  levelStars,
  newDiver,
  obstacleX,
  padX,
  scoreLanding,
  step,
  tap,
  windAt,
  type Diver,
  type Jump,
  type Outcome,
} from './game';
import { lang, t, type Key } from './i18n';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/parasut/PRIVACY.md';
declare const __APP_VERSION__: string;
document.documentElement.lang = lang;
document.title = t('title');

// ───────────────────────── skins (parachute patterns) ─────────────────────────
type Pattern = 'stripes' | 'checker' | 'rainbow' | 'night';
interface Skin { id: string; price: number; pattern: Pattern; colors: [string, string] }
const SKINS: Skin[] = [
  { id: 'classic', price: 0, pattern: 'stripes', colors: ['#ff5a4e', '#ffffff'] },
  { id: 'ocean', price: 150, pattern: 'stripes', colors: ['#1e88e5', '#4dd0e1'] },
  { id: 'sunset', price: 200, pattern: 'stripes', colors: ['#ff9a3c', '#ff4f81'] },
  { id: 'mint', price: 250, pattern: 'stripes', colors: ['#2ec4b6', '#e0fbf6'] },
  { id: 'checker', price: 300, pattern: 'checker', colors: ['#24304a', '#ffffff'] },
  { id: 'rainbow', price: 400, pattern: 'rainbow', colors: ['#ff5a4e', '#4dd0e1'] },
  { id: 'night', price: 500, pattern: 'night', colors: ['#1b1f4b', '#ffd447'] },
  { id: 'gold', price: 800, pattern: 'stripes', colors: ['#f5c542', '#b8860b'] },
];
const RAINBOW = ['#ff5a4e', '#ff9a3c', '#ffd447', '#3ccf6e', '#1e88e5', '#8e5cf7'];
function swatch(s: Skin) {
  const [a, b] = s.colors;
  if (s.pattern === 'checker') return `repeating-conic-gradient(${a} 0 25%, ${b} 0 50%) 0 0 / 20px 20px`;
  if (s.pattern === 'rainbow') return `linear-gradient(90deg, ${RAINBOW.join(', ')})`;
  if (s.pattern === 'night') return `radial-gradient(circle at 30% 40%, ${b} 0 2px, transparent 3px), radial-gradient(circle at 70% 65%, ${b} 0 2px, transparent 3px), ${a}`;
  return `repeating-linear-gradient(90deg, ${a} 0 12px, ${b} 12px 24px)`;
}

// ───────────────────────── profile + meta ─────────────────────────
const store = createStore('parasut');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const profile = createProfile({
  game: 'parasut',
  levelCount: LEVEL_COUNT,
  defaultSkin: 'classic',
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'games', targets: [3, 5, 8], reward: (n) => 15 + n * 5 },
    { id: 'landings', targets: [10, 20, 40], reward: (n) => 20 + n * 2 },
    { id: 'bullseye', targets: [3, 6, 10], reward: (n) => 25 + n * 5 },
  ],
});
let skin = SKINS.find((s) => s.id === profile.data.skin) ?? SKINS[0];

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as Key), price: s.price, swatch: swatch(s) })),
  onSkin: (id) => (skin = SKINS.find((s) => s.id === id) ?? SKINS[0]),
  levels: { count: LEVEL_COUNT, play: (n) => startLevel(n) },
  endless: { title: t('endless'), play: () => startEndless() },
  missionText: (id, n) => t(`mission_${id}` as Key, { n }),
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});
void initAds();
void initStore();
trackSession('parasut');

// ───────────────────────── run state ─────────────────────────
type Mode =
  | { kind: 'endless'; seed: number }
  | { kind: 'level'; level: number; goal: number; bulls: number };
type Stage = 'off' | 'intro' | 'fall' | 'landed' | 'splash';
const INTRO = 1.2;

let mode: Mode = { kind: 'endless', seed: 1 };
let stage: Stage = 'off';
let jumpIdx = 0;
let jump: Jump = generateJump(0, 1);
let diver: Diver = newDiver(jump);
let worldT = -INTRO; // seconds relative to the drop
let stageT = 0; // seconds spent in landed/splash
let score = 0;
let combo = 0;
let continues = 0;
let paused = false;
let pendingTap = false;
let autoTaps: number[] | null = null; // test hook
let outcome: Outcome | null = null;
let cutCanopy: { x: number; y: number; t: number } | null = null;
let splashT = 0;
const totalLandings = () => store.get('landings', 0);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
const scoreEl = $('score');
const labelEl = $('hud-label');
const hintEl = $('hint');
const popEl = $('pop');
const windVal = $('wind-val');
const windSvg = $('wind').querySelector('svg')!;

function updateHud() {
  scoreEl.textContent = String(score);
  labelEl.textContent =
    mode.kind === 'endless' ? t('jump', { n: jumpIdx + 1 }) : `${t('level', { n: mode.level })} · ${t('progress', { a: jumpIdx, b: mode.goal })}`;
  const w = jump.wind;
  windVal.textContent = String(Math.round(Math.abs(w) * 10) / 10);
  windSvg.style.transform = w < 0 ? 'scaleX(-1)' : '';
}

function pop(text: string, sub = '') {
  popEl.hidden = true;
  popEl.innerHTML = '';
  popEl.textContent = text;
  if (sub) {
    const s = document.createElement('small');
    s.textContent = sub;
    popEl.appendChild(s);
  }
  void popEl.offsetWidth;
  popEl.hidden = false;
}

function loadJump(j: Jump) {
  jump = j;
  diver = newDiver(j);
  worldT = -INTRO;
  stage = 'intro';
  outcome = null;
  cutCanopy = null;
  pendingTap = false;
  updateHud();
}
const nextJump = () => (mode.kind === 'endless' ? generateJump(jumpIdx, mode.seed + jumpIdx * 101) : levelJump(mode.level, jumpIdx));

function begin(m: Mode) {
  meta.hideHome();
  mode = m;
  jumpIdx = 0;
  score = 0;
  combo = 0;
  continues = 0;
  paused = false;
  loadJump(nextJump());
  track('game_start', m.kind === 'endless' ? { mode: 'endless' } : { mode: 'level', level: m.level });
}
function startEndless() {
  begin({ kind: 'endless', seed: Math.floor(Math.random() * 1e9) });
}
function startLevel(n: number) {
  begin({ kind: 'level', level: n, goal: levelGoal(n), bulls: 0 });
}
function stop() {
  stage = 'off';
  paused = false;
  hintEl.hidden = true;
}

// ───────────────────────── input ─────────────────────────
function onTap() {
  unlockAudio();
  if (paused || meta.covering || stage !== 'fall') return;
  pendingTap = true;
}
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  onTap();
});
$('pause-btn').addEventListener('click', () => pause());
function pause() {
  if (stage === 'off' || paused || meta.covering) return;
  paused = true;
  meta.showPause({
    onResume: () => (paused = false),
    onRestart: () => (mode.kind === 'endless' ? startEndless() : startLevel(mode.level)),
    onMenu: stop,
  });
}
setupNative({
  onBack: () => meta.back() || (stage !== 'off' && !meta.covering ? (pause(), true) : false),
  onPause: () => pause(),
  darkBackground: false,
});

// ───────────────────────── simulation ─────────────────────────
function applyTap() {
  const r = tap(diver);
  if (r === 'open') {
    tone({ freq: 220, to: 520, duration: 0.25, type: 'triangle', volume: 0.4 });
    haptic.medium();
  } else if (r === 'cut') {
    cutCanopy = { x: diver.x, y: diver.y, t: 0 };
    tone({ freq: 900, to: 300, duration: 0.2, type: 'square', volume: 0.2 });
    haptic.heavy();
  }
}

function tick() {
  if (stage === 'intro') {
    worldT += DT;
    if (worldT >= 0) (worldT = 0), (stage = 'fall');
    return;
  }
  if (stage === 'fall') {
    if (autoTaps) while (autoTaps.length && autoTaps[0] <= diver.t + 1e-9) autoTaps.shift(), applyTap();
    if (pendingTap) (pendingTap = false), applyTap();
    if (step(diver, jump) >= 0) {
      haptic.light();
      tone({ freq: 640, to: 420, duration: 0.12, volume: 0.25 });
    }
    worldT = diver.t;
    if (cutCanopy) cutCanopy.t += DT;
    if (diver.y <= 0) finish(landing(diver, jump));
    return;
  }
  worldT += DT;
  stageT += DT;
  if (cutCanopy) cutCanopy.t += DT;
  if (stage === 'splash') splashT += DT;
  if (stage === 'landed' && stageT > 1.1) afterLanding();
  if (stage === 'splash' && stageT > 1.1) afterSplash();
}

function finish(o: Outcome) {
  outcome = o;
  stageT = 0;
  autoTaps = null;
  if (o.kind === 'land') {
    stage = 'landed';
    const pad = jump.pads[o.pad];
    const r = scoreLanding(pad, o.bull, combo);
    combo = r.combo;
    score += r.points;
    if (mode.kind === 'level' && o.bull) mode.bulls++;
    store.set('landings', totalLandings() + 1);
    profile.progress('landings');
    if (o.bull) profile.progress('bullseye');
    pop(`+${r.points}`, o.bull ? (combo > 1 ? `${t('bullseye')} ${t('combo', { n: combo })}` : t('bullseye')) : t('landed'));
    [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s + (o.bull ? 3 : 0)), duration: 0.14, volume: 0.35, delay: i * 0.07 }));
    o.bull ? haptic.success() : haptic.medium();
    jumpIdx++;
    updateHud();
  } else {
    stage = 'splash';
    splashT = 0;
    combo = 0;
    pop(t('splash'), o.reason === 'freefall' ? t('freefall') : '');
    tone({ freq: 180, to: 60, duration: 0.45, type: 'sawtooth', volume: 0.3 });
    haptic.error();
  }
}

function afterLanding() {
  if (mode.kind === 'level' && jumpIdx >= mode.goal) {
    stage = 'off';
    const stars = levelStars(mode.goal, mode.bulls);
    const level = mode.level;
    track('level_complete', { level, stars, score });
    profile.finishFirstRun();
    meta.showWin({
      level,
      stars,
      coins: 10 + stars * 5,
      onNext: () => (level < LEVEL_COUNT ? startLevel(level + 1) : meta.showHome()),
      onMenu: stop,
    });
    maybeRequestReview(profile.data.unlocked, stars === 3);
    return;
  }
  loadJump(nextJump());
}

function afterSplash() {
  stage = 'off';
  const m = mode;
  const retryJump = () => {
    continues++;
    loadJump(nextJump());
  };
  track('game_over', { mode: m.kind, score, jumps: jumpIdx });
  profile.finishFirstRun();
  if (m.kind === 'endless') {
    if (score > profile.data.best) track('new_best', { score });
    meta.showLose({
      score,
      coins: Math.floor(score / 20),
      continuesUsed: continues,
      canContinue: continues < 3,
      onContinue: retryJump,
      onRetry: startEndless,
      onMenu: stop,
    });
  } else {
    // Kit workaround: showLose always records the endless best, so shield it for challenge levels.
    const best = profile.data.best;
    profile.data.best = Number.MAX_SAFE_INTEGER;
    meta.showLose({
      score: jumpIdx,
      coins: 0,
      label: t('level', { n: m.level }),
      continuesUsed: continues,
      canContinue: continues < 3,
      onContinue: retryJump,
      onRetry: () => startLevel(m.level),
      onMenu: stop,
    });
    profile.data.best = best;
    profile.save();
    const note = document.querySelector('.m-result .m-note');
    if (note) note.textContent = t('progress', { a: jumpIdx, b: m.goal });
  }
  maybeRequestReview(profile.data.best, false);
}

// ───────────────────────── rendering ─────────────────────────
let cw = 0, ch = 0, dpr = 1, sx = 1, sy = 1, seaY = 0, topY = 0;
function resize() {
  dpr = Math.min(3, window.devicePixelRatio || 1);
  cw = window.innerWidth;
  ch = window.innerHeight;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  sx = cw / W;
  seaY = ch * 0.8;
  topY = Math.max(130, ch * 0.17);
  sy = (seaY - topY) / START_Y;
}
window.addEventListener('resize', resize);
resize();
const X = (x: number) => x * sx;
const Y = (y: number) => seaY - y * sy;

function drawSky(time: number) {
  const g = ctx.createLinearGradient(0, 0, 0, seaY);
  g.addColorStop(0, '#3aa6e6');
  g.addColorStop(1, '#bfe8ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, seaY + 10);
  ctx.fillStyle = 'rgba(255,240,180,0.9)';
  ctx.beginPath();
  ctx.arc(cw * 0.82, topY - 40, 26, 0, Math.PI * 2);
  ctx.fill();
  // far clouds
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 4; i++) {
    const x = ((i * 137 + time * 4) % (cw + 160)) - 80;
    puff(x, seaY * (0.35 + i * 0.12), 18 + i * 3);
  }
  // wind streaks
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  const w = windAt(jump, Math.max(0, worldT));
  for (let i = 0; i < 9; i++) {
    const base = (i * 53.7) % 100;
    const x = X((((base + w * time * 3) % 110) + 110) % 110 - 5);
    const y = topY + ((i * 97) % 100) / 100 * (seaY - topY - 30);
    const len = Math.min(40, 6 + Math.abs(w) * 4) * Math.sign(w || 1);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
}
function puff(x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r, y + r * 0.2, r * 0.8, 0, Math.PI * 2);
  ctx.arc(x - r, y + r * 0.25, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawSea(time: number) {
  const g = ctx.createLinearGradient(0, seaY, 0, ch);
  g.addColorStop(0, '#2a93d4');
  g.addColorStop(1, '#0f4f80');
  ctx.fillStyle = g;
  ctx.fillRect(0, seaY + 6, cw, ch);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let row = 0; row < 4; row++) {
    const y = seaY + 18 + row * 22;
    ctx.beginPath();
    for (let x = 0; x <= cw; x += 8) ctx.lineTo(x, y + Math.sin(x / 26 + time * 2 + row) * 3);
    ctx.stroke();
  }
}

function drawBoat(i: number) {
  const p = jump.pads[i];
  const cx = X(padX(p, worldT));
  const hw = X(p.w) / 2;
  const deck = seaY;
  ctx.fillStyle = ['#e85d3f', '#2f3e5c', '#f2b134'][i % 3];
  ctx.beginPath();
  ctx.moveTo(cx - hw - 6, deck);
  ctx.lineTo(cx + hw + 6, deck);
  ctx.lineTo(cx + hw - 4, deck + 20);
  ctx.lineTo(cx - hw + 4, deck + 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4ead2';
  ctx.fillRect(cx - hw, deck - 5, hw * 2, 6);
  // bullseye rings
  const br = X(bullRadius(p));
  ctx.fillStyle = '#ff5a4e';
  ctx.fillRect(cx - br, deck - 5, br * 2, 6);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - br * 0.45, deck - 5, br * 0.9, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = '900 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`+${p.points}`, cx, deck + 15);
}

function drawObstacles() {
  jump.obstacles.forEach((o, i) => {
    const x = X(obstacleX(o, worldT));
    const y = Y(o.y);
    const hit = diver.hits & (1 << i);
    if (o.kind === 'cloud') {
      ctx.fillStyle = hit ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.95)';
      puff(x, y, X(o.r) * 0.6);
    } else {
      const flap = Math.sin(worldT * 14 + i) * 5;
      ctx.strokeStyle = '#24304a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 10, y - flap);
      ctx.quadraticCurveTo(x - 4, y - 2, x, y + 2);
      ctx.quadraticCurveTo(x + 4, y - 2, x + 10, y - flap);
      ctx.stroke();
    }
  });
}

function drawPlane() {
  const px = X(jump.startX + worldT * 25);
  const py = Y(START_Y + 6);
  if (px < -80 || px > cw + 80) return;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(px, py, 34, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff6b3d';
  ctx.fillRect(px - 8, py - 3, 22, 4);
  ctx.beginPath();
  ctx.moveTo(px - 30, py);
  ctx.lineTo(px - 38, py - 16);
  ctx.lineTo(px - 24, py - 4);
  ctx.fill();
  ctx.fillStyle = '#9fb7cc';
  ctx.fillRect(px - 6, py + 2, 18, 4);
  ctx.fillStyle = '#24304a';
  for (let k = 0; k < 3; k++) ctx.fillRect(px + 2 + k * 8, py - 5, 4, 3);
}

function canopy(cx: number, cy: number, rx: number, alpha = 1) {
  const ry = rx * 0.55;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0);
  for (let k = 4; k >= 0; k--) ctx.quadraticCurveTo(cx - rx + (k + 0.5) * (rx / 2.5), cy + ry * 0.25, cx - rx + k * (rx / 2.5), cy);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  const [a, b] = skin.colors;
  const left = cx - rx, top = cy - ry, n = 6, sw = (2 * rx) / n;
  if (skin.pattern === 'stripes' || skin.pattern === 'rainbow') {
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = skin.pattern === 'rainbow' ? RAINBOW[k] : k % 2 ? b : a;
      ctx.fillRect(left + k * sw, top, sw + 1, ry * 1.4);
    }
  } else if (skin.pattern === 'checker') {
    for (let k = 0; k < n; k++)
      for (let r = 0; r < 3; r++) {
        ctx.fillStyle = (k + r) % 2 ? b : a;
        ctx.fillRect(left + k * sw, top + r * (ry / 2.4), sw + 1, ry / 2.4 + 1);
      }
  } else {
    ctx.fillStyle = a;
    ctx.fillRect(left, top, rx * 2, ry * 1.4);
    ctx.fillStyle = b;
    [[0.3, 0.4], [0.6, 0.25], [0.75, 0.6], [0.45, 0.75], [0.15, 0.8]].forEach(([u, v]) => {
      ctx.beginPath();
      ctx.arc(left + u * rx * 2, top + v * ry, Math.max(1.5, rx * 0.06), 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(15,42,68,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawDiver() {
  let x: number, y: number;
  if (stage === 'intro') return;
  if (stage === 'landed' && outcome?.kind === 'land') {
    x = X(padX(jump.pads[outcome.pad], worldT) + outcome.dx);
    y = seaY - 5;
  } else if (stage === 'splash') {
    x = X(diver.x);
    y = seaY + 4;
  } else {
    x = X(diver.x);
    y = Y(Math.max(0, diver.y));
  }
  const u = Math.max(10, sx * 3.2); // body scale in px
  // drop guide
  if (stage === 'fall') {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + u * 0.6);
    ctx.lineTo(x, seaY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (stage === 'splash' || outcome?.kind === 'splash') return;
  const chute = diver.phase === 'chute' && stage !== 'landed';
  if (chute) {
    const cy = y - u * 2.6;
    ctx.strokeStyle = 'rgba(15,42,68,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const dx of [-1, -0.4, 0.4, 1]) {
      ctx.moveTo(x + dx * u * 1.5, cy);
      ctx.lineTo(x, y - u * 0.4);
    }
    ctx.stroke();
    canopy(x, cy, u * 1.6);
  }
  const free = diver.phase !== 'chute' && stage === 'fall';
  ctx.strokeStyle = '#ff8a00';
  ctx.lineCap = 'round';
  ctx.lineWidth = u * 0.32;
  ctx.beginPath();
  if (free) {
    // spread-eagle
    ctx.moveTo(x - u * 0.7, y - u * 0.6); ctx.lineTo(x, y - u * 0.1); ctx.lineTo(x + u * 0.7, y - u * 0.6);
    ctx.moveTo(x - u * 0.5, y + u * 0.7); ctx.lineTo(x, y + u * 0.2); ctx.lineTo(x + u * 0.5, y + u * 0.7);
    ctx.moveTo(x, y - u * 0.1); ctx.lineTo(x, y + u * 0.25);
  } else {
    ctx.moveTo(x - u * 0.45, y - u * 0.5); ctx.lineTo(x, y - u * 0.25); ctx.lineTo(x + u * 0.45, y - u * 0.5);
    ctx.moveTo(x, y - u * 0.3); ctx.lineTo(x, y + u * 0.25);
    ctx.moveTo(x - u * 0.25, y + u * 0.9); ctx.lineTo(x, y + u * 0.25); ctx.lineTo(x + u * 0.25, y + u * 0.9);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y - u * 0.65, u * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#24304a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawCutCanopy() {
  if (!cutCanopy) return;
  const k = cutCanopy.t;
  const a = Math.max(0, 1 - k / 2.5);
  if (a <= 0) return;
  const u = Math.max(10, sx * 3.2);
  canopy(X(cutCanopy.x + windAt(jump, worldT) * k * 0.8), Y(cutCanopy.y) - u * 2.6 - k * 25, u * 1.6, a);
}

function drawSplash() {
  if (stage !== 'splash') return;
  const x = X(diver.x);
  for (let r = 0; r < 3; r++) {
    const k = splashT * 1.4 - r * 0.2;
    if (k <= 0 || k > 1) continue;
    ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, seaY + 10, 10 + k * 50, 4 + k * 12, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 8; i++) {
    const vx = (i - 3.5) * 18;
    const h = Math.max(0, 60 * splashT * 3 - 140 * (splashT * 3) ** 2 * 0.5);
    ctx.beginPath();
    ctx.arc(x + vx * splashT * 2, seaY + 4 - h * (0.6 + (i % 3) * 0.3), 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function render(time: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSky(time);
  drawObstacles();
  drawPlane();
  drawCutCanopy();
  drawSea(time);
  jump.pads.forEach((_, i) => drawBoat(i));
  drawDiver();
  drawSplash();
}

function updateHint() {
  const learn = totalLandings() < 3 && stage === 'fall';
  const key = learn && diver.phase === 'free' ? 'hintOpen' : learn && diver.phase === 'chute' && jumpIdx === 0 ? 'hintCut' : null;
  hintEl.hidden = !key;
  if (key) hintEl.textContent = t(key);
}

// ───────────────────────── loop ─────────────────────────
let last = performance.now();
let acc = 0;
const testSpeed = { v: 1 };
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (stage !== 'off' && !paused && !meta.covering) {
    acc += dt * testSpeed.v;
    while (acc >= DT) {
      acc -= DT;
      tick();
      if ((stage as Stage) === 'off') break;
    }
  } else acc = 0;
  render(now / 1000);
  updateHint();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
meta.showHome();

// ───────────────────────── test hook ─────────────────────────
declare global {
  interface Window {
    __parasut: unknown;
  }
}
window.__parasut = {
  get stage() { return stage; },
  get score() { return score; },
  get jumpIdx() { return jumpIdx; },
  get diver() { return diver; },
  get jump() { return jump; },
  profile,
  /** Play the current jump with its proven-landable tap timeline. */
  autoplay: () => (autoTaps = [...jump.solution]),
  /** Never tap: free fall into the sea. */
  splash: () => (autoTaps = []),
  speed: (v: number) => (testSpeed.v = v),
  /** Jump straight to difficulty n in the current run (store screenshots). */
  goto: (n: number) => ((jumpIdx = n), loadJump(nextJump())),
  pause,
};
