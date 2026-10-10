/**
 * Kervan — pure, deterministic idle economy. No DOM, no clocks: the caller passes dt/seconds.
 *
 * Each unlocked city has a caravan route. Its income/sec is
 *   BASE_RATE[i] * level * milestone(level) * camelFactor * speedFactor * reputation
 * Without a merchant the income piles up in the city's stash (capped at STASH_SECONDS of income)
 * and the player taps the city to collect it; with a merchant it flows straight into coins and
 * also keeps earning while the app is closed (offline, capped at OFFLINE_CAP_SEC).
 */

export const CITY_COUNT = 6;
export const BASE_RATE = [1, 10, 100, 1000, 10_000, 100_000];
export const UNLOCK_COST = [0, 1500, 1.2e5, 1.2e7, 1.5e9, 1.6e11];
export const PROD_COST = [15, 80, 1500, 30_000, 600_000, 1.2e7];
export const PROD_GROWTH = 1.15;
export const CAMEL_GROWTH = 2.4;
export const SPEED_GROWTH = 2.6;
export const MAX_CAMELS = 8;
export const MAX_SPEED = 8;
export const MILESTONES = [25, 50, 100, 200, 300, 400];
export const STASH_SECONDS = 60;
export const OFFLINE_CAP_SEC = 8 * 3600;
export const STAR_BONUS = 0.1;
export const STAR_UNIT = 1e10;
export const SAVE_VERSION = 1;

export type UpgradeKind = 'prod' | 'camel' | 'speed' | 'merchant';
export const UPGRADES: UpgradeKind[] = ['prod', 'camel', 'speed', 'merchant'];

export interface City {
  level: number;
  camels: number;
  speed: number;
  merchant: boolean;
  stash: number;
}

export interface State {
  v: number;
  coins: number;
  /** One entry per unlocked city, in route order. */
  cities: City[];
  /** Coins earned since the last New Era (drives reputation stars). */
  runEarned: number;
  totalEarned: number;
  stars: number;
  prestiges: number;
  /** Seconds played in this run (online + claimed offline). */
  runTime: number;
  /** Seconds of x2 income left (Bazaar boost, bought with meta gems). Counts down online and offline. */
  boost: number;
}

export const newCity = (): City => ({ level: 1, camels: 1, speed: 0, merchant: false, stash: 0 });

export function newState(): State {
  return { v: SAVE_VERSION, coins: 0, cities: [newCity()], runEarned: 0, totalEarned: 0, stars: 0, prestiges: 0, runTime: 0, boost: 0 };
}

export function milestoneMult(level: number): number {
  let m = 1;
  for (const t of MILESTONES) if (level >= t) m *= 2;
  return m;
}

/** Next level at which production doubles, or null past the last one. */
export function nextMilestone(level: number): number | null {
  return MILESTONES.find((t) => t > level) ?? null;
}

export const reputationMult = (stars: number) => 1 + STAR_BONUS * stars;

export const BOOST_MULT = 2;
/** Bazaar boost stacks up to this many seconds. */
export const BOOST_CAP_SEC = 4 * 3600;
export const boostMult = (s: State) => (s.boost > 0 ? BOOST_MULT : 1);

export function cityRate(s: State, i: number, c: City = s.cities[i]): number {
  if (!c) return 0;
  return BASE_RATE[i] * c.level * milestoneMult(c.level) * (1 + 0.5 * (c.camels - 1)) * (1 + 0.25 * c.speed) * reputationMult(s.stars) * boostMult(s);
}

export const totalRate = (s: State) => s.cities.reduce((a, _, i) => a + cityRate(s, i), 0);
export const idleRate = (s: State) => s.cities.reduce((a, c, i) => a + (c.merchant ? cityRate(s, i) : 0), 0);

export function upgradeCost(s: State, i: number, kind: UpgradeKind): number {
  const c = s.cities[i];
  const p = PROD_COST[i];
  switch (kind) {
    case 'prod':
      return Math.ceil(p * Math.pow(PROD_GROWTH, c.level - 1));
    case 'camel':
      return c.camels >= MAX_CAMELS ? Infinity : Math.ceil(p * 10 * Math.pow(CAMEL_GROWTH, c.camels - 1));
    case 'speed':
      return c.speed >= MAX_SPEED ? Infinity : Math.ceil(p * 25 * Math.pow(SPEED_GROWTH, c.speed));
    case 'merchant':
      return c.merchant ? Infinity : Math.ceil(p * 40);
  }
}

/** The city as it would be after buying `kind` once (for ROI and "+x/s" previews). */
export function applied(c: City, kind: UpgradeKind): City {
  const n = { ...c };
  if (kind === 'prod') n.level++;
  else if (kind === 'camel') n.camels++;
  else if (kind === 'speed') n.speed++;
  else n.merchant = true;
  return n;
}

export function canBuy(s: State, i: number, kind: UpgradeKind): boolean {
  return !!s.cities[i] && s.coins >= upgradeCost(s, i, kind);
}

export function buy(s: State, i: number, kind: UpgradeKind): boolean {
  if (!canBuy(s, i, kind)) return false;
  s.coins -= upgradeCost(s, i, kind);
  s.cities[i] = applied(s.cities[i], kind);
  return true;
}

export const nextUnlockCost = (s: State) => (s.cities.length < CITY_COUNT ? UNLOCK_COST[s.cities.length] : Infinity);

export function unlockNext(s: State): boolean {
  const cost = nextUnlockCost(s);
  if (s.coins < cost) return false;
  s.coins -= cost;
  s.cities.push(newCity());
  return true;
}

function earn(s: State, amount: number) {
  s.coins += amount;
  s.runEarned += amount;
  s.totalEarned += amount;
}

export const stashCap = (s: State, i: number) => cityRate(s, i) * STASH_SECONDS;

/** Advances the economy by `dt` seconds of active play. Returns coins credited directly (merchants). */
export function tick(s: State, dt: number): number {
  if (!(dt > 0)) return 0;
  let direct = 0;
  s.cities.forEach((c, i) => {
    const r = cityRate(s, i) * dt;
    if (c.merchant) direct += r;
    else c.stash = Math.min(c.stash + r, stashCap(s, i));
  });
  earn(s, direct);
  s.runTime += dt;
  s.boost = Math.max(0, s.boost - dt);
  return direct;
}

/** Instant bonus for a tap: one second of that city's income, at least 1 coin. */
export const tapBonus = (s: State, i: number) => Math.max(1, cityRate(s, i));

/** Tap a city: collect its stash plus the tap bonus. Returns the coins gained. */
export function tap(s: State, i: number): number {
  const c = s.cities[i];
  if (!c) return 0;
  const gain = c.stash + tapBonus(s, i);
  c.stash = 0;
  earn(s, gain);
  return gain;
}

/** What `sec` seconds away would earn: merchants only, capped at 8 h; boost time left doubles its share. Pure. */
export function offlineEarnings(s: State, sec: number): { coins: number; seconds: number } {
  const seconds = Math.min(Math.max(0, Number.isFinite(sec) ? sec : 0), OFFLINE_CAP_SEC);
  const base = idleRate(s) / boostMult(s);
  return { coins: base * (seconds + (BOOST_MULT - 1) * Math.min(s.boost, seconds)), seconds };
}

/** Credits offline earnings (times `mult`, e.g. 2 for the rewarded ad) and refills stashes. */
export function applyOffline(s: State, sec: number, mult = 1): number {
  const { coins, seconds } = offlineEarnings(s, sec);
  s.cities.forEach((c, i) => {
    if (!c.merchant) c.stash = Math.min(c.stash + cityRate(s, i) * seconds, stashCap(s, i));
  });
  earn(s, coins * mult);
  s.runTime += seconds;
  s.boost = Math.max(0, s.boost - seconds);
  return coins * mult;
}

/** Income per second without the Bazaar boost (all cities, tapped or idle). */
export const baseRate = (s: State) => totalRate(s) / boostMult(s);

/** Bazaar: `sec` seconds of full income (every city, unboosted) credited at once. Returns coins. */
export function instantIncome(s: State, sec: number): number {
  const gain = Math.max(1, baseRate(s) * Math.max(0, sec));
  earn(s, gain);
  return gain;
}

/** Bazaar: adds x2 income time (stacks, capped at BOOST_CAP_SEC). */
export function addBoost(s: State, sec: number) {
  s.boost = Math.min(BOOST_CAP_SEC, Math.max(0, s.boost) + Math.max(0, sec));
}

/** Reputation stars a New Era would grant right now. */
export const starsFor = (runEarned: number) => Math.floor(Math.sqrt(Math.max(0, runEarned) / STAR_UNIT));

export const canPrestige = (s: State) => s.cities.length >= CITY_COUNT && starsFor(s.runEarned) >= 1;

/** New Era: cities and coins reset, reputation stars stay forever. */
export function prestige(s: State): number {
  if (!canPrestige(s)) return 0;
  const gained = starsFor(s.runEarned);
  const keep = { stars: s.stars + gained, prestiges: s.prestiges + 1, totalEarned: s.totalEarned, boost: s.boost };
  Object.assign(s, newState(), keep);
  return gained;
}

const num = (v: unknown, def: number, min = 0, max = Number.MAX_VALUE) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;

/** Turns any stored value (old, partial, corrupt) into a valid State. Never throws. */
export function migrate(raw: unknown): State {
  const base = newState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const cities = Array.isArray(r.cities) ? r.cities.slice(0, CITY_COUNT) : [];
  const parsed: City[] = cities
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      level: Math.floor(num(c.level, 1, 1, 10_000)),
      camels: Math.floor(num(c.camels, 1, 1, MAX_CAMELS)),
      speed: Math.floor(num(c.speed, 0, 0, MAX_SPEED)),
      merchant: c.merchant === true,
      stash: num(c.stash, 0),
    }));
  return {
    v: SAVE_VERSION,
    coins: num(r.coins, 0),
    cities: parsed.length ? parsed : [newCity()],
    runEarned: num(r.runEarned, 0),
    totalEarned: num(r.totalEarned, 0),
    stars: Math.floor(num(r.stars, 0)),
    prestiges: Math.floor(num(r.prestiges, 0)),
    runTime: num(r.runTime, 0),
    boost: num(r.boost, 0, 0, BOOST_CAP_SEC),
  };
}

// ───────────── balance simulation (used by tests and documented in GAME.md) ─────────────

export interface SimResult {
  unlockAt: number[];
  prestigeAt: number | null;
  stars: number;
}

/**
 * A simple player: taps once a second (collecting every stash every 5 s) during the first
 * 10 minutes, then plays idle. Buys merchants first, unlocks the next city when affordable,
 * otherwise buys the best-ROI upgrade if it pays back before the next unlock would.
 */
export function simulate(maxSec: number, step = 1): SimResult {
  const s = newState();
  const unlockAt = [0];
  let prestigeAt: number | null = null;
  for (let t = 0; t < maxSec; t += step) {
    tick(s, step);
    if (t < 600) {
      const best = s.cities.reduce((b, _, i) => (cityRate(s, i) > cityRate(s, b) ? i : b), 0);
      tap(s, best);
      if (t % 5 === 0) s.cities.forEach((c, i) => c.stash > 0 && tap(s, i));
    }
    for (let guard = 0; guard < 50; guard++) {
      if (unlockNext(s)) {
        unlockAt.push(t);
        continue;
      }
      const m = s.cities.findIndex((c, i) => !c.merchant && canBuy(s, i, 'merchant'));
      if (m >= 0) {
        buy(s, m, 'merchant');
        continue;
      }
      const rate = Math.max(totalRate(s), 1e-9);
      const toUnlock = (nextUnlockCost(s) - s.coins) / rate;
      let bestI = -1;
      let bestK: UpgradeKind = 'prod';
      let bestPayback = Infinity;
      s.cities.forEach((c, i) => {
        for (const k of ['prod', 'camel', 'speed'] as UpgradeKind[]) {
          const cost = upgradeCost(s, i, k);
          const gain = cityRate(s, i, applied(c, k)) - cityRate(s, i);
          const payback = cost / gain;
          if (payback < bestPayback) [bestI, bestK, bestPayback] = [i, k, payback];
        }
      });
      if (bestI >= 0 && bestPayback < toUnlock && buy(s, bestI, bestK)) continue;
      break;
    }
    if (prestigeAt === null && canPrestige(s) && starsFor(s.runEarned) >= 10) prestigeAt = t;
  }
  return { unlockAt, prestigeAt, stars: starsFor(s.runEarned) };
}
