import './style.css';
import {
  createMeta, createProfile, createStore, haptic, initAds, initStore, setHapticsEnabled, setSoundEnabled, setupNative,
  tone, track, trackSession, unlockAudio, maybeRequestReview,
} from '@studio/kit';
import {
  addTime, botTarget, createState, DT, generateLevel, H, LEVEL_COUNT, penCenter, pennedCount, starsFor, step, timeLeft, W, type State,
} from './game';
import { lang, t } from './i18n';

declare const __APP_VERSION__: string;
// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/coban/PRIVACY.md';
document.documentElement.lang = lang;
document.title = t('title');

// ───────────────────────── skins (dog breeds) ─────────────────────────
interface Skin { id: string; price: number; body: string; accent: string; spots?: string }
const SKINS: Skin[] = [
  { id: 'collie', price: 0, body: '#2b2b33', accent: '#f4f1ea' },
  { id: 'golden', price: 120, body: '#e0a548', accent: '#f3cf86' },
  { id: 'kangal', price: 250, body: '#e6d3a8', accent: '#2d2620' },
  { id: 'husky', price: 400, body: '#7c8796', accent: '#f4f6fa' },
  { id: 'shiba', price: 600, body: '#d9772f', accent: '#fbe9d2' },
  { id: 'choco', price: 800, body: '#6a3f25', accent: '#8a5636' },
  { id: 'dalmatian', price: 1000, body: '#f7f7f4', accent: '#f7f7f4', spots: '#222' },
];
const skinName = (id: string) => t(`skin_${id}` as Parameters<typeof t>[0]);

// ───────────────────────── profile + meta ─────────────────────────
const store = createStore('coban');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const profile = createProfile({
  game: 'coban',
  levelCount: LEVEL_COUNT,
  defaultSkin: 'collie',
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'sheep', targets: [15, 25, 40], reward: (n) => 20 + n * 2 },
  ],
});
let skin = SKINS.find((s) => s.id === profile.data.skin) ?? SKINS[0];

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  skins: SKINS.map((s) => ({
    id: s.id,
    name: skinName(s.id),
    price: s.price,
    swatch: s.spots
      ? `radial-gradient(circle at 30% 35%, ${s.spots} 0 9%, transparent 10%), radial-gradient(circle at 68% 62%, ${s.spots} 0 8%, transparent 9%), ${s.body}`
      : `linear-gradient(135deg, ${s.body} 0 58%, ${s.accent} 58%)`,
  })),
  onSkin: (id) => (skin = SKINS.find((s) => s.id === id) ?? SKINS[0]),
  levels: { count: LEVEL_COUNT, play: (n) => startLevel(n) },
  missionText: (id, n) => t(`mission_${id}` as Parameters<typeof t>[0], { n }),
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});
void initAds();
void initStore();
trackSession('coban');

// ───────────────────────── game state ─────────────────────────
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const $ = (id: string) => document.getElementById(id)!;
const hud = document.querySelector('.hud') as HTMLElement;
let S: State = createState(generateLevel(1));
let running = false;
let paused = false;
let continues = 0;
let dogAngle = -Math.PI / 2;
let dragging = false;
let tipTimer = 0;

function startLevel(n: number) {
  n = Math.max(1, Math.min(LEVEL_COUNT, n));
  S = createState(generateLevel(n));
  running = true;
  paused = false;
  continues = 0;
  dogAngle = -Math.PI / 2;
  meta.hideHome();
  $('level-label').textContent = t('level', { n });
  const first = n === 1 ? 'hint' : n === 12 ? 'black' : n === 25 ? 'wolf' : null;
  showTip(first ? t(first) : null);
  tone({ freq: 1100, to: 1700, duration: 0.18, type: 'sine', volume: 0.25 });
  track('level_start', { level: n });
  track('game_start', { level: n });
  hudRefresh();
}

function showTip(text: string | null) {
  const tip = $('tip');
  clearTimeout(tipTimer);
  tip.hidden = !text;
  if (text) {
    tip.textContent = text;
    tipTimer = window.setTimeout(() => (tip.hidden = true), 4000);
  }
}

function pause() {
  if (!running || paused || meta.covering) return;
  paused = true;
  meta.showPause({
    onResume: () => (paused = false),
    onRestart: () => startLevel(S.level),
    onMenu: () => (running = false),
  });
}
$('pause-btn').addEventListener('click', () => {
  unlockAudio();
  haptic.light();
  pause();
});

function onWin() {
  running = false;
  const stars = starsFor(S);
  const level = S.level;
  track('level_win', { level, stars, time: Math.round(S.time) });
  track('game_over', { level, win: true });
  if (profile.data.firstRun) profile.finishFirstRun();
  maybeRequestReview(level, stars === 3);
  meta.showWin({ level, stars, coins: 10 + stars * 5, onNext: () => startLevel(Math.min(level + 1, LEVEL_COUNT)) });
}

function onLose() {
  running = false;
  track('level_lose', { level: S.level, penned: pennedCount(S) });
  track('game_over', { level: S.level, win: false });
  tone({ freq: 330, to: 200, duration: 0.4, type: 'triangle', volume: 0.3 });
  haptic.error();
  meta.showLose({
    score: pennedCount(S),
    coins: pennedCount(S),
    label: t('timeUp'),
    continuesUsed: continues,
    canContinue: continues < 3,
    onContinue: () => {
      continues++;
      addTime(S);
      running = true;
      track('continue', { level: S.level, n: continues });
    },
    onRetry: () => startLevel(S.level),
  });
}

// ───────────────────────── input ─────────────────────────
let view = { s: 1, ox: 0, oy: 0 };
function toWorld(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(W, (e.clientX - r.left - view.ox) / view.s)), y: Math.max(0, Math.min(H, (e.clientY - r.top - view.oy) / view.s)) };
}
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (!running || paused) return;
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  S.target = toWorld(e);
  if (S.level === 1) showTip(null);
});
canvas.addEventListener('pointermove', (e) => {
  if (dragging && running) S.target = toWorld(e);
});
const up = () => (dragging = false);
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);

void setupNative({
  onBack: () => meta.back() || (running && !paused && !meta.covering ? (pause(), true) : false),
  onPause: () => pause(),
});

// ───────────────────────── loop ─────────────────────────
let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running && !paused && !meta.covering) {
    acc += dt;
    while (acc >= DT && running) {
      acc -= DT;
      const newly = step(S);
      if (newly) {
        profile.progress('sheep', newly);
        tone({ freq: 520, to: 430, duration: 0.22, type: 'triangle', volume: 0.3 });
        haptic.light();
        hudRefresh();
      }
      if (S.result === 'win') onWin();
      else if (S.result === 'lose') onLose();
    }
    if (S.ticks % 15 === 0) hudRefresh();
  } else acc = 0;
  draw(now / 1000);
  requestAnimationFrame(frame);
}

function hudRefresh() {
  $('sheep-count').textContent = `${pennedCount(S)}/${S.sheep.length}`;
  const left = Math.ceil(timeLeft(S));
  $('time').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  $('time-pill').classList.toggle('low', left <= 10);
}

// ───────────────────────── drawing ─────────────────────────
function resize() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  const top = hud.getBoundingClientRect().bottom + 4;
  const s = Math.min(innerWidth / W, (innerHeight - top - 8) / H);
  view = { s, ox: (innerWidth - W * s) / 2, oy: top + (innerHeight - top - H * s) / 2 };
}
addEventListener('resize', resize);

function hash(i: number) {
  const x = Math.sin(i * 127.1 + S.level * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function draw(time: number) {
  const dpr = canvas.width / innerWidth;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#5f9e48';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
  // meadow
  ctx.fillStyle = '#8fcf68';
  rr(0, 0, W, H, 18);
  ctx.fill();
  ctx.strokeStyle = '#78bb55';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = hash(i) * W, y = hash(i + 99) * H;
    ctx.beginPath();
    ctx.moveTo(x - 3, y + 2); ctx.lineTo(x - 1, y - 3);
    ctx.moveTo(x + 1, y + 2); ctx.lineTo(x + 3, y - 4);
    ctx.stroke();
  }
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? '#fff6c2' : '#ffd1e0';
    ctx.beginPath();
    ctx.arc(hash(i + 300) * W, hash(i + 400) * H, 2.2, 0, 7);
    ctx.fill();
  }
  // pen
  const p = S.pen;
  ctx.fillStyle = '#e8cf8f';
  rr(p.x, p.y, p.w, p.h, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,120,60,.18)';
  for (let i = 0; i < 12; i++) ctx.fillRect(p.x + 8 + hash(i + 500) * (p.w - 20), p.y + 8 + hash(i + 600) * (p.h - 16), 7, 2);
  // gate arrow hint
  ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + Math.sin(time * 4) * 0.15) + ')';
  const gy = p.y + p.h + 14 + Math.sin(time * 4) * 2;
  ctx.beginPath();
  ctx.moveTo(p.gx, gy - 8); ctx.lineTo(p.gx - 9, gy + 4); ctx.lineTo(p.gx + 9, gy + 4);
  ctx.fill();
  for (const w of [...S.walls, ...S.fences]) fence(w.a.x, w.a.y, w.b.x, w.b.y);
  // ponds & bushes
  for (const c of S.circles) {
    if (c.kind === 'pond') {
      ctx.fillStyle = '#3e8fc0';
      blob(c.x, c.y, c.r + 3);
      ctx.fillStyle = '#5bb6e6';
      blob(c.x, c.y, c.r);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.ellipse(c.x - c.r * 0.3, c.y - c.r * 0.35, c.r * 0.35, c.r * 0.12, -0.3, 0, 7);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.15)';
      ctx.beginPath(); ctx.ellipse(c.x + 2, c.y + 4, c.r, c.r * 0.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3f8f3a';
      for (const [dx, dy] of [[-0.45, 0.1], [0.45, 0.1], [0, -0.35], [0, 0.25]]) { ctx.beginPath(); ctx.arc(c.x + dx * c.r, c.y + dy * c.r, c.r * 0.65, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#58ad4b';
      ctx.beginPath(); ctx.arc(c.x - c.r * 0.2, c.y - c.r * 0.35, c.r * 0.35, 0, 7); ctx.fill();
    }
  }
  // finger target
  if (S.target && running && dragging) {
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(S.target.x, S.target.y, 14 + Math.sin(time * 8) * 2, 0, 7); ctx.stroke();
  }
  for (const w of S.wolves) if (w.hidden <= 0) wolf(w.x, w.y, w.edge === 'left' ? 0 : Math.PI, time);
  S.sheep.forEach((sh, i) => sheep(sh.x, sh.y, sh.heading, sh.black, time + i, Math.hypot(sh.vx, sh.vy)));
  const sp = Math.hypot(S.dog.vx, S.dog.vy);
  if (sp > 8) dogAngle = Math.atan2(S.dog.vy, S.dog.vx);
  dog(S.dog.x, S.dog.y, dogAngle, time, sp);
  if (!running && pennedCount(S) === S.sheep.length) {
    const c = penCenter(p);
    ctx.fillStyle = '#ffd34d';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(c.x + Math.cos(time * 2 + i * 1.26) * 50, c.y + Math.sin(time * 2 + i * 1.26) * 30, 3, 0, 7); ctx.fill(); }
  }
}

function rr(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function blob(x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2, k = r * (1 + Math.sin(a * 3 + x) * 0.06);
    i ? ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k) : ctx.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  ctx.fill();
}
function fence(ax: number, ay: number, bx: number, by: number) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.18)';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(ax + 1.5, ay + 3); ctx.lineTo(bx + 1.5, by + 3); ctx.stroke();
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = '#b57f45';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(ax, ay - 1); ctx.lineTo(bx, by - 1); ctx.stroke();
  const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 24));
  ctx.fillStyle = '#6b4220';
  for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.arc(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, 3.6, 0, 7); ctx.fill(); }
}
function sheep(x: number, y: number, a: number, black: boolean, t: number, v: number) {
  const bob = v > 5 ? Math.sin(t * 18) * 0.8 : 0;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(1.5, 4 - bob, 10, 7, 0, 0, 7); ctx.fill();
  ctx.rotate(a);
  ctx.fillStyle = black ? '#1e1f24' : '#3b302a';
  ctx.beginPath(); ctx.ellipse(8.5, 0, 5, 4, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(7, -4.5, 2.6, 1.4, -0.6, 0, 7); ctx.ellipse(7, 4.5, 2.6, 1.4, 0.6, 0, 7); ctx.fill();
  ctx.fillStyle = black ? '#3a3b43' : '#f7f4ec';
  for (const [dx, dy, r] of [[-3, -3.5, 5.5], [-3, 3.5, 5.5], [2, -3, 5], [2, 3, 5], [-5.5, 0, 5], [1, 0, 6]]) { ctx.beginPath(); ctx.arc(dx, dy, r, 0, 7); ctx.fill(); }
  ctx.fillStyle = black ? '#4b4c55' : '#ffffff';
  ctx.beginPath(); ctx.arc(-1, -2, 3, 0, 7); ctx.fill();
  ctx.restore();
}
function dog(x: number, y: number, a: number, t: number, v: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(1.5, 4, 13, 7, 0, 0, 7); ctx.fill();
  ctx.rotate(a);
  const wag = Math.sin(t * (v > 10 ? 22 : 8)) * 0.5;
  ctx.strokeStyle = skin.body;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-15, Math.sin(wag) * 6); ctx.stroke();
  ctx.fillStyle = skin.body;
  ctx.beginPath(); ctx.ellipse(-1, 0, 11, 6.5, 0, 0, 7); ctx.fill();
  if (skin.spots) {
    ctx.fillStyle = skin.spots;
    for (const [dx, dy] of [[-5, -2], [1, 3], [-2, -4], [4, -1]]) { ctx.beginPath(); ctx.arc(dx, dy, 1.4, 0, 7); ctx.fill(); }
  }
  ctx.fillStyle = skin.accent;
  ctx.beginPath(); ctx.ellipse(3, 0, 4, 4.6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = skin.body;
  ctx.beginPath(); ctx.arc(10, 0, 5.5, 0, 7); ctx.fill();
  ctx.fillStyle = skin.accent;
  ctx.beginPath(); ctx.ellipse(13.5, 0, 3.2, 2.6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(16.2, 0, 1.3, 0, 7); ctx.fill();
  ctx.fillStyle = skin.id === 'kangal' ? '#2d2620' : skin.body;
  ctx.beginPath(); ctx.ellipse(8, -5, 3, 1.8, -0.5, 0, 7); ctx.ellipse(8, 5, 3, 1.8, 0.5, 0, 7); ctx.fill();
  ctx.restore();
}
function wolf(x: number, y: number, a: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a + Math.sin(t * 2) * 0.15);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(1, 4, 15, 8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6f7a86';
  ctx.beginPath(); ctx.ellipse(-2, 0, 13, 7, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-22, -3); ctx.lineTo(-21, 3); ctx.fill();
  ctx.beginPath(); ctx.arc(10, 0, 6, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(9, -10); ctx.lineTo(12, -4); ctx.moveTo(6, 4); ctx.lineTo(9, 10); ctx.lineTo(12, 4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(14, -3); ctx.lineTo(20, 0); ctx.lineTo(14, 3); ctx.fill();
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath(); ctx.arc(12, -2.5, 1.2, 0, 7); ctx.arc(12, 2.5, 1.2, 0, 7); ctx.fill();
  ctx.restore();
}

// ───────────────────────── test hook ─────────────────────────
declare global {
  interface Window { __coban: unknown }
}
window.__coban = {
  get state() { return S; },
  get running() { return running; },
  get paused() { return paused; },
  profile,
  start: (n: number) => startLevel(n),
  win() {
    const c = penCenter(S.pen);
    S.sheep.forEach((sh, i) => { sh.penned = true; sh.x = c.x + ((i % 5) - 2) * 18; sh.y = c.y + (Math.floor(i / 5) - 1) * 18; });
  },
  lose() { S.timeLimit = S.time + 0.05; },
  /** Fast-forwards the sim with the built-in bot (store screenshots). */
  sim(sec: number) {
    for (let i = 0; i < sec * 60 && !S.result; i++) { if (i % 6 === 0) S.target = botTarget(S); step(S); }
    dragging = true;
    hudRefresh();
  },
};

resize();
hudRefresh();
meta.showHome();
requestAnimationFrame(frame);
