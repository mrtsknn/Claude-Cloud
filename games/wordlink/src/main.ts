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

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/wordlink/PRIVACY.md';
declare const __APP_VERSION__: string;

type Lang = 'en' | 'tr';
const PACKS: Record<Lang, () => Promise<{ default: unknown }>> = {
  en: () => import('./levels/en.json'),
  tr: () => import('./levels/tr.json'),
};

const HINT_COST = 25;
const LEVEL_REWARD = 10;
const BONUS_BATCH = 10;
const BONUS_REWARD = 25;
const AD_COINS = 40;

// ───────────────────────── persistence ─────────────────────────
interface Progress {
  level: number; // 1-based
  found: string[];
  revealed: string[];
  bonusFound: string[];
  order: string; // current wheel order
}

const store = createStore('wordlink');
const settings = store.get('settings', {
  sound: true,
  haptics: true,
  lang: (navigator.language.slice(0, 2) === 'tr' ? 'tr' : 'en') as Lang,
});
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

let coins = store.get('coins', 100);
let bonusMeter = store.get('bonusMeter', 0);
let levels: Level[] = [];
let level!: Level;
let P!: Progress;
let found = new Set<string>();
let revealed = new Set<string>();
let bonusFound = new Set<string>();
let startedAt = Date.now();
let busy = false;

const fresh = (n: number): Progress => ({ level: n, found: [], revealed: [], bonusFound: [], order: '' });
const save = () => {
  P.found = [...found];
  P.revealed = [...revealed];
  P.bonusFound = [...bonusFound];
  store.set(`progress.${settings.lang}`, P);
};
const upper = (s: string) => s.toLocaleUpperCase(settings.lang);

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
$('version').textContent = `v${__APP_VERSION__}`;
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

function setCoins(n: number) {
  coins = n;
  store.set('coins', coins);
  $('coins').textContent = String(coins);
  bump($('coins-pill'));
}

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
  if (busy) return;
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
    track('word_found', { level: P.level, len: word.length });
    afterProgress();
  } else if (v === 'bonus') {
    bonusFound.add(word);
    settlePreview('bonus', word);
    toast(t('bonusWord'));
    haptic.success();
    tone({ freq: 1046, to: 1568, duration: 0.18, volume: 0.35 });
    addBonus();
    save();
    track('bonus_word', { level: P.level });
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
    setCoins(coins + BONUS_REWARD);
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
  P = p;
  if (P.level > levels.length) P.level = levels.length;
  level = levels[P.level - 1];
  found = new Set(P.found);
  revealed = new Set(P.revealed);
  bonusFound = new Set(P.bonusFound);
  order = P.order && P.order.length === level.letters.length ? [...P.order] : [...level.letters];
  P.order = order.join('');
  busy = false;
  startedAt = Date.now();
  $('level').textContent = String(P.level);
  layoutWheel();
  renderBoard();
  renderPath();
  save();
  scheduleHand();
}

function win() {
  // Whole grid flashes once as the celebration.
  renderBoard(new Set(), new Set(level.words.flatMap((p) => cellsOf(p))));
  const words = level.words.map((p) => p.w).sort((a, b) => b.length - a.length);
  [0, 2, 4, 5, 7, 9].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.22, volume: 0.45, delay: i * 0.08 }));
  haptic.success();
  track('level_complete', {
    level: P.level,
    lang: settings.lang,
    bonus: bonusFound.size,
    hints: revealed.size,
    duration_s: Math.round((Date.now() - startedAt) / 1000),
  });
  setCoins(coins + LEVEL_REWARD);
  $('win-title').textContent = t('levelN', { n: P.level });
  $('win-word').textContent = upper(words[0]);
  $('win-coins').textContent = String(LEVEL_REWARD);
  const done = P.level;
  if (done >= levels.length) toast(t('allDone'), 4000);
  // Persist the next level now so quitting on this screen never loses progress.
  store.set(`progress.${settings.lang}`, fresh(Math.min(done + 1, levels.length)));
  store.set('completed', Math.max(store.get('completed', 0), done));
  $('win').hidden = false;
  maybeRequestReview(done, done >= 6);
}

$('next-btn').addEventListener('click', async () => {
  $('win').hidden = true;
  haptic.medium();
  const next = store.get<Progress>(`progress.${settings.lang}`, fresh(1));
  loadLevel(next);
  track('level_start', { level: next.level, lang: settings.lang });
  if (next.level > 6) await interstitialMoment('next_level');
});

// ───────────────────────── tools ─────────────────────────
$('shuffle-btn').addEventListener('click', () => {
  unlockAudio();
  if (busy) return;
  order = shuffleLetters(order, Math.random);
  P.order = order.join('');
  save();
  layoutWheel();
  haptic.light();
  tone({ freq: 500, to: 700, duration: 0.12, type: 'triangle', volume: 0.25 });
});

$('hint-btn').addEventListener('click', async () => {
  unlockAudio();
  if (busy) return;
  const k = hintCell(level, found, revealed);
  if (!k) return;
  if (coins < HINT_COST) {
    toast(t('freeCoins', { n: AD_COINS }), 2200);
    if (!(await showRewarded('coins'))) return;
    setCoins(coins + AD_COINS);
  }
  setCoins(coins - HINT_COST);
  revealed.add(k);
  renderBoard(new Set([k]));
  haptic.light();
  tone({ freq: 880, duration: 0.12, volume: 0.3 });
  track('hint', { level: P.level });
  afterProgress();
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

// ───────────────────────── tutorial hand ─────────────────────────
let handTimer = 0;
function hideHand() {
  clearTimeout(handTimer);
  hand.hidden = true;
}
/** Level 1–2: if the player hesitates, a finger traces the shortest unfound word. */
function scheduleHand() {
  hideHand();
  if (P.level > 2) return;
  handTimer = window.setTimeout(async () => {
    const target = level.words.filter((p) => !found.has(p.w)).sort((a, b) => a.w.length - b.w.length)[0];
    if (!target || busy) return;
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
  }, P.level === 1 && found.size === 0 ? 900 : 5000);
}

// ───────────────────────── settings ─────────────────────────
for (const [id, k] of [['opt-sound', 'sound'], ['opt-haptics', 'haptics']] as const) {
  const el = $<HTMLInputElement>(id);
  el.checked = settings[k];
  el.addEventListener('change', () => {
    settings[k] = el.checked;
    setSoundEnabled(settings.sound);
    setHapticsEnabled(settings.haptics);
    store.set('settings', settings);
    if (k === 'haptics') haptic.medium();
  });
}
function renderLang() {
  $('lang-tr').setAttribute('aria-checked', String(settings.lang === 'tr'));
  $('lang-en').setAttribute('aria-checked', String(settings.lang === 'en'));
}
async function setLang(lang: Lang) {
  if (lang === settings.lang && levels.length) return;
  if (levels.length) save();
  settings.lang = lang;
  store.set('settings', settings);
  renderLang();
  levels = (await PACKS[lang]()).default as Level[];
  loadLevel(store.get<Progress>(`progress.${lang}`, fresh(1)));
  track('language', { lang });
}
$('lang-tr').addEventListener('click', () => void setLang('tr'));
$('lang-en').addEventListener('click', () => void setLang('en'));
$('settings-btn').addEventListener('click', () => {
  unlockAudio();
  $('settings').hidden = false;
});
$('close-settings').addEventListener('click', () => ($('settings').hidden = true));
for (const id of ['settings', 'bonus-sheet']) {
  $(id).addEventListener('click', (e) => {
    if (e.target === e.currentTarget) $(id).hidden = true;
  });
}
$('privacy-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.open(PRIVACY_URL, '_blank');
});

window.addEventListener('resize', () => {
  if (!level) return;
  layoutWheel();
  renderBoard();
});

// ───────────────────────── boot ─────────────────────────
trackSession('wordlink');
$('coins').textContent = String(coins);
renderMeter();
const bootLang = settings.lang;
levels = (await PACKS[bootLang]()).default as Level[];
renderLang();
loadLevel(store.get<Progress>(`progress.${bootLang}`, fresh(1)));
track('level_start', { level: P.level, lang: bootLang, resumed: P.found.length > 0 });

void setupNative({
  onPause: save,
  onBack: () => {
    for (const id of ['settings', 'bonus-sheet']) {
      if (!$(id).hidden) {
        $(id).hidden = true;
        return true;
      }
    }
    return false;
  },
});

// Exposed for e2e/screenshot scripts.
(window as unknown as { __wordlink: unknown }).__wordlink = {
  get level() {
    return level;
  },
  get progress() {
    return P;
  },
  submit,
  goto: (n: number) => loadLevel(fresh(n)),
  setLang,
};
