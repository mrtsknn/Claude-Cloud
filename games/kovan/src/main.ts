import './style.css';
import {
  createProfile,
  createMeta,
  createStore,
  initAds,
  initStore,
  setupNative,
  setSoundEnabled,
  setHapticsEnabled,
  haptic,
  tone,
  pentatonic,
  unlockAudio,
  track,
  showRewarded,
  scheduleReminders,
  cancelReminders,
  shareResult,
  type MetaSkin,
} from '@studio/kit';
import * as G from './game';
import { fmt, fmtTime } from './format';
import { t, lang, type Key } from './i18n';
import { drawBee, drawGift, drawWorld, drawFlower, hexPath, FLOWER_COLORS } from './draw';
import { ICON, WORLD_ICON } from './icons';

declare const __APP_VERSION__: string;
document.documentElement.lang = lang;
document.title = t('title');
const STORE_URL = 'https://indiestudio.app/kovan';

// ───────── themes (shop skins) ─────────
interface Theme {
  id: string;
  price: number;
  bg: string; // page background
  deep: string; // solid fallback / gradient bottom
  cell: string; // filled honeycomb cell
  empty: string; // empty cell
  edge: string; // cell outline (wax)
  ink: string;
  accent: string;
}
const THEMES: Theme[] = [
  { id: 'amber', price: 0, bg: '#4a2c0c', deep: '#2b1a08', cell: '#f6b93b', empty: '#6b4416', edge: '#ffd77a', ink: '#3a2205', accent: '#ffc83d' },
  { id: 'mint', price: 150, bg: '#0f3b33', deep: '#082420', cell: '#7fe0b5', empty: '#1b5a4d', edge: '#c8ffe6', ink: '#0b2a24', accent: '#7fe0b5' },
  { id: 'lavender', price: 200, bg: '#33285c', deep: '#1c1636', cell: '#b9a4ff', empty: '#4a3c80', edge: '#e2d8ff', ink: '#221a44', accent: '#c9b8ff' },
  { id: 'night', price: 300, bg: '#141a33', deep: '#0a0d1c', cell: '#ffd35c', empty: '#26305a', edge: '#5d6ca8', ink: '#141a33', accent: '#ffd35c' },
  { id: 'berry', price: 300, bg: '#4a1430', deep: '#2a0a1a', cell: '#ff8fb1', empty: '#6e2347', edge: '#ffd0de', ink: '#3a0e24', accent: '#ff9ebd' },
  { id: 'forest', price: 400, bg: '#1e3312', deep: '#101d09', cell: '#c2e25a', empty: '#34521f', edge: '#e8ffaa', ink: '#1a2a0e', accent: '#c2e25a' },
  { id: 'ocean', price: 500, bg: '#0c2f4a', deep: '#061a2a', cell: '#5fd0ff', empty: '#174a6e', edge: '#c4efff', ink: '#082236', accent: '#6fd6ff' },
];
const SKINS: MetaSkin[] = THEMES.map((th) => ({
  id: th.id,
  name: t(`skin_${th.id}` as Key),
  price: th.price,
  swatch: `radial-gradient(circle at 50% 40%, ${th.cell} 0 34%, ${th.edge} 35% 40%, ${th.bg} 41%)`,
}));
let theme = THEMES[0];
function applySkin(id: string) {
  theme = THEMES.find((x) => x.id === id) ?? THEMES[0];
  const r = document.documentElement.style;
  r.setProperty('--bg', theme.bg);
  r.setProperty('--deep', theme.deep);
  r.setProperty('--cell', theme.cell);
  r.setProperty('--edge', theme.edge);
  r.setProperty('--ink', theme.ink);
  r.setProperty('--accent', theme.accent);
  r.setProperty('--m-bg', `radial-gradient(120% 80% at 50% 0%, ${theme.bg}, ${theme.deep})`);
  r.setProperty('--m-accent', theme.accent);
  r.setProperty('--m-accent-ink', theme.ink);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.deep);
}

// ───────── profile / meta ─────────
const store = createStore('kovan');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

const profile = createProfile({
  game: 'kovan',
  levelCount: 1,
  defaultSkin: 'amber',
  skinIds: THEMES.map((x) => x.id),
  missions: [
    { id: 'merges', targets: [10, 25, 50], reward: (n) => 20 + n },
    { id: 'spawns', targets: [15, 40, 80], reward: (n) => 15 + Math.round(n / 2) },
    { id: 'newBee', targets: [1, 2, 3], reward: (n) => 30 + n * 15 },
  ],
});
applySkin(profile.data.skin);

const meta = createMeta({
  title: t('title'),
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: 'https://indiestudio.app/kovan/privacy',
  profile,
  skins: SKINS,
  onSkin: applySkin,
  endless: { title: t('myHive'), play: enterHive },
  missionText: (id, n) => t(`mission_${id}` as Key, { n }),
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});

// ───────── state ─────────
const SAVE_KEY = 'kovan.hive';
function loadState(): G.State {
  try {
    return G.sanitize(JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'), Date.now());
  } catch {
    return G.newState(Date.now());
  }
}
let state = loadState();
const cells = () => G.hive(state).cells;
function save() {
  state.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* storage blocked */
  }
}
const worldName = (w: number) => t(`world_${G.WORLDS[w].id}` as Key);

// ───────── DOM ─────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;
const honeyEl = $('honey');
const rateEl = $('rate');
const coinsEl = $('coins');
const eggBtn = $<HTMLButtonElement>('egg-btn');
const eggCost = $('egg-cost');
const goldBtn = $<HTMLButtonElement>('gold-btn');
const sheet = $('sheet');
const sheetBody = $('sheet-body');
const toastEl = $('toast');
const worldsEl = $('worlds');
const questEl = $<HTMLButtonElement>('quest');
const festBtn = $<HTMLButtonElement>('fest-btn');
const upFill = $('up-fill');
$('gold-price').textContent = String(G.GOLDEN_PRICE);
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((e) => (e.textContent = t(e.dataset.i18n as Key)));

/** Sets text only when it changed (the HUD refreshes every frame). */
const setText = (el: HTMLElement, s: string) => {
  if (el.textContent !== s) el.textContent = s;
};
const setHtml = (el: HTMLElement, s: string) => {
  if (el.dataset.html !== s) {
    el.dataset.html = s;
    el.innerHTML = s;
  }
};

let toastTimer = 0;
function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), 1800);
}

let onSheetClose: (() => void) | null = null;
function openSheet(html: string, onClose?: () => void) {
  sheetBody.innerHTML = html;
  sheet.hidden = false;
  onSheetClose = onClose ?? null;
  sheetBody.querySelector('[data-close]')?.addEventListener('click', closeSheet);
}
function closeSheet() {
  if (sheet.hidden) return false;
  sheet.hidden = true;
  const cb = onSheetClose;
  onSheetClose = null;
  cb?.();
  return true;
}
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) closeSheet();
});

/** Animates a canvas inside the open sheet until the sheet closes. */
function animateIn(cv: HTMLCanvasElement, paint: (c: CanvasRenderingContext2D, time: number) => void) {
  const c2 = cv.getContext('2d')!;
  const loop = () => {
    if (sheet.hidden || !cv.isConnected) return;
    c2.clearRect(0, 0, cv.width, cv.height);
    paint(c2, performance.now() / 1000);
    requestAnimationFrame(loop);
  };
  loop();
}

// ───────── layout & render ─────────
const SQ3 = Math.sqrt(3);
let W = 0;
let H = 0;
let R = 20;
let centers: { x: number; y: number }[] = [];
const backdrop = document.createElement('canvas');
function layout() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  backdrop.width = canvas.width;
  backdrop.height = canvas.height;
  const bc = backdrop.getContext('2d')!;
  bc.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (W > 0 && H > 0) drawWorld(bc, G.WORLDS[state.world].id, W, H);
  const [cols, rows] = G.gridOf(G.hive(state));
  // a hair of padding around the comb; hexes nearly touch so small phones keep big cells
  R = Math.min((W - 6) / ((cols + 0.5) * SQ3), (H - 8) / ((rows - 1) * 1.5 + 2));
  const ox = (W - (cols + 0.5) * SQ3 * R) / 2 + (SQ3 * R) / 2;
  const oy = (H - ((rows - 1) * 1.5 + 2) * R) / 2 + R;
  centers = cells().map((_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return { x: ox + c * SQ3 * R + (r % 2 ? (SQ3 * R) / 2 : 0), y: oy + r * 1.5 * R };
  });
}
window.addEventListener('resize', layout);

const pops = new Map<number, number>(); // cell → time of spawn/merge (pop-in)
interface Fx {
  x: number;
  y: number;
  t0: number;
  text?: string;
  ring?: boolean;
}
let fx: Fx[] = [];
let drag: { from: number; x: number; y: number } | null = null;
let now = performance.now() / 1000;

function cellAt(x: number, y: number) {
  let best = -1;
  let bd = R * R * 0.9;
  centers.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(backdrop, 0, 0, W, H);
  const cs = cells();
  const target = drag ? cellAt(drag.x, drag.y) : -1;
  const dragLvl = drag ? cs[drag.from] : 0;
  const festLvl = state.festival.level;
  const festCol = state.festival.key ? FLOWER_COLORS[G.flowerOf(state.festival.key)].petal : '#fff';
  cs.forEach((v, i) => {
    const p = centers[i];
    if (!p) return;
    hexPath(ctx, p.x, p.y, R * 0.95);
    ctx.fillStyle = v === 0 ? theme.empty : theme.cell;
    ctx.globalAlpha = v === 0 ? 0.92 : 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(2, R * 0.07);
    const hot = drag && i === target && i !== drag.from && cs[i] === dragLvl;
    const fest = v > 0 && v === festLvl;
    ctx.strokeStyle = hot ? '#ffffff' : fest ? festCol : theme.edge;
    if (hot || fest) ctx.lineWidth *= hot ? 2 : 1.4;
    ctx.stroke();
    if (fest) {
      ctx.globalAlpha = 0.18 + 0.12 * Math.sin(now * 3 + i);
      ctx.fillStyle = festCol;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  });
  cs.forEach((v, i) => {
    const p = centers[i];
    if (!p || v === 0 || (drag && drag.from === i)) return;
    const age = now - (pops.get(i) ?? -9);
    const sc = age < 0.3 ? 0.4 + 0.6 * Math.sin((age / 0.3) * (Math.PI / 2)) * 1.08 : 1;
    ctx.save();
    ctx.translate(p.x, p.y + Math.sin(now * 2.2 + i) * R * 0.04);
    ctx.scale(sc, sc);
    if (v > 0) drawBee(ctx, 0, 0, R, v, now + i * 0.1);
    else drawGift(ctx, 0, 0, R, now);
    ctx.restore();
  });
  if (drag) drawBee(ctx, drag.x, drag.y - R * 0.3, R * 1.15, dragLvl, now);
  fx = fx.filter((f) => now - f.t0 < 1);
  for (const f of fx) {
    const a = now - f.t0;
    ctx.globalAlpha = 1 - a;
    if (f.ring) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4 * (1 - a);
      ctx.beginPath();
      ctx.arc(f.x, f.y, R * (0.5 + a * 1.2), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (f.text) {
      const size = Math.max(13, R * 0.36);
      ctx.font = `800 ${size}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(40,20,0,.55)';
      const y = f.y - R * 0.5 - a * R * 0.7;
      ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }
}

// ───────── HUD: honey, eggs, worlds, quest card, festival chip ─────────
function hud() {
  setText(honeyEl, fmt(state.honey));
  setText(rateEl, t('perSec', { n: fmt(G.rate(state)) }));
  setText(coinsEl, String(profile.data.coins));
  const cost = G.spawnCost(state);
  setText(eggCost, fmt(cost));
  eggBtn.classList.toggle('poor', state.honey < cost || G.freeCells(G.hive(state)).length === 0);
  goldBtn.classList.toggle('poor', profile.data.coins < G.GOLDEN_PRICE);
  const next = Math.min(G.expandCost(state), G.spawnUpCost(state));
  $('up-badge').hidden = next > state.honey;
  // progress toward the cheapest upgrade, so players learn to save up
  upFill.style.width = next < Infinity ? `${Math.min(100, (state.honey / next) * 100).toFixed(1)}%` : '0';
  worldsUI();
  questUI();
  festUI();
}
profile.onChange(hud);

let worldsSig = '';
function worldsUI() {
  const nw = G.nextWorld(state);
  const ready = G.canUnlockWorld(state);
  const sig = `${state.hives.length}|${state.world}|${nw >= 0 && state.best >= G.WORLDS[nw].unlock}|${ready}`;
  if (sig === worldsSig) return;
  worldsSig = sig;
  worldsEl.innerHTML = G.WORLDS.map((w, i) => {
    const owned = i < state.hives.length;
    const cls = ['wbtn', owned ? '' : 'locked', i === state.world ? 'on' : '', i === nw && state.best >= w.unlock ? 'open' : ''].join(' ');
    const label = owned ? `×${w.mult}` : `${ICON.lock}${w.unlock}`;
    return `<button class="${cls}" data-w="${i}" aria-label="${worldName(i)}">${WORLD_ICON[w.id]}<small>${label}</small>${i === nw && ready ? '<i class="dot"></i>' : ''}</button>`;
  }).join('');
}
worldsEl.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-w]');
  if (!b) return;
  unlockAudio();
  const w = Number(b.dataset.w);
  if (w < state.hives.length) {
    if (G.switchWorld(state, w)) {
      drag = null;
      layout();
      haptic.light();
      tone({ freq: pentatonic(w * 2 + 4), duration: 0.12, volume: 0.3 });
      toast(t('worldHere', { w: worldName(w), n: G.WORLDS[w].mult }));
      save();
      hud();
    }
  } else if (w === G.nextWorld(state)) openWorldSheet(w);
  else toast(t('worldLocked', { n: G.WORLDS[w].unlock }));
});

function openWorldSheet(w: number) {
  const def = G.WORLDS[w];
  const beeOk = state.best >= def.unlock;
  const can = G.canUnlockWorld(state);
  openSheet(`<div class="celebrate"><canvas class="scene" width="560" height="240"></canvas>
    <h2>${worldName(w)}</h2><p class="pill">${t('worldMult', { n: def.mult })}</p>
    <p class="muted">${t('worldSub', { n: def.mult })}</p>
    <p class="req ${beeOk ? 'ok' : ''}">${beeOk ? ICON.check : ICON.lock} ${t('worldNeedBee', { n: def.unlock })}</p>
    <button class="btn" data-build ${can ? '' : 'disabled'}>${t('worldBuild')} <span class="cost">${ICON.honey}${fmt(def.cost)}</span></button>
    <button class="btn ghost" data-close>${t('close')}</button></div>`);
  const cv = sheetBody.querySelector<HTMLCanvasElement>('canvas.scene')!;
  animateIn(cv, (c, time) => {
    c.save();
    c.scale(2, 2);
    drawWorld(c, def.id, 280, 120);
    [0, 1, 2].forEach((k) => drawBee(c, 80 + k * 60, 62 + Math.sin(time * 2 + k) * 4, 26, Math.max(1, state.spawnLevel + k), time + k, { badge: false }));
    c.restore();
  });
  sheetBody.querySelector('[data-build]')!.addEventListener('click', () => {
    if (!G.unlockWorld(state)) return toast(t('noHoney'));
    track('world_unlock', { world: def.id });
    [0, 4, 7, 12].forEach((s, k) => tone({ freq: pentatonic(s + w), duration: 0.18, volume: 0.35, delay: k * 0.08 }));
    haptic.success();
    closeSheet();
    layout();
    G.hive(state).cells.forEach((v, i) => v && popAt(i));
    toast(t('worldHere', { w: worldName(w), n: def.mult }));
    save();
    hud();
  });
}

let questSig = '';
function questUI() {
  const q = G.questAt(state.quest);
  const val = G.questValue(state, q.kind);
  const done = val >= q.n;
  const sig = `${state.quest}|${done}|${q.kind === 'earned' ? fmt(val) : val}|${q.reward.honeySec ? fmt(G.rate(state) * q.reward.honeySec) : ''}`;
  if (sig === questSig) return;
  questSig = sig;
  questEl.classList.toggle('done', done);
  setText($('q-num'), t('quest', { n: state.quest + 1 }));
  const text =
    q.kind === 'worlds' ? t('q_worlds', { w: worldName(q.n - 1) }) : t(`q_${q.kind}` as Key, { n: q.kind === 'earned' ? fmt(q.n) : q.n });
  setText($('q-text'), text);
  const frac = q.kind === 'earned' ? Math.log10(1 + val) / Math.log10(1 + q.n) : val / q.n;
  $('q-fill').style.width = `${Math.round(Math.min(1, frac) * 100)}%`;
  const r = q.reward;
  const amount = r.coins
    ? `${ICON.coin}<b>${r.coins}</b>`
    : r.gifts
      ? `${ICON.gift}<b>×${r.gifts}</b>`
      : `${ICON.honey}<b>${fmt(Math.max(50, G.rate(state) * (r.honeySec ?? 0)))}</b>`;
  setHtml($('q-reward'), done ? `${amount}<em>${t('questClaim')}</em>` : amount);
  setHtml($('q-ic'), done ? ICON.check : ICON.flag);
}
questEl.addEventListener('click', () => {
  unlockAudio();
  const before = state.quest;
  const p = G.claimQuest(state);
  if (!p) {
    questEl.classList.remove('nudge');
    void questEl.offsetWidth;
    questEl.classList.add('nudge');
    return;
  }
  if (p.coins) profile.addCoins(p.coins);
  for (const i of p.giftCells) {
    popAt(i);
    fx.push({ ...centers[i], t0: now, ring: true });
  }
  const parts = [p.coins ? t('rewardCoins', { n: p.coins }) : '', p.giftCells.length ? t('rewardGifts', { n: p.giftCells.length }) : '', p.honey ? t('rewardHoney', { n: fmt(p.honey) }) : ''];
  toast(parts.filter(Boolean).join(' · '));
  [0, 2, 4].forEach((s, k) => tone({ freq: pentatonic(s + 5), duration: 0.12, volume: 0.35, delay: k * 0.06 }));
  haptic.success();
  track('quest_claim', { quest: before + 1 });
  questEl.classList.remove('pop');
  void questEl.offsetWidth;
  questEl.classList.add('pop');
  save();
  hud();
});

// festival
let festSig = '';
const festIcon = $<HTMLCanvasElement>('fest-icon');
function fmtLeft(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d ? t('leftD', { d, h }) : t('leftH', { h, m: Math.floor((sec % 3600) / 60) });
}
function festUI() {
  const f = state.festival;
  if (!f.key) return;
  const flower = G.flowerOf(f.key);
  const left = fmtLeft(G.festivalLeft(Date.now()));
  const sig = `${f.key}|${f.level}|${left}|${G.festivalReady(state)}|${f.claimed}`;
  if (sig === festSig) return;
  if (!festSig.startsWith(`${f.key}|`)) {
    const c = festIcon.getContext('2d')!;
    c.clearRect(0, 0, 64, 64);
    drawFlower(c, 32, 32, 26, flower);
  }
  festSig = sig;
  setText($('fest-lv'), t('festChip', { lv: t('lv', { n: f.level }) }));
  setText($('fest-left'), left);
  $('fest-badge').hidden = !G.festivalReady(state);
  festBtn.classList.toggle('claimed', f.claimed);
}
festBtn.addEventListener('click', openFestival);

function openFestival() {
  unlockAudio();
  const f = state.festival;
  const flower = G.flowerOf(f.key);
  const bee = t(`flower_${flower}` as Key);
  const owned = state.flowers.includes(flower);
  const ready = G.festivalReady(state);
  const pct = Math.min(100, Math.round((f.merges / G.FESTIVAL_GOAL) * 100));
  openSheet(`<div class="celebrate fest-sheet"><p class="eyebrow">${t('festEnds', { t: fmtLeft(G.festivalLeft(Date.now())) })}</p>
    <canvas class="hero" width="240" height="240"></canvas>
    <h2>${t(`fest_${flower}` as Key)}</h2>
    <p class="muted">${t('festBoost', { n: f.level })}</p>
    <p class="note">${owned ? t('festOwned', { bee, n: G.FESTIVAL_REPEAT_COINS }) : t('festGoal', { n: G.FESTIVAL_GOAL, bee })}</p>
    <div class="meter"><i style="width:${pct}%"></i><span>${t('festProgress', { a: Math.min(f.merges, G.FESTIVAL_GOAL), b: G.FESTIVAL_GOAL })}</span></div>
    ${f.claimed ? `<p class="req ok">${ICON.check} ${t('festDone')}</p>` : `<button class="btn" data-claim ${ready ? '' : 'disabled'}>${t('questClaim')}</button>`}
    <p class="label">${t('festCollection')}</p><div class="collection">${G.FLOWERS.map((fl) => `<canvas width="96" height="96" data-fl="${fl}" class="${state.flowers.includes(fl) ? 'got' : ''}" title="${t(`flower_${fl}` as Key)}"></canvas>`).join('')}</div>
    <button class="btn ghost" data-close>${t('close')}</button></div>`);
  animateIn(sheetBody.querySelector<HTMLCanvasElement>('canvas.hero')!, (c, time) => drawBee(c, 120, 146, 150, f.level, time, { badge: false, flower }));
  sheetBody.querySelectorAll<HTMLCanvasElement>('.collection canvas').forEach((cv) => {
    const c = cv.getContext('2d')!;
    drawBee(c, 48, 52, 64, 5, 0.3, { badge: false, flower: cv.dataset.fl as G.Flower });
  });
  sheetBody.querySelector('[data-claim]')?.addEventListener('click', () => {
    const r = G.claimFestival(state);
    if (!r) return;
    profile.addCoins(r.coins);
    track('festival_claim', { flower: r.flower, new: r.isNew });
    [0, 2, 4, 7, 9, 12].forEach((s, k) => tone({ freq: pentatonic(s + 3), duration: 0.16, volume: 0.35, delay: k * 0.07 }));
    haptic.success();
    save();
    openFestival();
    toast(r.isNew ? t('festGot', { bee: t(`flower_${r.flower}` as Key) }) : t('rewardCoins', { n: r.coins }));
  });
}

function syncFestival() {
  const had = state.festival.key;
  if (G.syncFestival(state, Date.now())) {
    save();
    if (had && inHive) toast(t('festStart', { f: t(`fest_${G.flowerOf(state.festival.key)}` as Key) }));
  }
}

// ───────── actions ─────────
let inHive = false;

function popAt(i: number) {
  pops.set(i, now);
}

function onSpawned(i: number, level: number) {
  popAt(i);
  fx.push({ ...centers[i], t0: now, ring: true });
  tone({ freq: pentatonic(level), duration: 0.09, volume: 0.35, type: 'triangle' });
  haptic.light();
}

eggBtn.addEventListener('click', () => {
  unlockAudio();
  if (!G.freeCells(G.hive(state)).length) return toast(t('full'));
  if (state.honey < G.spawnCost(state)) return toast(t('noHoney'));
  const i = G.spawn(state);
  if (i < 0) return;
  onSpawned(i, cells()[i]);
  profile.progress('spawns');
  hud();
});

goldBtn.addEventListener('click', () => {
  unlockAudio();
  if (!G.freeCells(G.hive(state)).length) return toast(t('full'));
  if (!profile.spend(G.GOLDEN_PRICE)) return meta.openShop('coins');
  const i = G.goldenEgg(state);
  onSpawned(i, cells()[i]);
  track('golden_egg', { level: cells()[i] });
  save();
});

$('coins-btn').addEventListener('click', () => meta.openShop('coins'));
$('menu-btn').addEventListener('click', openPause);
$('up-btn').addEventListener('click', openUpgrades);

function openPause() {
  save();
  meta.showPause({ onResume: () => {}, onMenu: leaveHive });
}

function openUpgrades() {
  const h = G.hive(state);
  const [c0, r0] = G.gridOf(h);
  const next = G.GRIDS[h.expansion + 1];
  const ec = G.expandCost(state);
  const sc = G.spawnUpCost(state);
  const eggsMax = state.spawnLevel >= G.MAX_LEVEL - 4;
  const price = (n: number) => `<span class="cost">${ICON.honey}${fmt(n)}</span>`;
  openSheet(`<h2>${t('upgrades')}</h2>
    <div class="up-row"><span><b>${t('expand')} · ${worldName(state.world)}</b><small>${next ? t('expandSub', { a: c0 * r0, b: next[0] * next[1] }) : t('expandMax')}</small></span>
      <button class="btn small" data-up="expand" ${next && ec <= state.honey ? '' : 'disabled'}>${next ? price(ec) : ICON.check}</button></div>
    <div class="up-row"><span><b>${t('eggs')}</b><small>${eggsMax ? t('eggsMax') : sc < Infinity ? t('eggsSub', { n: state.spawnLevel + 1 }) : t('eggsLocked', { n: state.spawnLevel + 3 })}</small></span>
      <button class="btn small" data-up="eggs" ${sc <= state.honey ? '' : 'disabled'}>${eggsMax ? ICON.check : sc < Infinity ? price(sc) : ICON.lock}</button></div>
    <button class="btn ghost" data-close>${t('close')}</button>`);
  sheetBody.querySelector('[data-up="expand"]')?.addEventListener('click', () => {
    if (G.expand(state)) {
      layout();
      tone({ freq: 392, to: 784, duration: 0.3, volume: 0.4 });
      haptic.success();
      track('expand', { world: state.world, expansion: G.hive(state).expansion });
      save();
    }
    openUpgrades();
  });
  sheetBody.querySelector('[data-up="eggs"]')?.addEventListener('click', () => {
    if (G.upgradeSpawn(state)) {
      haptic.success();
      track('spawn_upgrade', { level: state.spawnLevel });
      save();
    }
    openUpgrades();
  });
}

// ───────── retention: reminders after the first new bee, sharing ─────────
type NotifPref = 'unasked' | 'on' | 'off';
let notif = store.get<NotifPref>('notif', 'unasked');
const FULL_ID = 4101;
const DAILY_ID = 4102;
function reminders() {
  return [
    { id: FULL_ID, title: t('remindFullTitle'), body: t('remindFullBody'), at: new Date(G.offlineFullAt(state)) },
    { id: DAILY_ID, title: t('remindDailyTitle'), body: t('remindDailyBody'), dailyHour: 19 },
  ];
}
function askReminders() {
  openSheet(`<div class="celebrate"><div class="bell">${ICON.bell}</div><h2>${t('notifAsk')}</h2><p class="muted">${t('notifAskSub')}</p>
    <button class="btn" data-yes>${t('notifYes')}</button><button class="btn ghost" data-no>${t('notifNo')}</button></div>`);
  const answer = (on: boolean) => {
    notif = on ? 'on' : 'off';
    store.set('notif', notif);
    track('reminder_opt', { on });
    if (on) void scheduleReminders(reminders());
  };
  sheetBody.querySelector('[data-yes]')!.addEventListener('click', () => {
    onSheetClose = null;
    closeSheet();
    answer(true);
  });
  sheetBody.querySelector('[data-no]')!.addEventListener('click', () => {
    onSheetClose = null;
    closeSheet();
    answer(false);
  });
  onSheetClose = () => answer(false);
}
/** Leaving the app: remind when the offline storage is full + a daily nudge. */
function onLeave() {
  save();
  if (notif === 'on') void scheduleReminders(reminders());
}

function celebrate(level: number) {
  const name = G.BEE_NAMES[lang][level - 1];
  profile.progress('newBee');
  profile.recordBest(level);
  profile.addCoins(level * 2);
  track('new_best', { level });
  [0, 2, 4, 7, 9].forEach((s, k) => tone({ freq: pentatonic(s + (level % 5)), duration: 0.16, volume: 0.35, delay: k * 0.07 }));
  haptic.success();
  const nw = G.nextWorld(state);
  const worldNote = nw >= 0 && level === G.WORLDS[nw].unlock ? `<p class="note hot">${t('worldNew', { w: worldName(nw) })}</p>` : '';
  openSheet(
    `<div class="celebrate"><p class="eyebrow">${t('newBee')}</p><canvas class="hero" width="240" height="240"></canvas>
    <h2>${name}</h2><p class="muted">${t('level', { n: level })} · ${t('perSec', { n: fmt(G.prodOf(level) * G.beeMult(state, state.world, level)) })}</p>
    <p class="note">${t('giftNote')}</p>${worldNote}
    <div class="row"><button class="btn alt" data-share>${ICON.share}${t('share')}</button><button class="btn" data-close>${t('great')}</button></div></div>`,
    () => {
      if (notif === 'unasked') setTimeout(() => sheet.hidden && inHive && askReminders(), 250);
    },
  );
  animateIn(sheetBody.querySelector<HTMLCanvasElement>('canvas.hero')!, (c, time) => drawBee(c, 120, 140, 140, level, time));
  sheetBody.querySelector('[data-share]')!.addEventListener('click', () => {
    void shareResult({ title: t('title'), text: t('shareText', { n: level, name }), url: STORE_URL });
  });
}

function showOffline(o: G.Offline) {
  openSheet(`<div class="celebrate"><p class="eyebrow">${t('awayTitle')}</p><div class="big">${ICON.honey}${fmt(o.honey)}</div>
    <p class="muted">${t('awaySub', { t: fmtTime(o.seconds) })}</p>
    <button class="btn" data-collect>${t('collect')}</button><button class="btn alt" data-double>${ICON.play}${t('double')}</button></div>`);
  let done = false;
  const give = (mult: number) => {
    if (done) return;
    done = true;
    state.honey += o.honey * mult;
    state.earned += o.honey * mult;
    tone({ freq: 523, to: 1046, duration: 0.25, volume: 0.4 });
    haptic.success();
    save();
    hud();
    closeSheet();
  };
  sheetBody.querySelector('[data-collect]')!.addEventListener('click', () => give(1));
  sheetBody.querySelector('[data-double]')!.addEventListener('click', async () => {
    if (await showRewarded('offline_double')) give(2);
  });
  onSheetClose = () => give(1);
}

/** Banks time away (app closed or backgrounded) when it is at least a minute. */
function checkOffline() {
  const o = G.offlineEarnings(state, Date.now());
  state.lastSeen = Date.now();
  if (o.seconds >= 60 && o.honey >= 1) showOffline(o);
}

function enterHive() {
  inHive = true;
  document.body.classList.add('in-hive');
  syncFestival();
  layout();
  hud();
  track('game_start');
  if (pendingOffline) {
    showOffline(pendingOffline);
    pendingOffline = null;
  }
  if (profile.data.firstRun) {
    toast(t('hint'));
    profile.finishFirstRun();
  }
}
function leaveHive() {
  inHive = false;
  closeSheet();
  document.body.classList.remove('in-hive');
  save();
}

// ───────── drag & drop ─────────
const pt = (e: PointerEvent) => {
  const b = canvas.getBoundingClientRect();
  return { x: e.clientX - b.left, y: e.clientY - b.top };
};
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const p = pt(e);
  const i = cellAt(p.x, p.y);
  if (i < 0) return;
  const v = cells()[i];
  if (v < 0) {
    const lvl = G.openGift(state, i);
    popAt(i);
    fx.push({ ...centers[i], t0: now, ring: true, text: t('lv', { n: lvl }) });
    tone({ freq: pentatonic(lvl + 3), duration: 0.15, volume: 0.4 });
    haptic.medium();
    save();
    return;
  }
  if (v > 0) {
    drag = { from: i, ...p };
    canvas.setPointerCapture(e.pointerId);
    haptic.light();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  Object.assign(drag, pt(e));
});
const endDrag = (e: PointerEvent) => {
  if (!drag) return;
  const p = pt(e);
  const from = drag.from;
  drag = null;
  const to = cellAt(p.x, p.y);
  if (to < 0 || to === from) return;
  const res = G.merge(state, from, to);
  if (res) {
    popAt(to);
    fx.push({ ...centers[to], t0: now, ring: true });
    tone({ freq: pentatonic(res.level), duration: 0.14, volume: 0.45 });
    tone({ freq: pentatonic(res.level + 2), duration: 0.14, volume: 0.35, delay: 0.06 });
    haptic.medium();
    profile.progress('merges');
    if (res.gift >= 0) popAt(res.gift);
    if (res.newBest) celebrate(res.level);
    save();
  } else if (G.move(state, from, to)) {
    popAt(to);
    haptic.light();
  }
  hud();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => (drag = null));

// ───────── loop ─────────
let last = performance.now();
let saveAcc = 0;
let floatAcc = 0;
let floatIdx = 0;
let festAcc = 0;
function frame(ms: number) {
  const dt = Math.min(1, Math.max(0, (ms - last) / 1000));
  last = ms;
  now = ms / 1000;
  G.tick(state, dt);
  saveAcc += dt;
  if (saveAcc > 2) {
    saveAcc = 0;
    save();
  }
  festAcc += dt;
  if (festAcc > 30) {
    festAcc = 0;
    syncFestival();
  }
  if (inHive) {
    floatAcc += dt;
    if (floatAcc > 0.6) {
      floatAcc = 0;
      const cs = cells();
      const bees = cs.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
      if (bees.length) {
        const i = bees[floatIdx++ % bees.length];
        if (centers[i] && drag?.from !== i)
          fx.push({ ...centers[i], t0: now, text: `+${fmt(G.prodOf(cs[i]) * G.beeMult(state, state.world, cs[i]))}` });
      }
    }
    render();
    hud();
  }
  requestAnimationFrame(frame);
}

// ───────── boot ─────────
let pendingOffline: G.Offline | null = null;
syncFestival();
{
  const o = G.offlineEarnings(state, Date.now());
  state.lastSeen = Date.now();
  if (o.seconds >= 60 && o.honey >= 1) pendingOffline = o;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') onLeave();
  else {
    last = performance.now();
    if (notif === 'on') void cancelReminders([FULL_ID]);
    syncFestival();
    if (inHive) checkOffline();
    else {
      const o = G.offlineEarnings(state, Date.now());
      state.lastSeen = Date.now();
      if (o.seconds >= 60 && o.honey >= 1) pendingOffline = o;
    }
  }
});

void setupNative({
  onBack: () => {
    if (meta.back()) return true;
    if (closeSheet()) return true;
    if (inHive && !meta.covering) {
      openPause();
      return true;
    }
    return false;
  },
  onPause: onLeave,
});
void initAds();
void initStore();
profile.recordBest(state.best);
meta.showHome();
requestAnimationFrame(frame);

// test hooks (e2e / screenshots)
(window as unknown as { __kovan: unknown }).__kovan = {
  get state() {
    return state;
  },
  set state(s: G.State) {
    state = G.sanitize(s, Date.now());
    syncFestival();
    layout();
  },
  /** Cell centre (page coordinates) in the active hive. */
  center: (i: number) => {
    const b = canvas.getBoundingClientRect();
    return { x: b.left + centers[i].x, y: b.top + centers[i].y };
  },
  /** Fast-forwards production by `sec` seconds of live play. */
  advance: (sec: number) => {
    G.tick(state, sec);
    hud();
  },
  get R() {
    return R;
  },
  costs: () => ({ expand: G.expandCost(state), eggs: G.spawnUpCost(state), rate: G.rate(state), egg: G.spawnCost(state) }),
  get notif() {
    return notif;
  },
  save,
  profile,
};
