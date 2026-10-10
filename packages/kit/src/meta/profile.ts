/**
 * Player profile shared by every game's meta layer: coins, level stars, endless best, daily
 * reward streak, daily missions, cosmetics, purchases. One JSON blob per game, validated field
 * by field on load so a missing or corrupt save falls back to defaults (never crashes).
 */
export interface MissionDef {
  id: string;
  /** Possible targets; one is picked when the mission is dealt. */
  targets: number[];
  reward: (target: number) => number;
}

export interface Mission {
  id: string;
  target: number;
  reward: number;
  progress: number;
  claimed: boolean;
}

export interface Profile {
  coins: number;
  stars: number[]; // index = level - 1, 0..3
  unlocked: number; // highest playable level
  best: number; // endless best
  dailyLast: string; // YYYY-MM-DD of last daily claim
  dailyStreak: number;
  missionsDay: string;
  missions: Mission[];
  owned: string[];
  skin: string;
  noAds: boolean;
  starterPack: boolean;
  adCoinsDay: string;
  adCoinsCount: number;
  firstRun: boolean;
}

export const DAILY_REWARDS = [20, 30, 40, 50, 60, 80, 150];
export const AD_COINS = 25;
export const AD_COINS_PER_DAY = 5;
export const STARTER_PACK_COINS = 500;
export const COIN_PACKS = { coins_small: 300, coins_large: 2000 } as const;

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yesterdayKey = () => dayKey(new Date(Date.now() - 86_400_000));

const num = (v: unknown, d: number, min = 0, max = 1e12) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : d;
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);

export interface ProfileOptions {
  game: string;
  /** 0 for games without a level mode. */
  levelCount?: number;
  missions: MissionDef[];
  defaultSkin: string;
  skinIds: string[];
  startCoins?: number;
  /** Deterministic RNG for tests; defaults to Math.random. */
  rng?: () => number;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

export function createProfile(opts: ProfileOptions) {
  const levelCount = opts.levelCount ?? 0;
  const key = `${opts.game}.profile`;
  const rng = opts.rng ?? Math.random;
  const storage = opts.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  const listeners = new Set<() => void>();

  const defaults = (): Profile => ({
    coins: opts.startCoins ?? 100,
    stars: Array(levelCount).fill(0),
    unlocked: 1,
    best: 0,
    dailyLast: '',
    dailyStreak: 0,
    missionsDay: '',
    missions: [],
    owned: [opts.defaultSkin],
    skin: opts.defaultSkin,
    noAds: false,
    starterPack: false,
    adCoinsDay: '',
    adCoinsCount: 0,
    firstRun: true,
  });

  const p = defaults();

  function load() {
    let raw: Record<string, unknown> | null = null;
    try {
      raw = JSON.parse(storage?.getItem(key) ?? 'null');
    } catch {
      raw = null;
    }
    if (!raw || typeof raw !== 'object') return;
    const d = defaults();
    p.coins = num(raw.coins, d.coins);
    p.stars = d.stars.map((_, i) => num(Array.isArray(raw!.stars) ? raw!.stars[i] : 0, 0, 0, 3));
    p.unlocked = num(raw.unlocked, 1, 1, Math.max(1, levelCount));
    p.best = num(raw.best, 0);
    p.dailyLast = str(raw.dailyLast, '');
    p.dailyStreak = num(raw.dailyStreak, 0);
    p.missionsDay = str(raw.missionsDay, '');
    p.missions = Array.isArray(raw.missions)
      ? (raw.missions as Mission[])
          .filter((m) => m && opts.missions.some((def) => def.id === m.id))
          .map((m) => ({ id: m.id, target: num(m.target, 1, 1), reward: num(m.reward, 20), progress: num(m.progress, 0), claimed: m.claimed === true }))
          .slice(0, 3)
      : [];
    const skins = new Set(opts.skinIds);
    p.owned = Array.isArray(raw.owned) ? (raw.owned as unknown[]).filter((s): s is string => typeof s === 'string' && skins.has(s)) : d.owned;
    if (!p.owned.includes(opts.defaultSkin)) p.owned.push(opts.defaultSkin);
    p.skin = p.owned.includes(raw.skin as string) ? (raw.skin as string) : opts.defaultSkin;
    p.noAds = raw.noAds === true;
    p.starterPack = raw.starterPack === true;
    p.adCoinsDay = str(raw.adCoinsDay, '');
    p.adCoinsCount = num(raw.adCoinsCount, 0, 0, 100);
    p.firstRun = raw.firstRun !== false;
  }

  function save() {
    try {
      storage?.setItem(key, JSON.stringify(p));
    } catch {
      /* storage blocked: keep playing in memory */
    }
    listeners.forEach((fn) => fn());
  }

  function dealMissions() {
    if (p.missionsDay === dayKey() && p.missions.length === 3) return;
    const pool = [...opts.missions];
    p.missions = [];
    while (p.missions.length < 3 && pool.length) {
      const def = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      const target = def.targets[Math.floor(rng() * def.targets.length)];
      p.missions.push({ id: def.id, target, reward: def.reward(target), progress: 0, claimed: false });
    }
    p.missionsDay = dayKey();
  }

  load();
  dealMissions();

  return {
    data: p,
    onChange(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    save,
    addCoins(n: number) {
      p.coins += Math.max(0, Math.floor(n));
      save();
    },
    spend(n: number): boolean {
      if (p.coins < n) return false;
      p.coins -= n;
      save();
      return true;
    },
    /** Records a finished level; returns how many new stars were earned. */
    recordLevel(level: number, stars: number): { newStars: number; firstClear: boolean } {
      const i = level - 1;
      const before = p.stars[i] ?? 0;
      const firstClear = before === 0;
      if (i >= 0 && i < p.stars.length) p.stars[i] = Math.max(before, Math.min(3, stars));
      if (level >= p.unlocked) p.unlocked = Math.min(levelCount, level + 1);
      save();
      return { newStars: Math.max(0, stars - before), firstClear };
    },
    totalStars: () => p.stars.reduce((a, b) => a + b, 0),
    recordBest(score: number): boolean {
      if (score <= p.best) return false;
      p.best = score;
      save();
      return true;
    },
    // daily reward
    dailyClaimable: () => p.dailyLast !== dayKey(),
    /** 0..6: which day of the 7-day calendar is next (missing a day restarts the streak). */
    dailyIndex(): number {
      const continuing = p.dailyLast === yesterdayKey() || p.dailyLast === dayKey();
      return continuing ? p.dailyStreak % DAILY_REWARDS.length : 0;
    },
    claimDaily(): number | null {
      if (p.dailyLast === dayKey()) return null;
      const continuing = p.dailyLast === yesterdayKey();
      const idx = continuing ? p.dailyStreak % DAILY_REWARDS.length : 0;
      p.dailyStreak = continuing ? p.dailyStreak + 1 : 1;
      p.dailyLast = dayKey();
      p.coins += DAILY_REWARDS[idx];
      save();
      return DAILY_REWARDS[idx];
    },
    // missions
    missions: () => (dealMissions(), p.missions),
    /** Games report events; matching missions advance. Returns true if one just completed. */
    progress(id: string, amount = 1): boolean {
      dealMissions();
      let completed = false;
      for (const m of p.missions) {
        if (m.id !== id || m.claimed || m.progress >= m.target) continue;
        m.progress = Math.min(m.target, m.progress + amount);
        if (m.progress >= m.target) completed = true;
      }
      save();
      return completed;
    },
    claimMission(i: number): number {
      const m = p.missions[i];
      if (!m || m.claimed || m.progress < m.target) return 0;
      m.claimed = true;
      p.coins += m.reward;
      save();
      return m.reward;
    },
    claimableMissions: () => p.missions.filter((m) => !m.claimed && m.progress >= m.target).length,
    // free coins via rewarded ad, capped per day
    adCoinsLeft(): number {
      return p.adCoinsDay === dayKey() ? Math.max(0, AD_COINS_PER_DAY - p.adCoinsCount) : AD_COINS_PER_DAY;
    },
    grantAdCoins() {
      if (p.adCoinsDay !== dayKey()) {
        p.adCoinsDay = dayKey();
        p.adCoinsCount = 0;
      }
      p.adCoinsCount++;
      p.coins += AD_COINS;
      save();
    },
    // cosmetics
    owns: (id: string) => p.owned.includes(id),
    unlockSkin(id: string) {
      if (!p.owned.includes(id)) p.owned.push(id);
      p.skin = id;
      save();
    },
    equip(id: string) {
      if (p.owned.includes(id)) {
        p.skin = id;
        save();
      }
    },
    finishFirstRun() {
      p.firstRun = false;
      save();
    },
  };
}

export type ProfileStore = ReturnType<typeof createProfile>;
