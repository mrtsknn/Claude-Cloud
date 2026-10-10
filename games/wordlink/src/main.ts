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
  cellKey,
  cellsOf,
  completedByReveal,
  hintCell,
  isComplete,
  judge,
  shuffleLetters,
  type Level,
} from './game';
import { t } from './i18n';
import { SKINS } from './skins';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/wordlink/PRIVACY.md';
declare const __APP_VERSION__: string;

type Lang = 'en' | 'tr';
const PACKS: Record<Lang, () => Promise<{ default: unknown }>> = {
  en: () => import('./levels/en.json'),
  tr: () => import('./levels/tr.json'),
};

const LEVEL_COUNT = 400;
const HINT_COST = 25;
const BONUS_BATCH = 10;
const BONUS_REWARD = 25;

// ───────────────────────── persistence ─────────────────────────
/** In-level state of the level being played in one language (resumed when it is replayed). */
interface Progress {
  level: number; // 1-based
  found: string[];
  revealed: string[];
  bonusFound: string[];
  order: string; // current wheel order
}
/** Per-language level map: stars and the highest unlocked level. */
interface LangMap {
  stars: number[];
  unlocked: number;
}

const store = createStore('wordlink');
const settings = store.get('settings', {
  sound: true,
  haptics: true,
  lang: (navigator.language.slice(0, 2) === 'tr' ? 'tr' : 'en') as Lang,
});
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

let bonusMeter = store.get('bonusMeter', 0);
let levels: Level[] = [];
let level!: Level;
let cur!: Progress;
let found = new Set<string>();
let revealed = new Set<string>();
let bonusFound = new Set<string>();
let startedAt = Date.now();
let busy = false;
let inGame = false;

const fresh = (n: number): Progress => ({ level: n, found: [], revealed: [], bonusFound: [], order: '' });
const save = () => {
  if (!cur) return;
  cur.found = [...found];
  cur.revealed = [...revealed];
  cur.bonusFound = [...bonusFound];
  store.set(`progress.${settings.lang}`, cur);
};
const upper = (s: string) => s.toLocaleUpperCase(settings.lang);

// ───────────────────────── profile (coins shared, level map per language) ─────────────────────────
// One kit profile holds coins, missions, daily reward and skins for both languages. Its
// `stars`/`unlocked` always mirror the active word language; each language's copy lives in
// `wordlink.map.<lang>` and is swapped in when the language changes.
const hadProfile = (() => {
  try {
    return localStorage.getItem('wordlink.profile') !== null;
  } catch {
    return false;
  }
})();
const profile = createProfile({
  game: 'wordlink',
  levelCount: LEVEL_COUNT,
  defaultSkin: SKINS[0].id,
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'levels', targets: [2, 3, 5], reward: (n) => 20 + n * 10 },
    { id: 'stars', targets: [4, 6, 9], reward: (n) => 20 + n * 5 },
    { id: 'perfect', targets: [1, 2, 3], reward: (n) => 30 + n * 10 },
    { id: 'words', targets: [10, 15, 25], reward: (n) => 15 + n * 2 },
    { id: 'bonus', targets: [2, 4, 6], reward: (n) => 20 + n * 6 },
  ],
});

const normMap = (m: Partial<LangMap> | null): LangMap => ({
  stars: Array.from({ length: LEVEL_COUNT }, (_, i) => {
    const v = Array.isArray(m?.stars) ? Number(m!.stars[i]) : 0;
    return Number.isFinite(v) ? Math.max(0, Math.min(3, Math.floor(v))) : 0;
  }),
  unlocked: Math.max(1, Math.min(LEVEL_COUNT, Math.floor(Number(m?.unlocked) || 1))),
});

// v1.0 → meta: keep the old coin balance and each language's reached level.
if (!hadProfile) {
  const oldCoins = store.get<number | null>('coins', null);
  if (typeof oldCoins === 'number' && Number.isFinite(oldCoins)) profile.data.coins = Math.max(0, Math.floor(oldCoins));
}
store.remove('coins');
for (const l of ['en', 'tr'] as Lang[]) {
  if (store.get<LangMap | null>(`map.${l}`, null)) continue;
  const old = store.get<Progress | null>(`progress.${l}`, null);
  const reached = Math.max(1, Math.min(LEVEL_COUNT, old?.level ?? 1));
  store.set(`map.${l}`, normMap({ stars: Array.from({ length: reached - 1 }, () => 1), unlocked: reached }));
}

function loadMap(l: Lang) {
  const m = normMap(store.get<LangMap | null>(`map.${l}`, null));
  profile.data.stars = m.stars;
  profile.data.unlocked = m.unlocked;
}
loadMap(settings.lang);
profile.onChange(() => store.set(`map.${settings.lang}`, { stars: profile.data.stars, unlocked: profile.data.unlocked }));
profile.save();

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const board = $('board');
const wheel = $('wheel');
const preview = $('preview');
const trail = $('trail-line') as unknown as SVGPolylineElement;
const hand = $('hand');

document.documentElement.lang = navigator.language.slice(0, 2) === 'tr' ? 'tr' : 'en';
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
});
$('hint-price').textContent = String(HINT_COST);

let toastTimer = 0;
function toast(text: string, ms = 1800) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

function bump(el: HTMLElement) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

let shownCoins = profile.data.coins;
function renderCoins() {
  $('coins').textContent = String(profile.data.coins);
  if (profile.data.coins !== shownCoins) bump($('coins-pill'));
  shownCoins = profile.data.coins;
}
profile.onChange(renderCoins);

// ───────────────────────── board ─────────────────────────
function renderBoard(animate: Set<string> = new Set(), flash: Set<string> = new Set()) {
  const wrap = board.parentElement!.getBoundingClientRect();
  const gap = 5;
  const cell = Math.floor(Math.min(52, (wrap.width - 32 - gap * (level.cols - 1)) / level.cols, (wrap.height - 16 - gap * (level.rows - 1)) / level.rows));
  board.style.setProperty('--cell', `${cell}px`);
  board.style.gridTemplateColumns = `repeat(${level.cols}, ${cell}px)`;
  const letters = new Map<string, string>();
  for (const p of level.words) cellsOf(p).forEach((k, i) => letters.set(k, p.w[i]));
  const vis = new Set(revealed);
  for (const p of level.words) if (found.has(p.w)) cellsOf(p).forEach((k) => vis.add(k));
  const html: string[] = [];
  let stagger = 0;
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      const k = cellKey(r, c);
      const ch = letters.get(k);
      if (!ch) {
        html.push('<div class="cell blank"></div>');
        continue;
      }
      const shown = vis.has(k);
      const isFound = level.words.some((p) => found.has(p.w) && cellsOf(p).includes(k));
      const cls = ['cell', shown ? (isFound ? 'on' : 'hinted') : '', flash.has(k) ? 'flash' : ''].join(' ');
      const delay = animate.has(k) ? `style="animation-delay:${stagger++ * 60}ms"` : 'style="animation:none"';
      html.push(`<div class="${cls}" ${shown && !flash.has(k) ? delay : ''}>${shown ? upper(ch) : ''}</div>`);
    }
  }
  board.innerHTML = html.join('');
}

// ───────────────────────── wheel ─────────────────────────
let order: string[] = [];
let positions: { x: number; y: number }[] = [];
let wheelSize = 0;
let path: number[] = [];
let pointer: { x: number; y: number } | null = null;

function layoutWheel() {
  wheelSize = Math.min(window.innerWidth - 150, 300, window.innerHeight * 0.34);
  wheel.style.setProperty('--wheel', `${wheelSize}px`);
  const n = order.length;
  const lsize = Math.min(64, wheelSize * (n <= 5 ? 0.27 : 0.23));
  wheel.style.setProperty('--lsize', `${lsize}px`);
  const radius = wheelSize / 2 - lsize * 0.62;
  positions = order.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: wheelSize / 2 + Math.cos(a) * radius, y: wheelSize / 2 + Math.sin(a) * radius };
  });
  wheel.querySelectorAll('.letter').forEach((el) => el.remove());
  order.forEach((ch, i) => {
    const el = document.createElement('div');
    el.className = 'letter';
    el.textContent = upper(ch);
    el.style.left = `${positions[i].x}px`;
    el.style.top = `${positions[i].y}px`;
    el.dataset.i = String(i);
    wheel.appendChild(el);
  });
  (wheel.querySelector('svg') as SVGSVGElement).setAttribute('viewBox', `0 0 ${wheelSize} ${wheelSize}`);
}

function renderPath() {
  wheel.querySelectorAll<HTMLElement>('.letter').forEach((el) => el.classList.toggle('on', path.includes(Number(el.dataset.i))));
  const pts = path.map((i) => `${positions[i].x},${positions[i].y}`);
  if (pointer && path.length) pts.push(`${pointer.x},${pointer.y}`);
  trail.setAttribute('points', pts.join(' '));
  const word = path.map((i) => order[i]).join('');
  preview.className = 'preview' + (word ? ' show' : '');
  preview.textContent = upper(word);
}

function hitLetter(x: number, y: number) {
  const lsize = parseFloat(wheel.style.getPropertyValue('--lsize'));
  let best = -1;
  let bestD = lsize * 0.62;
  positions.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

function local(e: PointerEvent) {
  const r = wheel.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function addLetter(i: number) {
  if (i < 0) return;
  if (path.length >= 2 && path[path.length - 2] === i) {
    path.pop(); // slid back: undo last letter
    haptic.light();
  } else if (!path.includes(i)) {
    path.push(i);
    haptic.light();
    tone({ freq: pentatonic(path.length - 1, 392), duration: 0.1, type: 'triangle', volume: 0.3 });
  }
}

wheel.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (busy || meta.covering) return;
  const p = local(e);
  const i = hitLetter(p.x, p.y);
  if (i < 0) return;
  wheel.setPointerCapture(e.pointerId);
  path = [];
  pointer = p;
  addLetter(i);
  hideHand();
  renderPath();
});
wheel.addEventListener('pointermove', (e) => {
  if (!path.length) return;
  pointer = local(e);
  addLetter(hitLetter(pointer.x, pointer.y));
  renderPath();
});
function endSwipe() {
  if (!path.length) return;
  const word = path.map((i) => order[i]).join('');
  path = [];
  pointer = null;
  wheel.querySelectorAll('.letter').forEach((el) => el.classList.remove('on'));
  trail.setAttribute('points', '');
  submit(word);
}
wheel.addEventListener('pointerup', endSwipe);
wheel.addEventListener('pointercancel', endSwipe);

function settlePreview(kind: string, word: string) {
  preview.textContent = upper(word);
  preview.className = `preview show ${kind}`;
  setTimeout(() => (preview.className = 'preview'), kind === 'bad' ? 450 : 600);
}

function submit(word: string) {
  if (word.length < 3) {
    preview.className = 'preview';
    return;
  }
  const v = judge(level, found, bonusFound, word);
  if (v === 'answer') {
    found.add(word);
    settlePreview('good', word);
    const placed = level.words.find((p) => p.w === word)!;
    renderBoard(new Set(cellsOf(placed)));
    haptic.medium();
    [0, 2, 4].forEach((s, i) => tone({ freq: pentatonic(s + word.length - 3), duration: 0.16, volume: 0.4, delay: i * 0.05 }));
    track('word_found', { level: cur.level, len: word.length });
    profile.progress('words');
    afterProgress();
  } else if (v === 'bonus') {
    bonusFound.add(word);
    settlePreview('bonus', word);
    toast(t('bonusWord'));
    haptic.success();
    tone({ freq: 1046, to: 1568, duration: 0.18, volume: 0.35 });
    addBonus();
    save();
    profile.progress('bonus');
    track('bonus_word', { level: cur.level });
  } else if (v === 'dup' || v === 'bonusDup') {
    settlePreview('dup', word);
    toast(t('already'), 1000);
    if (v === 'dup') {
      const placed = level.words.find((p) => p.w === word)!;
      renderBoard(new Set(), new Set(cellsOf(placed)));
    }
    haptic.light();
  } else {
    settlePreview('bad', word);
    haptic.error();
    tone({ freq: 180, to: 130, duration: 0.15, type: 'triangle', volume: 0.3 });
  }
}

function addBonus() {
  bonusMeter++;
  if (bonusMeter >= BONUS_BATCH) {
    bonusMeter = 0;
    profile.addCoins(BONUS_REWARD);
    toast(t('gotCoins', { n: BONUS_REWARD }));
  }
  store.set('bonusMeter', bonusMeter);
  renderMeter();
  bump($('bonus-btn'));
}

function renderMeter() {
  $('bonus-meter').style.width = `${(bonusMeter / BONUS_BATCH) * 100}%`;
}

function afterProgress() {
  for (const w of completedByReveal(level, found, revealed)) found.add(w);
  save();
  if (isComplete(level, found)) {
    busy = true;
    setTimeout(win, 650);
  } else {
    scheduleHand();
  }
}

// ───────────────────────── level flow ─────────────────────────
function loadLevel(p: Progress) {
  cur = p;
  if (cur.level > levels.length) cur.level = levels.length;
  level = levels[cur.level - 1];
  found = new Set(cur.found);
  revealed = new Set(cur.revealed);
  bonusFound = new Set(cur.bonusFound);
  order = cur.order && cur.order.length === level.letters.length ? [...cur.order] : [...level.letters];
  cur.order = order.join('');
  busy = false;
  startedAt = Date.now();
  $('level').textContent = String(cur.level);
  layoutWheel();
  renderBoard();
  renderPath();
  save();
  scheduleHand();
}

/** Starts (or resumes) level `n` of the active language. */
function play(n: number) {
  n = Math.max(1, Math.min(n, levels.length));
  const saved = store.get<Progress | null>(`progress.${settings.lang}`, null);
  const resumed = !!saved && saved.level === n;
  inGame = true;
  loadLevel(resumed ? saved! : fresh(n));
  track('level_start', { level: n, lang: settings.lang, resumed: resumed && saved!.found.length > 0 });
}

/** 3 stars without hints, 2 with one or two hints, 1 otherwise. */
const starsFor = (hints: number) => (hints === 0 ? 3 : hints <= 2 ? 2 : 1);

function win() {
  // Whole grid flashes once as the celebration.
  renderBoard(new Set(), new Set(level.words.flatMap((p) => cellsOf(p))));
  [0, 2, 4, 5, 7, 9].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.22, volume: 0.45, delay: i * 0.08 }));
  haptic.success();
  const done = cur.level;
  const stars = starsFor(revealed.size);
  track('level_complete', {
    level: done,
    lang: settings.lang,
    bonus: bonusFound.size,
    hints: revealed.size,
    stars,
    duration_s: Math.round((Date.now() - startedAt) / 1000),
  });
  // Persist the next level now so quitting on this screen never loses progress.
  store.set(`progress.${settings.lang}`, fresh(Math.min(done + 1, levels.length)));
  store.set('completed', Math.max(store.get('completed', 0), done));
  setTimeout(() => {
    if (profile.data.firstRun) profile.finishFirstRun(); // daily reward pops up on home from now on
    meta.showWin({
      level: done,
      stars,
      coins: 10 + stars * 5,
      onNext: () => {
        if (done >= levels.length) {
          inGame = false;
          meta.showHome();
          meta.toast(t('allDone'));
        } else play(done + 1);
      },
      onMenu: () => {
        inGame = false;
        hideHand();
      },
    });
    maybeRequestReview(done, done >= 6);
  }, 500);
}

// ───────────────────────── tools ─────────────────────────
$('shuffle-btn').addEventListener('click', () => {
  unlockAudio();
  if (busy) return;
  order = shuffleLetters(order, Math.random);
  cur.order = order.join('');
  save();
  layoutWheel();
  haptic.light();
  tone({ freq: 500, to: 700, duration: 0.12, type: 'triangle', volume: 0.25 });
});

$('hint-btn').addEventListener('click', () => {
  unlockAudio();
  if (busy) return;
  const k = hintCell(level, found, revealed);
  if (!k) return;
  if (!profile.spend(HINT_COST)) {
    // Free coins (rewarded video) and coin packs live in the meta shop.
    haptic.error();
    meta.openShop('coins');
    meta.toast(t('notEnough'));
    return;
  }
  revealed.add(k);
  renderBoard(new Set([k]));
  haptic.light();
  tone({ freq: 880, duration: 0.12, volume: 0.3 });
  track('hint', { level: cur.level });
  afterProgress();
});

$('coins-pill').addEventListener('click', () => {
  unlockAudio();
  meta.openShop('coins');
});

$('bonus-btn').addEventListener('click', () => {
  const list = $('bonus-list');
  list.innerHTML = '';
  for (const w of bonusFound) {
    const s = document.createElement('span');
    s.textContent = upper(w);
    list.appendChild(s);
  }
  $('bonus-info').textContent = bonusFound.size ? t('bonusInfo', { n: BONUS_BATCH, c: BONUS_REWARD }) : t('bonusNone');
  $('bonus-sheet').hidden = false;
});
$('close-bonus').addEventListener('click', () => ($('bonus-sheet').hidden = true));
$('bonus-sheet').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) $('bonus-sheet').hidden = true;
});

// ───────────────────────── tutorial hand ─────────────────────────
let handTimer = 0;
function hideHand() {
  clearTimeout(handTimer);
  hand.hidden = true;
}
/** Level 1–2: if the player hesitates, a finger traces the shortest unfound word. */
function scheduleHand() {
  hideHand();
  if (cur.level > 2 || !inGame) return;
  handTimer = window.setTimeout(async () => {
    const target = level.words.filter((p) => !found.has(p.w)).sort((a, b) => a.w.length - b.w.length)[0];
    if (!target || busy || !inGame) return;
    const used: number[] = [];
    const idx = [...target.w].map((ch) => {
      const i = order.findIndex((o, j) => o === ch && !used.includes(j));
      used.push(i);
      return i;
    });
    hand.hidden = false;
    for (let loop = 0; loop < 3 && !hand.hidden; loop++) {
      for (const i of idx) {
        if (hand.hidden) return;
        hand.style.left = `${positions[i].x}px`;
        hand.style.top = `${positions[i].y}px`;
        await new Promise((r) => setTimeout(r, 480));
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    hand.hidden = true;
    scheduleHand();
  }, cur.level === 1 && found.size === 0 ? 900 : 5000);
}

// ───────────────────────── skins ─────────────────────────
function applySkin(id: string) {
  const s = SKINS.find((k) => k.id === id) ?? SKINS[0];
  const root = document.documentElement.style;
  const vars: Record<string, string> = {
    '--bg-top': s.bgTop,
    '--bg-bottom': s.bgBottom,
    '--tile': s.tile,
    '--tile-ink': s.tileInk,
    '--accent': s.accent,
    '--accent-dark': s.accentDark,
    '--mint': s.mint,
    '--sheet': s.sheet,
    '--muted': s.muted,
    '--m-bg': `radial-gradient(120% 80% at 50% 0%, ${s.bgTop}, ${s.bgBottom})`,
    '--m-ink': s.tileInk,
    '--m-accent': s.accent,
  };
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.bgBottom);
}
applySkin(profile.data.skin);

// ───────────────────────── home artwork ─────────────────────────
const HERO: Record<Lang, { word: string; slots: number[] }> = {
  en: { word: 'LINK', slots: [0, 2, 3, 1] },
  tr: { word: 'KELİME', slots: [0, 3, 1, 4, 2, 5] },
};
/** A mini letter wheel tracing the word into a row of tiles above it (follows the word language). */
function heroArt() {
  const el = document.createElement('div') as HTMLDivElement & { repaint: () => void };
  el.className = 'hero';
  el.repaint = () => {
    const { word, slots } = HERO[settings.lang];
    const letters = [...word];
    const n = letters.length;
    const pos = (slot: number) => {
      const a = -Math.PI / 2 + (slot * 2 * Math.PI) / n;
      return { x: 90 + Math.cos(a) * 60, y: 90 + Math.sin(a) * 60 };
    };
    const pts = slots.map((s) => pos(s));
    el.innerHTML = `
      <div class="hero-tiles">${letters.map((ch, i) => `<i style="animation-delay:${400 + i * 160}ms">${ch}</i>`).join('')}</div>
      <div class="hero-wheel">
        <svg viewBox="0 0 180 180"><polyline points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}" pathLength="1" style="--n:${n}"/></svg>
        ${letters.map((ch, i) => `<b style="left:${pts[i].x}px;top:${pts[i].y}px;animation-delay:${400 + i * 160}ms">${ch}</b>`).join('')}
      </div>`;
  };
  el.repaint();
  return el;
}
const hero = heroArt();

// ───────────────────────── word language (meta settings row) ─────────────────────────
function langRow() {
  const el = document.createElement('div');
  el.innerHTML = `<div class="m-row"><span></span><div class="lang-seg" role="radiogroup"><button data-lang="tr" role="radio">TR</button><button data-lang="en" role="radio">EN</button></div></div><p class="credits"></p>`;
  el.querySelector('span')!.textContent = t('language');
  el.querySelector('.credits')!.textContent = t('credits');
  el.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) => b.addEventListener('click', () => void setLang(b.dataset.lang as Lang)));
  return el;
}
const extraSettings = langRow();
function renderLang() {
  extraSettings.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === settings.lang)));
}

async function setLang(lang: Lang) {
  if (lang === settings.lang) return;
  haptic.light();
  save();
  settings.lang = lang;
  store.set('settings', settings);
  renderLang();
  loadMap(lang);
  levels = (await PACKS[lang]()).default as Level[];
  profile.save(); // writes the map under the new language and refreshes the home screen
  hero.repaint();
  if (inGame) play(store.get<Progress | null>(`progress.${lang}`, null)?.level ?? profile.data.unlocked);
  track('language', { lang });
}

// ───────────────────────── meta (menu, missions, daily, shop) ─────────────────────────
const meta = createMeta({
  title: 'Wordlink',
  tagline: t('tagline'),
  hero,
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  levels: { count: LEVEL_COUNT, play },
  missionText: (id, n) => t(`mission_${id}` as 'mission_levels', { n }),
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as 'skin_lagoon'), price: s.price, swatch: s.swatch })),
  onSkin: applySkin,
  settings: { sound: settings.sound, haptics: settings.haptics },
  onSettings: (s) => {
    settings.sound = s.sound;
    settings.haptics = s.haptics;
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', settings);
  },
  extraSettings,
});

$('settings-btn').addEventListener('click', () => {
  unlockAudio();
  if (busy || meta.covering) return;
  hideHand();
  meta.showPause({
    onResume: () => scheduleHand(),
    onRestart: () => {
      track('level_restart', { level: cur.level, lang: settings.lang });
      loadLevel(fresh(cur.level));
    },
    onMenu: () => {
      save();
      inGame = false;
      hideHand();
    },
  });
});

window.addEventListener('resize', () => {
  if (!level) return;
  layoutWheel();
  renderBoard();
});

// ───────────────────────── boot ─────────────────────────
trackSession('wordlink');
renderCoins();
renderMeter();
renderLang();
levels = (await PACKS[settings.lang]()).default as Level[];

void initAds();
void initStore();
void setupNative({
  onPause: save,
  onBack: () => {
    if (meta.back()) return true;
    if (!$('bonus-sheet').hidden) {
      $('bonus-sheet').hidden = true;
      return true;
    }
    if (inGame && !meta.covering) {
      $('settings-btn').click();
      return true;
    }
    return false;
  },
});
meta.showHome();

// Exposed for e2e/screenshot scripts.
(window as unknown as { __wordlink: unknown }).__wordlink = {
  get level() {
    return level;
  },
  get progress() {
    return cur;
  },
  submit,
  goto: (n: number) => {
    meta.hideHome();
    play(n);
  },
  setLang,
};
