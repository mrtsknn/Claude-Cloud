import './style.css';
import {
  createMeta,
  createProfile,
  createStore,
  haptic,
  initAds,
  initStore,
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
  BAKE,
  LEVELS,
  TRAY_SIZE,
  addTime,
  apply,
  bake,
  botAction,
  isOver,
  newGame,
  ovenPhase,
  serve,
  starsFor,
  step,
  tapOven,
  trashTray,
  type Item,
  type State,
} from './game';
import { lang, t } from './i18n';

declare const __APP_VERSION__: string;
// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/firin/PRIVACY.md';

document.documentElement.lang = lang;
document.title = t('title');
const $ = (id: string) => document.getElementById(id)!;

// ───────────────────────── art ─────────────────────────
type Tone = 'dough' | 'gold' | 'burnt';
const SHADE: Record<Item, Record<Tone, [string, string]>> = {
  bread: { dough: ['#f4e3c3', '#d9c09a'], gold: ['#e3a052', '#a8642a'], burnt: ['#4a3226', '#21140e'] },
  ring: { dough: ['#f4e3c3', '#d9c09a'], gold: ['#c97a35', '#8a4a1c'], burnt: ['#4a3226', '#21140e'] },
  croissant: { dough: ['#f6e6c8', '#dcc39c'], gold: ['#f0b24f', '#b9741f'], burnt: ['#4a3226', '#21140e'] },
  cake: { dough: ['#fbefd8', '#e5cfa8'], gold: ['#ffe2a8', '#e88aa2'], burnt: ['#4a3226', '#21140e'] },
  cookie: { dough: ['#f2ddb8', '#cfb184'], gold: ['#d99b55', '#6b3d22'], burnt: ['#3e2a20', '#1a100b'] },
};
function itemSvg(it: Item, tn: Tone = 'gold') {
  const [a, b] = SHADE[it][tn];
  const body: Record<Item, string> = {
    bread: `<ellipse cx="24" cy="27" rx="19" ry="12" fill="${b}"/><ellipse cx="24" cy="24" rx="18" ry="11" fill="${a}"/><path d="M14 20l5 7M22 18l5 8M30 18l5 7" stroke="${b}" stroke-width="2.4" stroke-linecap="round"/>`,
    ring: `<circle cx="24" cy="25" r="16" fill="none" stroke="${b}" stroke-width="10"/><circle cx="24" cy="23" r="15" fill="none" stroke="${a}" stroke-width="9"/>${tn === 'gold' ? [[14, 14], [24, 9], [34, 14], [38, 24], [10, 24], [16, 33], [30, 34]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.4" ry="0.9" fill="#fff4d6"/>`).join('') : ''}`,
    croissant: `<path d="M5 31c4-14 13-20 19-20s15 6 19 20c-5 1-8-2-10-4-2 4-6 6-9 6s-7-2-9-6c-2 2-5 5-10 4z" fill="${b}"/><path d="M6 29c4-12 12-17 18-17s14 5 18 17c-4 0-7-2-9-5-2 4-6 6-9 6s-7-2-9-6c-2 3-5 5-9 5z" fill="${a}"/><path d="M17 16l3 12M24 13v15M31 16l-3 12" stroke="${b}" stroke-width="2" stroke-linecap="round"/>`,
    cake: `<path d="M6 36L40 18v18z" fill="${tn === 'gold' ? '#c98a4a' : b}"/><path d="M6 30l34-12v6L6 36z" fill="${a}"/><path d="M6 30l34-12" stroke="${b}" stroke-width="3"/>${tn === 'gold' ? '<path d="M8 33l32-10" stroke="#fff" stroke-width="2.5"/><circle cx="33" cy="15" r="3.5" fill="#d94352"/>' : ''}`,
    cookie: `<circle cx="24" cy="25" r="17" fill="${b}" opacity=".5"/><circle cx="24" cy="24" r="16" fill="${a}"/>${[[17, 18], [29, 17], [22, 27], [32, 28], [16, 31]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${tn === 'dough' ? '#8a5a3c' : b}"/>`).join('')}`,
  };
  return `<svg class="item" viewBox="0 0 48 48">${body[it]}</svg>`;
}
const LOOKS = ['#7cc4a8', '#f2a65a', '#8fa8f0', '#e98aa2', '#c3a3e6', '#f2cf5b'];
function personSvg(look: number) {
  return `<svg class="person" viewBox="0 0 60 60"><path d="M8 60c0-16 10-24 22-24s22 8 22 24z" fill="${LOOKS[look]}"/><circle cx="30" cy="24" r="15" fill="${LOOKS[(look + 2) % 6]}"/><circle cx="25" cy="23" r="2.2" fill="#2a1a12"/><circle cx="35" cy="23" r="2.2" fill="#2a1a12"/><path class="mouth" d="M25 30q5 4 10 0" stroke="#2a1a12" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`;
}

// ───────────────────────── skins ─────────────────────────
const SKINS = [
  { id: 'classic', price: 0, a: '#d9483b', b: '#fff4e0' },
  { id: 'mint', price: 150, a: '#2f9e7e', b: '#effcf5' },
  { id: 'ocean', price: 250, a: '#2f6fb5', b: '#eef5ff' },
  { id: 'sun', price: 400, a: '#e9a514', b: '#fff8e1' },
  { id: 'plum', price: 600, a: '#7e4a93', b: '#f7eefa' },
  { id: 'night', price: 900, a: '#26304a', b: '#c8d2ec' },
] as const;
function applySkin(id: string) {
  document.documentElement.dataset.skin = id;
}

// ───────────────────────── settings / meta ─────────────────────────
const store = createStore('firin');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);
trackSession('firin');

const profile = createProfile({
  game: 'firin',
  levelCount: LEVELS,
  defaultSkin: 'classic',
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'served', targets: [15, 25, 40], reward: (n) => 20 + n },
    { id: 'combo', targets: [5, 10, 15], reward: (n) => 25 + n * 2 },
  ],
});
applySkin(profile.data.skin);

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  skins: SKINS.map((s) => ({
    id: s.id,
    name: t(`skin_${s.id}` as 'skin_classic'),
    price: s.price,
    swatch: `repeating-linear-gradient(90deg, ${s.a} 0 14px, ${s.b} 14px 28px)`,
  })),
  onSkin: applySkin,
  levels: { count: LEVELS, play: (n) => start(n) },
  missionText: (id, n) => t(`mission_${id}` as 'mission_levels', { n }),
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});
void initAds();
void initStore();

// ───────────────────────── game screen ─────────────────────────
let S: State | null = null;
let paused = false;
let continues = 0;
let ended = false;
let autoplay = 0; // e2e/screenshots: bot speed multiplier
const gameEl = $('game');
const counter = $('counter');
const ovensEl = $('ovens');
const trayEl = $('tray');
const stations = $('stations');
const hintEl = $('hint');

function start(level: number) {
  S = newGame(level);
  continues = 0;
  ended = false;
  paused = false;
  gameEl.hidden = false;
  $('level-label').textContent = t('level', { n: level });
  const [s1, s2, s3] = S.cfg.stars;
  const ticks = gameEl.querySelectorAll<HTMLElement>('.goal-bar s');
  ticks[0].style.left = `${(s1 / s3) * 100}%`;
  ticks[1].style.left = `${(s2 / s3) * 100}%`;
  counter.innerHTML = '';
  counter.style.setProperty('--n', String(S.cfg.seats));
  for (let i = 0; i < S.cfg.seats; i++) {
    const c = document.createElement('button');
    c.className = 'seat empty';
    c.innerHTML = `<div class="bubble"></div><div class="who"></div><div class="pat"><i></i></div>`;
    c.addEventListener('pointerdown', () => act(() => serve(S!, i)));
    counter.appendChild(c);
  }
  ovensEl.innerHTML = '';
  ovensEl.style.setProperty('--o', String(S.cfg.ovens));
  S.ovens.forEach((_, i) => {
    const o = document.createElement('button');
    o.className = 'oven';
    o.innerHTML = `<svg class="ring" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/><circle class="prog" cx="32" cy="32" r="28" pathLength="100"/></svg><div class="slot"></div>`;
    o.addEventListener('pointerdown', () => act(() => tapOven(S!, i)));
    ovensEl.appendChild(o);
  });
  stations.innerHTML = '';
  S.cfg.items.forEach((it) => {
    const b = document.createElement('button');
    b.className = 'station';
    b.innerHTML = itemSvg(it, 'dough') + `<small>${BAKE[it]}s</small>`;
    b.addEventListener('pointerdown', () => act(() => (bake(S!, it) >= 0 ? true : (toast(t('ovensFull')), false))));
    stations.appendChild(b);
  });
  hintEl.textContent = t('hint');
  hintEl.hidden = level > 2;
  keys = {};
  render();
  track('game_start', { level });
}

function act(fn: () => boolean | void) {
  if (!S || paused || ended || meta.covering) return;
  unlockAudio();
  fn();
  drain();
  render();
}

function toast(text: string) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  clearTimeout((toast as unknown as { h: number }).h);
  (toast as unknown as { h: number }).h = window.setTimeout(() => (el.hidden = true), 1300);
}

function floatText(target: Element, text: string, cls = '') {
  const r = target.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = `float ${cls}`;
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top + r.height * 0.3}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 900);
}

/** Turn sim events into sound, haptics and little pops. */
function drain() {
  if (!S) return;
  for (const e of S.events) {
    switch (e.type) {
      case 'bake':
        tone({ freq: 330, to: 420, duration: 0.08, volume: 0.25 });
        haptic.light();
        break;
      case 'ready':
        tone({ freq: pentatonic(4), duration: 0.12, volume: 0.3 });
        break;
      case 'burn':
        tone({ freq: 160, to: 90, duration: 0.25, type: 'sawtooth', volume: 0.2 });
        floatText(ovensEl.children[e.oven!], t('burnt'), 'bad');
        haptic.medium();
        break;
      case 'pick':
        tone({ freq: pentatonic(6), duration: 0.08, volume: 0.3 });
        haptic.light();
        break;
      case 'trash':
        tone({ freq: 200, to: 120, duration: 0.1, volume: 0.2 });
        break;
      case 'fill':
        tone({ freq: pentatonic(5), duration: 0.08, volume: 0.3 });
        haptic.light();
        break;
      case 'serve':
        [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s + Math.min(e.combo!, 5)), duration: 0.12, volume: 0.3, delay: i * 0.05 }));
        haptic.success();
        floatText(counter.children[e.seat!], `+${e.coins}`, 'coin');
        if (e.combo! >= 2) toast(t('combo', { n: e.combo! }));
        profile.progress('served');
        if (e.combo! >= 2) profile.progress('combo');
        hintEl.hidden = true;
        break;
      case 'leave':
        tone({ freq: 260, to: 180, duration: 0.2, volume: 0.2 });
        haptic.medium();
        break;
      case 'reject':
        if (e.oven !== undefined) toast(t('trayFull'));
        else if (e.seat !== undefined) {
          counter.children[e.seat].classList.remove('shake');
          void (counter.children[e.seat] as HTMLElement).offsetWidth;
          counter.children[e.seat].classList.add('shake');
        }
        haptic.light();
        break;
    }
  }
  S.events.length = 0;
}

let keys: Record<string, string> = {};
function setHtml(el: Element, key: string, html: string) {
  const id = (el as HTMLElement).dataset.k ?? ((el as HTMLElement).dataset.k = String(Math.random()));
  if (keys[id] === key) return;
  keys[id] = key;
  el.innerHTML = html;
}

function render() {
  if (!S) return;
  const s = S;
  const sec = Math.ceil(s.time);
  const timer = $('timer');
  timer.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  timer.classList.toggle('low', sec <= 10);
  $('coins-label').textContent = `${s.coins} / ${s.cfg.target}`;
  $('goal-fill').style.width = `${Math.min(1, s.coins / s.cfg.stars[2]) * 100}%`;
  $('goal-fill').classList.toggle('met', s.coins >= s.cfg.target);

  s.seats.forEach((c, i) => {
    const el = counter.children[i] as HTMLElement;
    el.classList.toggle('empty', !c);
    if (!c) {
      setHtml(el.children[0], 'none', '');
      setHtml(el.children[1], 'none', '');
      return;
    }
    setHtml(el.children[0], `${c.id}:${c.got.join()}`, c.order.map((it, k) => `<span class="${c.got[k] ? 'got' : ''}">${itemSvg(it)}</span>`).join(''));
    const f = c.patience / c.max;
    setHtml(el.children[1], `${c.id}:${f < 0.33}`, personSvg(c.look));
    el.classList.toggle('angry', f < 0.33);
    const bar = el.children[2].firstElementChild as HTMLElement;
    bar.style.width = `${f * 100}%`;
    bar.style.background = f > 0.66 ? '#4cc38a' : f > 0.33 ? '#f2b33d' : '#e5534b';
  });

  s.ovens.forEach((o, i) => {
    const el = ovensEl.children[i] as HTMLElement;
    const ph = ovenPhase(s, o);
    el.dataset.phase = ph;
    const prog = el.querySelector('.prog') as SVGCircleElement;
    let p = 0;
    if (ph === 'baking') p = o.t / BAKE[o.item!];
    else if (ph === 'ready') p = 1 - (o.t - BAKE[o.item!]) / s.cfg.burnAfter;
    prog.style.strokeDashoffset = String(100 - p * 100);
    setHtml(el.children[1], `${o.item}:${ph}`, o.item ? itemSvg(o.item, ph === 'baking' ? 'dough' : ph === 'ready' ? 'gold' : 'burnt') : '');
  });

  setHtml(
    trayEl,
    s.tray.join(),
    Array.from({ length: TRAY_SIZE }, (_, i) => `<button class="tslot" data-i="${i}">${s.tray[i] ? itemSvg(s.tray[i]) : ''}</button>`).join(''),
  );
}
trayEl.addEventListener('pointerdown', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.tslot');
  if (b) act(() => trashTray(S!, Number(b.dataset.i)));
});

function finish() {
  if (!S) return;
  ended = true;
  const s = S;
  const level = s.cfg.level;
  const stars = starsFor(s.cfg, s.coins);
  if (profile.data.firstRun) profile.finishFirstRun();
  track('game_over', { level, coins: s.coins, served: s.served, stars });
  if (stars > 0) {
    meta.showWin({
      level,
      stars,
      coins: 10 + stars * 5,
      onNext: () => start(Math.min(level + 1, LEVELS)),
      onMenu: leave,
    });
  } else {
    toast(t('timeUp'));
    meta.showLose({
      score: s.coins,
      coins: 0,
      label: t('needMore', { n: s.coins, t: s.cfg.target }),
      continuesUsed: continues,
      canContinue: continues < 3,
      onContinue: () => {
        continues++;
        addTime(s);
        ended = false;
        track('continue', { level });
      },
      onRetry: () => start(level),
      onMenu: leave,
    });
  }
}

function leave() {
  S = null;
  gameEl.hidden = true;
}

function pause() {
  if (!S || ended || meta.covering) return;
  paused = true;
  meta.showPause({
    onResume: () => (paused = false),
    onRestart: () => start(S!.cfg.level),
    onMenu: leave,
  });
}
$('pause-btn').addEventListener('click', pause);

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S && !paused && !ended && !meta.covering) {
    const k = autoplay || 1;
    for (let i = 0; i < k; i++) {
      step(S, dt);
      if (autoplay && Math.random() < dt / 0.35) {
        const a = botAction(S);
        if (a) apply(S, a);
      }
    }
    drain();
    render();
    if (isOver(S)) finish();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

void setupNative({
  onBack: () => {
    if (meta.back()) return true;
    if (S && !ended && !meta.covering) {
      pause();
      return true;
    }
    return false;
  },
  onPause: () => pause(),
});

meta.showHome();

// Test hooks for scripts/e2e.mjs and scripts/screenshots.mjs.
(window as unknown as { __firin: unknown }).__firin = {
  get state() {
    return S;
  },
  meta,
  profile,
  start,
  autoplay: (k: number) => (autoplay = k),
  setTime: (sec: number) => S && (S.time = sec),
  setCoins: (n: number) => S && (S.coins = n),
};
