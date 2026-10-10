/**
 * The meta layer every game needs around its gameplay screen: home menu with mode cards,
 * level map, daily missions, 7-day daily reward, shop (skins, free coins, IAP), settings,
 * pause, win and lose screens. Built from DOM once; each game themes it with CSS variables
 * (see meta.css) and plugs in its own modes, skins and mission texts.
 */
import './meta.css';
import { haptic } from '../haptics';
import { tone, pentatonic, unlockAudio } from '../audio';
import { track } from '../analytics';
import { showRewarded, interstitialMoment } from '../ads';
import { DAILY_REWARDS, AD_COINS, COIN_PACKS, STARTER_PACK_COINS, type ProfileStore } from './profile';
import { priceOf, purchase, restorePurchases, setNoAds, storeAvailable, rewardedAvailable, type ProductId } from './monetize';
import { setAdsRemoved } from '../ads';
import type { ContinueOffer, InterstitialPolicy } from '../retention/offers';

const T = {
  en: {
    play: 'Play', levels: 'Levels', level: 'Level {n}', endless: 'Endless', best: 'Best', missions: 'Missions', daily: 'Daily',
    shop: 'Shop', settings: 'Settings', sound: 'Sound', vibration: 'Vibration', privacy: 'Privacy policy', restore: 'Restore purchases',
    close: 'Close', claim: 'Claim', claimed: 'Claimed', day: 'Day {n}', dailyTitle: 'Daily reward', dailyNote: 'Come back every day — day 7 pays the most.',
    dailyDone: 'Come back tomorrow!', missionsTitle: 'Daily missions', missionsNote: 'New missions every day.', skins: 'Styles', coins: 'Coins',
    equip: 'Use', equipped: 'In use', free: 'Free', watch: 'Watch video', left: '{n} left today', removeAds: 'Remove ads', removeAdsSub: 'No more pop-up ads. Rewarded videos stay optional.',
    starter: 'Starter pack', starterSub: '{n} coins + no ads', small: 'Pile of coins', large: 'Chest of coins', owned: 'Owned',
    notEnough: 'Not enough coins', bought: 'Unlocked!', thanks: 'Thank you!', unavailable: 'Store not available right now',
    restored: 'Purchases restored', win: 'Level complete!', next: 'Next', menu: 'Menu', retry: 'Try again', double: 'x2 with video',
    over: 'Game over', newBest: 'New best!', score: 'Score', cont: 'Continue', contAd: 'Continue (video)', paused: 'Paused', resume: 'Resume',
    restart: 'Restart', stars: '{n} stars', allMissions: 'All missions done — great!', locked: 'Locked', mapNote: 'Collect stars on every level.',
  },
  tr: {
    play: 'Oyna', levels: 'Seviyeler', level: 'Seviye {n}', endless: 'Sonsuz', best: 'Rekor', missions: 'Görevler', daily: 'Günlük',
    shop: 'Mağaza', settings: 'Ayarlar', sound: 'Ses', vibration: 'Titreşim', privacy: 'Gizlilik politikası', restore: 'Satın alımları geri yükle',
    close: 'Kapat', claim: 'Al', claimed: 'Alındı', day: '{n}. gün', dailyTitle: 'Günlük ödül', dailyNote: 'Her gün gel — 7. gün en büyük ödül.',
    dailyDone: 'Yarın tekrar gel!', missionsTitle: 'Günlük görevler', missionsNote: 'Her gün yeni görevler.', skins: 'Görünümler', coins: 'Jeton',
    equip: 'Kullan', equipped: 'Kullanımda', free: 'Ücretsiz', watch: 'Video izle', left: 'Bugün {n} hak', removeAds: 'Reklamları kaldır', removeAdsSub: 'Araya giren reklamlar biter. Ödüllü videolar isteğe bağlı kalır.',
    starter: 'Başlangıç paketi', starterSub: '{n} jeton + reklamsız', small: 'Bir avuç jeton', large: 'Sandık dolusu jeton', owned: 'Sende var',
    notEnough: 'Jeton yetmiyor', bought: 'Açıldı!', thanks: 'Teşekkürler!', unavailable: 'Mağaza şu an kullanılamıyor',
    restored: 'Satın alımlar geri yüklendi', win: 'Seviye tamam!', next: 'Sonraki', menu: 'Menü', retry: 'Tekrar dene', double: 'Videoyla x2',
    over: 'Oyun bitti', newBest: 'Yeni rekor!', score: 'Skor', cont: 'Devam et', contAd: 'Devam et (video)', paused: 'Duraklatıldı', resume: 'Devam',
    restart: 'Baştan başla', stars: '{n} yıldız', allMissions: 'Tüm görevler tamam — harika!', locked: 'Kilitli', mapNote: 'Her seviyede yıldızları topla.',
  },
};
type Key = keyof (typeof T)['en'];
const lang: 'en' | 'tr' = typeof navigator !== 'undefined' && navigator.language.slice(0, 2) === 'tr' ? 'tr' : 'en';
const tt = (k: Key, vars: Record<string, string | number> = {}) => T[lang][k].replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? ''));

const ICON = {
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#ffc83d" stroke="#b57d10" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#e0a21c" stroke-width="1.6"/><path d="M9 8.5a5 5 0 0 1 3-1.2" stroke="#fff3c4" stroke-width="1.6"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17l-5.7 3.1 1.2-6.3L2.9 9.4l6.3-.8z"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18M12 9v12M12 9S10 4 7.5 5 8 9 12 9zM12 9s2-5 4.5-4S16 9 12 9z"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>',
  inf: '<svg viewBox="0 0 24 24"><path d="M7 8a4 4 0 1 0 0 8c3 0 7-8 10-8a4 4 0 1 1 0 8c-3 0-7-8-10-8z"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  ad: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9v6l5-3z" fill="currentColor"/></svg>',
  trophy: '<svg viewBox="0 0 24 24"><path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/></svg>',
};

export interface MetaSkin {
  id: string;
  name: string;
  price: number;
  /** Any CSS background for the preview tile. */
  swatch: string;
}

/** Extra button on a result sheet (win / fail / lose), placed next to "Menu". */
export interface ResultButton {
  label: string;
  /** Becomes `data-btn` (tests, styling). */
  id?: string;
  /** Inline SVG markup shown before the label. */
  icon?: string;
  cls?: 'alt' | 'ghost' | '';
  /** Keep the sheet open after the tap (e.g. Share). */
  keepOpen?: boolean;
  onClick: () => void;
}

/** Official slots on the result sheets (instead of decorating the kit DOM afterwards). */
export interface ResultExtras {
  /** Content placed under the headline / stars / reward (progress rows, rewards…). */
  extra?: HTMLElement;
  buttons?: ResultButton[];
}

/** Quick-access button on the home screen (league, album, events…), in a row above the mission strip. */
export interface HomeButton {
  id: string;
  icon: string;
  label: string;
  /** Small second line (rank, pack count…), re-read on every refresh. */
  sub?: () => string;
  /** Red badge text, re-read on every refresh; empty / 0 / null hides it. */
  badge?: () => string | number | null;
  onClick: () => void;
}

export interface SheetOptions {
  /** Taps on the backdrop and Android back do not close it. */
  modal?: boolean;
  wide?: boolean;
  onClose?: () => void;
}

export interface MetaConfig {
  title: string;
  tagline: string;
  version: string;
  privacyUrl: string;
  profile: ProfileStore;
  levels?: {
    count: number;
    play: (level: number) => void;
    /** Gate before a level starts (e.g. lives). Return false to stay on the current screen. */
    canPlay?: (level: number) => boolean;
    /** Header placed before level `n` in the map grid (chapters, areas…). */
    section?: (level: number) => HTMLElement | null;
    /** Extra class for a map tile (e.g. 'hard', 'veryhard'). */
    tag?: (level: number) => string;
  };
  endless?: { title?: string; subtitle?: string; play: () => void };
  missionText: (id: string, target: number) => string;
  skins: MetaSkin[];
  onSkin?: (id: string) => void;
  settings: { sound: boolean; haptics: boolean };
  onSettings: (s: { sound: boolean; haptics: boolean }) => void;
  /** Game artwork shown in the middle of the home screen (animated preview, mascot…). */
  hero?: HTMLElement;
  /** Extra rows for the settings sheet (e.g. a language toggle). */
  extraSettings?: HTMLElement;
  /** Placed in the home top bar between the coins and the settings button (e.g. a lives pill). */
  topExtra?: HTMLElement;
  homeButtons?: HomeButton[];
  /** Interstitial rules (retention `createInterstitialPolicy`); default: after level 4, time-capped. */
  interstitial?: InterstitialPolicy;
  /** After a successful purchase (e.g. starter pack → unlimited lives for 24 h). */
  onPurchase?: (id: ProductId) => void;
}

const el = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

export function createMeta(cfg: MetaConfig) {
  const P = cfg.profile;
  const root = el(`<div class="meta-root"></div>`);
  document.body.appendChild(root);
  const coinPill = () => `<button class="m-coins" data-act="shop-coins">${ICON.coin}<b data-coins>${P.data.coins}</b><i>+</i></button>`;

  // ───────────────────────── home ─────────────────────────
  const home = el(`
    <section class="m-screen m-home" hidden>
      <header class="m-top">${coinPill()}<span class="m-top-extra"></span><button class="m-icon" data-act="settings" aria-label="${tt('settings')}">${ICON.gear}</button></header>
      <div class="m-hero"><h1 class="m-logo" translate="no"></h1><p class="m-tag"></p><div class="m-art"></div></div>
      <div class="m-bottom">
        <div class="m-quick" hidden></div>
        <button class="m-strip" data-act="missions">${ICON.target}<span class="m-strip-body"><span data-strip-text></span><span class="m-bar"><i data-strip-bar></i></span></span><i class="m-badge" data-strip-badge hidden>!</i></button>
        <div class="m-cards"></div>
        <nav class="m-nav">
          ${cfg.levels ? `<button data-act="map">${ICON.map}<span>${tt('levels')}</span></button>` : ''}
          <button data-act="missions">${ICON.target}<span>${tt('missions')}</span><i class="m-badge" data-badge-missions hidden></i></button>
          <button data-act="daily">${ICON.gift}<span>${tt('daily')}</span><i class="m-badge" data-badge-daily hidden>!</i></button>
          <button data-act="shop">${ICON.bag}<span>${tt('shop')}</span></button>
        </nav>
      </div>
    </section>`);
  home.querySelector('.m-logo')!.textContent = cfg.title;
  home.querySelector('.m-tag')!.textContent = cfg.tagline;
  if (cfg.hero) home.querySelector('.m-art')!.appendChild(cfg.hero);
  if (cfg.topExtra) home.querySelector('.m-top-extra')!.appendChild(cfg.topExtra);
  const quick = home.querySelector('.m-quick') as HTMLElement;
  for (const b of cfg.homeButtons ?? []) {
    const btn = el(`<button class="m-qbtn" data-home-btn="${b.id}"><span class="m-qico">${b.icon}</span><span class="m-qbody"><b></b><small></small></span><i class="m-badge" hidden></i></button>`);
    btn.querySelector('b')!.textContent = b.label;
    btn.addEventListener('click', () => {
      unlockAudio();
      haptic.light();
      b.onClick();
    });
    quick.appendChild(btn);
    quick.hidden = false;
  }
  const cards = home.querySelector('.m-cards')!;
  if (cfg.levels) {
    cards.appendChild(
      el(`<button class="m-card m-card-main" data-act="play-level"><span class="m-card-ico solid">${ICON.star}</span><span class="m-card-body"><b data-level-title></b><small data-level-sub></small></span><span class="m-go">${ICON.play}</span></button>`),
    );
  }
  if (cfg.endless) {
    cards.appendChild(
      el(`<button class="m-card ${cfg.levels ? '' : 'm-card-main'}" data-act="play-endless"><span class="m-card-ico">${ICON.inf}</span><span class="m-card-body"><b>${cfg.endless.title ?? tt('endless')}</b><small>${cfg.endless.subtitle ?? tt('play')}</small></span><span class="m-best">${ICON.trophy}<b data-best></b></span></button>`),
    );
  }
  root.appendChild(home);

  // ───────────────────────── sheets ─────────────────────────
  const sheet = el(`<div class="m-overlay" hidden><div class="m-sheet"></div></div>`);
  root.appendChild(sheet);
  const sheetBody = sheet.querySelector('.m-sheet') as HTMLElement;
  let onSheetClose: (() => void) | null = null;
  function openSheet(html: string | HTMLElement, onClose?: () => void, wide = false) {
    sheetBody.className = 'm-sheet' + (wide ? ' wide' : '');
    delete sheetBody.dataset.modal;
    sheetBody.innerHTML = '';
    if (typeof html === 'string') sheetBody.innerHTML = html;
    else sheetBody.appendChild(html);
    sheet.hidden = false;
    onSheetClose = onClose ?? null;
  }
  function closeSheet() {
    sheet.hidden = true;
    const cb = onSheetClose;
    onSheetClose = null;
    cb?.();
  }
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet && !sheetBody.dataset.modal) closeSheet();
  });

  const toastEl = el(`<div class="m-toast" hidden></div>`);
  root.appendChild(toastEl);
  let toastTimer = 0;
  function toast(text: string) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toastEl.hidden = true), 1800);
  }

  function chime() {
    [0, 2, 4, 7].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.16, volume: 0.35, delay: i * 0.06 }));
  }
  function coinBurst(n: number) {
    if (n <= 0) return;
    chime();
    haptic.success();
    toast(`+${n}`);
  }

  // ───────────────────────── refresh ─────────────────────────
  function refresh() {
    root.querySelectorAll('[data-coins]').forEach((b) => (b.textContent = String(P.data.coins)));
    if (cfg.levels) {
      const lvl = Math.min(P.data.unlocked, cfg.levels.count);
      home.querySelector('[data-level-title]')!.textContent = tt('level', { n: lvl });
      home.querySelector('[data-level-sub]')!.textContent = `${P.totalStars()} / ${cfg.levels.count * 3} ★`;
    }
    const best = home.querySelector('[data-best]');
    if (best) best.textContent = String(P.data.best);
    const ms = P.missions();
    const open = ms.find((m) => !m.claimed);
    const strip = home.querySelector('.m-strip') as HTMLElement;
    strip.hidden = !open;
    if (open) {
      home.querySelector('[data-strip-text]')!.textContent = `${cfg.missionText(open.id, open.target)}  ${open.progress}/${open.target}`;
      (home.querySelector('[data-strip-bar]') as HTMLElement).style.width = `${(open.progress / open.target) * 100}%`;
    }
    const claimable = P.claimableMissions();
    (home.querySelector('[data-strip-badge]') as HTMLElement).hidden = claimable === 0;
    const mb = home.querySelector('[data-badge-missions]') as HTMLElement;
    mb.hidden = claimable === 0;
    mb.textContent = String(claimable);
    (home.querySelector('[data-badge-daily]') as HTMLElement).hidden = !P.dailyClaimable();
    for (const b of cfg.homeButtons ?? []) {
      const btn = quick.querySelector(`[data-home-btn="${b.id}"]`)!;
      const sub = btn.querySelector('small') as HTMLElement;
      sub.textContent = b.sub?.() ?? '';
      sub.hidden = !sub.textContent;
      const badge = btn.querySelector('.m-badge') as HTMLElement;
      const v = b.badge?.();
      badge.hidden = v === null || v === undefined || v === '' || v === 0;
      badge.textContent = badge.hidden ? '' : String(v);
    }
  }
  P.onChange(refresh);

  // ───────────────────────── level map ─────────────────────────
  function openMap() {
    if (!cfg.levels) return;
    const wrap = el(`<div><h2>${tt('levels')}</h2><p class="m-note">${ICON.star} ${P.totalStars()} / ${cfg.levels.count * 3} · ${tt('mapNote')}</p><div class="m-grid"></div><button class="m-btn ghost" data-close>${tt('close')}</button></div>`);
    const grid = wrap.querySelector('.m-grid')!;
    for (let n = 1; n <= cfg.levels.count; n++) {
      const locked = n > P.data.unlocked;
      const stars = P.data.stars[n - 1] ?? 0;
      const head = cfg.levels.section?.(n);
      if (head) {
        head.classList.add('m-section');
        grid.appendChild(head);
      }
      const b = el(
        `<button class="m-lvl ${locked ? 'locked' : ''} ${n === P.data.unlocked ? 'current' : ''} ${cfg.levels.tag?.(n) ?? ''}">${locked ? ICON.lock : `<b>${n}</b><span class="m-lvl-stars">${[1, 2, 3].map((s) => `<i class="${s <= stars ? 'on' : ''}">${ICON.star}</i>`).join('')}</span>`}</button>`,
      );
      if (!locked)
        b.addEventListener('click', () => {
          closeSheet();
          startLevel(n);
        });
      grid.appendChild(b);
    }
    wrap.querySelector('[data-close]')!.addEventListener('click', closeSheet);
    openSheet(wrap, undefined, true);
    (grid.querySelector('.current') as HTMLElement | null)?.scrollIntoView({ block: 'center' });
  }

  // ───────────────────────── missions ─────────────────────────
  function openMissions() {
    const wrap = el(`<div><h2>${tt('missionsTitle')}</h2><p class="m-note">${tt('missionsNote')}</p><div class="m-list"></div><button class="m-btn ghost" data-close>${tt('close')}</button></div>`);
    const list = wrap.querySelector('.m-list')!;
    const render = () => {
      list.innerHTML = '';
      const ms = P.missions();
      ms.forEach((m, i) => {
        const done = m.progress >= m.target;
        const row = el(`<div class="m-mission ${m.claimed ? 'claimed' : ''}">
          <div class="m-mission-body"><b></b><span class="m-bar"><i style="width:${(m.progress / m.target) * 100}%"></i></span><small>${m.progress}/${m.target}</small></div>
          <button class="m-btn small" ${done && !m.claimed ? '' : 'disabled'}>${m.claimed ? tt('claimed') : `${ICON.coin}${m.reward}`}</button></div>`);
        row.querySelector('b')!.textContent = cfg.missionText(m.id, m.target);
        row.querySelector('button')!.addEventListener('click', () => {
          coinBurst(P.claimMission(i));
          track('mission_claim', { mission: m.id });
          render();
        });
        list.appendChild(row);
      });
      if (ms.every((m) => m.claimed)) list.appendChild(el(`<p class="m-note">${tt('allMissions')}</p>`));
    };
    render();
    wrap.querySelector('[data-close]')!.addEventListener('click', closeSheet);
    openSheet(wrap);
  }

  // ───────────────────────── daily ─────────────────────────
  function openDaily() {
    const idx = P.dailyIndex();
    const can = P.dailyClaimable();
    const wrap = el(`<div><h2>${tt('dailyTitle')}</h2><p class="m-note">${tt('dailyNote')}</p><div class="m-days"></div><button class="m-btn" data-claim ${can ? '' : 'disabled'}>${can ? `${tt('claim')} ${ICON.coin}${DAILY_REWARDS[idx]}` : tt('dailyDone')}</button><button class="m-btn ghost" data-close>${tt('close')}</button></div>`);
    const days = wrap.querySelector('.m-days')!;
    DAILY_REWARDS.forEach((r, i) => {
      const state = i < idx || (!can && i === idx) ? 'done' : i === idx ? 'today' : '';
      days.appendChild(el(`<div class="m-day ${state} ${i === 6 ? 'big' : ''}"><small>${tt('day', { n: i + 1 })}</small>${ICON.coin}<b>${r}</b></div>`));
    });
    wrap.querySelector('[data-claim]')!.addEventListener('click', () => {
      const got = P.claimDaily();
      if (got) {
        coinBurst(got);
        track('daily_claim', { day: idx + 1 });
      }
      openDaily();
    });
    wrap.querySelector('[data-close]')!.addEventListener('click', closeSheet);
    openSheet(wrap);
  }

  // ───────────────────────── shop ─────────────────────────
  async function buy(id: ProductId) {
    if (!storeAvailable()) return toast(tt('unavailable'));
    if (!(await purchase(id))) return;
    if (id === 'remove_ads' || id === 'starter_pack') {
      P.data.noAds = true;
      setNoAds(true);
      setAdsRemoved(true);
    }
    if (id === 'starter_pack') {
      P.data.starterPack = true;
      P.addCoins(STARTER_PACK_COINS);
    } else if (id === 'coins_small' || id === 'coins_large') {
      P.addCoins(COIN_PACKS[id]);
    } else P.save();
    track('iap', { product: id });
    cfg.onPurchase?.(id);
    coinBurst(1);
    toast(tt('thanks'));
  }

  function openShop(tab: 'skins' | 'coins' = 'skins') {
    const wrap = el(`<div><h2>${tt('shop')}</h2><div class="m-tabs"><button data-tab="skins">${tt('skins')}</button><button data-tab="coins">${tt('coins')}</button></div><div class="m-shop-body"></div><button class="m-btn ghost" data-close>${tt('close')}</button></div>`);
    const body = wrap.querySelector('.m-shop-body')!;
    const render = (which: 'skins' | 'coins') => {
      wrap.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.tab === which));
      body.innerHTML = '';
      if (which === 'skins') {
        const grid = el(`<div class="m-skins"></div>`);
        for (const s of cfg.skins) {
          const owned = P.owns(s.id);
          const using = P.data.skin === s.id;
          const card = el(`<button class="m-skin ${using ? 'using' : ''}"><span class="m-swatch"></span><b></b><small>${using ? tt('equipped') : owned ? tt('equip') : s.price === 0 ? tt('free') : `${ICON.coin}${s.price}`}</small></button>`);
          (card.querySelector('.m-swatch') as HTMLElement).style.background = s.swatch;
          card.querySelector('b')!.textContent = s.name;
          card.addEventListener('click', () => {
            if (P.owns(s.id)) P.equip(s.id);
            else if (P.spend(s.price)) {
              P.unlockSkin(s.id);
              toast(tt('bought'));
              chime();
              track('skin_buy', { skin: s.id });
            } else return toast(tt('notEnough'));
            cfg.onSkin?.(s.id);
            P.save(); // notify listeners again now that the game has applied the skin
            haptic.light();
            render('skins');
          });
          grid.appendChild(card);
        }
        body.appendChild(grid);
      } else {
        const list = el(`<div class="m-list"></div>`);
        const left = P.adCoinsLeft();
        const free = el(`<div class="m-offer"><span class="m-offer-ico">${ICON.ad}</span><span class="m-offer-body"><b>${ICON.coin}${AD_COINS} ${tt('free')}</b><small>${tt('left', { n: left })}</small></span><button class="m-btn small" ${left > 0 && rewardedAvailable() ? '' : 'disabled'}>${tt('watch')}</button></div>`);
        free.querySelector('button')!.addEventListener('click', async () => {
          if (await showRewarded('shop_coins')) {
            P.grantAdCoins();
            coinBurst(AD_COINS);
          }
          render('coins');
        });
        list.appendChild(free);
        const offers: [ProductId, string, string, boolean][] = [
          ['starter_pack', tt('starter'), tt('starterSub', { n: STARTER_PACK_COINS }), P.data.starterPack],
          ['remove_ads', tt('removeAds'), tt('removeAdsSub'), P.data.noAds],
          ['coins_small', tt('small'), `${COIN_PACKS.coins_small}`, false],
          ['coins_large', tt('large'), `${COIN_PACKS.coins_large}`, false],
        ];
        for (const [id, name, sub, owned] of offers) {
          const row = el(`<div class="m-offer"><span class="m-offer-ico">${id.startsWith('coins') ? ICON.coin : id === 'remove_ads' ? ICON.ad : ICON.gift}</span><span class="m-offer-body"><b></b><small></small></span><button class="m-btn small" ${owned ? 'disabled' : ''}>${owned ? tt('owned') : priceOf(id)}</button></div>`);
          row.querySelector('b')!.textContent = name;
          row.querySelector('small')!.textContent = sub;
          row.querySelector('button')!.addEventListener('click', async () => {
            await buy(id);
            render('coins');
          });
          list.appendChild(row);
        }
        body.appendChild(list);
      }
    };
    wrap.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => render((b as HTMLElement).dataset.tab as 'skins' | 'coins')));
    wrap.querySelector('[data-close]')!.addEventListener('click', closeSheet);
    render(tab);
    openSheet(wrap, undefined, true);
  }

  // ───────────────────────── settings ─────────────────────────
  function openSettings(onClose?: () => void) {
    const s = cfg.settings;
    const wrap = el(`<div><h2>${tt('settings')}</h2>
      <label class="m-row"><span>${tt('sound')}</span><input type="checkbox" class="m-switch" data-k="sound" ${s.sound ? 'checked' : ''}></label>
      <label class="m-row"><span>${tt('vibration')}</span><input type="checkbox" class="m-switch" data-k="haptics" ${s.haptics ? 'checked' : ''}></label>
      <div data-extra></div>
      <button class="m-btn ghost" data-restore>${tt('restore')}</button>
      <button class="m-btn" data-close>${tt('close')}</button>
      <p class="m-foot"><a href="${cfg.privacyUrl}" target="_blank" rel="noopener">${tt('privacy')}</a> · v${cfg.version}</p></div>`);
    if (cfg.extraSettings) wrap.querySelector('[data-extra]')!.appendChild(cfg.extraSettings);
    wrap.querySelectorAll<HTMLInputElement>('[data-k]').forEach((inp) =>
      inp.addEventListener('change', () => {
        s[inp.dataset.k as 'sound' | 'haptics'] = inp.checked;
        cfg.onSettings(s);
        if (inp.dataset.k === 'haptics') haptic.medium();
      }),
    );
    wrap.querySelector('[data-restore]')!.addEventListener('click', async () => {
      const owned = await restorePurchases();
      if (owned.includes('remove_ads') || owned.includes('starter_pack')) {
        P.data.noAds = true;
        setNoAds(true);
        setAdsRemoved(true);
      }
      if (owned.includes('starter_pack')) P.data.starterPack = true;
      P.save();
      toast(tt('restored'));
    });
    wrap.querySelector('[data-close]')!.addEventListener('click', closeSheet);
    openSheet(wrap, onClose);
  }

  // ───────────────────────── navigation ─────────────────────────
  function startLevel(n: number) {
    if (cfg.levels!.canPlay && !cfg.levels!.canPlay(n)) return;
    hideHome();
    cfg.levels!.play(n);
  }
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!btn) return;
    unlockAudio();
    haptic.light();
    switch (btn.dataset.act) {
      case 'play-level':
        return startLevel(Math.min(P.data.unlocked, cfg.levels!.count));
      case 'play-endless':
        hideHome();
        return cfg.endless!.play();
      case 'map':
        return openMap();
      case 'missions':
        return openMissions();
      case 'daily':
        return openDaily();
      case 'shop':
        return openShop('skins');
      case 'shop-coins':
        return openShop('coins');
      case 'settings':
        return openSettings();
    }
  });

  function showHome() {
    closeSheet();
    refresh();
    home.hidden = false;
    // Only if the player is still on the home screen (they may already have tapped Play).
    if (P.dailyClaimable() && !P.data.firstRun) setTimeout(() => !home.hidden && sheet.hidden && openDaily(), 350);
    track('home');
  }
  function hideHome() {
    home.hidden = true;
  }

  // ───────────────────────── results ─────────────────────────
  /** Puts the game's extra content after `anchor` and its buttons next to Menu. */
  function addExtras(wrap: HTMLElement, x: ResultExtras, anchor: Element) {
    if (x.extra) anchor.after(x.extra);
    if (!x.buttons?.length) return;
    const menu = wrap.querySelector<HTMLElement>('[data-menu]')!;
    const row = el(`<div class="m-pair"></div>`);
    menu.replaceWith(row);
    for (const b of x.buttons) {
      const btn = el(`<button class="m-btn ${b.cls ?? 'ghost'}">${b.icon ?? ''}<span></span></button>`);
      if (b.id) btn.dataset.btn = b.id;
      btn.querySelector('span')!.textContent = b.label;
      btn.addEventListener('click', () => {
        if (!b.keepOpen) {
          onSheetClose = null;
          closeSheet();
        }
        b.onClick();
      });
      row.appendChild(btn);
    }
    row.appendChild(menu);
  }
  function maybeInterstitial(level: number) {
    if (cfg.interstitial ? cfg.interstitial.afterWin(level) : level > 4) return interstitialMoment('level_next', cfg.interstitial ? 60 : 120);
  }
  /** Continue buttons: rewarded ad (first continue) and/or coins; tracks continue_offer/accept. */
  function continueButtons(wrap: HTMLElement, offer: ContinueOffer, level: number, onContinue: () => void) {
    if (offer.ad) track('continue_offer', { kind: 'ad', level });
    if (offer.coins) track('continue_offer', { kind: 'coins', level, price: offer.coins });
    wrap.querySelector('[data-cont-ad]')?.addEventListener('click', async () => {
      if (!(await showRewarded('continue'))) return;
      track('continue_accept', { kind: 'ad', level });
      onSheetClose = null;
      closeSheet();
      onContinue();
    });
    wrap.querySelector('[data-cont-coins]')?.addEventListener('click', () => {
      if (!P.spend(offer.coins!)) return toast(tt('notEnough'));
      track('continue_accept', { kind: 'coins', level, price: offer.coins! });
      onSheetClose = null;
      closeSheet();
      onContinue();
    });
  }
  const continueHtml = (offer: ContinueOffer) =>
    `${offer.ad ? `<button class="m-btn alt" data-cont-ad>${ICON.ad} ${tt('contAd')}</button>` : ''}${offer.coins ? `<button class="m-btn ${offer.ad ? 'ghost' : 'alt'}" data-cont-coins>${tt('cont')} · ${ICON.coin}${offer.coins}</button>` : ''}`;

  /**
   * Level win: stars, coin reward with optional x2 video, next / menu. `level: 0` (daily puzzle,
   * events) pays the coins without touching the level map or the level/star missions.
   */
  function showWin(o: { level: number; stars: number; coins: number; title?: string; eyebrow?: string; onNext: () => void; onMenu?: () => void } & ResultExtras) {
    if (P.data.firstRun) P.finishFirstRun();
    if (o.level > 0) {
      const rec = P.recordLevel(o.level, o.stars);
      P.progress('levels');
      if (rec.newStars) P.progress('stars', rec.newStars);
      if (o.stars === 3) P.progress('perfect');
    }
    P.addCoins(o.coins);
    const wrap = el(`<div class="m-result"><p class="m-eyebrow"></p><h2></h2>
      <div class="m-stars">${[1, 2, 3].map((s) => `<i class="${s <= o.stars ? 'on' : ''}" style="animation-delay:${s * 150}ms">${ICON.star}</i>`).join('')}</div>
      <p class="m-reward">${ICON.coin}<b data-reward>+${o.coins}</b></p>
      <button class="m-btn" data-next>${tt('next')}</button>
      <button class="m-btn alt" data-double ${rewardedAvailable() ? '' : 'hidden'}>${ICON.ad} ${tt('double')}</button>
      <button class="m-btn ghost" data-menu>${tt('menu')}</button></div>`);
    wrap.querySelector('.m-eyebrow')!.textContent = o.eyebrow ?? (o.level > 0 ? tt('level', { n: o.level }) : '');
    wrap.querySelector('h2')!.textContent = o.title ?? tt('win');
    addExtras(wrap, o, wrap.querySelector('.m-reward')!);
    wrap.querySelector('[data-next]')!.addEventListener('click', async () => {
      closeSheet();
      o.onNext();
      await maybeInterstitial(o.level);
    });
    wrap.querySelector('[data-double]')!.addEventListener('click', async (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      b.disabled = true;
      if (await showRewarded('double_coins')) {
        P.addCoins(o.coins);
        wrap.querySelector('[data-reward]')!.textContent = `+${o.coins * 2}`;
        coinBurst(o.coins);
      }
      b.hidden = true;
    });
    wrap.querySelector('[data-menu]')!.addEventListener('click', () => {
      closeSheet();
      o.onMenu?.();
      showHome();
    });
    chime();
    haptic.success();
    openSheet(wrap);
    sheetBody.dataset.modal = '1';
  }

  /** Endless game over: score/best, continue (coins with rising price, or video), retry / menu. */
  function showLose(o: {
    score: number;
    coins: number;
    label?: string;
    continuesUsed: number;
    canContinue: boolean;
    /** Coin price per continue (index = continues already used). Default 100 / 200 / 400. */
    continuePrices?: number[];
    onContinue?: () => void;
    onRetry: () => void;
    onMenu?: () => void;
  } & ResultExtras) {
    if (P.data.firstRun) P.finishFirstRun();
    const isBest = P.recordBest(o.score);
    P.addCoins(o.coins);
    P.progress('games');
    const price = (o.continuePrices ?? [100, 200, 400])[o.continuesUsed] ?? 0;
    const wrap = el(`<div class="m-result"><p class="m-eyebrow">${isBest ? tt('newBest') : o.label ?? tt('over')}</p>
      <div class="m-score">${o.score}</div>${isBest ? '' : `<p class="m-note">${ICON.trophy} ${tt('best')} ${P.data.best}</p>`}
      ${o.coins ? `<p class="m-reward">${ICON.coin}<b>+${o.coins}</b></p>` : ''}
      ${o.canContinue && price ? `<button class="m-btn alt" data-cont-ad>${ICON.ad} ${tt('contAd')}</button><button class="m-btn ghost" data-cont-coins>${tt('cont')} · ${ICON.coin}${price}</button>` : ''}
      <button class="m-btn" data-retry>${tt('retry')}</button>
      <button class="m-btn ghost" data-menu>${tt('menu')}</button></div>`);
    addExtras(wrap, o, wrap.querySelector('.m-score')!);
    wrap.querySelector('[data-cont-ad]')?.addEventListener('click', async () => {
      if (!(await showRewarded('continue'))) return;
      closeSheet();
      o.onContinue?.();
    });
    wrap.querySelector('[data-cont-coins]')?.addEventListener('click', () => {
      if (!P.spend(price)) return toast(tt('notEnough'));
      closeSheet();
      o.onContinue?.();
    });
    wrap.querySelector('[data-retry]')!.addEventListener('click', async () => {
      closeSheet();
      o.onRetry();
      if (cfg.interstitial) cfg.interstitial.afterLoss();
      else await interstitialMoment('retry');
    });
    wrap.querySelector('[data-menu]')!.addEventListener('click', () => {
      closeSheet();
      o.onMenu?.();
      showHome();
    });
    if (isBest) haptic.success();
    openSheet(wrap);
    sheetBody.dataset.modal = '1';
  }

  /**
   * Level failed (out of time, hearts, moves…): retry / menu, with an optional paid continue.
   * Unlike showLose it never touches the endless best score.
   */
  function showFail(
    o: {
      level: number;
      reason?: string;
      continuesUsed?: number;
      /** Continue pricing (retention `continueOffer`); default: video or 100 / 200 / 400 coins. */
      offer?: ContinueOffer;
      /** Attempt number of this level (analytics). */
      attempt?: number;
      onContinue?: () => void;
      onRetry: () => void;
      onMenu?: () => void;
    } & ResultExtras,
  ) {
    const price = o.onContinue ? ([100, 200, 400][o.continuesUsed ?? 0] ?? 0) : 0;
    const offer: ContinueOffer = o.onContinue ? (o.offer ?? { ad: !!price, coins: price || null }) : { ad: false, coins: null };
    const wrap = el(`<div class="m-result"><p class="m-eyebrow">${tt('level', { n: o.level })}</p><h2></h2>
      ${continueHtml(offer)}
      <button class="m-btn" data-retry>${tt('retry')}</button>
      <button class="m-btn ghost" data-menu>${tt('menu')}</button></div>`);
    wrap.querySelector('h2')!.textContent = o.reason ?? tt('over');
    addExtras(wrap, o, wrap.querySelector('h2')!);
    if (o.onContinue) continueButtons(wrap, offer, o.level, o.onContinue);
    cfg.interstitial?.afterLoss();
    wrap.querySelector('[data-retry]')!.addEventListener('click', () => {
      closeSheet();
      o.onRetry();
    });
    wrap.querySelector('[data-menu]')!.addEventListener('click', () => {
      closeSheet();
      o.onMenu?.();
      showHome();
    });
    haptic.error();
    track('level_fail', { level: o.level, ...(o.attempt ? { attempt: o.attempt } : {}) });
    openSheet(wrap);
    sheetBody.dataset.modal = '1';
  }

  function showPause(o: { onResume: () => void; onRestart?: () => void; onMenu?: () => void }) {
    const wrap = el(`<div><h2>${tt('paused')}</h2>
      <button class="m-btn" data-resume>${tt('resume')}</button>
      ${o.onRestart ? `<button class="m-btn ghost" data-restart>${tt('restart')}</button>` : ''}
      <button class="m-btn ghost" data-settings>${tt('settings')}</button>
      <button class="m-btn ghost" data-menu>${tt('menu')}</button></div>`);
    wrap.querySelector('[data-resume]')!.addEventListener('click', closeSheet);
    wrap.querySelector('[data-restart]')?.addEventListener('click', () => {
      onSheetClose = null;
      closeSheet();
      o.onRestart?.();
    });
    wrap.querySelector('[data-settings]')!.addEventListener('click', () => openSettings(o.onResume));
    wrap.querySelector('[data-menu]')!.addEventListener('click', () => {
      onSheetClose = null;
      closeSheet();
      o.onMenu?.();
      showHome();
    });
    openSheet(wrap, o.onResume);
  }

  if (P.data.noAds) {
    setNoAds(true);
    setAdsRemoved(true);
  }

  /** Updates the endless/second mode card after creation (title, subtitle, badge markup). */
  function setEndless(o: { title?: string; subtitle?: string; badge?: string; cls?: string }) {
    const card = home.querySelector<HTMLElement>('[data-act="play-endless"]');
    if (!card) return;
    if (o.title !== undefined) card.querySelector('.m-card-body b')!.textContent = o.title;
    if (o.subtitle !== undefined) card.querySelector('.m-card-body small')!.textContent = o.subtitle;
    if (o.badge !== undefined) card.querySelector('.m-best')!.innerHTML = o.badge;
    if (o.cls !== undefined) card.className = `m-card ${cfg.levels ? '' : 'm-card-main'} ${o.cls}`;
  }

  return {
    showHome,
    hideHome,
    setEndless,
    /** Opens any content in the kit sheet (retention screens, game sheets). */
    openSheet(content: HTMLElement, o: SheetOptions = {}) {
      openSheet(content, o.onClose, o.wide);
      if (o.modal) sheetBody.dataset.modal = '1';
    },
    closeSheet,
    get sheetOpen() {
      return !sheet.hidden;
    },
    /** True while the home screen is up. */
    get onHome() {
      return !home.hidden;
    },
    showWin,
    showLose,
    showFail,
    showPause,
    openShop,
    openSettings,
    toast,
    refresh,
    /** True while any meta screen covers the game (games pause input/time while this is true). */
    get covering() {
      return !home.hidden || !sheet.hidden;
    },
    /** Android back: closes the top sheet, else returns false. */
    back(): boolean {
      if (!sheet.hidden && !sheetBody.dataset.modal) {
        closeSheet();
        return true;
      }
      return false;
    },
  };
}

export type Meta = ReturnType<typeof createMeta>;
