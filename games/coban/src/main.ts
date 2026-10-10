import './style.css';
import {
  createMeta, createProfile, createStore, haptic, initAds, initStore, maybeRequestReview, scheduleReminders, setHapticsEnabled,
  setSoundEnabled, setupNative, shareResult, tone, track, trackSession, unlockAudio,
} from '@studio/kit';
import {
  addTime, bark, barkReady, botAct, botPlan, createRushState, createState, dogStats, DT, FEATURE_LEVEL, generateLevel, H, KIND, levelParams,
  LEVEL_COUNT, penCenter, pennedCount, rushContinue, starsFor, step, timeLeft, UPGRADE_MAX, UPGRADE_PRICES, W,
  type Animal, type Circle, type Feature, type GameEvent, type State, type Upgrades,
} from './game';
import { lang, t } from './i18n';

declare const __APP_VERSION__: string;
// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/coban/PRIVACY.md';
// TODO(mağaza): yayınlanınca gerçek mağaza bağlantısı (App Store / Play) ile değiştir.
const STORE_URL = 'https://play.google.com/store/apps/details?id=com.indiestudio.coban';
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
const upgrades: Upgrades = { speed: 0, bark: 0, cd: 0, ...store.get<Partial<Upgrades>>('upgrades', {}) };
const seenTips = new Set<string>(store.get<string[]>('tips', []));
let remindersOn = store.get('reminders', false);

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
    { id: 'barks', targets: [5, 10, 20], reward: (n) => 20 + n * 3 },
    { id: 'rush', targets: [5, 10, 20], reward: (n) => 25 + n * 3 },
  ],
});
let skin = SKINS.find((s) => s.id === profile.data.skin) ?? SKINS[0];

// home hero: the dog herding a few sheep + the dog-training button
const hero = document.createElement('div');
hero.className = 'hero';
hero.innerHTML = `<canvas class="hero-art" width="600" height="240"></canvas>
  <button class="train-btn" id="train-btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17l5-5 3 3 6-7M14 8h5v5"/></svg><span>${t('upgrades')}</span><i class="train-dot" hidden></i></button>`;
const heroCanvas = hero.querySelector('canvas')!;

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  hero,
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
  endless: { title: t('rush'), subtitle: t('rushSub'), play: () => startRush() },
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
const stageCtx = canvas.getContext('2d')!;
let ctx = stageCtx; // drawing helpers paint here (swapped for the tip pictograms and the home hero)
const $ = (id: string) => document.getElementById(id)!;
const hud = document.querySelector('.hud') as HTMLElement;
const barkBtn = $('bark-btn') as HTMLButtonElement;
let S: State = createState(generateLevel(1));
let running = false;
let paused = false;
let continues = 0;
let dogAngle = -Math.PI / 2;
let dragging = false;
let tipTimer = 0;
let tipFocus: (() => { x: number; y: number; r: number } | null) | null = null;
let tipUntil = 0;
let shakeUntil = 0;
const headings = new Map<number, number>(); // smoothed draw angle per animal (no jitter)
interface Fx { kind: 'ring' | 'plus' | 'puff' | 'gate'; x: number; y: number; t0: number; r?: number }
let fx: Fx[] = [];
const now = () => performance.now() / 1000;

function begin(state: State) {
  S = state;
  running = true;
  paused = false;
  continues = 0;
  dogAngle = -Math.PI / 2;
  headings.clear();
  fx = [];
  meta.hideHome();
  barkBtn.hidden = !S.barkEnabled;
  lastCd = -1;
  barkUi();
  $('time-pill').hidden = !!S.rush;
  $('miss-pill').hidden = !S.rush;
  hudRefresh();
}

function startLevel(n: number) {
  n = Math.max(1, Math.min(LEVEL_COUNT, n));
  begin(createState(generateLevel(n), dogStats(upgrades)));
  $('level-label').textContent = t('level', { n });
  showTip(introTip(n));
  tone({ freq: 1100, to: 1700, duration: 0.18, type: 'sine', volume: 0.25 });
  track('level_start', { level: n });
  track('game_start', { level: n });
}

function startRush() {
  begin(createRushState(dogStats(upgrades)));
  $('level-label').textContent = t('rush');
  showTip(seenTips.has('bark') ? null : 'bark');
  tone({ freq: 900, to: 1500, duration: 0.2, type: 'sine', volume: 0.25 });
  track('rush_start');
  track('game_start', { mode: 'rush' });
}

// ───────────────────────── one-time wordless tips ─────────────────────────
type TipId = Feature | 'hint';
/** The first level with a new thing shows its tip (once per install). */
function introTip(n: number): TipId | null {
  if (n === 1 && !seenTips.has('hint')) return 'hint';
  const P = levelParams(n);
  const has: Record<Feature, boolean> = {
    bark: n >= FEATURE_LEVEL.bark, lamb: P.lambs > 0, black: P.black > 0, mud: P.mud > 0, goat: P.goats > 0,
    wolf: P.wolves > 0, gate: P.gate, goose: P.geese > 0,
  };
  return (Object.keys(FEATURE_LEVEL) as Feature[]).find((f) => has[f] && !seenTips.has(f)) ?? null;
}

function showTip(id: TipId | null) {
  const tip = $('tip');
  clearTimeout(tipTimer);
  tip.hidden = !id;
  barkBtn.classList.remove('hint');
  tipFocus = null;
  if (!id) return;
  seenTips.add(id);
  store.set('tips', [...seenTips]);
  // text only where words help; new animals/obstacles are shown, not told
  const text = id === 'hint' ? t('hint') : id === 'black' ? t('black') : id === 'wolf' ? t('wolf') : '';
  $('tip-text').textContent = text;
  $('tip-text').hidden = !text;
  drawTipArt(id);
  const first = (k: Animal['kind']) => () => {
    const a = S.sheep.find((x) => x.kind === k && !x.penned);
    return a ? { x: a.x, y: a.y, r: 22 } : null;
  };
  tipFocus = {
    hint: () => ({ x: S.dog.x, y: S.dog.y, r: 26 }),
    bark: () => ({ x: S.dog.x, y: S.dog.y, r: S.stats.barkR }),
    lamb: first('lamb'),
    black: first('black'),
    goat: first('goat'),
    goose: first('goose'),
    mud: () => { const c = S.circles.find((x) => x.kind === 'mud'); return c ? { x: c.x, y: c.y, r: c.r + 8 } : null; },
    gate: () => (S.button && !S.gateOpen ? { x: S.button.x, y: S.button.y, r: 26 } : null),
    wolf: () => { const w = S.wolves.find((x) => x.hidden <= 0); return w ? { x: w.x, y: w.y, r: 26 } : null; },
  }[id];
  tipUntil = now() + 5;
  if (id === 'bark') barkBtn.classList.add('hint');
  tipTimer = window.setTimeout(() => {
    tip.hidden = true;
    barkBtn.classList.remove('hint');
  }, 5000);
}

function banner(text: string) {
  const b = $('banner');
  b.textContent = text;
  b.hidden = false;
  b.style.animation = 'none';
  void b.offsetWidth;
  b.style.animation = '';
  window.setTimeout(() => (b.hidden = true), 1400);
}

// ───────────────────────── pause / results ─────────────────────────
function pause() {
  if (!running || paused || meta.covering) return;
  paused = true;
  meta.showPause({
    onResume: () => (paused = false),
    onRestart: () => (S.rush ? startRush() : startLevel(S.level)),
    onMenu: () => (running = false),
  });
}
$('pause-btn').addEventListener('click', () => {
  unlockAudio();
  haptic.light();
  pause();
});

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Adds a Share button to the result sheet the meta layer just opened. */
function addShare(text: string) {
  const res = document.querySelector('.m-result');
  if (!res || res.querySelector('[data-share]')) return;
  const b = document.createElement('button');
  b.className = 'm-btn ghost';
  b.dataset.share = '';
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>${t('share')}`;
  b.addEventListener('click', () => void shareResult({ title: t('title'), text, url: STORE_URL }));
  res.insertBefore(b, res.querySelector('[data-menu]'));
}

function onWin() {
  running = false;
  const stars = starsFor(S);
  const level = S.level;
  track('level_win', { level, stars, time: Math.round(S.time) });
  track('game_over', { level, win: true });
  if (profile.data.firstRun) profile.finishFirstRun();
  maybeRequestReview(level, stars === 3);
  meta.showWin({ level, stars, coins: 10 + stars * 5, onNext: () => startLevel(Math.min(level + 1, LEVEL_COUNT)) });
  addShare(t('shareWin', { n: S.sheep.length, level, time: clock(S.time), stars }));
  // ask for reminders at a happy moment — after the first win, never on the first screen
  if (!remindersOn) {
    remindersOn = true;
    store.set('reminders', true);
    void scheduleReminders([{ id: 1, title: t('remindTitle'), body: t('remindBody'), dailyHour: 19 }]);
  }
}

function onLose() {
  running = false;
  tone({ freq: 330, to: 200, duration: 0.4, type: 'triangle', volume: 0.3 });
  haptic.error();
  if (S.rush) {
    const score = S.rush.score;
    track('rush_over', { score, wave: S.rush.wave });
    track('game_over', { mode: 'rush', score });
    meta.showLose({
      score,
      coins: score,
      label: t('rushOver'),
      continuesUsed: continues,
      canContinue: continues < 2,
      onContinue: () => {
        continues++;
        rushContinue(S);
        running = true;
        track('continue', { mode: 'rush', n: continues });
      },
      onRetry: () => startRush(),
    });
    addShare(t('shareRush', { n: score }));
    return;
  }
  track('level_lose', { level: S.level, penned: pennedCount(S) });
  track('game_over', { level: S.level, win: false });
  meta.showFail({
    level: S.level,
    reason: t('timeUp'),
    continuesUsed: continues,
    onContinue: continues < 3
      ? () => {
          continues++;
          addTime(S);
          running = true;
          track('continue', { level: S.level, n: continues });
        }
      : undefined,
    onRetry: () => startLevel(S.level),
  });
}

// ───────────────────────── bark ─────────────────────────
function doBark() {
  unlockAudio();
  if (!running || paused || meta.covering) return;
  if (!bark(S)) {
    if (S.barkEnabled) barkBtn.classList.add('nope'), setTimeout(() => barkBtn.classList.remove('nope'), 250);
    return;
  }
  barkBtn.classList.remove('hint');
}
barkBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  doBark();
});
addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === 'b') {
    e.preventDefault();
    doBark();
  }
});

// ───────────────────────── dog training (upgrades) ─────────────────────────
const UP_ROWS: { key: keyof Upgrades; label: () => string; icon: string }[] = [
  { key: 'speed', label: () => t('upSpeed'), icon: '<path d="M4 16h6M2 12h8M4 8h6"/><path d="M13 6l6 6-6 6"/>' },
  { key: 'bark', label: () => t('upBark'), icon: '<circle cx="8" cy="12" r="2"/><path d="M12 8a6 6 0 0 1 0 8M15 5a10 10 0 0 1 0 14M18 3a13 13 0 0 1 0 18"/>' },
  { key: 'cd', label: () => t('upCd'), icon: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M10 2h4"/>' },
];
const upPrice = (k: keyof Upgrades) => UPGRADE_PRICES[upgrades[k]] ?? 0;
const canTrain = () => UP_ROWS.some((r) => upgrades[r.key] < UPGRADE_MAX && profile.data.coins >= upPrice(r.key));
const trainRoot = document.createElement('div');
trainRoot.className = 'meta-root';
document.body.appendChild(trainRoot);

function openTraining() {
  const coin = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#ffc83d" stroke="#b57d10" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#e0a21c" stroke-width="1.6"/></svg>';
  const render = () => {
    trainRoot.innerHTML = `<div class="m-overlay" data-train-bg><div class="m-sheet"><div>
      <h2>${t('upgrades')}</h2><p class="m-note">${coin}<b>${profile.data.coins}</b> · ${t('upgradesNote')}</p>
      <div class="m-list">${UP_ROWS.map((r) => {
        const lvl = upgrades[r.key];
        const full = lvl >= UPGRADE_MAX;
        return `<div class="m-offer up-row"><span class="m-offer-ico"><svg viewBox="0 0 24 24">${r.icon}</svg></span>
          <span class="m-offer-body"><b>${r.label()}</b><span class="pips">${Array.from({ length: UPGRADE_MAX }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span></span>
          <button class="m-btn small" data-up="${r.key}" ${full ? 'disabled' : ''}>${full ? t('max') : `${coin}${upPrice(r.key)}`}</button></div>`;
      }).join('')}</div>
      <button class="m-btn ghost" data-train-close>OK</button></div></div></div>`;
  };
  render();
  trainRoot.onclick = (e) => {
    const el = e.target as HTMLElement;
    if (el.matches('[data-train-bg]') || el.closest('[data-train-close]')) {
      trainRoot.innerHTML = '';
      refreshTrainDot();
      return;
    }
    const b = el.closest<HTMLElement>('[data-up]');
    if (!b) return;
    const k = b.dataset.up as keyof Upgrades;
    if (upgrades[k] >= UPGRADE_MAX) return;
    if (!profile.spend(upPrice(k))) {
      meta.toast(t('notEnough'));
      haptic.error();
      return;
    }
    upgrades[k]++;
    store.set('upgrades', upgrades);
    track('upgrade', { kind: k, level: upgrades[k] });
    haptic.success();
    [0, 4, 7].forEach((st, i) => tone({ freq: 523 * Math.pow(2, st / 12), duration: 0.14, volume: 0.3, delay: i * 0.07 }));
    render();
  };
}
const refreshTrainDot = () => ((hero.querySelector('.train-dot') as HTMLElement).hidden = !canTrain());
$('train-btn').addEventListener('click', () => {
  unlockAudio();
  haptic.light();
  openTraining();
});
profile.onChange(refreshTrainDot);
refreshTrainDot();

// ───────────────────────── input ─────────────────────────
let view = { s: 1, ox: 0, oy: 0 };
function toWorld(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(W, (e.clientX - r.left - view.ox) / view.s)), y: Math.max(0, Math.min(H, (e.clientY - r.top - view.oy) / view.s)) };
}
let dragId = -1;
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (!running || paused) return;
  if (dragging && e.pointerId !== dragId) return; // a second finger doesn't steal the dog
  dragging = true;
  dragId = e.pointerId;
  $('tip').classList.add('faint');
  canvas.setPointerCapture(e.pointerId);
  S.target = toWorld(e);
});
canvas.addEventListener('pointermove', (e) => {
  if (dragging && running && e.pointerId === dragId) S.target = toWorld(e);
});
const up = (e: PointerEvent) => {
  if (e.pointerId !== dragId) return;
  dragging = false;
  $('tip').classList.remove('faint');
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);

void setupNative({
  onBack: () => {
    if (trainRoot.firstChild) {
      trainRoot.innerHTML = '';
      return true;
    }
    return meta.back() || (running && !paused && !meta.covering ? (pause(), true) : false);
  },
  onPause: () => pause(),
});

// ───────────────────────── loop ─────────────────────────
let last = performance.now();
let acc = 0;
function handle(e: GameEvent) {
  const t0 = now();
  switch (e.type) {
    case 'pen':
      profile.progress('sheep', 1);
      if (S.rush) profile.progress('rush', 1);
      fx.push({ kind: 'plus', x: e.x, y: e.y, t0 });
      penSound(e.kind);
      haptic.light();
      break;
    case 'bark':
      fx.push({ kind: 'ring', x: S.dog.x, y: S.dog.y, t0, r: S.stats.barkR });
      shakeUntil = t0 + 0.18;
      tone({ freq: 340, to: 190, duration: 0.11, type: 'sawtooth', volume: 0.32 });
      tone({ freq: 300, to: 165, duration: 0.13, type: 'square', volume: 0.16, delay: 0.12 });
      haptic.medium();
      profile.progress('barks', 1);
      track('bark', { scared: e.scared });
      break;
    case 'gate':
      fx.push({ kind: 'gate', x: S.pen.gx, y: S.pen.y + S.pen.h, t0 });
      tone({ freq: 620, to: 930, duration: 0.14, type: 'triangle', volume: 0.3 });
      tone({ freq: 930, to: 1240, duration: 0.18, type: 'triangle', volume: 0.3, delay: 0.12 });
      haptic.success();
      break;
    case 'hop':
      tone({ freq: 480, to: 820, duration: 0.09, type: 'sine', volume: 0.14 });
      break;
    case 'escape':
      fx.push({ kind: 'puff', x: e.x, y: e.y, t0 });
      tone({ freq: 420, to: 240, duration: 0.3, type: 'triangle', volume: 0.3 });
      haptic.heavy();
      break;
    case 'wave':
      if (e.n > 1) banner(t('wave', { n: e.n }));
      tone({ freq: 440, duration: 0.16, type: 'triangle', volume: 0.22 });
      tone({ freq: 587, duration: 0.22, type: 'triangle', volume: 0.22, delay: 0.14 });
      break;
  }
}
function penSound(kind: Animal['kind']) {
  if (kind === 'goose') tone({ freq: 720, to: 560, duration: 0.14, type: 'square', volume: 0.16 });
  else if (kind === 'goat') tone({ freq: 380, to: 340, duration: 0.24, type: 'sawtooth', volume: 0.16 });
  else if (kind === 'lamb') tone({ freq: 760, to: 640, duration: 0.2, type: 'triangle', volume: 0.28 });
  else tone({ freq: 520, to: 430, duration: 0.22, type: 'triangle', volume: 0.3 });
}

function frame(nowMs: number) {
  const dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  if (running && !paused && !meta.covering) {
    acc += dt;
    while (acc >= DT && running) {
      acc -= DT;
      const newly = step(S);
      for (const e of S.events) handle(e);
      S.events.length = 0;
      if (newly) hudRefresh();
      if (S.result === 'win') onWin();
      else if (S.result === 'lose') onLose();
    }
    if (S.ticks % 10 === 0) hudRefresh();
    barkUi();
  } else acc = 0;
  draw(nowMs / 1000);
  drawHero(nowMs / 1000);
  requestAnimationFrame(frame);
}

let lastHud = '';
function hudRefresh() {
  const R = S.rush;
  const left = Math.ceil(timeLeft(S));
  const missSvg = (on: boolean) => `<svg viewBox="0 0 24 24" class="${on ? 'gone' : ''}"><circle cx="10" cy="13" r="6"/><circle cx="17" cy="10" r="3"/></svg>`;
  const key = R ? `${R.score}|${R.missed}` : `${pennedCount(S)}|${left}`;
  if (key !== lastHud) {
    lastHud = key;
    $('sheep-count').textContent = R ? String(R.score) : `${pennedCount(S)}/${S.sheep.length}`;
    if (R) $('miss-pill').innerHTML = Array.from({ length: R.limit }, (_, i) => missSvg(i < R.missed)).join('');
    else {
      $('time').textContent = clock(left);
      $('time-pill').classList.toggle('low', left <= 10);
    }
  }
}
let lastCd = -1;
function barkUi() {
  const cd = Math.round((S.barkCd / S.stats.barkCd) * 100) / 100;
  if (cd === lastCd) return;
  lastCd = cd;
  barkBtn.style.setProperty('--cd', String(cd));
  barkBtn.classList.toggle('ready', barkReady(S));
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
  ctx = stageCtx;
  const dpr = canvas.width / innerWidth;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#5f9e48';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const shake = time < shakeUntil ? Math.sin(time * 90) * 2.2 : 0;
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * (view.ox + shake), dpr * view.oy);
  const p = S.pen;
  const hy = p.y + p.h;
  // meadow
  ctx.fillStyle = '#8fcf68';
  rr(0, 0, W, H, 18);
  ctx.fill();
  ctx.strokeStyle = '#78bb55';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = hash(i) * W, y = hy + hash(i + 99) * (H - hy);
    ctx.beginPath();
    ctx.moveTo(x - 3, y + 2); ctx.lineTo(x - 1, y - 3);
    ctx.moveTo(x + 1, y + 2); ctx.lineTo(x + 3, y - 4);
    ctx.stroke();
  }
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? '#fff6c2' : '#ffd1e0';
    ctx.beginPath();
    ctx.arc(hash(i + 300) * W, hy + 20 + hash(i + 400) * (H - hy - 20), 2.2, 0, 7);
    ctx.fill();
  }
  // mud under everything
  for (const c of S.circles) if (c.kind === 'mud') mud(c, time);
  // pen + the hedgerow it is set into
  hedgeRow(p.x, p.x + p.w, hy);
  ctx.fillStyle = '#e8cf8f';
  rr(p.x, p.y, p.w, p.h, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,120,60,.18)';
  for (let i = 0; i < 12; i++) ctx.fillRect(p.x + 8 + hash(i + 500) * (p.w - 20), p.y + 8 + hash(i + 600) * (p.h - 16), 7, 2);
  gate(time);
  for (const w of S.walls.slice(0, 5)) fence(w.a.x, w.a.y, w.b.x, w.b.y);
  // gate posts
  for (const gx of [p.gx - p.gw / 2, p.gx + p.gw / 2]) {
    ctx.fillStyle = '#5a3518';
    ctx.beginPath(); ctx.arc(gx, hy, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath(); ctx.moveTo(gx, hy - 4); ctx.lineTo(gx, hy - 18); ctx.lineTo(gx + (gx < p.gx ? -9 : 9), hy - 14); ctx.lineTo(gx, hy - 11); ctx.fill();
    ctx.strokeStyle = '#5a3518'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(gx, hy - 4); ctx.lineTo(gx, hy - 18); ctx.stroke();
  }
  for (const f of S.fences) fence(f.a.x, f.a.y, f.b.x, f.b.y);
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
    } else if (c.kind === 'bush') bush(c);
  }
  // finger target
  if (S.target && running && dragging) {
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(S.target.x, S.target.y, 14 + Math.sin(time * 8) * 2, 0, 7); ctx.stroke();
  }
  // tip highlight
  const focus = tipFocus && time < tipUntil ? tipFocus() : null;
  if (focus) {
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -time * 20;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(focus.x, focus.y, focus.r + Math.sin(time * 5) * 3, 0, 7); ctx.stroke();
    ctx.restore();
  }
  for (const w of S.wolves) if (w.hidden <= 0) wolf(w.x, w.y, w.edge === 'left' ? 0 : Math.PI, time);
  // animals (smoothed headings → no jitter)
  for (const a of S.sheep) {
    const target = a.heading;
    const cur = headings.get(a.id) ?? target;
    let d = target - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const h = cur + d * 0.2;
    headings.set(a.id, h);
    animal(a, h, time);
  }
  const sp = Math.hypot(S.dog.vx, S.dog.vy);
  if (sp > 12) {
    const target = Math.atan2(S.dog.vy, S.dog.vx);
    let d = target - dogAngle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    dogAngle += d * 0.3;
  }
  dog(S.dog.x, S.dog.y, dogAngle, time, sp, S.barkAt >= 0 && S.time - S.barkAt < 0.25);
  drawFx(time);
  if (!running && !S.rush && pennedCount(S) === S.sheep.length) {
    const c = penCenter(p);
    ctx.fillStyle = '#ffd34d';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(c.x + Math.cos(time * 2 + i * 1.26) * 50, c.y + Math.sin(time * 2 + i * 1.26) * 30, 3, 0, 7); ctx.fill(); }
  }
}

function drawFx(time: number) {
  fx = fx.filter((f) => time - f.t0 < 1);
  for (const f of fx) {
    const k = Math.max(0, time - f.t0); // rAF time can trail performance.now()
    if (f.kind === 'ring') {
      for (const [delay, w] of [[0, 6], [0.08, 3]]) {
        const q = Math.min(1, Math.max(0, (k - delay) / 0.45));
        if (q <= 0 || q >= 1) continue;
        const ease = 1 - (1 - q) ** 3;
        ctx.strokeStyle = `rgba(255,255,255,${0.95 * (1 - q * q)})`;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.arc(f.x, f.y, 12 + (f.r! - 12) * ease, 0, 7); ctx.stroke();
      }
      if (k < 0.45) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 * (1 - k / 0.45)})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r! * (1 - (1 - k / 0.45) ** 3), 0, 7); ctx.fill();
      }
    } else if (f.kind === 'plus') {
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(31,51,36,.6)';
      ctx.lineWidth = 3;
      ctx.font = '900 16px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeText('+1', f.x, f.y - 14 - k * 24);
      ctx.fillText('+1', f.x, f.y - 14 - k * 24);
      ctx.globalAlpha = 1;
    } else if (f.kind === 'puff') {
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(f.x + Math.cos(i) * k * 26, f.y + Math.sin(i * 1.7) * k * 26, 6 * (1 - k) + 2, 0, 7); ctx.fill(); }
    } else if (f.kind === 'gate') {
      ctx.strokeStyle = `rgba(255,211,77,${1 - k})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 50, Math.PI, 0); ctx.stroke();
    }
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
function bush(c: Circle) {
  const dark = c.hedge ? '#2f6f33' : '#3f8f3a', light = c.hedge ? '#418a3f' : '#58ad4b';
  ctx.fillStyle = 'rgba(0,0,0,.15)';
  ctx.beginPath(); ctx.ellipse(c.x + 2, c.y + 4, c.r, c.r * 0.8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = dark;
  for (const [dx, dy] of [[-0.45, 0.1], [0.45, 0.1], [0, -0.35], [0, 0.25]]) { ctx.beginPath(); ctx.arc(c.x + dx * c.r, c.y + dy * c.r, c.r * 0.65, 0, 7); ctx.fill(); }
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.arc(c.x - c.r * 0.2, c.y - c.r * 0.35, c.r * 0.35, 0, 7); ctx.fill();
}
/** Dense hedge filling the top of the meadow either side of the pen. */
function hedgeRow(x0: number, x1: number, y: number) {
  ctx.fillStyle = '#2f6f33';
  ctx.fillRect(-60, -400, W + 120, y + 400); // up to the screen edge; the pen is drawn on top
  for (const [a, b] of [[0, x0 - 4], [x1 + 4, W]]) {
    for (let x = a + 9; x < b; x += 15) {
      const k = hash(Math.round(x));
      ctx.fillStyle = '#3c8139';
      ctx.beginPath(); ctx.arc(x, y - 3 + k * 3, 11 + k * 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#4f9a46';
      ctx.beginPath(); ctx.arc(x - 3, y - 7 + k * 3, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#2a5f2c';
      ctx.beginPath(); ctx.arc(x + 4, y - 24 + k * 10, 9, 0, 7); ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.fillRect(0, y + 6, x0, 3);
  ctx.fillRect(x1, y + 6, W - x1, 3);
}
function mud(c: Circle, time: number) {
  ctx.fillStyle = '#7a4f28';
  blob(c.x, c.y, c.r + 2);
  ctx.fillStyle = '#946437';
  blob(c.x, c.y, c.r - 2);
  ctx.fillStyle = '#6b4321';
  for (let i = 0; i < 5; i++) {
    const a = i * 1.9 + c.x, d = c.r * (0.25 + (i % 3) * 0.2);
    ctx.beginPath(); ctx.ellipse(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 4, 2.5, a, 0, 7); ctx.fill();
  }
  ctx.strokeStyle = `rgba(255,255,255,${0.12 + Math.sin(time * 2 + c.x) * 0.05})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(c.x - c.r * 0.3, c.y - c.r * 0.3, c.r * 0.3, c.r * 0.12, -0.3, 0, 7); ctx.stroke();
}
/** The gate opening: a sandy path with chevrons; when locked, a bar + the paw button. */
function gate(time: number) {
  const p = S.pen, hy = p.y + p.h, x0 = p.gx - p.gw / 2, x1 = p.gx + p.gw / 2;
  ctx.fillStyle = 'rgba(232,207,143,.55)';
  ctx.beginPath(); ctx.moveTo(x0 + 2, hy); ctx.lineTo(x1 - 2, hy); ctx.lineTo(x1 + 10, hy + 36); ctx.lineTo(x0 - 10, hy + 36); ctx.fill();
  if (S.gateOpen) {
    for (let i = 0; i < 2; i++) {
      const y = hy + 30 - ((time * 26 + i * 14) % 28);
      ctx.strokeStyle = `rgba(255,255,255,${0.75 - ((time * 26 + i * 14) % 28) / 40})`;
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(p.gx - 9, y + 6); ctx.lineTo(p.gx, y - 2); ctx.lineTo(p.gx + 9, y + 6); ctx.stroke();
    }
    return;
  }
  // locked bar with stripes
  ctx.lineCap = 'butt';
  ctx.lineWidth = 6;
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = i % 2 ? '#fff' : '#e2533f';
    ctx.beginPath(); ctx.moveTo(x0 + (p.gw / 6) * i, hy); ctx.lineTo(x0 + (p.gw / 6) * (i + 1), hy); ctx.stroke();
  }
  ctx.lineCap = 'round';
  const b = S.button!;
  ctx.save();
  ctx.setLineDash([3, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.quadraticCurveTo((b.x + p.gx) / 2 + 30, (b.y + hy) / 2, p.gx, hy + 4); ctx.stroke();
  ctx.restore();
  const pulse = 1 + Math.sin(time * 5) * 0.08;
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(b.x + 1.5, b.y + 3, 17, 13, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#c84a36';
  ctx.beginPath(); ctx.arc(b.x, b.y, 16 * pulse, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff7a5c';
  ctx.beginPath(); ctx.arc(b.x, b.y - 1.5, 13 * pulse, 0, 7); ctx.fill();
  paw(b.x, b.y, 1, '#fff');
}
function paw(x: number, y: number, k: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y + 2.5 * k, 4.5 * k, 3.8 * k, 0, 0, 7); ctx.fill();
  for (const [dx, dy] of [[-5, -2.5], [-1.8, -5.5], [1.8, -5.5], [5, -2.5]]) { ctx.beginPath(); ctx.arc(x + dx * k, y + dy * k, 1.8 * k, 0, 7); ctx.fill(); }
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

function animal(a: Animal, heading: number, time: number) {
  const v = Math.hypot(a.vx, a.vy);
  const t = time + a.id;
  if (a.kind === 'goat') goat(a.x, a.y, heading, t, v, a.hop > 0 ? Math.sin((a.hop / 0.35) * Math.PI) : 0);
  else if (a.kind === 'goose') goose(a.x, a.y, heading, t, v);
  else sheep(a.x, a.y, heading, a.kind === 'black', t, v, a.kind === 'lamb' ? 0.72 : 1);
  if (a.scare > 0) {
    ctx.fillStyle = '#fff';
    ctx.font = '900 13px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', a.x, a.y - KIND[a.kind].r - 6);
  }
  if (S.rush && !a.penned && a.life < 8) {
    const blink = a.life < 4 ? Math.sin(time * 14) > 0 : true;
    if (blink) {
      ctx.strokeStyle = '#ff5a4a';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(a.x, a.y, KIND[a.kind].r + 5, -Math.PI / 2, -Math.PI / 2 + (a.life / 8) * Math.PI * 2); ctx.stroke();
    }
  }
}
function sheep(x: number, y: number, a: number, black: boolean, t: number, v: number, k = 1) {
  const bob = v > 5 ? Math.sin(t * 18) * 0.8 : 0;
  const lamb = k < 1;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(k, k);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(1.5, 4 - bob, 10, 7, 0, 0, 7); ctx.fill();
  ctx.rotate(a);
  ctx.fillStyle = black ? '#1e1f24' : lamb ? '#e9b7a6' : '#3b302a';
  ctx.beginPath(); ctx.ellipse(8.5, 0, lamb ? 5.5 : 5, 4, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(7, -4.5, 2.6, 1.4, -0.6, 0, 7); ctx.ellipse(7, 4.5, 2.6, 1.4, 0.6, 0, 7); ctx.fill();
  ctx.fillStyle = black ? '#3a3b43' : lamb ? '#fffaf2' : '#f7f4ec';
  for (const [dx, dy, r] of [[-3, -3.5, 5.5], [-3, 3.5, 5.5], [2, -3, 5], [2, 3, 5], [-5.5, 0, 5], [1, 0, 6]]) { ctx.beginPath(); ctx.arc(dx, dy, r, 0, 7); ctx.fill(); }
  ctx.fillStyle = black ? '#4b4c55' : '#ffffff';
  ctx.beginPath(); ctx.arc(-1, -2, 3, 0, 7); ctx.fill();
  if (lamb) {
    ctx.fillStyle = '#2a2220';
    ctx.beginPath(); ctx.arc(10.5, -1.6, 0.9, 0, 7); ctx.arc(10.5, 1.6, 0.9, 0, 7); ctx.fill();
  }
  ctx.restore();
}
function goat(x: number, y: number, a: number, t: number, v: number, hop: number) {
  const bob = v > 5 ? Math.sin(t * 16) * 0.8 : 0;
  ctx.save();
  ctx.translate(x, y + bob - hop * 9);
  ctx.fillStyle = `rgba(0,0,0,${0.16 - hop * 0.08})`;
  ctx.beginPath(); ctx.ellipse(1.5, 4 - bob + hop * 9, 10 - hop * 2, 6, 0, 0, 7); ctx.fill();
  ctx.scale(1 + hop * 0.15, 1 + hop * 0.15);
  ctx.rotate(a);
  ctx.fillStyle = '#c9a46a';
  ctx.beginPath(); ctx.ellipse(-1, 0, 10, 6.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#8a6a3d';
  ctx.beginPath(); ctx.ellipse(-4, -1, 4, 3, 0.4, 0, 7); ctx.fill();
  ctx.strokeStyle = '#c9a46a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-13, -2); ctx.stroke();
  ctx.fillStyle = '#d8b67c';
  ctx.beginPath(); ctx.ellipse(10, 0, 5, 4, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(8, -2.5); ctx.quadraticCurveTo(4, -6, 2, -4); ctx.moveTo(8, 2.5); ctx.quadraticCurveTo(4, 6, 2, 4); ctx.stroke();
  ctx.fillStyle = '#efe2c4';
  ctx.beginPath(); ctx.moveTo(14, -1.5); ctx.lineTo(18, 0); ctx.lineTo(14, 1.5); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(11.5, -2, 0.9, 0, 7); ctx.arc(11.5, 2, 0.9, 0, 7); ctx.fill();
  ctx.restore();
}
function goose(x: number, y: number, a: number, t: number, v: number) {
  const bob = v > 5 ? Math.sin(t * 22) * 0.7 : 0;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.fillStyle = 'rgba(0,0,0,.15)';
  ctx.beginPath(); ctx.ellipse(1, 3.5 - bob, 8, 5.5, 0, 0, 7); ctx.fill();
  ctx.rotate(a);
  ctx.fillStyle = '#fbfbf7';
  ctx.beginPath(); ctx.ellipse(-1, 0, 8.5, 5.5, 0, 0, 7); ctx.fill();
  const flap = v > 60 ? Math.sin(t * 30) * 1.5 : 0;
  ctx.fillStyle = '#c9ccd2';
  ctx.beginPath(); ctx.ellipse(-2, -3 - flap, 5.5, 2.4, 0.2, 0, 7); ctx.ellipse(-2, 3 + flap, 5.5, 2.4, -0.2, 0, 7); ctx.fill();
  ctx.strokeStyle = '#fbfbf7'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(10, 0); ctx.stroke();
  ctx.fillStyle = '#fbfbf7';
  ctx.beginPath(); ctx.arc(11, 0, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff9a2e';
  ctx.beginPath(); ctx.moveTo(13.5, -1.4); ctx.lineTo(17.5, 0); ctx.lineTo(13.5, 1.4); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(11.6, -1.4, 0.7, 0, 7); ctx.arc(11.6, 1.4, 0.7, 0, 7); ctx.fill();
  ctx.restore();
}
function dog(x: number, y: number, a: number, t: number, v: number, barking = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(1.5, 4, 13, 7, 0, 0, 7); ctx.fill();
  ctx.rotate(a);
  const run = Math.min(1, v / 120);
  // legs (under the body), swinging when running
  ctx.strokeStyle = skin.body === '#f7f7f4' ? '#d8d8d2' : skin.body;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  const sw = Math.sin(t * 20) * 3 * run;
  for (const [lx, side, ph] of [[6, -1, 1], [6, 1, -1], [-6, -1, -1], [-6, 1, 1]]) {
    ctx.beginPath(); ctx.moveTo(lx, side * 4); ctx.lineTo(lx + sw * ph, side * 7.5); ctx.stroke();
  }
  const wag = Math.sin(t * (v > 10 ? 22 : 8)) * 0.5;
  ctx.strokeStyle = skin.body;
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-15, Math.sin(wag) * 6); ctx.stroke();
  ctx.fillStyle = skin.body;
  ctx.beginPath(); ctx.ellipse(-1, 0, 11, 6.5, 0, 0, 7); ctx.fill();
  if (skin.spots) {
    ctx.fillStyle = skin.spots;
    for (const [dx, dy] of [[-5, -2], [1, 3], [-2, -4], [4, -1]]) { ctx.beginPath(); ctx.arc(dx, dy, 1.4, 0, 7); ctx.fill(); }
  }
  ctx.fillStyle = skin.accent;
  ctx.beginPath(); ctx.ellipse(3, 0, 4, 4.6, 0, 0, 7); ctx.fill();
  const hx = barking ? 11.5 : 10;
  ctx.fillStyle = skin.body;
  ctx.beginPath(); ctx.arc(hx, 0, 5.5, 0, 7); ctx.fill();
  ctx.fillStyle = skin.accent;
  ctx.beginPath(); ctx.ellipse(hx + 3.5, 0, 3.2, 2.6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(hx + 6.2, 0, 1.3, 0, 7); ctx.fill();
  if (barking) {
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.ellipse(hx + 5, 0, 1.6, 1.2, 0, 0, 7); ctx.fill();
  }
  ctx.fillStyle = skin.id === 'kangal' ? '#2d2620' : skin.body;
  ctx.beginPath(); ctx.ellipse(hx - 2, -5, 3, 1.8, barking ? -0.9 : -0.5, 0, 7); ctx.ellipse(hx - 2, 5, 3, 1.8, barking ? 0.9 : 0.5, 0, 7); ctx.fill();
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

// ───────────────────────── tip pictograms (drawn with the game's own art) ─────────────────────────
const tipCanvas = $('tip-art') as HTMLCanvasElement;
function arrow(x0: number, y0: number, x1: number, y1: number, curve = 0) {
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - curve;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
  const ang = Math.atan2(y1 - my, x1 - mx);
  ctx.beginPath();
  ctx.moveTo(x1 + Math.cos(ang) * 4, y1 + Math.sin(ang) * 4);
  ctx.lineTo(x1 + Math.cos(ang + 2.5) * 8, y1 + Math.sin(ang + 2.5) * 8);
  ctx.lineTo(x1 + Math.cos(ang - 2.5) * 8, y1 + Math.sin(ang - 2.5) * 8);
  ctx.fill();
}
function drawTipArt(id: TipId) {
  const c = tipCanvas.getContext('2d')!;
  const saved = ctx;
  ctx = c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, tipCanvas.width, tipCanvas.height);
  c.setTransform(2, 0, 0, 2, 0, 0); // 150×64 art space
  const T = 1.3;
  switch (id) {
    case 'hint': {
      dog(40, 34, 0, T, 100);
      arrow(58, 34, 96, 34);
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(112, 34, 9, 0, 7); c.fill();
      c.fillStyle = '#1f3324';
      c.beginPath(); c.arc(112, 34, 4, 0, 7); c.fill();
      break;
    }
    case 'bark': {
      dog(28, 34, 0, T, 0, true);
      c.strokeStyle = '#fff';
      c.lineWidth = 2.5;
      for (const r of [12, 20, 28]) { c.beginPath(); c.arc(42, 34, r, -0.7, 0.7); c.stroke(); }
      sheep(96, 22, 0, false, T, 80);
      sheep(104, 46, 0.3, false, T, 80);
      arrow(114, 22, 138, 22);
      arrow(122, 46, 144, 50);
      break;
    }
    case 'lamb': {
      sheep(92, 32, 0, false, T, 50);
      sheep(62, 34, 0, false, T, 50, 0.72);
      c.fillStyle = '#ff6f8a';
      c.beginPath(); c.moveTo(77, 18); c.bezierCurveTo(70, 10, 64, 18, 77, 26); c.bezierCurveTo(90, 18, 84, 10, 77, 18); c.fill();
      arrow(18, 34, 46, 34);
      break;
    }
    case 'black': {
      sheep(50, 34, 0, true, T, 30);
      sheep(102, 34, 0, false, T, 90);
      c.fillStyle = '#fff';
      c.fillRect(66, 33, 10, 3);
      for (const [x, y] of [[120, 30], [124, 36], [118, 40]]) { c.fillRect(x, y, 10, 2.5); }
      break;
    }
    case 'mud': {
      mud({ x: 75, y: 36, r: 28, kind: 'mud' }, T);
      dog(75, 34, 0, T, 30);
      arrow(108, 34, 122, 34);
      arrow(10, 34, 40, 34);
      break;
    }
    case 'goat': {
      fence(75, 12, 75, 58);
      goat(48, 40, 0, T, 0, 0);
      goat(108, 40, 0, T, 40, 0.6);
      arrow(56, 26, 100, 26, 18);
      break;
    }
    case 'wolf': {
      wolf(40, 34, 0, T);
      dog(110, 34, Math.PI, T, 100);
      arrow(92, 34, 62, 34);
      break;
    }
    case 'gate': {
      const bx = 30, by = 40;
      c.fillStyle = '#c84a36';
      c.beginPath(); c.arc(bx, by, 14, 0, 7); c.fill();
      c.fillStyle = '#ff7a5c';
      c.beginPath(); c.arc(bx, by - 1.5, 11.5, 0, 7); c.fill();
      paw(bx, by, 0.9, '#fff');
      arrow(50, 36, 88, 30, 10);
      fence(100, 20, 108, 20);
      fence(132, 20, 140, 20);
      c.fillStyle = '#ffd34d';
      for (let i = 0; i < 2; i++) { c.beginPath(); c.moveTo(114 + i * 6, 38); c.lineTo(120 + i * 6, 30); c.lineTo(126 + i * 6, 38); c.fill(); }
      break;
    }
    case 'goose': {
      goose(46, 24, 0, T, 120);
      goose(36, 40, 0, T, 120);
      goose(58, 44, 0, T, 120);
      c.fillStyle = '#fff';
      for (const [x, y] of [[14, 22], [6, 38], [26, 46]]) c.fillRect(x, y, 12, 2.5);
      arrow(78, 34, 140, 34);
      break;
    }
  }
  ctx = saved;
}

// ───────────────────────── home hero (animated) ─────────────────────────
const heroCtx = heroCanvas.getContext('2d')!;
function drawHero(time: number) {
  if (!heroCanvas.isConnected || heroCanvas.offsetParent === null) return;
  const saved = ctx;
  ctx = heroCtx;
  heroCtx.setTransform(1, 0, 0, 1, 0, 0);
  heroCtx.clearRect(0, 0, 600, 240);
  heroCtx.setTransform(2, 0, 0, 2, 0, 0); // 300×120 art space
  const p = (time * 0.35) % 1;
  const x = -40 + p * 380;
  for (const [i, dx, dy] of [[0, 0, -16], [1, -18, 8], [2, 14, 14]]) {
    sheep(x + 60 + dx, 64 + dy + Math.sin(time * 3 + i) * 2, 0, false, time + i, 100);
  }
  sheep(x + 40, 76, 0, false, time + 5, 100, 0.72);
  dog(x, 66, 0, time, 140);
  ctx = saved;
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
  upgrades,
  start: (n: number) => startLevel(n),
  rush: () => startRush(),
  bark: () => doBark(),
  /** What the herding bot would do now (Playwright drives the real pointer with it). */
  plan: () => botPlan(S),
  get view() { return view; },
  train: () => openTraining(),
  win() {
    const c = penCenter(S.pen);
    S.sheep.forEach((sh, i) => { sh.penned = true; sh.x = c.x + ((i % 5) - 2) * 18; sh.y = c.y + (Math.floor(i / 5) - 1) * 18; });
  },
  lose() {
    if (S.rush) S.rush.missed = S.rush.limit;
    else S.timeLimit = S.time + 0.05;
  },
  /** Fast-forwards the sim with the built-in bot (store screenshots). */
  sim(sec: number) {
    for (let i = 0; i < sec * 60 && !S.result; i++) {
      if (i % 6 === 0) botAct(S);
      step(S);
      S.events.length = 0;
    }
    dragging = true;
    hudRefresh();
  },
  /** Draws a bark shockwave frozen mid-air (store screenshots). */
  barkShot() {
    fx.push({ kind: 'ring', x: S.dog.x, y: S.dog.y, t0: now() - 0.14, r: S.stats.barkR });
    for (const a of S.sheep) if (Math.hypot(a.x - S.dog.x, a.y - S.dog.y) < S.stats.barkR) a.scare = 0.5;
  },
};

resize();
hudRefresh();
meta.showHome();
requestAnimationFrame(frame);
