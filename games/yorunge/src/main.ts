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
  LEVEL_COUNT,
  STEP,
  WORLD_W,
  continueRun,
  hitAngles,
  levelDone,
  levelStars,
  levelTarget,
  newGame,
  newLevel,
  release,
  simulateRelease,
  start,
  step,
  type GameEvent,
  type GameState,
} from './game';
import { lang, t } from './i18n';
import { SKINS, trailColor } from './skins';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/yorunge/PRIVACY.md';
declare const __APP_VERSION__: string;

// Soft pastel planets: [body, light, glow]
const PLANETS = [
  ['#f7a8b8', '#ffd9e1', '247,168,184'],
  ['#ffc98f', '#ffe6c7', '255,201,143'],
  ['#9fe3bd', '#d6f7e4', '159,227,189'],
  ['#9ccdf7', '#d7ecff', '156,205,247'],
  ['#c3b0fa', '#e6ddff', '195,176,250'],
  ['#f3df8c', '#fff4c8', '243,223,140'],
];

// ───────────── persistence & settings ─────────────
const store = createStore('yorunge');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);
const legacyBest = store.get('best', 0); // v1.0 kept the best score here; migrated into the profile below
let gamesPlayed = store.get('gamesPlayed', 0);
trackSession('yorunge');

// ───────────── DOM ─────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
const scoreEl = $('score');
const bestEl = $('best');
const hintEl = $('hint');
const goalEl = $('goal');

document.documentElement.lang = lang;
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
});

// ───────────── layout ─────────────
let W = 0;
let H = 0;
let dpr = 1;
let k = 1; // css px per world unit
let game: GameState = newGame((Math.random() * 2 ** 31) | 0);
type Mode = { kind: 'endless' } | { kind: 'level'; n: number; target: number };
let mode: Mode = { kind: 'endless' };
let skin = SKINS[0];
/** Level reached its target: input is blocked until the win sheet is answered. */
let ended = false;

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  k = W / WORLD_W;
  game.viewH = H / k;
}
window.addEventListener('resize', layout);
layout();
game.camY = game.planets[0].y - game.viewH * 0.25;

const sx = (x: number) => x * k;
const sy = (y: number) => H - (y - game.camY) * k;

// ───────────── fx state ─────────────
let trail: { x: number; y: number }[] = [];
let pulses: { planet: number; t0: number; perfect: boolean }[] = [];
let floaters: { text: string; x: number; y: number; t0: number; color: string }[] = [];
let sparks: { x: number; y: number; vx: number; vy: number; t0: number }[] = [];
let startedAt = Date.now();


const bgStars = Array.from({ length: 110 }, (_, i) => {
  const r = Math.sin(i * 12.9898) * 43758.5453;
  const r2 = Math.sin(i * 78.233) * 12543.123;
  return { x: (r - Math.floor(r)) * WORLD_W, y: (r2 - Math.floor(r2)) * 1800, s: 0.5 + ((i * 7) % 5) * 0.3, tw: i * 1.7 };
});

// ───────────── drawing ─────────────
function drawBackground(now: number) {
  ctx.fillStyle = '#fff';
  for (const st of bgStars) {
    const y = H - (((st.y - game.camY * 0.3) % 1800) + 1800) % 1800 * k;
    if (y < -4 || y > H + 4) continue;
    ctx.globalAlpha = 0.25 + 0.25 * Math.sin(now / 900 + st.tw);
    ctx.beginPath();
    ctx.arc(sx(st.x), y, st.s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlanets(now: number) {
  const lo = Math.max(0, game.sat.planet - 3);
  for (let i = lo; i < game.planets.length; i++) {
    const p = game.planets[i];
    const x = sx(p.x);
    const y = sy(p.y);
    if (y + p.ring * k * 2 < 0) break;
    if (y - p.ring * k * 2 > H) continue;
    const [body, light, glow] = PLANETS[p.hue];
    const r = p.r * k;
    // halo
    const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2.6);
    halo.addColorStop(0, `rgba(${glow},0.32)`);
    halo.addColorStop(1, `rgba(${glow},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    // body
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, light);
    g.addColorStop(0.6, body);
    g.addColorStop(1, `rgba(${glow},0.75)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // a slowly turning band shows the planet's spin
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = r * 0.16;
    const off = ((now / 1000) * p.omega * 0.25) % 1;
    for (const b of [-0.4, 0.25]) {
      const by = y + (b + off * 0.3 - 0.15) * r * 1.6;
      ctx.beginPath();
      ctx.moveTo(x - r, by);
      ctx.lineTo(x + r, by);
      ctx.stroke();
    }
    ctx.restore();
    // dotted orbit ring
    const active = i === game.sat.planet && !game.sat.flying;
    const pulse = pulses.find((q) => q.planet === i);
    let ringR = p.ring * k;
    let alpha = active ? 0.6 : 0.3;
    if (pulse) {
      const q = Math.min(1, (now - pulse.t0) / 500);
      ringR *= 1 + 0.08 * Math.sin(q * Math.PI);
      alpha += 0.4 * (1 - q);
    }
    const goal = mode.kind === 'level' && i === mode.target;
    if (goal) {
      // the level's finish planet: golden ring with a little flag on top
      alpha = Math.min(1, alpha + 0.35);
      const fy = y - ringR - 6;
      ctx.strokeStyle = '#ffd98a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, fy);
      ctx.lineTo(x, fy - 24);
      ctx.stroke();
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath();
      ctx.moveTo(x, fy - 24);
      ctx.lineTo(x + 15 + Math.sin(now / 250) * 2, fy - 19);
      ctx.lineTo(x, fy - 13);
      ctx.fill();
    }
    ctx.setLineDash([0, 9 * Math.max(1, k * 0.9)]);
    ctx.lineCap = 'round';
    ctx.lineWidth = goal ? 3.4 : 2.6;
    ctx.strokeStyle = goal ? `rgba(255,217,138,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.lineDashOffset = -(now / 1000) * p.omega * 10 * (active ? game.sat.dir : 1);
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  pulses = pulses.filter((q) => now - q.t0 < 500);
}

function drawStars(now: number) {
  for (const st of game.stars) {
    if (st.taken) continue;
    const x = sx(st.x);
    const y = sy(st.y);
    if (y < -20 || y > H + 20) continue;
    const s = (7 + Math.sin(now / 300 + st.x) * 1.2) * Math.max(1, k * 0.9);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, s * 2.6);
    glow.addColorStop(0, 'rgba(255,224,140,0.45)');
    glow.addColorStop(1, 'rgba(255,224,140,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, s * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now / 1400);
    ctx.fillStyle = '#ffe39a';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? s * 0.38 : s;
      const a = (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawSatellite(now: number) {
  const { sat } = game;
  if (game.phase !== 'over') trail.push({ x: sat.x, y: sat.y });
  if (trail.length > 26) trail.shift();
  ctx.lineCap = 'round';
  for (let i = 1; i < trail.length; i++) {
    const a = i / trail.length;
    ctx.strokeStyle = trailColor(skin, a, a * 0.6);
    ctx.lineWidth = 1 + a * 3.5;
    ctx.beginPath();
    ctx.moveTo(sx(trail[i - 1].x), sy(trail[i - 1].y));
    ctx.lineTo(sx(trail[i].x), sy(trail[i].y));
    ctx.stroke();
  }
  if (game.phase === 'over') return;
  const x = sx(sat.x);
  const y = sy(sat.y);
  const combo = Math.min(game.combo, 5);
  const glowR = 16 + combo * 5 + (combo ? Math.sin(now / 120) * 2 : 0);
  const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
  g.addColorStop(0, combo ? 'rgba(255,226,150,0.85)' : `rgba(${skin.glow},0.7)`);
  g.addColorStop(1, `rgba(${skin.glow},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin.sat;
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawFx(now: number) {
  sparks = sparks.filter((p) => now - p.t0 < 600);
  ctx.fillStyle = '#ffe39a';
  for (const p of sparks) {
    const q = (now - p.t0) / 600;
    ctx.globalAlpha = 1 - q;
    ctx.beginPath();
    ctx.arc(sx(p.x + p.vx * q), sy(p.y + p.vy * q), 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  floaters = floaters.filter((f) => now - f.t0 < 900);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 20px ui-rounded, system-ui, sans-serif';
  for (const f of floaters) {
    const q = (now - f.t0) / 900;
    ctx.globalAlpha = q > 0.6 ? (1 - q) / 0.4 : 1;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, sx(f.x), sy(f.y) - 34 - q * 30);
  }
  ctx.globalAlpha = 1;
}

// ───────────── loop ─────────────
let last = performance.now();
let acc = 0;
let frozen = false;
function frame(now: number) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  // Meta screens (home, pause, results) stop time; the scene keeps drawing behind them.
  if (frozen || meta.covering) acc = 0;
  while (acc >= STEP) {
    acc -= STEP;
    handle(step(game), now);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawBackground(now);
  drawPlanets(now);
  drawStars(now);
  drawSatellite(now);
  drawFx(now);
  requestAnimationFrame(frame);
}

// ───────────── HUD ─────────────
function hud() {
  const level = mode.kind === 'level' ? mode : null;
  scoreEl.textContent = level ? `${Math.min(game.reached, level.target)}/${level.target}` : String(game.score);
  scoreEl.classList.toggle('small', !!level);
  bestEl.textContent = level ? t('levelShort', { n: level.n }) : String(profile.data.best);
  $('best-ico').toggleAttribute('hidden', !!level);
  $('level-ico').toggleAttribute('hidden', !level);
}

function bump() {
  hud();
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bump');
  setTimeout(() => scoreEl.classList.remove('bump'), 150);
}

function handle(events: GameEvent[], now: number) {
  for (const e of events) {
    if (e.type === 'capture') {
      pulses.push({ planet: e.planet, t0: now, perfect: e.perfect });
      if (!e.scored) continue;
      const p = game.planets[e.planet];
      profile.progress('hops');
      if (e.perfect) {
        profile.progress('perfects');
        haptic.success();
        [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s + Math.min(game.combo, 6)), duration: 0.16, volume: 0.4, delay: i * 0.05 }));
        floaters.push({ text: game.combo > 1 ? `${t('perfect')} ×${game.combo}` : t('perfect'), x: p.x, y: p.y + p.ring, t0: now, color: '#ffe39a' });
      } else {
        haptic.medium();
        tone({ freq: pentatonic(game.score % 10), duration: 0.18, volume: 0.45 });
      }
      bump();
      if (mode.kind === 'level' && !ended && levelDone(game, mode.target)) winLevel(mode.n, mode.target);
    } else if (e.type === 'star') {
      const st = game.stars[e.index];
      profile.progress('starsCollected');
      haptic.light();
      tone({ freq: 1320, to: 1760, duration: 0.12, type: 'triangle', volume: 0.3 });
      floaters.push({ text: '+1', x: st.x, y: st.y, t0: now, color: '#ffe39a' });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        sparks.push({ x: st.x, y: st.y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, t0: now });
      }
      bump();
    } else if (e.type === 'lost') {
      haptic.error();
      [392, 330, 247].forEach((f, i) => tone({ freq: f, duration: 0.22, type: 'triangle', volume: 0.35, delay: i * 0.12 }));
      const run = game;
      setTimeout(() => run === game && (mode.kind === 'level' ? failLevel() : showGameOver()), 650);
    }
  }
}

// ───────────── game flow ─────────────
/** Fresh run in the current mode, waiting for the first tap. */
function reset() {
  game = mode.kind === 'level' ? newLevel(mode.n, game.viewH) : newGame((Math.random() * 2 ** 31) | 0, game.viewH);
  game.camY = game.planets[0].y - game.viewH * 0.25;
  ended = false;
  trail = [];
  floaters = [];
  sparks = [];
  pulses = [];
  hintEl.hidden = false;
  goalEl.hidden = mode.kind !== 'level';
  if (mode.kind === 'level') goalEl.textContent = t('goal', { n: mode.target });
  hud();
}

function playEndless() {
  mode = { kind: 'endless' };
  reset();
}

function playLevel(n: number) {
  n = Math.max(1, Math.min(LEVEL_COUNT, n));
  mode = { kind: 'level', n, target: levelTarget(n) };
  reset();
}

function finishRun(isNewBest: boolean) {
  gamesPlayed++;
  store.set('gamesPlayed', gamesPlayed);
  if (profile.data.firstRun) profile.finishFirstRun();
  maybeRequestReview(gamesPlayed, isNewBest);
}

function showGameOver() {
  const isNewBest = game.score > profile.data.best;
  if (isNewBest) track('new_best', { score: game.score });
  track('game_over', { score: game.score, duration: Math.round((Date.now() - startedAt) / 1000), continued: game.continued });
  meta.showLose({
    score: game.score,
    label: t('lost'),
    coins: game.score,
    continuesUsed: game.continued ? 1 : 0,
    canContinue: !game.continued,
    onContinue: revive,
    onRetry: () => {
      finishRun(isNewBest);
      reset();
    },
    onMenu: () => {
      finishRun(isNewBest);
      reset();
    },
  });
  hud();
}

/** Continue (paid on the meta lose screen): back into orbit around the last planet. */
function revive() {
  if (!continueRun(game)) return;
  trail = [];
  haptic.success();
  [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.16, delay: i * 0.07 }));
  track('continue', { score: game.score });
}

function winLevel(n: number, target: number) {
  ended = true;
  const stars = levelStars(game, target);
  track('level_win', { level: n, stars, perfects: game.perfects, duration: Math.round((Date.now() - startedAt) / 1000) });
  setTimeout(() => {
    if (profile.data.firstRun) profile.finishFirstRun();
    meta.showWin({
      level: n,
      stars,
      coins: 10 + stars * 5,
      onNext: () => playLevel(n < LEVEL_COUNT ? n + 1 : n),
      onMenu: () => playLevel(n),
    });
  }, 700);
}

/** Missed in a level: no lose sheet, the level simply restarts (one-tap games live on instant retries). */
function failLevel() {
  if (mode.kind !== 'level') return;
  track('level_fail', { level: mode.n, reached: game.reached });
  meta.toast(t('tryAgain'));
  reset();
}

canvas.addEventListener('pointerdown', () => {
  unlockAudio();
  if (meta.covering || ended) return;
  if (game.phase === 'ready') {
    start(game);
    hintEl.hidden = true;
    startedAt = Date.now();
    track('game_start', mode.kind === 'level' ? { mode: 'level', level: mode.n } : { mode: 'endless' });
    haptic.light();
    tone({ freq: 440, to: 660, duration: 0.1, type: 'triangle', volume: 0.3 });
    return;
  }
  if (release(game)) {
    haptic.light();
    tone({ freq: 620, to: 880, duration: 0.09, type: 'sine', volume: 0.25 });
  }
});

// ───────────── meta (home, levels, missions, daily, shop) ─────────────
const profile = createProfile({
  game: 'yorunge',
  levelCount: LEVEL_COUNT,
  defaultSkin: SKINS[0].id,
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'games', targets: [2, 3, 5], reward: (n) => 15 + n * 8 },
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'hops', targets: [20, 40, 80], reward: (n) => 20 + Math.round(n / 2) },
    { id: 'perfects', targets: [5, 10, 20], reward: (n) => 20 + n * 2 },
    { id: 'starsCollected', targets: [5, 10, 20], reward: (n) => 20 + n * 2 },
  ],
});
// Players from v1.0 keep their best score.
if (profile.data.best < legacyBest) {
  profile.data.best = legacyBest;
  profile.save();
}

function applySkin(id: string) {
  skin = SKINS.find((s) => s.id === id) ?? SKINS[0];
}
applySkin(profile.data.skin);

/** Home artwork: a pastel planet with the equipped satellite looping its dotted orbit. */
function heroArt() {
  const el = document.createElement('div');
  el.className = 'hero';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<span class="hero-glow"></span><span class="hero-ring"></span><span class="hero-planet"></span>
    <span class="hero-moon"></span><span class="hero-orbit"><i class="hero-trail"></i><b class="hero-sat"></b></span>
    ${[0, 1, 2, 3, 4].map((i) => `<em class="hero-star" style="--i:${i}"></em>`).join('')}`;
  const paint = () => {
    const trailEl = el.querySelector<HTMLElement>('.hero-trail')!;
    const sat = el.querySelector<HTMLElement>('.hero-sat')!;
    const stops = [0, 0.25, 0.5, 0.75, 1].map((a) => `${trailColor(skin, a, a * 0.9)} ${70 + a * 30}%`);
    trailEl.style.background = `conic-gradient(transparent 0 70%, ${stops.join(', ')})`;
    sat.style.background = skin.sat;
    sat.style.boxShadow = `0 0 10px 4px rgba(${skin.glow},0.75), 0 0 26px 10px rgba(${skin.glow},0.3)`;
  };
  paint();
  profile.onChange(paint);
  return el;
}

const meta = createMeta({
  title: 'Yörünge',
  hero: heroArt(),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  levels: { count: LEVEL_COUNT, play: playLevel },
  endless: { play: playEndless },
  missionText: (id, n) => t(`mission_${id}` as 'mission_games', { n }),
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as 'skin_moon'), price: s.price, swatch: s.swatch })),
  onSkin: applySkin,
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});

function pause() {
  unlockAudio();
  if (meta.covering || game.phase === 'over' || ended) return;
  meta.showPause({
    onResume: () => {},
    onRestart: () => {
      if (game.phase === 'play') track('game_abandon', { score: game.score });
      reset();
    },
    onMenu: () => {
      if (game.phase === 'play') track('game_abandon', { score: game.score });
      reset();
    },
  });
}
$('pause-btn').addEventListener('click', pause);

// ───────────── test hook (e2e + store screenshots) ─────────────
let aim: { planet: number; best: number | null } = { planet: -1, best: null };
function bestAngle() {
  if (aim.planet !== game.sat.planet || aim.best === null) aim = { planet: game.sat.planet, best: hitAngles(game).best };
  return aim.best;
}
const ahead = (target: number) => ((target - game.sat.angle) * game.sat.dir + Math.PI * 4) % (Math.PI * 2);
Object.assign(window, {
  __orbit: {
    get state() {
      return game;
    },
    get mode() {
      return mode;
    },
    /** True just before the satellite reaches the best release angle. */
    aligned: () => {
      const b = bestAngle();
      return game.phase === 'play' && !game.sat.flying && b !== null && ahead(b) < 0.1;
    },
    /** True when releasing now would miss everything. */
    missing: () => game.phase === 'play' && !game.sat.flying && simulateRelease(game, game.sat.angle).planet < 0,
    /** Instantly make n perfect captures (store screenshots, e2e level clear). */
    warp(n: number) {
      if (game.phase === 'ready') {
        start(game);
        startedAt = Date.now();
      }
      hintEl.hidden = true;
      for (let i = 0; i < n && !ended; i++) {
        aim.best = null;
        const b = bestAngle();
        if (b === null) return;
        game.sat.angle = b - game.sat.dir * game.planets[game.sat.planet].omega * STEP;
        handle(step(game), performance.now());
        release(game);
        while (game.sat.flying && game.phase === 'play') handle(step(game), performance.now());
      }
      game.camY = game.planets[game.sat.planet].y - game.viewH * 0.25;
      trail = [];
      floaters = [];
      sparks = [];
      hud();
    },
    freeze: (on: boolean) => (frozen = on),
  },
});

// ───────────── boot ─────────────
hud();
void initAds();
void initStore();
void setupNative({
  onPause: () => {
    if (game.phase === 'play') pause();
  },
  onBack: () => {
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
