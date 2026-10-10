/**
 * DOM side of the retention layer, drawn inside the kit meta sheets (so it inherits the game's
 * meta.css theme variables). Pure state lives in the stores (build, lives, league, album);
 * these functions only render them and call back for rewards the game pays out.
 */
import './retention.css';
import { haptic } from '../haptics';
import { tone, pentatonic } from '../audio';
import { showRewarded } from '../ads';
import { rewardedAvailable } from '../meta/monetize';
import type { SheetOptions } from '../meta/meta';
import type { Build, BuildArea } from './build';
import { formatCountdown, type Lives } from './lives';
import { LEAGUE_GROUP, LEAGUE_DEMOTE, LEAGUE_PROMOTE, LEAGUE_TIERS, type League, type LeagueReward } from './league';
import { CARD_PRICE, SET_SIZE, cardId, rarityOf, type Album, type PackCard } from './album';

const T = {
  en: {
    build: 'Build', next: 'Next: {task}', buildNow: 'Build: {task}', area: 'Area {n}', areaDone: 'Area complete!', collect: 'Collect',
    needStars: 'Win levels to earn stars', allBuilt: 'Everything is built. New areas are on the way!', packs: '+{n} card packs', pack: '+1 card pack',
    lives: 'Lives', full: 'Full', nextLife: 'Next life in {t}', livesFull: 'All lives are full', plusLife: '+1 life', refill: 'Refill all',
    unlimited: 'Unlimited · {t}', noLives: 'Out of lives', league: '{tier} League', endsIn: 'Ends in {t}', leagueRule: 'Top {up} move up · bottom {down} move down',
    you: 'You', weekOver: 'Week over!', finished: 'You finished #{n}', promoted: 'Promoted to {tier} League!', demoted: 'Back to {tier} League', stayed: 'You stay in {tier} League',
    album: 'Album', cards: '{a}/{b} cards', dust: 'Dust', openPack: 'Open pack ({n})', noPacks: 'Earn packs on hard levels, areas and in the league',
    newCard: 'New!', setDone: 'Set complete!', claim: 'Claim', buyFor: 'Get it for {n} dust', notEnoughDust: 'Not enough dust', notEnoughCoins: 'Not enough coins', close: 'Close', done: 'Done',
    openAnother: 'Open another', dh: '{d}d {h}h', hm: '{h}h {m}m', streak: 'Win streak', playToJoin: 'Win a level to join this week',
    bronze: 'Bronze', silver: 'Silver', gold: 'Gold', sapphire: 'Sapphire', ruby: 'Ruby', diamond: 'Diamond', rare: 'Rare', epic: 'Epic',
  },
  tr: {
    build: 'Yap', next: 'Sıradaki: {task}', buildNow: 'Yap: {task}', area: '{n}. bölge', areaDone: 'Bölge tamam!', collect: 'Ödülü al',
    needStars: 'Yıldız kazanmak için seviye geç', allBuilt: 'Her şey yapıldı. Yeni bölgeler yolda!', packs: '+{n} kart paketi', pack: '+1 kart paketi',
    lives: 'Canlar', full: 'Dolu', nextLife: 'Sonraki can {t}', livesFull: 'Tüm canlar dolu', plusLife: '+1 can', refill: 'Hepsini doldur',
    unlimited: 'Sınırsız · {t}', noLives: 'Canın kalmadı', league: '{tier} Ligi', endsIn: 'Bitişe {t}', leagueRule: 'İlk {up} yükselir · son {down} düşer',
    you: 'Sen', weekOver: 'Hafta bitti!', finished: '{n}. oldun', promoted: '{tier} Ligine yükseldin!', demoted: '{tier} Ligine düştün', stayed: '{tier} Liginde kaldın',
    album: 'Albüm', cards: '{a}/{b} kart', dust: 'Toz', openPack: 'Paket aç ({n})', noPacks: 'Zor seviyelerde, bölgelerde ve ligde paket kazan',
    newCard: 'Yeni!', setDone: 'Set tamam!', claim: 'Al', buyFor: '{n} tozla al', notEnoughDust: 'Toz yetmiyor', notEnoughCoins: 'Jeton yetmiyor', close: 'Kapat', done: 'Tamam',
    openAnother: 'Bir tane daha aç', dh: '{d} g {h} sa', hm: '{h} sa {m} dk', streak: 'Galibiyet serisi', playToJoin: 'Bu haftaya katılmak için bir seviye geç',
    bronze: 'Bronz', silver: 'Gümüş', gold: 'Altın', sapphire: 'Safir', ruby: 'Yakut', diamond: 'Elmas', rare: 'Nadir', epic: 'Efsane',
  },
};
type Key = keyof (typeof T)['en'];
const lang: 'en' | 'tr' = typeof navigator !== 'undefined' && navigator.language.slice(0, 2) === 'tr' ? 'tr' : 'en';
export const rt = (k: Key, vars: Record<string, string | number> = {}) => T[lang][k].replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? ''));

export const RICON = {
  star: '<svg viewBox="0 0 24 24" class="r-solid"><path d="M12 2.8l2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17l-5.7 3.1 1.2-6.3L2.9 9.4l6.3-.8z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" class="r-solid"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.1 1.8-1.9 3.3-3.1 5.4-3.1 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z"/></svg>',
  hammer: '<svg viewBox="0 0 24 24"><path d="M14 6l4 4M4 20l9-9M12.5 4.5l7 7 1.5-1.5-3-6-4-1z"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" fill="currentColor"/><path d="M8.5 12l2.5 2.5 4.5-5" stroke="#fff" stroke-width="2.2"/></svg>',
  cards: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="11" height="15" rx="2" transform="rotate(-8 8 13)"/><rect x="10" y="3" width="11" height="15" rx="2" fill="currentColor" fill-opacity="0.18" transform="rotate(8 15 10)"/></svg>',
  ad: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9v6l5-3z" fill="currentColor"/></svg>',
  coin: '<svg viewBox="0 0 24 24" class="r-coin"><circle cx="12" cy="12" r="9" fill="#ffc83d" stroke="#b57d10" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#e0a21c" stroke-width="1.6"/></svg>',
  flame: '<svg viewBox="0 0 24 24" class="r-solid"><path d="M12 2c1 4 6 6.5 6 12a6 6 0 0 1-12 0c0-3 1.5-5 3-6.5 0 2.5 1 4 2.5 4.5C11 9 10 5.5 12 2z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  dust: '<svg viewBox="0 0 24 24" class="r-solid"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM6 15l.6 1.6 1.6.6-1.6.6L6 19.4l-.6-1.6L3.8 17.2l1.6-.6z"/></svg>',
};

/** What the retention screens need from the meta layer (`createMeta` returns all of it). */
export interface SheetHost {
  openSheet(content: HTMLElement, o?: SheetOptions): void;
  closeSheet(): void;
  toast(text: string): void;
}

const el = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};
const fanfare = (base = 392) => [0, 2, 4, 7, 9].forEach((s, i) => tone({ freq: pentatonic(s, base), duration: 0.18, volume: 0.35, delay: i * 0.07 }));
const spanText = (node: HTMLElement, sel: string, s: string) => (node.querySelector(sel)!.textContent = s);
export const tierName = (tier: number) => rt(LEAGUE_TIERS[Math.max(0, Math.min(LEAGUE_TIERS.length - 1, tier))]);
export const TIER_COLORS = ['#c98a54', '#9fb3c8', '#f2b632', '#3f8cff', '#e0445f', '#5fd7e8'];

/** "3d 4h" / "5h 12m" for longer countdowns. */
export function formatDuration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d ? rt('dh', { d, h }) : rt('hm', { h, m: m % 60 });
}

// ───────────────────────── one ticker for every live countdown ─────────────────────────
const tickers = new Set<() => void>();
let tickTimer = 0;
function onTick(fn: () => void) {
  tickers.add(fn);
  if (!tickTimer && typeof window !== 'undefined') tickTimer = window.setInterval(() => tickers.forEach((f) => f()), 1000);
  return () => tickers.delete(fn);
}

// ───────────────────────── build ─────────────────────────
/** Layered art of one area: `base` is always drawn; each task id reveals its own layer. */
export interface BuildArt {
  viewBox: string;
  base: string;
  layers: Record<string, string>;
  /** Drawn over every layer (foreground framing, light). */
  top?: string;
  /** Where the "build here" marker of a task sits, in viewBox units. */
  spots?: Record<string, [number, number]>;
}

export interface BuildUi {
  build: Build;
  art: (areaIndex: number) => BuildArt;
  areaName: (area: BuildArea, index: number) => string;
  taskName: (area: BuildArea, taskId: string) => string;
  /** Pays an area reward (coins to the profile, packs to the album…). */
  onReward: (reward: BuildArea['reward']) => void;
}

/** SVG markup of an area with the built layers; `reveal` animates one layer in. */
export function buildSceneSvg(art: BuildArt, done: Set<string>, o: { reveal?: string; markers?: string[] } = {}): string {
  const layers = Object.entries(art.layers)
    .map(([id, svg]) => `<g class="r-layer ${done.has(id) ? 'on' : ''} ${id === o.reveal ? 'reveal' : ''}" data-task="${id}">${svg}</g>`)
    .join('');
  const marks = (o.markers ?? [])
    .filter((id) => art.spots?.[id])
    .map((id) => {
      const [x, y] = art.spots![id];
      return `<g transform="translate(${x} ${y})"><g class="r-mark" data-task="${id}"><circle r="11" fill="#fff" stroke="#ffb547" stroke-width="3"/><path d="M-5 0h10M0-5v10" stroke="#e08a00" stroke-width="3" stroke-linecap="round"/></g></g>`;
    })
    .join('');
  return `<svg class="r-svg" viewBox="${art.viewBox}" preserveAspectRatio="xMidYMid meet">${art.base}${layers}${art.top ?? ''}${marks}</svg>`;
}

/** Home hero: the area being built + "Next: Fountain · ★2" call to action. Call `.refresh()` after changes. */
export function createBuildHero(ui: BuildUi, onOpen: () => void): HTMLElement & { refresh: () => void } {
  const b = ui.build;
  const root = el(`<div class="r-hero"><button class="r-scene" aria-label="${rt('build')}"></button>
    <button class="r-cta"><span class="r-cta-ico">${RICON.hammer}</span><span class="r-cta-text"></span><span class="r-cta-cost">${RICON.star}<b></b></span></button></div>`) as HTMLElement & { refresh: () => void };
  root.querySelectorAll('button').forEach((x) => x.addEventListener('click', onOpen));
  root.refresh = () => {
    const area = b.area();
    const idx = Math.min(b.areaIndex, b.areas.length - 1);
    const art = ui.art(idx);
    const next = b.nextTask();
    const done = area ? b.doneTasks() : new Set(Object.keys(art.layers));
    root.querySelector('.r-scene')!.innerHTML = buildSceneSvg(art, done, { markers: next ? [next.id] : [] }) + `<span class="r-area-tag"></span>`;
    const p = b.progress();
    spanText(root, '.r-area-tag', area ? `${ui.areaName(area, b.areaIndex)} · ${p.done}/${p.total}` : rt('allBuilt'));
    const cta = root.querySelector('.r-cta') as HTMLElement;
    cta.hidden = !area;
    if (!area) return;
    const ready = b.areaComplete() || (!!next && b.stars >= next.cost);
    cta.classList.toggle('ready', ready);
    spanText(root, '.r-cta-text', b.areaComplete() ? rt('areaDone') : next ? rt(ready ? 'buildNow' : 'next', { task: ui.taskName(area, next.id) }) : '');
    spanText(root, '.r-cta-cost b', b.areaComplete() ? '' : `${b.stars}/${next?.cost ?? 0}`);
  };
  root.refresh();
  b.onChange(root.refresh);
  return root;
}

/** Full build screen: scene, star balance, task list; builds with a reveal animation, then area reward. */
export function openBuildScreen(host: SheetHost, ui: BuildUi, onClose?: () => void) {
  const b = ui.build;
  const wrap = el(`<div class="r-build"></div>`);
  const render = (reveal?: string) => {
    const area = b.area();
    if (!area) {
      wrap.innerHTML = `<div class="r-scene big">${buildSceneSvg(ui.art(b.areas.length - 1), new Set(Object.keys(ui.art(b.areas.length - 1).layers)))}</div><p class="m-note"></p><button class="m-btn" data-close></button>`;
      spanText(wrap, '.m-note', rt('allBuilt'));
      spanText(wrap, '[data-close]', rt('close'));
      wrap.querySelector('[data-close]')!.addEventListener('click', () => host.closeSheet());
      return;
    }
    const art = ui.art(b.areaIndex);
    const done = b.doneTasks();
    const p = b.progress();
    const open = area.tasks.filter((t) => !done.has(t.id)).map((t) => t.id);
    wrap.innerHTML = `
      <div class="r-build-head"><div><small></small><b></b></div><span class="r-starpill">${RICON.star}<b>${b.stars}</b></span></div>
      <div class="r-scene big">${buildSceneSvg(art, done, { reveal, markers: open })}</div>
      <div class="r-progress"><i style="width:${(p.done / p.total) * 100}%"></i><span>${p.done}/${p.total}</span></div>
      <div class="r-tasks"></div>
      <button class="m-btn ghost" data-close></button>`;
    spanText(wrap, '.r-build-head small', rt('area', { n: b.areaIndex + 1 }));
    spanText(wrap, '.r-build-head b', ui.areaName(area, b.areaIndex));
    spanText(wrap, '[data-close]', rt('close'));
    wrap.querySelector('[data-close]')!.addEventListener('click', () => host.closeSheet());
    const list = wrap.querySelector('.r-tasks')!;
    for (const t of area.tasks) {
      const isDone = done.has(t.id);
      const can = !isDone && b.stars >= t.cost;
      const row = el(`<div class="r-task ${isDone ? 'done' : can ? 'ready' : ''}"><span class="r-task-name"></span>
        <button class="m-btn small ${can ? '' : 'ghost'}" ${isDone ? 'disabled' : ''}>${isDone ? RICON.check : `${RICON.star}${t.cost}`}</button></div>`);
      spanText(row, '.r-task-name', ui.taskName(area, t.id));
      row.querySelector('button')!.addEventListener('click', () => doBuild(t.id));
      list.appendChild(row);
    }
    wrap.querySelectorAll<SVGGElement>('.r-mark').forEach((m) => m.addEventListener('click', () => doBuild(m.dataset.task!)));
    if (b.areaComplete()) setTimeout(() => areaDone(area), reveal ? 1100 : 200);
  };
  function doBuild(id: string) {
    if (!b.build(id)) {
      haptic.error();
      host.toast(rt('needStars'));
      return;
    }
    haptic.success();
    fanfare(440);
    render(id);
  }
  function areaDone(area: BuildArea) {
    if (!wrap.isConnected || b.area() !== area) return;
    const idx = b.areaIndex;
    const art = ui.art(idx);
    const r = area.reward;
    const done = el(`<div class="r-area-done"><div class="r-rays"></div><p class="m-eyebrow"></p><h2></h2>
      <div class="r-scene big">${buildSceneSvg(art, new Set(Object.keys(art.layers)))}</div>
      <p class="m-reward">${RICON.coin}<b>+${r.coins}</b></p>${r.packs ? `<p class="m-note r-packs">${RICON.cards}<span></span></p>` : ''}
      <button class="m-btn" data-collect></button></div>`);
    spanText(done, '.m-eyebrow', ui.areaName(area, idx));
    spanText(done, 'h2', rt('areaDone'));
    if (r.packs) spanText(done, '.r-packs span', r.packs === 1 ? rt('pack') : rt('packs', { n: r.packs }));
    spanText(done, '[data-collect]', rt('collect'));
    done.querySelector('[data-collect]')!.addEventListener('click', () => {
      const got = b.claimArea();
      if (got) ui.onReward(got);
      haptic.success();
      render();
    });
    wrap.replaceChildren(done);
    [0, 4, 7, 9, 11, 14].forEach((s, i) => tone({ freq: pentatonic(s, 330), duration: 0.25, volume: 0.4, delay: 0.1 + i * 0.09 }));
  }
  render();
  host.openSheet(wrap, { wide: true, onClose });
}

// ───────────────────────── lives ─────────────────────────
/** Top-bar pill: heart with the count and the time to the next life ("Full" / "∞ 59:00"). */
export function createLivesPill(lives: Lives, onClick: () => void): HTMLElement {
  const pill = el(`<button class="r-lives" aria-label="${rt('lives')}"><span class="r-heart">${RICON.heart}<b></b></span><small></small></button>`);
  pill.addEventListener('click', onClick);
  const paint = () => {
    const inf = lives.unlimited();
    pill.classList.toggle('inf', inf);
    pill.querySelector('.r-heart b')!.textContent = inf ? '∞' : String(lives.count);
    pill.querySelector('small')!.textContent = inf ? formatCountdown(lives.unlimitedLeftMs()) : lives.full() ? rt('full') : formatCountdown(lives.nextInMs());
  };
  paint();
  lives.onChange(paint);
  onTick(() => pill.isConnected && paint());
  return pill;
}

export interface LivesSheetOptions {
  /** Coin price of a full refill. */
  refillPrice: number;
  spendCoins: (n: number) => boolean;
  /** Game-specific extra (e.g. "play the daily puzzle, it's free"). */
  extra?: HTMLElement;
  onClose?: () => void;
}

/** Lives sheet: count, next-life timer, +1 via rewarded ad, full refill via coins. */
export function openLivesSheet(host: SheetHost, lives: Lives, o: LivesSheetOptions) {
  const wrap = el(`<div class="r-lives-sheet"><h2></h2><div class="r-bigheart">${RICON.heart}<b></b></div><p class="m-note" data-timer></p>
    <button class="m-btn alt" data-ad>${RICON.ad}<span></span></button>
    <button class="m-btn" data-coins><span></span> · ${RICON.coin}${o.refillPrice}</button>
    <div data-extra></div>
    <button class="m-btn ghost" data-close></button></div>`);
  spanText(wrap, '[data-ad] span', rt('plusLife'));
  spanText(wrap, '[data-coins] span', rt('refill'));
  spanText(wrap, '[data-close]', rt('close'));
  if (o.extra) wrap.querySelector('[data-extra]')!.appendChild(o.extra);
  const paint = () => {
    const inf = lives.unlimited();
    const n = lives.count;
    spanText(wrap, 'h2', n === 0 && !inf ? rt('noLives') : rt('lives'));
    spanText(wrap, '.r-bigheart b', inf ? '∞' : String(n));
    spanText(wrap, '[data-timer]', inf ? rt('unlimited', { t: formatCountdown(lives.unlimitedLeftMs()) }) : lives.full() ? rt('livesFull') : rt('nextLife', { t: formatCountdown(lives.nextInMs()) }));
    (wrap.querySelector('[data-ad]') as HTMLButtonElement).disabled = inf || lives.full() || !rewardedAvailable();
    (wrap.querySelector('[data-coins]') as HTMLButtonElement).disabled = inf || lives.full();
  };
  wrap.querySelector('[data-ad]')!.addEventListener('click', async () => {
    if (await showRewarded('life')) {
      lives.add(1);
      haptic.success();
      fanfare();
    }
    paint();
  });
  wrap.querySelector('[data-coins]')!.addEventListener('click', () => {
    if (!o.spendCoins(o.refillPrice)) return host.toast(rt('notEnoughCoins'));
    lives.refill();
    haptic.success();
    fanfare();
    paint();
  });
  wrap.querySelector('[data-close]')!.addEventListener('click', () => host.closeSheet());
  paint();
  const stop = onTick(() => (wrap.isConnected ? paint() : stop()));
  host.openSheet(wrap, { onClose: o.onClose });
}

// ───────────────────────── win streak ─────────────────────────
/** Three flames lit up to `tier` (for win sheets and the HUD). */
export function streakFlames(tier: number, max = 3): string {
  return `<span class="r-flames" aria-label="${rt('streak')} ${tier}">${Array.from({ length: max }, (_, i) => `<i class="${i < tier ? 'on' : ''}">${RICON.flame}</i>`).join('')}</span>`;
}

// ───────────────────────── league ─────────────────────────
export function openLeague(host: SheetHost, league: League, onReward: (r: LeagueReward) => void) {
  if (league.pendingResult()) return showLeagueResult(host, league, onReward, () => openLeague(host, league, onReward));
  const { rows, rank } = league.standings();
  const tier = league.tier;
  const wrap = el(`<div class="r-league">
    <div class="r-league-head" style="--tier:${TIER_COLORS[tier]}"><span class="r-tier">${RICON.shield}</span><div><b></b><small data-left></small></div></div>
    <p class="m-note"></p><div class="r-table"></div><button class="m-btn ghost" data-close></button></div>`);
  spanText(wrap, '.r-league-head b', rt('league', { tier: tierName(tier) }));
  spanText(wrap, '.m-note', league.score > 0 ? rt('leagueRule', { up: LEAGUE_PROMOTE, down: LEAGUE_DEMOTE }) : rt('playToJoin'));
  spanText(wrap, '[data-close]', rt('close'));
  const left = () => spanText(wrap, '[data-left]', rt('endsIn', { t: formatDuration(league.timeLeftMs()) }));
  left();
  const table = wrap.querySelector('.r-table')!;
  rows.forEach((r, i) => {
    const pos = i + 1;
    const zone = pos <= LEAGUE_PROMOTE && tier < LEAGUE_TIERS.length - 1 ? 'up' : pos > LEAGUE_GROUP - LEAGUE_DEMOTE && tier > 0 ? 'down' : '';
    const row = el(`<div class="r-row ${zone} ${r.you ? 'you' : ''}"><i>${pos}</i><span></span><b>${r.score}</b></div>`);
    spanText(row, 'span', r.you ? rt('you') : r.name);
    table.appendChild(row);
  });
  wrap.querySelector('[data-close]')!.addEventListener('click', () => host.closeSheet());
  const stop = onTick(() => (wrap.isConnected ? left() : stop()));
  host.openSheet(wrap, { wide: true });
  const you = table.querySelector<HTMLElement>('.you');
  if (you && rank > 6) table.scrollTop = you.offsetTop - table.clientHeight / 2;
}

/** End-of-week result sheet: rank, promotion / relegation, reward. */
export function showLeagueResult(host: SheetHost, league: League, onReward: (r: LeagueReward) => void, then?: () => void) {
  const r = league.pendingResult();
  if (!r) return then?.();
  const msg = r.newTier > r.tier ? rt('promoted', { tier: tierName(r.newTier) }) : r.newTier < r.tier ? rt('demoted', { tier: tierName(r.newTier) }) : rt('stayed', { tier: tierName(r.newTier) });
  const wrap = el(`<div class="m-result r-league-result"><div class="r-rays"></div><p class="m-eyebrow"></p>
    <div class="r-tier big" style="--tier:${TIER_COLORS[r.newTier]}">${RICON.shield}</div>
    <h2></h2><p class="m-note" data-msg></p>
    <p class="m-reward">${RICON.coin}<b>+${r.reward.coins}</b></p>${r.reward.packs ? `<p class="m-note r-packs">${RICON.cards}<span></span></p>` : ''}
    <button class="m-btn" data-collect></button></div>`);
  spanText(wrap, '.m-eyebrow', rt('weekOver'));
  spanText(wrap, 'h2', rt('finished', { n: r.rank }));
  spanText(wrap, '[data-msg]', msg);
  if (r.reward.packs) spanText(wrap, '.r-packs span', r.reward.packs === 1 ? rt('pack') : rt('packs', { n: r.reward.packs }));
  spanText(wrap, '[data-collect]', rt('collect'));
  wrap.querySelector('[data-collect]')!.addEventListener('click', () => {
    const got = league.claimResult();
    if (got) onReward(got);
    haptic.success();
    host.closeSheet();
    then?.();
  });
  fanfare(r.newTier > r.tier ? 523 : 392);
  host.openSheet(wrap, { modal: true });
}

// ───────────────────────── album ─────────────────────────
export interface AlbumUi {
  album: Album;
  setName: (set: string) => string;
  cardName: (set: string, index: number) => string;
  /** Card artwork (SVG markup, drawn into a 3:4 frame). */
  cardArt: (set: string, index: number) => string;
  onSetReward: (set: string, coins: number) => void;
}

function cardHtml(ui: AlbumUi, set: string, i: number, owned: boolean, extra = '') {
  const r = rarityOf(i);
  return `<div class="r-card r${r} ${owned ? '' : 'missing'}" data-card="${cardId(set, i)}">${owned ? `<div class="r-card-art">${ui.cardArt(set, i)}</div>` : `<div class="r-card-art"><i>?</i></div>`}<span></span>${extra}</div>`;
}

export function openAlbum(host: SheetHost, ui: AlbumUi, startSet?: string) {
  const a = ui.album;
  let current = startSet ?? a.activeSets()[0] ?? a.sets[0].id;
  const wrap = el(`<div class="r-album"><h2></h2><p class="m-note" data-sum></p>
    <button class="m-btn" data-open></button>
    <div class="r-set-tabs"></div><div class="r-set"></div><button class="m-btn ghost" data-close></button></div>`);
  spanText(wrap, 'h2', rt('album'));
  spanText(wrap, '[data-close]', rt('close'));
  wrap.querySelector('[data-close]')!.addEventListener('click', () => host.closeSheet());
  wrap.querySelector('[data-open]')!.addEventListener('click', () => {
    if (a.packs > 0) openPack(host, ui, () => openAlbum(host, ui, current));
  });
  const paint = () => {
    const tot = a.total();
    wrap.querySelector('[data-sum]')!.innerHTML = `${rt('cards', { a: tot.have, b: tot.all })} · ${RICON.dust}<b>${a.dust}</b>`;
    const open = wrap.querySelector('[data-open]') as HTMLButtonElement;
    open.innerHTML = `${RICON.cards}<span></span>`;
    spanText(open, 'span', a.packs > 0 ? rt('openPack', { n: a.packs }) : rt('noPacks'));
    open.disabled = a.packs <= 0;
    open.classList.toggle('alt', a.packs <= 0);
    const tabs = wrap.querySelector('.r-set-tabs')!;
    tabs.innerHTML = '';
    for (const st of a.sets) {
      const t = el(`<button class="${st.id === current ? 'on' : ''} ${a.setComplete(st.id) ? 'full' : ''}"><b></b><small>${a.setCount(st.id)}/${SET_SIZE}</small>${a.claimable().includes(st.id) ? '<i class="m-badge">!</i>' : ''}</button>`);
      spanText(t, 'b', ui.setName(st.id));
      t.addEventListener('click', () => {
        current = st.id;
        haptic.light();
        paint();
      });
      tabs.appendChild(t);
    }
    const set = wrap.querySelector('.r-set')!;
    const st = a.sets.find((x) => x.id === current)!;
    set.innerHTML = `<div class="r-set-head"><b></b><span>${a.setCount(st.id)}/${SET_SIZE}</span><span class="r-set-reward">${a.isClaimed(st.id) ? RICON.check : `${RICON.coin}${st.reward}`}</span></div><div class="r-cards"></div>`;
    spanText(set as HTMLElement, '.r-set-head b', ui.setName(st.id));
    const grid = set.querySelector('.r-cards')!;
    for (let i = 0; i < SET_SIZE; i++) {
      const c = el(cardHtml(ui, st.id, i, a.has(cardId(st.id, i))));
      spanText(c, 'span', a.has(cardId(st.id, i)) ? ui.cardName(st.id, i) : rarityOf(i) === 2 ? rt('epic') : rarityOf(i) === 1 ? rt('rare') : '');
      if (!a.has(cardId(st.id, i)))
        c.addEventListener('click', () => {
          const price = CARD_PRICE[rarityOf(i)];
          if (!c.classList.contains('ask')) {
            grid.querySelectorAll('.ask').forEach((x) => x.classList.remove('ask'));
            c.classList.add('ask');
            spanText(c, 'span', rt('buyFor', { n: price }));
            return;
          }
          if (!a.buyCard(cardId(st.id, i))) return host.toast(rt('notEnoughDust'));
          haptic.success();
          fanfare();
          paint();
        });
      grid.appendChild(c);
    }
    if (a.claimable().includes(st.id)) {
      const claim = el(`<button class="m-btn r-claim">${RICON.coin}<span></span></button>`);
      spanText(claim, 'span', `${rt('setDone')} ${rt('claim')} +${st.reward}`);
      claim.addEventListener('click', () => {
        const coins = a.claimSet(st.id);
        if (coins) ui.onSetReward(st.id, coins);
        haptic.success();
        fanfare(523);
        paint();
      });
      set.appendChild(claim);
    }
  };
  paint();
  host.openSheet(wrap, { wide: true });
  wrap.querySelector('.r-set-tabs .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/** Pack opening: cards flip in one by one with NEW / +dust labels. */
export function openPack(host: SheetHost, ui: AlbumUi, then?: () => void) {
  const cards: PackCard[] | null = ui.album.openPack();
  if (!cards) return then?.();
  const wrap = el(`<div class="r-pack"><h2></h2><div class="r-pack-cards"></div><button class="m-btn" data-more></button><button class="m-btn ghost" data-done></button></div>`);
  spanText(wrap, 'h2', rt('album'));
  const row = wrap.querySelector('.r-pack-cards')!;
  cards.forEach((c, i) => {
    const node = el(cardHtml(ui, c.set, c.index, true, `<em class="${c.isNew ? 'new' : 'dup'}">${c.isNew ? rt('newCard') : `+${c.dust} ${rt('dust')}`}</em>`));
    node.style.animationDelay = `${150 + i * 260}ms`;
    spanText(node, 'span', ui.cardName(c.set, c.index));
    const set = document.createElement('small');
    set.className = 'r-card-set';
    set.textContent = ui.setName(c.set);
    node.appendChild(set);
    row.appendChild(node);
    tone({ freq: pentatonic(i * 2 + (c.isNew ? 4 : 0), 440), duration: 0.14, volume: 0.3, delay: 0.15 + i * 0.26 });
  });
  const more = wrap.querySelector('[data-more]') as HTMLElement;
  more.hidden = ui.album.packs <= 0;
  spanText(wrap, '[data-more]', `${rt('openAnother')} (${ui.album.packs})`);
  spanText(wrap, '[data-done]', rt('done'));
  more.addEventListener('click', () => openPack(host, ui, then));
  wrap.querySelector('[data-done]')!.addEventListener('click', () => {
    host.closeSheet();
    then?.();
  });
  haptic.success();
  host.openSheet(wrap, { wide: true, modal: true });
}
