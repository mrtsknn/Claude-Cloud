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
  scheduleReminders,
  setHapticsEnabled,
  setSoundEnabled,
  setupNative,
  shareResult,
  tone,
  track,
  trackSession,
  unlockAudio,
} from '@studio/kit';
import {
  LEVEL_COUNT,
  PAINTS,
  ROWS,
  STAMPS,
  addStamp,
  addToShelf,
  classify,
  decodeProfile,
  groove,
  heightOf,
  makePot,
  matchPercent,
  orderFor,
  orderReward,
  paintRing,
  parseShelf,
  pull,
  push,
  rowAt,
  startProfile,
  starsFor,
  targetFor,
  undoBand,
  type Decor,
  type Kind,
  type Order,
  type Profile,
  type SavedPot,
  type Stamp,
} from './game';
import { setHumEnabled, unlockHum, updateHum } from './hum';
import { CUSTOMER_TINTS, customerName, lang, t, type Key } from './i18n';
import { GLAZES, drawPlank, drawPot, drawPotFit, drawWheel, glazeById, type Glaze, type View } from './render';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/comlek/PRIVACY.md';
// TODO(mağaza): yayından sonra gerçek mağaza bağlantısı (App Store / Play) ile değiştir.
const STORE_URL = 'https://play.google.com/store/apps/details?id=com.indiestudio.comlek';
const REMINDER_ID = 4101;
declare const __APP_VERSION__: string;

document.documentElement.lang = lang;
document.title = t('title');

const glazeName = (g: Glaze) => t(`g_${g.id}` as Key);
const swatch = (g: Glaze) =>
  g.pattern === 'stripes' ? `repeating-linear-gradient(0deg, ${g.base} 0 8px, ${g.alt} 8px 12px)`
  : g.pattern === 'dots' ? `radial-gradient(circle at 50% 50%, ${g.alt} 0 18%, transparent 20%) 0 0/14px 14px, ${g.base}`
  : g.pattern === 'speckle' ? `radial-gradient(circle, ${g.alt} 0 1.5px, transparent 2px) 0 0/7px 9px, ${g.base}`
  : g.pattern === 'rim' ? `linear-gradient(${g.alt} 0 22%, ${g.base} 22%)`
  : `linear-gradient(160deg, ${g.base}, ${g.alt})`;

// ───────────────────────── persistence ─────────────────────────
const store = createStore('comlek');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHumEnabled(settings.sound);
setHapticsEnabled(settings.haptics);
let shelf: SavedPot[] = parseShelf(store.get<unknown>('shelf', []));
let lastSaved = 0;

const profile = createProfile({
  game: 'comlek',
  levelCount: LEVEL_COUNT,
  defaultSkin: 'terracotta',
  skinIds: GLAZES.map((g) => g.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'pots', targets: [2, 4, 6], reward: (n) => 20 + n * 8 },
  ],
});

// ───────────────────────── home hero: my shelf ─────────────────────────
const SHELF_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18M3 13h18M6 13V9a2 2 0 0 1 2-2h1v6M14 13V6h2a2 2 0 0 1 2 2v5M10 20v-4h4v4"/></svg>';
const hero = document.createElement('button');
hero.className = 'home-shelf';
hero.dataset.shelf = '';
hero.innerHTML = `<canvas></canvas><span>${SHELF_ICON}<b></b></span>`;
hero.addEventListener('click', () => {
  unlockAudio();
  haptic.light();
  openShelf();
});

function drawHero() {
  const c = hero.querySelector('canvas')!;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = 230;
  const h = 84;
  c.width = w * dpr;
  c.height = h * dpr;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  drawPlank(g, 0, h - 16, w, 9);
  const pots = shelf.slice(0, 4);
  const slots = 4;
  for (let i = 0; i < slots; i++) {
    const x = 6 + i * ((w - 12) / slots);
    const pot = pots[i];
    if (pot) {
      const p = decodeProfile(pot.p);
      if (p) drawPotFit(g, p, pot.d, x, 4, (w - 12) / slots, h - 20, 0.5 + i);
    } else {
      // ghost pot outline waiting to be made
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.setLineDash([4, 4]);
      g.lineWidth = 2;
      const cx = x + (w - 12) / slots / 2;
      g.beginPath();
      g.moveTo(cx - 11, h - 17);
      g.quadraticCurveTo(cx - 20, h - 40, cx - 10, h - 58);
      g.lineTo(cx + 10, h - 58);
      g.quadraticCurveTo(cx + 20, h - 40, cx + 11, h - 17);
      g.stroke();
      g.setLineDash([]);
    }
  }
  hero.querySelector('b')!.textContent = `${t('shelf_open')} · ${t('shelf_count', { n: shelf.length })}`;
}

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  skins: GLAZES.map((g) => ({ id: g.id, name: glazeName(g), price: g.price, swatch: swatch(g) })),
  onSkin: (id) => {
    if (state.phase === 'decorate') state.decor = { ...state.decor, g: id };
  },
  levels: { count: LEVEL_COUNT, play: (n) => startLevel(n) },
  endless: { title: t('free_title'), subtitle: t('free_sub'), play: () => startFree() },
  hero,
  missionText: (id, n) => t(`mission_${id}` as Key, { n }),
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHumEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});

// ───────────────────────── state ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
const fireBtn = $<HTMLButtonElement>('fire-btn');
const shareBtn = $<HTMLButtonElement>('share-btn');
const hintEl = $('hint');
const decoEl = $('deco');
const orderEl = $('order');
const matchEl = $('match');
const meterEl = $('meter');
$('glaze-label').textContent = t('glaze');
shareBtn.setAttribute('aria-label', t('share'));

type Mode = 'order' | 'free';
type Phase = 'shape' | 'decorate' | 'done';
type Tool = 'ring' | Stamp;
const blankRings = () => new Array<number>(ROWS).fill(0);
const state = {
  mode: 'order' as Mode,
  level: 1,
  phase: 'shape' as Phase,
  kind: 'cup' as Kind,
  order: null as Order | null,
  clay: startProfile(),
  target: startProfile(),
  rings: blankRings(),
  decor: { g: 'terracotta', b: [] } as Decor,
  pct: 0,
  stars: 0,
  touched: false,
  painted: false,
  tool: 'ring' as Tool,
  paint: 0,
};
let spin = 0;
let wheel = 0; // 0..1 wheel speed, eases toward the phase target
let contact = 0; // 0..1 how hard the clay is moving under fingers (sound + wobble)
let fireT = -1;
let lastShare = '';
interface Finger { x: number; y: number; mode: 'push' | 'pull'; lastRow: number }
const pointers = new Map<number, Finger>();
interface Drop { x: number; y: number; vx: number; vy: number; life: number; r: number; ember?: boolean }
const drops: Drop[] = [];

/** Puts a level on the wheel without counting a play (boot uses this behind the home menu). */
function setupLevel(n: number) {
  const tg = targetFor(n);
  const order = orderFor(n);
  Object.assign(state, {
    mode: 'order',
    level: n,
    phase: 'shape',
    kind: tg.kind,
    order,
    clay: startProfile(),
    target: tg.profile,
    rings: blankRings(),
    decor: { g: profile.data.skin, b: [] },
    stars: 0,
    touched: false,
    painted: false,
  });
  resetScene();
  $('level').textContent = t('level', { n });
  $('kind').textContent = t(tg.kind);
  $('match-label').textContent = t('match');
  meterEl.classList.remove('free');
  orderEl.hidden = false;
  const who = customerName(order.customer);
  $('order-av').textContent = who.charAt(0);
  $('order-av').style.background = CUSTOMER_TINTS[order.customer % CUSTOMER_TINTS.length];
  $('order-who').textContent = `${who}:`;
  $('order-req').textContent = t(`req_${order.kind}_${order.variant}` as Key);
  // restart the bubble's entrance animation
  orderEl.style.animation = 'none';
  void orderEl.offsetWidth;
  orderEl.style.animation = '';
  hintEl.textContent = t('hint');
  hintEl.classList.toggle('gone', n > 3);
  updateMatch(true);
}

function startLevel(n: number) {
  meta.hideHome();
  closeOverlays();
  setupLevel(n);
  track('game_start', { level: n, mode: 'order' });
}

function startFree() {
  meta.hideHome();
  closeOverlays();
  Object.assign(state, {
    mode: 'free',
    phase: 'shape',
    order: null,
    clay: startProfile(),
    target: startProfile(),
    rings: blankRings(),
    decor: { g: profile.data.skin, b: [] },
    stars: 0,
    touched: false,
    painted: false,
  });
  resetScene();
  $('level').textContent = t('free_title');
  $('match-label').textContent = t('shelf');
  matchEl.textContent = String(shelf.length);
  meterEl.classList.add('free');
  orderEl.hidden = true;
  hintEl.textContent = t('hint');
  hintEl.classList.toggle('gone', shelf.length > 2);
  updateMatch(true);
  track('game_start', { mode: 'free' });
}

function resetScene() {
  pointers.clear();
  drops.length = 0;
  fireT = -1;
  wheel = 0;
  fireBtn.textContent = t('fire');
  fireBtn.disabled = false;
  decoEl.hidden = true;
  shareBtn.hidden = true;
}

let lastStars = 0;
function updateMatch(reset = false) {
  if (state.mode === 'free') {
    state.kind = classify(state.clay);
    $('kind').textContent = t(state.kind);
    return;
  }
  state.pct = matchPercent(state.clay, state.target);
  matchEl.textContent = `${state.pct}%`;
  $('meter-fill').style.width = `${state.pct}%`;
  const st = starsFor(state.pct);
  meterEl.querySelectorAll('s').forEach((s, i) => s.classList.toggle('on', st > i));
  if (reset) lastStars = st;
  else if (st > lastStars) {
    // crossing a star threshold: tiny chime + pop
    lastStars = st;
    haptic.medium();
    tone({ freq: pentatonic(st * 2, 523.25), duration: 0.18, volume: 0.28 });
    matchEl.classList.add('pop');
    setTimeout(() => matchEl.classList.remove('pop'), 180);
  } else lastStars = st;
}

function fire() {
  if (state.phase !== 'shape' || covering()) return;
  updateMatch();
  if (state.mode === 'order') {
    state.stars = starsFor(state.pct);
    track('game_over', { level: state.level, match: state.pct, stars: state.stars });
    if (!state.stars) {
      haptic.error();
      tone({ freq: 220, to: 150, duration: 0.3, volume: 0.4 });
      meta.showFail({ level: state.level, reason: t('failed', { n: state.pct }), onRetry: () => startLevel(state.level) });
      return;
    }
  } else track('free_fire', { kind: state.kind });
  fireT = performance.now();
  pointers.clear();
  state.phase = 'decorate';
  state.decor = { g: profile.data.skin, b: [] };
  haptic.success();
  [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s, 392), duration: 0.25, volume: 0.35, delay: i * 0.08 }));
  // embers rise from the kiln
  for (let k = 0; k < 26; k++) {
    drops.push({ x: L.cx + (Math.random() - 0.5) * L.maxR * 1.6, y: L.base - Math.random() * 40, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 120, life: 1, r: 1.5 + Math.random() * 2.5, ember: true });
  }
  fireBtn.textContent = t('done');
  hintEl.textContent = t('paint_hint');
  hintEl.classList.remove('gone');
  orderEl.hidden = true;
  shareBtn.hidden = false;
  renderDeco();
}

// ───────────────────────── decorate toolbars ─────────────────────────
const TOOL_ICONS: Record<Tool | 'undo', string> = {
  ring: '<path d="M4 20c3 0 5-2 5-5l9-9a2 2 0 0 0-3-3l-9 9c-3 0-5 2-5 5"/><path d="M12 8l3 3"/>',
  dots: '<circle cx="6" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="18" cy="12" r="2" fill="currentColor"/>',
  waves: '<path d="M2 12c2.5-4 5-4 7.5 0s5 4 7.5 0 3.5-3 5-2"/>',
  zigzag: '<path d="M2 15l4-6 4 6 4-6 4 6 4-6"/>',
  leaves: '<path d="M12 21V9"/><path d="M12 13c-4 0-7-3-7-7 4 0 7 3 7 7z"/><path d="M12 10c3 0 6-2 6-6-3 0-6 2-6 6z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
};
const toolName = (k: Tool | 'undo') => (k === 'ring' ? t('t_brush') : k === 'undo' ? t('undo') : t(`t_${k}` as Key));

function renderDeco() {
  const gl = $('glazes');
  gl.innerHTML = '';
  for (const g of GLAZES.filter((g) => profile.owns(g.id))) {
    const b = document.createElement('button');
    b.style.background = swatch(g);
    b.setAttribute('aria-label', glazeName(g));
    b.className = g.id === state.decor.g ? 'on' : '';
    b.addEventListener('click', () => {
      state.decor = { ...state.decor, g: g.id };
      haptic.light();
      tone({ freq: pentatonic(GLAZES.indexOf(g)), duration: 0.12, volume: 0.3 });
      renderDeco();
    });
    gl.appendChild(b);
  }
  const tools = $('tools');
  tools.innerHTML = '';
  for (const k of ['ring', ...STAMPS, 'undo'] as (Tool | 'undo')[]) {
    if (k === 'undo') {
      const sep = document.createElement('span');
      sep.className = 'sep';
      tools.appendChild(sep);
    }
    const b = document.createElement('button');
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${TOOL_ICONS[k]}</svg>`;
    b.setAttribute('aria-label', toolName(k));
    b.dataset.tool = k;
    if (k === state.tool) b.className = 'on';
    if (k === 'undo') b.disabled = !state.decor.b.length;
    b.addEventListener('click', () => {
      haptic.light();
      if (k === 'undo') {
        state.decor = undoBand(state.decor);
        tone({ freq: 330, to: 260, duration: 0.1, volume: 0.25 });
      } else state.tool = k;
      renderDeco();
    });
    tools.appendChild(b);
  }
  const pa = $('paints');
  pa.innerHTML = '';
  PAINTS.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = `radial-gradient(circle at 35% 30%, rgba(255,255,255,.45), transparent 45%), ${c}`;
    b.setAttribute('aria-label', c);
    b.dataset.paint = String(i);
    if (i === state.paint) b.className = 'on';
    b.addEventListener('click', () => {
      state.paint = i;
      haptic.light();
      tone({ freq: pentatonic(i, 659.25), duration: 0.1, volume: 0.22 });
      renderDeco();
    });
    pa.appendChild(b);
  });
  decoEl.hidden = false;
}

function decorate(row: number, first: boolean) {
  const before = state.decor;
  if (state.tool === 'ring') state.decor = paintRing(state.decor, row, state.paint);
  else if (first) state.decor = addStamp(state.decor, state.tool, row, state.paint);
  if (state.decor !== before) {
    if (!state.painted) {
      state.painted = true;
      hintEl.classList.add('gone');
    }
    if (first || state.decor.b.length !== before.b.length) {
      haptic.light();
      tone({ freq: state.tool === 'ring' ? pentatonic(state.paint, 440) : 196, duration: state.tool === 'ring' ? 0.08 : 0.14, volume: 0.22, type: state.tool === 'ring' ? 'sine' : 'triangle' });
    }
    if (first || before.b.length !== state.decor.b.length) renderDeco();
  }
}

// ───────────────────────── finishing + collection ─────────────────────────
function currentPot(): SavedPot {
  const now = Math.max(Date.now(), lastSaved + 1);
  return makePot({
    profile: state.clay,
    decor: state.decor,
    mode: state.mode === 'order' ? 'o' : 'f',
    kind: state.mode === 'order' ? state.kind : classify(state.clay),
    pct: state.mode === 'order' ? state.pct : undefined,
    level: state.mode === 'order' ? state.level : undefined,
    order: state.order ?? undefined,
    now,
  });
}

function savePot(): SavedPot {
  const pot = currentPot();
  lastSaved = pot.t;
  shelf = addToShelf(shelf, pot);
  store.set('shelf', shelf);
  profile.recordBest(shelf.length);
  profile.progress('pots');
  drawHero();
  if (!store.get('reminder', false)) {
    store.set('reminder', true);
    void scheduleReminders([{ id: REMINDER_ID, title: t('remind_title'), body: t('remind_body'), dailyHour: 19 }]);
  }
  return pot;
}

function finish() {
  if (state.phase !== 'decorate' || covering()) return;
  const pot = savePot();
  state.phase = 'done';
  decoEl.hidden = true;
  shareBtn.hidden = true;
  hintEl.classList.add('gone');
  haptic.success();
  if (state.mode === 'order') {
    const decorated = state.decor.b.length > 0;
    track('level_complete', { level: state.level, stars: state.stars, match: state.pct, glaze: state.decor.g, bands: state.decor.b.length });
    maybeRequestReview(profile.data.stars.filter((s) => s > 0).length, state.stars === 3);
    meta.showWin({
      level: state.level,
      stars: state.stars,
      coins: orderReward(state.pct, decorated),
      onNext: () => startLevel(Math.min(state.level + 1, LEVEL_COUNT)),
    });
    meta.toast(t('kept'));
  } else {
    track('free_kept', { kind: pot.k, bands: pot.d.b.length, shelf: shelf.length });
    openViewer(pot, 'kept');
  }
}

fireBtn.addEventListener('click', () => {
  unlockAudio();
  unlockHum();
  if (state.phase === 'shape') fire();
  else if (state.phase === 'decorate') finish();
});
shareBtn.addEventListener('click', () => void sharePot(currentPot()));

function pause() {
  if (covering()) return;
  pointers.clear();
  meta.showPause({ onResume: () => {}, onRestart: () => (state.mode === 'free' ? startFree() : startLevel(state.level)) });
}
$('pause-btn').addEventListener('click', pause);

// ───────────────────────── shelf screen + viewer ─────────────────────────
const shelfEl = $('shelf');
const viewerEl = $('viewer');
const shelfGrid = $('shelf-grid');
$('shelf-title').textContent = t('shelf_title');
$('shelf-back').addEventListener('click', () => closeShelf());
let thumbObserver: IntersectionObserver | null = null;

function paintThumb(c: HTMLCanvasElement, pot: SavedPot) {
  const p = decodeProfile(pot.p);
  if (!p) return;
  const r = c.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(60, r.width || 100);
  const h = (w * 6) / 5;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawPotFit(g, p, pot.d, 4, 4, w - 8, h - 6, 0.7 + (pot.t % 7));
}

function openShelf() {
  closeViewer();
  $('shelf-count').textContent = t('shelf_count', { n: shelf.length });
  shelfGrid.innerHTML = '';
  thumbObserver?.disconnect();
  if (!shelf.length) {
    const p = document.createElement('p');
    p.className = 'shelf-empty';
    p.textContent = t('shelf_empty');
    shelfGrid.appendChild(p);
  }
  thumbObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const c = e.target as HTMLCanvasElement;
            const pot = shelf.find((p) => p.id === c.dataset.id);
            if (pot) paintThumb(c, pot);
            thumbObserver?.unobserve(c);
          }
        })
      : null;
  for (let i = 0; i < shelf.length; i += 3) {
    const row = document.createElement('div');
    row.className = 'shelf-row';
    for (const pot of shelf.slice(i, i + 3)) {
      const b = document.createElement('button');
      b.setAttribute('aria-label', t(pot.k));
      const c = document.createElement('canvas');
      c.dataset.id = pot.id;
      b.appendChild(c);
      b.addEventListener('click', () => {
        haptic.light();
        tone({ freq: 523.25, duration: 0.08, volume: 0.2 });
        openViewer(pot, 'shelf');
      });
      row.appendChild(b);
    }
    shelfGrid.appendChild(row);
  }
  shelfEl.hidden = false;
  shelfGrid.scrollTop = 0;
  shelfGrid.querySelectorAll('canvas').forEach((c) => (thumbObserver ? thumbObserver.observe(c) : paintThumb(c, shelf.find((p) => p.id === c.dataset.id)!)));
  track('shelf_open', { pots: shelf.length });
}
function closeShelf() {
  shelfEl.hidden = true;
  thumbObserver?.disconnect();
}

let viewerPot: SavedPot | null = null;
let viewerSpin = 0;
function potTitle(pot: SavedPot) {
  return pot.m === 'o' && pot.cu !== undefined ? `${t(pot.k)} · ${t('order_for', { who: customerName(pot.cu) })}` : `${t(pot.k)} · ${t('free_title')}`;
}
function potSub(pot: SavedPot) {
  const date = new Date(pot.t).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const stars = pot.pct !== undefined ? '★'.repeat(starsFor(pot.pct)) + '☆'.repeat(3 - starsFor(pot.pct)) : '';
  return [pot.pct !== undefined ? `${t('match_pct', { n: pot.pct })} ${stars}` : '', glazeName(glazeById(pot.d.g)), date].filter(Boolean).join(' · ');
}

function openViewer(pot: SavedPot, ctxKind: 'shelf' | 'kept') {
  viewerPot = pot;
  viewerSpin = 0;
  $('viewer-title').textContent = ctxKind === 'kept' ? t('kept') : potTitle(pot);
  $('viewer-sub').textContent = ctxKind === 'kept' ? potTitle(pot) : potSub(pot);
  const acts = $('viewer-actions');
  acts.innerHTML = '';
  const add = (label: string, cls: string, fn: () => void, attr: string) => {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.dataset[attr] = '';
    b.addEventListener('click', () => {
      haptic.light();
      fn();
    });
    acts.appendChild(b);
  };
  add(t('share'), '', () => void sharePot(pot), 'share');
  if (ctxKind === 'kept') {
    add(t('new_pot'), 'ghost', () => startFree(), 'again');
    add(t('menu'), 'ghost', () => {
      closeOverlays();
      meta.showHome();
    }, 'home');
  } else add(t('close'), 'ghost', closeViewer, 'close');
  viewerEl.hidden = false;
  track('pot_view', { from: ctxKind });
}
function closeViewer() {
  viewerEl.hidden = true;
  viewerPot = null;
}
viewerEl.addEventListener('click', (e) => {
  if (e.target === viewerEl && !shelfEl.hidden) closeViewer();
});
function closeOverlays() {
  closeViewer();
  closeShelf();
}
const covering = () => meta.covering || !shelfEl.hidden || !viewerEl.hidden;

function drawViewer(dt: number) {
  if (!viewerPot) return;
  const c = $<HTMLCanvasElement>('viewer-canvas');
  const r = c.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
  }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, r.width, r.height);
  viewerSpin += dt * 0.7;
  const p = decodeProfile(viewerPot.p);
  if (!p) return;
  drawPlank(g, r.width * 0.08, r.height - 34, r.width * 0.84, 10);
  drawPotFit(g, p, viewerPot.d, r.width * 0.1, r.height * 0.08, r.width * 0.8, r.height * 0.92 - 34, viewerSpin);
}

// ───────────────────────── sharing ─────────────────────────
/** The pot as a 1080×1350 share card (JPEG data URL, small enough to share quickly). */
function shareImage(pot: SavedPot): string {
  const W2 = 1080;
  const H2 = 1350;
  const c = document.createElement('canvas');
  c.width = W2;
  c.height = H2;
  const g = c.getContext('2d')!;
  const bg = g.createRadialGradient(W2 / 2, H2 * 0.42, 60, W2 / 2, H2 * 0.5, H2 * 0.75);
  bg.addColorStop(0, '#fff6ea');
  bg.addColorStop(1, '#e2c4a0');
  g.fillStyle = bg;
  g.fillRect(0, 0, W2, H2);
  const p = decodeProfile(pot.p) ?? startProfile();
  drawPlank(g, 90, 1110, 900, 28);
  drawPotFit(g, p, pot.d, 150, 300, 780, 810, 0.55);
  const font = (w: number, s: number) => `${w} ${s}px ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = '#3b2a20';
  g.font = font(900, 68);
  g.fillText(potTitle(pot), W2 / 2, 150, W2 - 120);
  g.fillStyle = '#8a7363';
  g.font = font(700, 38);
  const sub = pot.pct !== undefined ? `${t('match_pct', { n: pot.pct })}  ${'★'.repeat(starsFor(pot.pct))}` : glazeName(glazeById(pot.d.g));
  g.fillText(sub, W2 / 2, 214, W2 - 120);
  // brand footer
  g.fillStyle = '#c8663b';
  g.font = font(900, 54);
  g.fillText(t('title'), W2 / 2, 1262);
  g.fillStyle = '#8a7363';
  g.font = font(700, 30);
  g.fillText(t('tagline'), W2 / 2, 1306);
  return c.toDataURL('image/jpeg', 0.9);
}

async function sharePot(pot: SavedPot) {
  unlockAudio();
  const image = shareImage(pot);
  lastShare = image;
  const text =
    pot.m === 'o' && pot.cu !== undefined && pot.pct !== undefined
      ? t('share_order', { kind: t(pot.k).toLocaleLowerCase(lang), who: customerName(pot.cu), n: pot.pct })
      : t('share_free', { kind: t(pot.k).toLocaleLowerCase(lang) });
  // Web: share the picture itself when the browser can (Web Share Level 2).
  try {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare && nav.share) {
      const blob = await (await fetch(image)).blob();
      const file = new File([blob], 'comlek.jpg', { type: 'image/jpeg' });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: t('title'), text: `${text} ${STORE_URL}` });
        track('share', { title: t('title'), image: true });
        return;
      }
    }
  } catch {
    /* user cancelled or files unsupported → text share below */
  }
  const ok = await shareResult({ title: t('title'), text, url: STORE_URL, imageDataUrl: image });
  if (ok && !('share' in navigator)) meta.toast(t('copied'));
}

// ───────────────────────── layout + input ─────────────────────────
let W = 0, H = 0, dpr = 1;
const L: View = { cx: 0, base: 0, potH: 0, maxR: 0 };
let baseRest = 0; // wheel position while throwing
let lift = 0; // camera lift that centres a finished (often low) pot
function resize() {
  dpr = Math.min(3, window.devicePixelRatio || 1);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  L.cx = W / 2;
  baseRest = H - 40;
  L.base = baseRest - lift;
  L.potH = Math.max(80, H - 76);
  // leave room for clay pulled out to MAX_R (1.3) on both sides
  L.maxR = Math.min((W / 2 - 12) / 1.3, L.potH * 0.42);
}
window.addEventListener('resize', resize);

const local = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
const rowFor = (y: number) => rowAt(heightOf(state.clay), (L.base - y) / L.potH);

canvas.addEventListener('pointerdown', (e) => {
  if (covering() || state.phase === 'done') return;
  unlockAudio();
  unlockHum();
  const pt = local(e);
  const row = rowFor(pt.y);
  if (state.phase === 'decorate') {
    const ri = Math.max(0, Math.min(ROWS - 1, Math.round(row)));
    if (row < -3 || row > ROWS + 2 || Math.abs(pt.x - L.cx) > state.clay[ri] * L.maxR + 34) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { ...pt, mode: 'push', lastRow: ri });
    decorate(ri, true);
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  // A finger that lands inside the clay (or inside the rim, above it) grabs and pulls outward.
  const ri = Math.max(0, Math.min(ROWS - 1, Math.round(row)));
  const xn = Math.abs(pt.x - L.cx) / L.maxR;
  const inside = row > -2 && row < ROWS + 10 && xn < state.clay[ri] * 0.9;
  pointers.set(e.pointerId, { ...pt, mode: inside ? 'pull' : 'push', lastRow: ri });
  haptic.light();
});
canvas.addEventListener('pointermove', (e) => {
  const f = pointers.get(e.pointerId);
  if (!f) return;
  const pt = local(e);
  f.x = pt.x;
  f.y = pt.y;
});
const release = (e: PointerEvent) => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

let lastTick = 0;
let tickCount = 0;
function sculpt(dt: number, now: number) {
  if (covering() || !pointers.size) {
    contact = Math.max(0, contact - dt * 4);
    return;
  }
  if (state.phase === 'decorate') {
    contact += (0.22 - contact) * Math.min(1, dt * 8);
    if (state.tool !== 'ring') return;
    for (const f of pointers.values()) {
      const ri = Math.max(0, Math.min(ROWS - 1, Math.round(rowFor(f.y))));
      if (ri !== f.lastRow) {
        // fill every row between frames so fast strokes stay continuous
        const dir = Math.sign(ri - f.lastRow);
        for (let r = f.lastRow + dir; r !== ri + dir; r += dir) decorate(r, false);
        f.lastRow = ri;
      } else decorate(ri, false);
    }
    return;
  }
  if (state.phase !== 'shape') return;
  const h = heightOf(state.clay);
  let moved = 0;
  const rate = 1 - Math.exp(-dt * 6);
  for (const f of pointers.values()) {
    const row = rowAt(h, (L.base - f.y) / L.potH);
    const x = Math.abs(f.x - L.cx) / L.maxR;
    const before = state.clay;
    if (f.mode === 'pull') {
      if (row < -4 || row > ROWS + 12) continue;
      state.clay = pull(state.clay, Math.min(ROWS - 1, row), x, rate);
    } else {
      if (row < -4 || row > ROWS + 4) continue;
      state.clay = push(state.clay, row, x, rate);
    }
    let m = 0;
    for (let i = 0; i < ROWS; i++) m += Math.abs(before[i] - state.clay[i]);
    moved += m;
    if (m > 0.002) {
      const rr = Math.max(0, Math.min(ROWS - 1, row));
      state.rings = groove(state.rings, rr, Math.min(0.5, m * 1.5));
      // slurry flicks off the fingertip along the spin
      if (Math.random() < Math.min(0.9, m * 6) && drops.length < 70) {
        const side = f.x < L.cx ? -1 : 1;
        drops.push({ x: f.x, y: f.y, vx: side * (40 + Math.random() * 90), vy: -40 - Math.random() * 90, life: 1, r: 1.2 + Math.random() * 2.2 });
      }
    }
  }
  contact += (Math.min(1, moved * 9) - contact) * Math.min(1, dt * 10);
  if (moved > 0.002) {
    if (!state.touched) {
      state.touched = true;
      hintEl.classList.add('gone');
    }
    // haptic ticks: quicker and stronger the more clay moves
    const gap = moved > 0.05 ? 55 : moved > 0.015 ? 80 : 120;
    if (now - lastTick > gap) {
      lastTick = now;
      tickCount++;
      if (moved > 0.05 || tickCount % 4 === 0) haptic.medium();
      else haptic.light();
    }
    updateMatch();
  }
}

// ───────────────────────── drawing ─────────────────────────
function draw(now: number, dt: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const wob = Math.sin(spin * 0.9) * (0.5 + 1.8 * contact) * wheel;
  if (state.phase !== 'done') {
    drawWheel(ctx, L, spin, wob);
    const glaze = state.phase === 'decorate' ? glazeById(state.decor.g) : null;
    const k = fireT < 0 ? 0 : Math.max(0, 1 - (now - fireT) / 1100);
    drawPot(ctx, L, state.clay, {
      glaze,
      decor: state.phase === 'decorate' ? state.decor : null,
      spin,
      wet: glaze ? 0 : 0.6 + 0.4 * contact,
      rings: state.rings,
      wobble: wob,
    });
    if (k > 0) {
      ctx.fillStyle = `rgba(255,140,40,${0.55 * k})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (state.phase === 'shape' && state.mode === 'order') {
      // target silhouette: marching dashes
      outline(state.target);
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = -now / 60;
      ctx.strokeStyle = 'rgba(59,42,32,0.75)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const f of pointers.values()) {
      if (state.phase !== 'shape') break;
      ctx.fillStyle = f.mode === 'pull' ? 'rgba(255,248,236,0.5)' : 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(f.x, f.y, 16, 0, Math.PI * 2);
      ctx.fill();
      if (f.mode === 'pull') {
        ctx.strokeStyle = 'rgba(122,69,41,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  } else {
    const sw = Math.min(W - 24, L.maxR * 2.9);
    drawPlank(ctx, L.cx - sw / 2, L.base, sw, 14);
    ctx.fillStyle = 'rgba(59,42,32,0.18)';
    ctx.beginPath();
    ctx.ellipse(L.cx, L.base + 1, state.clay[0] * L.maxR * 1.1, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    drawPot(ctx, L, state.clay, { glaze: glazeById(state.decor.g), decor: state.decor, spin, rings: state.rings });
  }
  // slurry drops / kiln embers
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.life -= dt * (d.ember ? 0.9 : 1.6);
    if (d.life <= 0) {
      drops.splice(i, 1);
      continue;
    }
    d.vy += (d.ember ? -20 : 420) * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    ctx.fillStyle = d.ember ? `rgba(255,${150 + Math.floor(80 * d.life)},60,${d.life})` : `rgba(150,88,56,${0.7 * d.life})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function outline(p: Profile) {
  const h = heightOf(p);
  ctx.beginPath();
  const steps = 90;
  const rAt = (y: number) => {
    const f = (y / h) * ROWS - 0.5;
    const i = Math.max(0, Math.min(ROWS - 1, Math.floor(f)));
    const j = Math.min(ROWS - 1, i + 1);
    const tt = Math.max(0, Math.min(1, f - i));
    return (p[i] * (1 - tt) + p[j] * tt) * L.maxR;
  };
  for (let s = 0; s <= steps; s++) {
    const y = (s / steps) * h * 0.999;
    const r = rAt(y);
    s ? ctx.lineTo(L.cx - r, L.base - y * L.potH) : ctx.moveTo(L.cx - r, L.base - y * L.potH);
  }
  for (let s = steps; s >= 0; s--) {
    const y = (s / steps) * h * 0.999;
    ctx.lineTo(L.cx + rAt(y), L.base - y * L.potH);
  }
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
  const target = covering() ? 0 : state.phase === 'shape' ? 1 - 0.14 * contact : state.phase === 'decorate' ? 0.3 : 0.08;
  wheel += (target - wheel) * Math.min(1, dt * (target > wheel ? 1.4 : 3));
  spin += dt * wheel * 10;
  const potPx = heightOf(state.clay) * L.potH;
  const liftTo = state.phase === 'shape' ? 0 : Math.max(0, (baseRest - 24 - potPx) * 0.42);
  lift += (liftTo - lift) * Math.min(1, dt * 5);
  L.base = baseRest - lift;
  for (let i = 0; i < ROWS; i++) if (state.rings[i] > 0) state.rings[i] = Math.max(0, state.rings[i] - dt * 0.015);
  sculpt(dt, now);
  if (W && H) draw(now, dt);
  drawViewer(dt);
  updateHum(wheel, contact, !covering() && state.phase !== 'done');
  requestAnimationFrame(frame);
}

// ───────────────────────── boot ─────────────────────────
resize();
drawHero();
// The wheel is prepared behind the home menu; game_start is only tracked when play is tapped.
setupLevel(Math.min(profile.data.unlocked, LEVEL_COUNT));
requestAnimationFrame(frame);
trackSession('comlek');
void setupNative({
  darkBackground: false,
  onBack: () => {
    if (!viewerEl.hidden) {
      if (viewerPot && shelfEl.hidden && state.phase === 'done') {
        closeOverlays();
        meta.showHome();
      } else closeViewer();
      return true;
    }
    if (!shelfEl.hidden) {
      closeShelf();
      return true;
    }
    return meta.back() || (!meta.covering && (pause(), true)) || true;
  },
});
void initAds();
void initStore();
meta.showHome();

// e2e / screenshot hook
(window as unknown as { __comlek: object }).__comlek = {
  state,
  perfect: () => {
    state.clay = state.target.slice();
    state.touched = true;
    updateMatch();
  },
  set: (p: Profile) => {
    state.clay = p.slice();
    state.touched = true;
    hintEl.classList.add('gone');
    updateMatch();
  },
  rings: (k: number) => (state.rings = state.rings.map((_, i) => (i % 2 ? k * 0.45 : k))),
  fire,
  finish,
  start: startLevel,
  free: startFree,
  glaze: (id: string) => {
    state.decor = { ...state.decor, g: id };
    if (state.phase === 'decorate') renderDeco();
  },
  paint: (row: number, color: number) => {
    state.decor = paintRing(state.decor, row, color);
    renderDeco();
  },
  stamp: (kind: Stamp, row: number, color: number) => {
    state.decor = addStamp(state.decor, kind, row, color);
    renderDeco();
  },
  shelf: () => shelf,
  openShelf,
  lastShare: () => lastShare,
};
