/**
 * Kovan — pure merge-idle economy. No DOM, no timers: every function takes the state and
 * (where time matters) an explicit timestamp, so the whole economy is unit-testable.
 *
 * Cells: 0 = empty, n > 0 = bee of level n, n < 0 = gift box holding a bee of level -n.
 */
export const MAX_LEVEL = 20;
/** Hive sizes as [cols, rows]; each expansion moves to the next one. */
export const GRIDS: [number, number][] = [
  [4, 5],
  [5, 5],
  [5, 6],
  [6, 6],
  [6, 7],
];
export const EXPAND_COSTS = [1_500, 25_000, 400_000, 6_000_000];
export const OFFLINE_CAP_SEC = 4 * 3600;
/** Share of the live rate earned while away (the x2 video doubles it). */
export const OFFLINE_RATE = 0.5;
export const SPAWN_BASE = 8;
export const SPAWN_GROWTH = 2;
/** A golden egg (bought with meta coins) hatches this many levels above the spawn level. */
export const GOLDEN_BONUS = 3;
export const GOLDEN_PRICE = 40;

export interface State {
  honey: number;
  cells: number[];
  expansion: number;
  spawnLevel: number;
  spawns: number;
  best: number;
  merges: number;
  lastSeen: number;
}

export function newState(now = 0): State {
  const [c, r] = GRIDS[0];
  const cells = Array<number>(c * r).fill(0);
  cells[7] = 1;
  cells[8] = 1;
  return { honey: 20, cells, expansion: 0, spawnLevel: 1, spawns: 0, best: 1, merges: 0, lastSeen: now };
}

export const gridOf = (s: Pick<State, 'expansion'>) => GRIDS[s.expansion];

/** Honey per second of one bee: ×2.5 per level, so a merge is always worth it. */
export const prodOf = (level: number) => (level <= 0 ? 0 : 0.2 * Math.pow(2.2, level - 1));

/** Every expansion also makes the whole hive 25% more productive. */
export const hiveBonus = (s: Pick<State, 'expansion'>) => 1 + 0.25 * s.expansion;

export function rate(s: State): number {
  let r = 0;
  for (const c of s.cells) if (c > 0) r += prodOf(c);
  return r * hiveBonus(s);
}

export function tick(s: State, dt: number): number {
  const gain = rate(s) * Math.max(0, dt);
  s.honey += gain;
  return gain;
}

export const spawnCost = (s: State) => Math.round(SPAWN_BASE * Math.pow(1 + s.spawns / 20, SPAWN_GROWTH));

export const freeCells = (s: State) => s.cells.reduce<number[]>((a, c, i) => (c === 0 ? (a.push(i), a) : a), []);

function place(s: State, level: number, rng: () => number): number {
  const free = freeCells(s);
  if (!free.length) return -1;
  const i = free[Math.floor(rng() * free.length)];
  s.cells[i] = level;
  return i;
}

/** Buys an egg: a bee of the current spawn level in a random free cell. Returns the cell or -1. */
export function spawn(s: State, rng: () => number = Math.random): number {
  const cost = spawnCost(s);
  if (s.honey < cost || !freeCells(s).length) return -1;
  s.honey -= cost;
  s.spawns++;
  return place(s, s.spawnLevel, rng);
}

/** Golden egg (paid elsewhere with meta coins): free, higher-level bee. */
export function goldenEgg(s: State, rng: () => number = Math.random): number {
  return place(s, Math.min(MAX_LEVEL - 1, s.spawnLevel + GOLDEN_BONUS), rng);
}

export const canMerge = (s: State, a: number, b: number) =>
  a !== b && s.cells[a] > 0 && s.cells[a] === s.cells[b] && s.cells[a] < MAX_LEVEL;

export interface MergeResult {
  level: number;
  newBest: boolean;
  /** Cell where the reward gift box landed, or -1 (hive full / no new best). */
  gift: number;
}

/** Drops bee `a` onto bee `b`. Equal levels merge into `b`; otherwise null. */
export function merge(s: State, a: number, b: number, rng: () => number = Math.random): MergeResult | null {
  if (!canMerge(s, a, b)) return null;
  const level = s.cells[b] + 1;
  s.cells[a] = 0;
  s.cells[b] = level;
  s.merges++;
  const newBest = level > s.best;
  let gift = -1;
  if (newBest) {
    s.best = level;
    gift = place(s, -giftLevel(s, level), rng);
  }
  return { level, newBest, gift };
}

export const giftLevel = (s: State, best: number) => Math.max(s.spawnLevel, best - 3);

/** Moves a bee to an empty cell, or swaps two different bees. */
export function move(s: State, a: number, b: number): boolean {
  if (a === b || s.cells[a] <= 0 || s.cells[b] < 0 || canMerge(s, a, b)) return false;
  [s.cells[a], s.cells[b]] = [s.cells[b], s.cells[a]];
  return true;
}

export function openGift(s: State, i: number): number {
  if (s.cells[i] >= 0) return 0;
  s.cells[i] = -s.cells[i];
  return s.cells[i];
}

// ───────── upgrades ─────────
export const expandCost = (s: State) => EXPAND_COSTS[s.expansion] ?? Infinity;

export function expand(s: State): boolean {
  const cost = expandCost(s);
  if (s.honey < cost) return false;
  const [oc, or] = GRIDS[s.expansion];
  const [nc, nr] = GRIDS[s.expansion + 1];
  const cells = Array<number>(nc * nr).fill(0);
  for (let r = 0; r < or; r++) for (let c = 0; c < oc; c++) cells[r * nc + c] = s.cells[r * oc + c];
  s.honey -= cost;
  s.cells = cells;
  s.expansion++;
  return true;
}

/** Spawn level can go up to 3 below the best bee ever made. */
export const spawnUpCost = (s: State) =>
  s.spawnLevel + 3 > s.best ? Infinity : Math.round(3_000 * Math.pow(30, s.spawnLevel - 1));

export function upgradeSpawn(s: State): boolean {
  const cost = spawnUpCost(s);
  if (s.honey < cost) return false;
  s.honey -= cost;
  s.spawnLevel++;
  return true;
}

// ───────── offline ─────────
export interface Offline {
  seconds: number;
  honey: number;
}

export function offlineEarnings(s: State, now: number): Offline {
  const seconds = Math.min(OFFLINE_CAP_SEC, Math.max(0, (now - s.lastSeen) / 1000));
  return { seconds, honey: rate(s) * seconds * OFFLINE_RATE };
}

// ───────── save / load ─────────
export function sanitize(raw: unknown, now: number): State {
  const d = newState(now);
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const n = (v: unknown, def: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def;
  const expansion = Math.floor(n(o.expansion, 0, 0, GRIDS.length - 1));
  const [c, r] = GRIDS[expansion];
  const cells = Array<number>(c * r).fill(0);
  if (Array.isArray(o.cells))
    for (let i = 0; i < cells.length; i++) cells[i] = Math.trunc(n(o.cells[i], 0, -MAX_LEVEL, MAX_LEVEL));
  return {
    honey: n(o.honey, d.honey, 0, 1e300),
    cells,
    expansion,
    spawnLevel: Math.floor(n(o.spawnLevel, 1, 1, MAX_LEVEL - 4)),
    spawns: Math.floor(n(o.spawns, 0, 0, 1e6)),
    best: Math.floor(n(o.best, 1, 1, MAX_LEVEL)),
    merges: Math.floor(n(o.merges, 0, 0, 1e9)),
    lastSeen: n(o.lastSeen, now, 0, now),
  };
}

// ───────── simple greedy player for balancing ─────────
/** One "player action" step: merge any pair, open gifts, buy upgrades, else buy an egg. */
export function autoPlay(s: State, rng: () => number = Math.random): string {
  const gift = s.cells.findIndex((c) => c < 0);
  if (gift >= 0) return openGift(s, gift), 'gift';
  for (let i = 0; i < s.cells.length; i++) {
    if (s.cells[i] <= 0) continue;
    const j = s.cells.findIndex((c, k) => k !== i && c === s.cells[i]);
    if (j >= 0 && merge(s, i, j, rng)) return 'merge';
  }
  // save up for an expansion when the hive is getting full, or for a spawn upgrade within a minute's honey
  if (expandCost(s) <= s.honey + rate(s) * 60 || (freeCells(s).length <= 4 && expandCost(s) < Infinity))
    return expand(s) ? 'expand' : 'save';
  if (spawnUpCost(s) <= s.honey + rate(s) * 60) return upgradeSpawn(s) ? 'upgrade' : 'save';
  if (spawn(s, rng) >= 0) return 'spawn';
  return 'wait';
}

export const BEE_NAMES = {
  en: ['Larva', 'Worker', 'Forager', 'Nurse', 'Builder', 'Guard', 'Scout', 'Drone', 'Fanner', 'Harvester',
    'Waxsmith', 'Pollen Knight', 'Nectar Sage', 'Comb Architect', 'Royal Guard', 'Sky Dancer', 'Amber Lord', 'Sun Bee', 'Golden Elder', 'Queen'],
  tr: ['Larva', 'İşçi', 'Toplayıcı', 'Bakıcı', 'Yapıcı', 'Muhafız', 'Kâşif', 'Erkek Arı', 'Yelpazeci', 'Hasatçı',
    'Mumcu', 'Polen Şövalyesi', 'Nektar Bilgesi', 'Petek Mimarı', 'Kraliyet Muhafızı', 'Gök Dansçısı', 'Kehribar Beyi', 'Güneş Arısı', 'Altın Bilge', 'Kraliçe'],
};
