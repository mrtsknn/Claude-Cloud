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
  STEP,
  WORLD_W,
  continueRun,
  hitAngles,
  newGame,
  release,
  simulateRelease,
  start,
  step,
  type GameEvent,
  type GameState,
} from './game';
import { lang, t } from './i18n';

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
let best = store.get('best', 0);
let gamesPlayed = store.get('gamesPlayed', 0);
trackSession('yorunge');

// ───────────── DOM ─────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
const scoreEl = $('score');
const bestEl = $('best');
const hintEl = $('hint');

document.documentElement.lang = lang;
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
});
$('version').textContent = `v${__APP_VERSION__}`;

// ───────────── layout ─────────────
let W = 0;
let H = 0;
let dpr = 1;
let k = 1; // css px per world unit
let game: GameState = newGame((Math.random() * 2 ** 31) | 0);

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
    ctx.setLineDash([0, 9 * Math.max(1, k * 0.9)]);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
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
    ctx.strokeStyle = `rgba(200,215,255,${a * 0.55})`;
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
  g.addColorStop(0, combo ? 'rgba(255,226,150,0.85)' : 'rgba(210,225,255,0.7)');
  g.addColorStop(1, 'rgba(210,225,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
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
  while (!frozen && acc >= STEP) {
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

function bump() {
  scoreEl.textContent = String(game.score);
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
      if (e.perfect) {
        haptic.success();
        [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s + Math.min(game.combo, 6)), duration: 0.16, volume: 0.4, delay: i * 0.05 }));
        floaters.push({ text: game.combo > 1 ? `${t('perfect')} ×${game.combo}` : t('perfect'), x: p.x, y: p.y + p.ring, t0: now, color: '#ffe39a' });
      } else {
        haptic.medium();
        tone({ freq: pentatonic(game.score % 10), duration: 0.18, volume: 0.45 });
      }
      bump();
    } else if (e.type === 'star') {
      const st = game.stars[e.index];
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
      setTimeout(showGameOver, 650);
    }
  }
}

// ───────────── game flow ─────────────
let isNewBest = false;
function showGameOver() {
  isNewBest = game.score > best;
  if (isNewBest) {
    best = game.score;
    store.set('best', best);
    bestEl.textContent = String(best);
    track('new_best', { score: best });
  }
  $('go-title').textContent = isNewBest ? t('newBest') : t('lost');
  $('go-score').textContent = String(game.score);
  $('go-best').textContent = t('best', { n: best });
  $('go-best').hidden = isNewBest;
  $('continue-btn').hidden = game.continued;
  $('gameover').hidden = false;
  track('game_over', { score: game.score, duration: Math.round((Date.now() - startedAt) / 1000), continued: game.continued });
}

$('continue-btn').addEventListener('click', async () => {
  $('gameover').hidden = true;
  if (!(await showRewarded('continue'))) {
    $('gameover').hidden = false;
    return;
  }
  continueRun(game);
  trail = [];
  haptic.success();
  [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.16, delay: i * 0.07 }));
  track('continue', { score: game.score });
});

$('again-btn').addEventListener('click', async () => {
  $('gameover').hidden = true;
  gamesPlayed++;
  store.set('gamesPlayed', gamesPlayed);
  maybeRequestReview(gamesPlayed, isNewBest);
  game = newGame((Math.random() * 2 ** 31) | 0, game.viewH);
  trail = [];
  floaters = [];
  scoreEl.textContent = '0';
  hintEl.hidden = false;
  haptic.medium();
  await interstitialMoment('play_again');
});

canvas.addEventListener('pointerdown', () => {
  unlockAudio();
  if (game.phase === 'ready') {
    start(game);
    hintEl.hidden = true;
    startedAt = Date.now();
    track('game_start');
    haptic.light();
    tone({ freq: 440, to: 660, duration: 0.1, type: 'triangle', volume: 0.3 });
    return;
  }
  if (release(game)) {
    haptic.light();
    tone({ freq: 620, to: 880, duration: 0.09, type: 'sine', volume: 0.25 });
  }
});

// settings
const soundOpt = $<HTMLInputElement>('opt-sound');
const hapticsOpt = $<HTMLInputElement>('opt-haptics');
soundOpt.checked = settings.sound;
hapticsOpt.checked = settings.haptics;
soundOpt.addEventListener('change', () => {
  settings.sound = soundOpt.checked;
  setSoundEnabled(settings.sound);
  store.set('settings', settings);
});
hapticsOpt.addEventListener('change', () => {
  settings.haptics = hapticsOpt.checked;
  setHapticsEnabled(settings.haptics);
  store.set('settings', settings);
  haptic.medium();
});
// Opening settings pauses the physics.
$('settings-btn').addEventListener('click', () => {
  unlockAudio();
  frozen = true;
  $('settings').hidden = false;
});
const closeSettings = () => {
  $('settings').hidden = true;
  frozen = false;
};
$('close-settings').addEventListener('click', closeSettings);
$('settings').addEventListener('click', (e) => e.target === e.currentTarget && closeSettings());
$('privacy-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.open(PRIVACY_URL, '_blank');
});

// ───────────── test hook (e2e + store screenshots) ─────────────
let aim: { planet: number; best: number | null } = { planet: -1, best: null };
function bestAngle() {
  if (aim.planet !== game.sat.planet) aim = { planet: game.sat.planet, best: hitAngles(game).best };
  return aim.best;
}
const ahead = (target: number) => {
  const d = ((target - game.sat.angle) * game.sat.dir + Math.PI * 4) % (Math.PI * 2);
  return d;
};
Object.assign(window, {
  __orbit: {
    get state() {
      return game;
    },
    /** True just before the satellite reaches the best release angle. */
    aligned: () => {
      const b = bestAngle();
      return game.phase === 'play' && !game.sat.flying && b !== null && ahead(b) < 0.1;
    },
    /** True when releasing now would miss everything. */
    missing: () => game.phase === 'play' && !game.sat.flying && simulateRelease(game, game.sat.angle).planet < 0,
    /** Instantly make n perfect captures (store screenshots). */
    warp(n: number) {
      start(game);
      hintEl.hidden = true;
      for (let i = 0; i < n; i++) {
        const b = bestAngle();
        if (b === null) return;
        game.sat.angle = b - game.sat.dir * game.planets[game.sat.planet].omega * STEP;
        step(game);
        release(game);
        while (game.sat.flying && game.phase === 'play') step(game);
      }
      game.camY = game.planets[game.sat.planet].y - game.viewH * 0.25;
      trail = [];
      scoreEl.textContent = String(game.score);
    },
    freeze: (on: boolean) => (frozen = on),
  },
});

// ───────────── boot ─────────────
bestEl.textContent = String(best);
void setupNative({
  onPause: () => {
    if (game.phase === 'play' && !frozen) $('settings-btn').click();
  },
  onBack: () => {
    if (!$('settings').hidden) {
      closeSettings();
      return true;
    }
    return false;
  },
});
requestAnimationFrame(frame);
