import './style.css';
import { Capacitor } from '@capacitor/core';
import {
  createMeta,
  createProfile,
  createStore,
  dayKey,
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
  type Reminder,
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
import {
  CHAPTER_SIZE,
  chapterCount,
  chapterName,
  chapterOf,
  chapterRange,
  chapterReward,
  isChapterEnd,
  sceneSvg,
  skyGradient,
  stepInChapter,
} from './chapters';
import {
  addDays,
  bestStreak,
  clock,
  currentStreak,
  dailyIndex,
  dayNumber,
  milestoneBonus,
  monthGrid,
  nextMilestone,
  parseDay,
  prune,
  type Solved,
} from './daily';
import { t } from './i18n';
import { SKINS } from './skins';
import COUNTS from './levels/counts.json';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/wordlink/PRIVACY.md';
// TODO(mağaza): yayından sonra mağaza / akıllı bağlantıyla değiştir (paylaşım metnine eklenir).
const STORE_URL = 'https://play.google.com/store/apps/details?id=com.indiestudio.wordlink';
declare const __APP_VERSION__: string;

type Lang = 'en' | 'tr';
const PACKS: Record<Lang, () => Promise<{ default: unknown }>> = {
  en: () => import('./levels/en.json'),
  tr: () => import('./levels/tr.json'),
};
const DAILY_PACKS: Record<Lang, () => Promise<{ default: unknown }>> = {
  en: () => import('./levels/daily-en.json'),
  tr: () => import('./levels/daily-tr.json'),
};

/** Levels per word language (TR has fewer: its hand-reviewed allowlist is smaller). */
const LEVEL_COUNT: Record<Lang, number> = { en: COUNTS.en.levels, tr: COUNTS.tr.levels };
/** The shared kit profile is sized for the longer map. */
const MAX_LEVELS = Math.max(LEVEL_COUNT.en, LEVEL_COUNT.tr);
const HINT_COST = 25;
const DAILY_COINS = 30;
const DAILY_PERFECT_COINS = 10;
const REMINDER_HOUR = 19;
const REMINDER_IDS = [1901, 1902, 1903, 1904, 1905, 1906, 1907];
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
  /** Daily puzzle runs only: the date it belongs to and seconds played. */
  day?: string;
  elapsed?: number;
}
/** Daily puzzle history (shared by both word languages: the streak belongs to the player). */
interface DailyData {
  solved: Solved;
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
/** What is on the board: a numbered level or today's daily puzzle. */
let mode: 'level' | 'daily' = 'level';

const fresh = (n: number): Progress => ({ level: n, found: [], revealed: [], bonusFound: [], order: '' });
const runKey = () => (mode === 'daily' ? `dailyRun.${settings.lang}` : `progress.${settings.lang}`);
const save = () => {
  if (!cur) return;
  cur.found = [...found];
  cur.revealed = [...revealed];
  cur.bonusFound = [...bonusFound];
  store.set(runKey(), cur);
};

const dailyData: DailyData = (() => {
  const d = store.get<Partial<DailyData> | null>('daily', null);
  const solved: Solved = {};
  if (d && d.solved && typeof d.solved === 'object')
    for (const [k, v] of Object.entries(d.solved))
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && Number.isFinite(v.t) && Number.isFinite(v.h)) solved[k] = { t: Math.max(0, v.t), h: Math.max(0, v.h) };
  return { solved: prune(solved, dayKey()) };
})();
const saveDaily = () => store.set('daily', dailyData);
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
  levelCount: MAX_LEVELS,
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

// v1.0 maps had 400 entries; they grow here and every earned star keeps its level.
const normMap = (m: Partial<LangMap> | null, lang: Lang): LangMap => ({
  stars: Array.from({ length: MAX_LEVELS }, (_, i) => {
    const v = Array.isArray(m?.stars) && i < LEVEL_COUNT[lang] ? Number(m!.stars[i]) : 0;
    return Number.isFinite(v) ? Math.max(0, Math.min(3, Math.floor(v))) : 0;
  }),
  unlocked: Math.max(1, Math.min(LEVEL_COUNT[lang], Math.floor(Number(m?.unlocked) || 1))),
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
  const reached = Math.max(1, Math.min(LEVEL_COUNT[l], old?.level ?? 1));
  store.set(`map.${l}`, normMap({ stars: Array.from({ length: reached - 1 }, () => 1), unlocked: reached }, l));
}

function loadMap(l: Lang) {
  const m = normMap(store.get<LangMap | null>(`map.${l}`, null), l);
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

/**
 * Letter under the pointer. The first touch is forgiving; while dragging, a letter only joins
 * when the finger is on its disc, so a straight drag between two letters of a 6–7 letter wheel
 * does not clip the letter sitting between them.
 */
function hitLetter(x: number, y: number, dragging = false) {
  const lsize = parseFloat(wheel.style.getPropertyValue('--lsize'));
  let best = -1;
  let bestD = lsize * (dragging ? 0.42 : 0.62);
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
  if (busy || covering()) return;
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
  addLetter(hitLetter(pointer.x, pointer.y, true));
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
    hideHand();
    setTimeout(() => (mode === 'daily' ? dailyWin() : win()), 650);
  } else {
    scheduleHand();
  }
}

// ───────────────────────── scenery + HUD ─────────────────────────
const scenery = $('scenery');
let sceneShown = -1;
/** Swaps the code-drawn landscape behind the board (cross-fades when the chapter changes). */
function setScene(index: number) {
  if (index === sceneShown) return;
  sceneShown = index;
  const layer = document.createElement('div');
  layer.className = 'scene';
  layer.innerHTML = sceneSvg(index);
  scenery.appendChild(layer);
  const old = [...scenery.children].slice(0, -1);
  setTimeout(() => old.forEach((el) => el.remove()), 700);
}

const fmtDate = (key: string, o: Intl.DateTimeFormatOptions) => {
  const { y, m, d } = parseDay(key);
  return new Intl.DateTimeFormat(settings.lang === 'tr' ? 'tr-TR' : 'en-US', { ...o, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
};

function renderHud() {
  if (mode === 'daily') {
    $('hud-eyebrow').textContent = t('dailyHud');
    $('level').textContent = fmtDate(cur.day!, { day: 'numeric', month: 'short' });
    $('hud-sub').textContent = clock(cur.elapsed ?? 0);
    $('app').classList.add('daily');
  } else {
    $('hud-eyebrow').textContent = t('level');
    $('level').textContent = String(cur.level);
    $('hud-sub').textContent = `${chapterName(chapterOf(cur.level), settings.lang)} · ${stepInChapter(cur.level)}/${CHAPTER_SIZE}`;
    $('app').classList.remove('daily');
  }
}

// ───────────────────────── level flow ─────────────────────────
function loadLevel(p: Progress, lvl: Level) {
  cur = p;
  level = lvl;
  found = new Set(cur.found);
  revealed = new Set(cur.revealed);
  bonusFound = new Set(cur.bonusFound);
  order = cur.order && cur.order.length === level.letters.length ? [...cur.order] : [...level.letters];
  cur.order = order.join('');
  busy = false;
  startedAt = Date.now();
  renderHud();
  layoutWheel();
  renderBoard(new Set(level.words.flatMap((w) => (found.has(w.w) ? cellsOf(w) : []))));
  renderPath();
  save();
  scheduleHand();
}

/** Starts (or resumes) level `n` of the active language. */
function play(n: number) {
  n = Math.max(1, Math.min(n, levels.length));
  mode = 'level';
  const saved = store.get<Progress | null>(`progress.${settings.lang}`, null);
  const resumed = !!saved && saved.level === n;
  inGame = true;
  setScene(chapterOf(n));
  loadLevel(resumed ? saved! : fresh(n), levels[n - 1]);
  track('level_start', { level: n, lang: settings.lang, resumed: resumed && saved!.found.length > 0 });
}

/** 3 stars without hints, 2 with one or two hints, 1 otherwise. */
const starsFor = (hints: number) => (hints === 0 ? 3 : hints <= 2 ? 2 : 1);

/** Whole grid flashes once with a rising arpeggio. */
function celebrateBoard() {
  renderBoard(new Set(), new Set(level.words.flatMap((p) => cellsOf(p))));
  [0, 2, 4, 5, 7, 9].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.22, volume: 0.45, delay: i * 0.08 }));
  haptic.success();
}

function win() {
  celebrateBoard();
  const done = cur.level;
  const hints = revealed.size;
  const stars = starsFor(hints);
  const firstClear = (profile.data.stars[done - 1] ?? 0) === 0;
  track('level_complete', {
    level: done,
    lang: settings.lang,
    bonus: bonusFound.size,
    hints,
    stars,
    duration_s: Math.round((Date.now() - startedAt) / 1000),
  });
  // Persist the next level now so quitting on this screen never loses progress.
  store.set(`progress.${settings.lang}`, fresh(Math.min(done + 1, levels.length)));
  store.set('completed', Math.max(store.get('completed', 0), done));
  const firstWin = !store.get('remindAsked', false);
  const after = () => {
    if (firstWin) maybeAskReminders();
  };
  const showWin = () => {
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
        after();
      },
      onMenu: () => {
        inGame = false;
        hideHand();
        after();
      },
    });
    decorateWin(done, stars, hints);
    maybeRequestReview(done, done >= 6);
  };
  setTimeout(() => {
    if (profile.data.firstRun) profile.finishFirstRun(); // daily reward pops up on home from now on
    // Finishing a chapter for the first time: celebration + reward before the usual win sheet.
    if (isChapterEnd(done) && firstClear) showChapterDone(chapterOf(done), showWin);
    else showWin();
  }, 500);
}

// ───────────────────────── own sheets (styled by the kit's meta.css) ─────────────────────────
// The kit meta root is created by createMeta (below); this layer is appended after it so own
// sheets always sit on top of the kit's screens.
let kitRoot!: HTMLElement;
const kitSheet = () => kitRoot.querySelector<HTMLElement>('.m-sheet')!;
const layer = document.createElement('div');
layer.className = 'meta-root wl-layer';
layer.innerHTML = '<div class="m-overlay" hidden><div class="m-sheet"></div></div>';
const panel = layer.firstElementChild as HTMLElement;
const panelBody = panel.firstElementChild as HTMLElement;
let panelModal = false;
let panelClose: (() => void) | null = null;
function openPanel(content: HTMLElement, o: { modal?: boolean; onClose?: () => void; cls?: string } = {}) {
  panelBody.className = `m-sheet ${o.cls ?? ''}`;
  panelBody.replaceChildren(content);
  panel.hidden = false;
  panelModal = !!o.modal;
  panelClose = o.onClose ?? null;
}
function closePanel() {
  if (panel.hidden) return;
  panel.hidden = true;
  const cb = panelClose;
  panelClose = null;
  cb?.();
}
panel.addEventListener('click', (e) => {
  if (e.target === panel && !panelModal) closePanel();
});
const html = (s: string) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = s.trim();
  return tpl.content.firstElementChild as HTMLElement;
};
/** True while anything (kit sheet, own sheet, bonus list) covers the board. */
const covering = () => meta.covering || !panel.hidden || !$('bonus-sheet').hidden;

const ICON = {
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#ffc83d" stroke="#b57d10" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#e0a21c" stroke-width="1.6"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  flame: '<svg viewBox="0 0 24 24" class="flame"><path d="M12 2c1 4 6 6.5 6 12a6 6 0 0 1-12 0c0-3 1.5-5 3-6.5 0 2.5 1 4 2.5 4.5C11 9 10 5.5 12 2z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

// ───────────────────────── sharing ─────────────────────────
const hintWords = (h: number) => (h === 0 ? t('noHints') : h === 1 ? t('oneHint') : t('hints', { n: h }));
const dayWords = (n: number) => (n === 1 ? t('oneDay') : t('days', { n }));
async function share(text: string, placement: string) {
  track('share_tap', { placement });
  const ok = await shareResult({ title: 'Wordlink', text, url: STORE_URL });
  const nav = navigator as Navigator & { share?: unknown };
  if (ok && !Capacitor.isNativePlatform() && !nav.share) meta.toast(t('copied'));
}

/** Adds the chapter progress row and a Share button to the kit's level win sheet. */
function decorateWin(done: number, stars: number, hints: number) {
  const res = kitSheet().querySelector<HTMLElement>('.m-result');
  if (!res || res.querySelector('.wl-chap')) return;
  const c = chapterOf(done);
  const step = stepInChapter(done);
  const row = html(`<div class="wl-chap" style="background:${skyGradient(c, '90deg')}"><span></span><i>${Array.from({ length: CHAPTER_SIZE }, (_, i) => `<b class="${i < step ? 'on' : ''}"></b>`).join('')}</i></div>`);
  row.querySelector('span')!.textContent = `${t('chapter', { n: c + 1 })} · ${chapterName(c, settings.lang)}`;
  res.querySelector('h2')!.after(row);
  const menu = res.querySelector<HTMLElement>('[data-menu]')!;
  const pair = html(`<div class="wl-pair"><button class="m-btn ghost" data-share>${ICON.share}<span></span></button></div>`);
  pair.querySelector('span')!.textContent = t('share');
  menu.replaceWith(pair);
  pair.appendChild(menu);
  pair.querySelector('[data-share]')!.addEventListener('click', () => void share(t('shareLevel', { n: done, how: hintWords(hints), stars }), 'level_win'));
}

// ───────────────────────── chapters ─────────────────────────
function showChapterDone(c: number, then: () => void) {
  const reward = chapterReward(c);
  const next = c + 1 < chapterCount(levels.length) ? c + 1 : -1;
  const confetti = Array.from({ length: 28 }, (_, i) => {
    const r = (k: number) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1; // stable scatter
    return `<i style="left:${Math.round(r(1) * 96)}%;animation-delay:${Math.round(r(2) * 700)}ms;animation-duration:${1500 + Math.round(r(3) * 900)}ms;transform:rotate(${Math.round(r(4) * 180)}deg);background:${['#ffc83d', '#5ee0b8', '#ff8fb8', '#7fd6ff'][i % 4]}"></i>`;
  }).join('');
  const el = html(`<div class="m-result wl-chapter">
    <div class="wl-confetti">${confetti}</div>
    <div class="wl-scene">${sceneSvg(next >= 0 ? next : c, 'card')}</div>
    <p class="m-eyebrow"></p><h2>${t('chapterDone')}</h2>
    <p class="m-note" data-next-name></p>
    <p class="m-reward">${ICON.coin}<b>+${reward}</b></p>
    <button class="m-btn" data-collect></button></div>`);
  el.querySelector('.m-eyebrow')!.textContent = `${t('chapter', { n: c + 1 })} · ${chapterName(c, settings.lang)}`;
  el.querySelector('[data-next-name]')!.textContent = next >= 0 ? t('chapterNext', { name: chapterName(next, settings.lang) }) : t('allDone');
  el.querySelector('[data-collect]')!.textContent = t('collect');
  el.querySelector('[data-collect]')!.addEventListener('click', () => {
    unlockAudio();
    profile.addCoins(reward);
    haptic.success();
    closePanel();
    then();
  });
  [0, 4, 7, 9, 11, 14].forEach((s, i) => tone({ freq: pentatonic(s, 330), duration: 0.25, volume: 0.4, delay: 0.1 + i * 0.09 }));
  track('chapter_complete', { chapter: c + 1, lang: settings.lang });
  openPanel(el, { modal: true });
}

// ───────────────────────── daily puzzle ─────────────────────────
const streakNow = () => currentStreak(dailyData.solved, dayKey());

async function startDaily() {
  const today = dayKey();
  if (dailyData.solved[today]) {
    // Already solved today: show the result and calendar over the home screen.
    meta.showHome();
    showDailySheet(false);
    return;
  }
  const pack = (await DAILY_PACKS[settings.lang]()).default as Level[];
  const saved = store.get<Progress | null>(`dailyRun.${settings.lang}`, null);
  mode = 'daily';
  inGame = true;
  setScene(100 + (dayNumber(today) % 48)); // a different landscape every day
  const run = saved && saved.day === today ? saved : { ...fresh(0), day: today, elapsed: 0 };
  loadLevel(run, pack[dailyIndex(today, pack.length)]);
  track('daily_start', { lang: settings.lang, resumed: run === saved });
}

function dailyWin() {
  celebrateBoard();
  const day = cur.day!;
  const result = { t: cur.elapsed ?? 0, h: revealed.size };
  dailyData.solved[day] = result;
  saveDaily();
  store.remove(`dailyRun.${settings.lang}`);
  const streak = streakNow();
  const bonus = milestoneBonus(streak);
  const coins = DAILY_COINS + (result.h === 0 ? DAILY_PERFECT_COINS : 0);
  profile.addCoins(coins + bonus);
  track('daily_complete', { lang: settings.lang, streak, time_s: result.t, hints: result.h, bonus });
  paintDailyCard();
  void refreshReminders(); // today's reminder is no longer needed
  setTimeout(() => {
    if (profile.data.firstRun) profile.finishFirstRun();
    showDailySheet(true, coins, bonus);
  }, 500);
}

const until = () => {
  const now = new Date();
  const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const mins = Math.max(1, Math.ceil((mid - now.getTime()) / 60000));
  return t('hm', { h: Math.floor(mins / 60), m: mins % 60 });
};

function calendarHtml(today: string) {
  const { y, m } = parseDay(today);
  const week = Array.from({ length: 7 }, (_, i) => fmtDate(addDays('2026-01-05', i), { weekday: 'narrow' })); // a Monday
  const cells = monthGrid(y, m)
    .map((k) => {
      if (!k) return '<span></span>';
      const cls = [dailyData.solved[k] ? 'done' : '', k === today ? 'today' : '', k > today ? 'future' : ''].join(' ');
      return `<span class="${cls}">${dailyData.solved[k] ? ICON.check : parseDay(k).d}</span>`;
    })
    .join('');
  return `<div class="wl-cal"><div class="wl-cal-title"><b>${fmtDate(today, { month: 'long', year: 'numeric' })}</b><small>${t('dailyBest', { n: bestStreak(dailyData.solved) })}</small></div><div class="wl-cal-grid">${week.map((w) => `<small>${w}</small>`).join('')}${cells}</div></div>`;
}

/** Daily result: time, hints, streak, month calendar, reward and Share. */
function showDailySheet(justSolved: boolean, coins = 0, bonus = 0) {
  const today = dayKey();
  const res = dailyData.solved[today];
  const streak = streakNow();
  const next = nextMilestone(streak);
  const el = html(`<div class="m-result wl-daily">
    <p class="m-eyebrow"></p><h2></h2>
    <div class="wl-stats">
      <div><b>${res ? clock(res.t) : '–'}</b><small>${t('dailyTime')}</small></div>
      <div><b>${res ? res.h : '–'}</b><small>${t('dailyHints')}</small></div>
      <div class="streak">${ICON.flame}<b>${streak}</b><small>${t('dailyStreak')}</small></div>
    </div>
    ${justSolved ? `<p class="m-reward">${ICON.coin}<b>+${coins}</b></p>` : ''}
    ${bonus ? `<p class="wl-bonus">${ICON.flame}<span></span><b>+${bonus}</b></p>` : ''}
    ${calendarHtml(today)}
    <p class="m-note" data-note></p>
    ${justSolved ? '<button class="m-btn" data-levels></button>' : ''}
    <div class="wl-pair"><button class="m-btn alt" data-share>${ICON.share}<span></span></button><button class="m-btn ghost" data-close></button></div></div>`);
  el.querySelector('.m-eyebrow')!.textContent = `${t('dailyHud')} · ${fmtDate(today, { day: 'numeric', month: 'long' })}`;
  el.querySelector('h2')!.textContent = res ? t('dailySolved') : t('daily');
  if (bonus) el.querySelector('.wl-bonus span')!.textContent = t('dailyBonus', { n: streak });
  el.querySelector('[data-note]')!.textContent = res ? `${t('dailyNext', { n: next.days - streak, d: next.days })}. ${t('dailyCome', { t: until() })}.` : t('dailyNext', { n: next.days - streak, d: next.days });
  el.querySelector('[data-share] span')!.textContent = t('share');
  el.querySelector('[data-share]')!.addEventListener('click', () => {
    if (res) void share(t('shareDaily', { t: clock(res.t), how: hintWords(res.h), s: dayWords(streak) }), 'daily');
  });
  const toLevels = el.querySelector<HTMLElement>('[data-levels]');
  if (toLevels) {
    toLevels.textContent = t('playLevels');
    toLevels.addEventListener('click', () => {
      panelClose = null;
      closePanel();
      play(profile.data.unlocked);
      maybeAskReminders();
    });
  }
  const close = el.querySelector<HTMLElement>('[data-close]')!;
  close.textContent = justSolved ? t('menu') : t('close');
  close.addEventListener('click', closePanel);
  if (justSolved) {
    haptic.success();
    [0, 2, 4, 7, 9].forEach((s, i) => tone({ freq: pentatonic(s, 440), duration: 0.18, volume: 0.35, delay: i * 0.07 }));
  }
  openPanel(el, {
    modal: justSolved,
    cls: 'wide',
    onClose: () => {
      if (justSolved) {
        inGame = false;
        hideHand();
        meta.showHome();
        maybeAskReminders();
      }
    },
  });
}

/** Home card for the daily puzzle (the kit's `endless` slot): calendar icon, streak, status. */
function paintDailyCard() {
  const card = kitRoot?.querySelector<HTMLElement>('[data-act="play-endless"]');
  if (!card) return;
  const today = dayKey();
  const solved = !!dailyData.solved[today];
  const streak = streakNow();
  card.classList.add('wl-daily-card');
  card.classList.toggle('solved', solved);
  const ico = card.querySelector('.m-card-ico')!;
  const dayNum = String(parseDay(today).d);
  if (ico.getAttribute('data-day') !== dayNum) {
    ico.setAttribute('data-day', dayNum);
    ico.innerHTML = `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><text x="12" y="18.6" text-anchor="middle" font-size="8" font-weight="900" fill="currentColor" stroke="none">${dayNum}</text></svg>`;
  }
  card.querySelector('.m-card-body small')!.textContent = solved ? t('dailySolvedSub', { n: streak }) : streak ? t('dailyToday', { n: streak }) : t('dailyStart');
  const badge = card.querySelector<HTMLElement>('.m-best')!;
  badge.innerHTML = streak ? `${solved ? ICON.check : ICON.flame}<b>${streak}</b>` : '';
  badge.setAttribute('aria-label', `${t('dailyStreak')} ${streak}`);
}
document.addEventListener('visibilitychange', () => !document.hidden && paintDailyCard());

// Timer for the daily puzzle: runs only while the board is visible and playable.
setInterval(() => {
  if (mode !== 'daily' || !inGame || busy || document.hidden || covering()) return;
  cur.elapsed = (cur.elapsed ?? 0) + 1;
  $('hud-sub').textContent = clock(cur.elapsed);
  if (cur.elapsed % 5 === 0) save();
}, 1000);

// ───────────────────────── reminders ─────────────────────────
/** The next seven evenings at 19:00, skipping today once today's puzzle is solved or the hour has passed. */
function reminderList(): Reminder[] {
  const now = new Date();
  const skipToday = !!dailyData.solved[dayKey()] || now.getHours() >= REMINDER_HOUR;
  return REMINDER_IDS.map((id, i) => {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i + (skipToday ? 1 : 0), REMINDER_HOUR, 0, 0);
    return { id, title: 'Wordlink', body: t('notifBody'), at };
  });
}
async function refreshReminders() {
  if (store.get('remind', false)) await scheduleReminders(reminderList());
}
/** After the first win: a soft ask first, so the one-time OS prompt is only used on a "yes". */
function maybeAskReminders() {
  if (store.get('remindAsked', false)) return;
  store.set('remindAsked', true);
  if (!Capacitor.isNativePlatform()) return; // no local notifications on the web build
  const el = html(`<div class="m-result wl-remind"><div class="wl-bell">${ICON.flame}</div><h2></h2><p class="m-note"></p><button class="m-btn" data-yes></button><button class="m-btn ghost" data-no></button></div>`);
  el.querySelector('h2')!.textContent = t('remindTitle');
  el.querySelector('.m-note')!.textContent = t('remindBody');
  el.querySelector('[data-yes]')!.textContent = t('remindYes');
  el.querySelector('[data-no]')!.textContent = t('remindNo');
  el.querySelector('[data-yes]')!.addEventListener('click', () => {
    store.set('remind', true);
    closePanel();
    void refreshReminders();
    track('reminder_opt_in');
  });
  el.querySelector('[data-no]')!.addEventListener('click', () => {
    closePanel();
    track('reminder_opt_out');
  });
  openPanel(el);
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
  if (mode === 'daily' || cur.level > 2 || !inGame) return;
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
  levelsCfg.count = LEVEL_COUNT[lang]; // the kit reads this when it draws the map / home card
  profile.save(); // writes the map under the new language and refreshes the home screen
  hero.repaint();
  if (inGame) {
    if (mode === 'daily') void startDaily();
    else play(store.get<Progress | null>(`progress.${lang}`, null)?.level ?? profile.data.unlocked);
  }
  track('language', { lang });
}

// ───────────────────────── meta (menu, missions, daily, shop) ─────────────────────────
const levelsCfg = { count: LEVEL_COUNT[settings.lang], play };
const meta = createMeta({
  title: 'Wordlink',
  tagline: t('tagline'),
  hero,
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  levels: levelsCfg,
  // The kit's second mode card hosts the daily puzzle (subtitle/badge painted by paintDailyCard).
  endless: { title: t('daily'), subtitle: t('dailyStart'), play: () => void startDaily() },
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
kitRoot = document.querySelector<HTMLElement>('.meta-root')!;
document.body.appendChild(layer);
paintDailyCard();
profile.onChange(paintDailyCard);
panel.addEventListener('click', (e) => {
  if (e.target === panel && !panelModal) closePanel();
});
// Level map: chapter headers between every 10 levels (decorates the kit's map when it opens).
new MutationObserver(() => {
  const grid = kitRoot.querySelector<HTMLElement>('.m-grid');
  if (grid && !grid.dataset.chapters) decorateMap(grid);
}).observe(kitSheet(), { childList: true });

function decorateMap(grid: HTMLElement) {
  grid.dataset.chapters = '1';
  const buttons = [...grid.querySelectorAll<HTMLElement>('.m-lvl')];
  for (let c = 0; c * CHAPTER_SIZE < buttons.length; c++) {
    const [a, b] = chapterRange(c);
    const stars = profile.data.stars.slice(a - 1, Math.min(b, buttons.length)).reduce((x, y) => x + y, 0);
    const head = html(`<div class="wl-ch-head ${a > profile.data.unlocked ? 'locked' : ''}" style="background:${skyGradient(c, '100deg')}"><b></b><span></span><small>★ ${stars}/${CHAPTER_SIZE * 3}</small></div>`);
    head.querySelector('b')!.textContent = t('chapter', { n: c + 1 });
    head.querySelector('span')!.textContent = chapterName(c, settings.lang);
    grid.insertBefore(head, buttons[a - 1]);
  }
  grid.querySelector('.current')?.scrollIntoView({ block: 'center' });
}

$('settings-btn').addEventListener('click', () => {
  unlockAudio();
  if (busy || covering()) return;
  hideHand();
  meta.showPause({
    onResume: () => scheduleHand(),
    onRestart: () => {
      track('level_restart', { level: cur.level, lang: settings.lang, daily: mode === 'daily' });
      if (mode === 'daily') loadLevel({ ...fresh(0), day: cur.day, elapsed: cur.elapsed }, level); // the clock keeps running
      else loadLevel(fresh(cur.level), level);
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
    if (!panel.hidden) {
      if (!panelModal) closePanel();
      return true;
    }
    if (meta.back()) return true;
    if (!$('bonus-sheet').hidden) {
      $('bonus-sheet').hidden = true;
      return true;
    }
    if (inGame && !covering()) {
      $('settings-btn').click();
      return true;
    }
    return false;
  },
});
meta.showHome();
void refreshReminders(); // keeps the rolling week of evening reminders fresh (only after opt-in)
setTimeout(() => void DAILY_PACKS[settings.lang](), 1500); // warm the daily pack so the card opens instantly

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
  daily: () => {
    meta.hideHome();
    return startDaily();
  },
  get mode() {
    return mode;
  },
  setLang,
};
