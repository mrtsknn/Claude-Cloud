/**
 * Kovan — pure merge-idle economy. No DOM, no timers: every function takes the state and
 * (where time matters) an explicit timestamp, so the whole economy is unit-testable.
 *
 * Cells: 0 = empty, n > 0 = bee of level n, n < 0 = gift box holding a bee of level -n.
 * The player owns one hive per unlocked world; every hive produces honey all the time,
 * eggs, gifts and golden eggs land in the active one.
 */
export const MAX_LEVEL = 30;
/** Hive sizes as [cols, rows]; each expansion moves to the next one. */
export const GRIDS: [number, number][] = [
  [4, 5],
  [5, 5],
  [5, 6],
  [6, 6],
  [6, 7],
];
/** Meadow expansion costs; later worlds multiply them by `WorldDef.costMul`. */
export const EXPAND_COSTS = [1_500, 25_000, 400_000, 6_000_000];
export const OFFLINE_CAP_SEC = 4 * 3600;
/** Share of the live rate earned while away (the x2 video doubles it). */
export const OFFLINE_RATE = 0.5;
export const SPAWN_BASE = 8;
export const SPAWN_GROWTH = 2;
/** A golden egg (bought with meta coins) hatches this many levels above the spawn level. */
export const GOLDEN_BONUS = 3;
export const GOLDEN_PRICE = 40;

// ───────── worlds ─────────
export interface WorldDef {
  id: 'meadow' | 'orchard' | 'forest' | 'mountain';
  /** Best bee level needed before the world can be built. */
  unlock: number;
  /** Honey to build the world's hive. */
  cost: number;
  /** Production multiplier of every bee living in this world. */
  mult: number;
  /** Expansion cost multiplier for this world's hive. */
  costMul: number;
}
export const WORLDS: WorldDef[] = [
  { id: 'meadow', unlock: 1, cost: 0, mult: 1, costMul: 1 },
  { id: 'orchard', unlock: 12, cost: 2e6, mult: 4, costMul: 2e3 },
  { id: 'forest', unlock: 18, cost: 4e9, mult: 16, costMul: 2e6 },
  { id: 'mountain', unlock: 24, cost: 8e12, mult: 64, costMul: 2e9 },
];

export interface Hive {
  cells: number[];
  expansion: number;
}

export interface Festival {
  /** ISO week key (year * 100 + week) this record belongs to; 0 = none yet. */
  key: number;
  /** Bee level that makes 2× honey this week. */
  level: number;
  /** Merges made during the festival week. */
  merges: number;
  claimed: boolean;
}

export interface State {
  honey: number;
  /** One hive per unlocked world, in `WORLDS` order. */
  hives: Hive[];
  /** Index of the hive on screen. */
  world: number;
  spawnLevel: number;
  spawns: number;
  best: number;
  merges: number;
  lastSeen: number;
  /** Gift boxes opened (quest stat). */
  gifts: number;
  /** Lifetime honey produced (quest stat). */
  earned: number;
  /** Position in the quest chain. */
  quest: number;
  festival: Festival;
  /** Festival bees collected (flower ids); each one is a permanent honey bonus. */
  flowers: string[];
}

const emptyHive = (spawnLevel: number): Hive => {
  const [c, r] = GRIDS[0];
  const cells = Array<number>(c * r).fill(0);
  cells[7] = spawnLevel;
  cells[8] = spawnLevel;
  return { cells, expansion: 0 };
};

export function newState(now = 0): State {
  return {
    honey: 20,
    hives: [emptyHive(1)],
    world: 0,
    spawnLevel: 1,
    spawns: 0,
    best: 1,
    merges: 0,
    lastSeen: now,
    gifts: 0,
    earned: 0,
    quest: 0,
    festival: { key: 0, level: 0, merges: 0, claimed: false },
    flowers: [],
  };
}

/** The hive on screen. */
export const hive = (s: Pick<State, 'hives' | 'world'>) => s.hives[s.world];
export const gridOf = (h: Pick<Hive, 'expansion'>) => GRIDS[h.expansion];

/** Honey per second of one bee: ×2.2 per level, so a merge is always worth it. */
export const prodOf = (level: number) => (level <= 0 ? 0 : 0.2 * Math.pow(2.2, level - 1));

/** Every expansion also makes that hive 25% more productive. */
export const hiveBonus = (h: Pick<Hive, 'expansion'>) => 1 + 0.25 * h.expansion;

/** Each collected festival bee adds 10% to all honey. */
export const flowerBonus = (s: Pick<State, 'flowers'>) => 1 + 0.1 * s.flowers.length;

/** Multiplier of one bee in world `w` (world, hive size, festival boost, flower bonus). */
export function beeMult(s: State, w: number, level: number): number {
  const fest = s.festival.level === level ? FESTIVAL_BOOST : 1;
  return WORLDS[w].mult * hiveBonus(s.hives[w]) * flowerBonus(s) * fest;
}

export function hiveRate(s: State, w: number): number {
  let r = 0;
  for (const c of s.hives[w].cells) if (c > 0) r += prodOf(c) * beeMult(s, w, c);
  return r;
}

export function rate(s: State): number {
  let r = 0;
  for (let w = 0; w < s.hives.length; w++) r += hiveRate(s, w);
  return r;
}

export function tick(s: State, dt: number): number {
  const gain = rate(s) * Math.max(0, dt);
  s.honey += gain;
  s.earned += gain;
  return gain;
}

export const spawnCost = (s: State) => Math.round(SPAWN_BASE * Math.pow(1 + s.spawns / 20, SPAWN_GROWTH));

export const freeCells = (h: Hive) => h.cells.reduce<number[]>((a, c, i) => (c === 0 ? (a.push(i), a) : a), []);

function place(h: Hive, level: number, rng: () => number): number {
  const free = freeCells(h);
  if (!free.length) return -1;
  const i = free[Math.floor(rng() * free.length)];
  h.cells[i] = level;
  return i;
}

/** Buys an egg: a bee of the current spawn level in a random free cell. Returns the cell or -1. */
export function spawn(s: State, rng: () => number = Math.random): number {
  const cost = spawnCost(s);
  if (s.honey < cost || !freeCells(hive(s)).length) return -1;
  s.honey -= cost;
  s.spawns++;
  return place(hive(s), s.spawnLevel, rng);
}

/** Golden egg (paid elsewhere with meta coins): free, higher-level bee. */
export function goldenEgg(s: State, rng: () => number = Math.random): number {
  return place(hive(s), Math.min(MAX_LEVEL - 1, s.spawnLevel + GOLDEN_BONUS), rng);
}

export const canMerge = (h: Hive, a: number, b: number) =>
  a !== b && h.cells[a] > 0 && h.cells[a] === h.cells[b] && h.cells[a] < MAX_LEVEL;

export interface MergeResult {
  level: number;
  newBest: boolean;
  /** Cell where the reward gift box landed, or -1 (hive full / no new best). */
  gift: number;
}

/** Drops bee `a` onto bee `b` in the active hive. Equal levels merge into `b`; otherwise null. */
export function merge(s: State, a: number, b: number, rng: () => number = Math.random): MergeResult | null {
  const h = hive(s);
  if (!canMerge(h, a, b)) return null;
  const level = h.cells[b] + 1;
  h.cells[a] = 0;
  h.cells[b] = level;
  s.merges++;
  s.festival.merges++;
  const newBest = level > s.best;
  let gift = -1;
  if (newBest) {
    s.best = level;
    gift = place(h, -giftLevel(s, level), rng);
  }
  return { level, newBest, gift };
}

export const giftLevel = (s: Pick<State, 'spawnLevel'>, best: number) => Math.max(s.spawnLevel, best - 3);

/** Moves a bee to an empty cell, or swaps two different bees. */
export function move(s: State, a: number, b: number): boolean {
  const h = hive(s);
  if (a === b || h.cells[a] <= 0 || h.cells[b] < 0 || canMerge(h, a, b)) return false;
  [h.cells[a], h.cells[b]] = [h.cells[b], h.cells[a]];
  return true;
}

export function openGift(s: State, i: number): number {
  const h = hive(s);
  if (h.cells[i] >= 0) return 0;
  h.cells[i] = -h.cells[i];
  s.gifts++;
  return h.cells[i];
}

// ───────── upgrades ─────────
export const expandCost = (s: State, w = s.world) => (EXPAND_COSTS[s.hives[w].expansion] ?? Infinity) * WORLDS[w].costMul;

export function expand(s: State, w = s.world): boolean {
  const cost = expandCost(s, w);
  if (s.honey < cost) return false;
  const h = s.hives[w];
  const [oc, or] = GRIDS[h.expansion];
  const [nc, nr] = GRIDS[h.expansion + 1];
  const cells = Array<number>(nc * nr).fill(0);
  for (let r = 0; r < or; r++) for (let c = 0; c < oc; c++) cells[r * nc + c] = h.cells[r * oc + c];
  s.honey -= cost;
  h.cells = cells;
  h.expansion++;
  return true;
}

export const totalExpansions = (s: State) => s.hives.reduce((a, h) => a + h.expansion, 0);

/**
 * Better eggs: up to 3 levels below the best bee. ×30 per level for the first steps (the
 * original first-session curve), then ×8 so the late game keeps moving for weeks.
 */
export function spawnUpCost(s: State): number {
  if (s.spawnLevel + 3 > s.best || s.spawnLevel >= MAX_LEVEL - 4) return Infinity;
  const l = s.spawnLevel;
  return Math.round(3_000 * Math.pow(30, Math.min(l, 3) - 1) * Math.pow(6, Math.max(0, l - 3)));
}

export function upgradeSpawn(s: State): boolean {
  const cost = spawnUpCost(s);
  if (s.honey < cost) return false;
  s.honey -= cost;
  s.spawnLevel++;
  return true;
}

/** Next world that can be built: index or -1. */
export const nextWorld = (s: State) => (s.hives.length < WORLDS.length ? s.hives.length : -1);
export const canUnlockWorld = (s: State) => {
  const w = nextWorld(s);
  return w >= 0 && s.best >= WORLDS[w].unlock && s.honey >= WORLDS[w].cost;
};

/** Builds the next world's hive (two starter bees) and switches to it. */
export function unlockWorld(s: State): boolean {
  if (!canUnlockWorld(s)) return false;
  const w = nextWorld(s);
  s.honey -= WORLDS[w].cost;
  s.hives.push(emptyHive(s.spawnLevel));
  s.world = w;
  return true;
}

export function switchWorld(s: State, w: number): boolean {
  if (w < 0 || w >= s.hives.length || w === s.world) return false;
  s.world = w;
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

/** When the offline honey storage will be full (for the "collect your honey" reminder). */
export const offlineFullAt = (s: Pick<State, 'lastSeen'>) => s.lastSeen + OFFLINE_CAP_SEC * 1000;

// ───────── quest chain ─────────
export type QuestKind = 'merges' | 'best' | 'spawns' | 'expand' | 'worlds' | 'earned' | 'gifts' | 'eggs';
export interface QuestReward {
  coins?: number;
  /** Gift boxes dropped into the active hive. */
  gifts?: number;
  /** Seconds of current production paid out as honey. */
  honeySec?: number;
}
export interface Quest {
  kind: QuestKind;
  n: number;
  reward: QuestReward;
}

const Q = (kind: QuestKind, n: number, reward: QuestReward): Quest => ({ kind, n, reward });
export const QUESTS: Quest[] = [
  Q('merges', 3, { coins: 20 }),
  Q('best', 4, { gifts: 1 }),
  Q('spawns', 10, { coins: 20 }),
  Q('best', 5, { honeySec: 20 }),
  Q('merges', 15, { coins: 25 }),
  Q('best', 6, { gifts: 1 }),
  Q('expand', 1, { coins: 30 }),
  Q('best', 7, { honeySec: 20 }),
  Q('spawns', 40, { coins: 30 }),
  Q('eggs', 2, { gifts: 1 }),
  Q('best', 8, { coins: 30 }),
  Q('merges', 60, { honeySec: 30 }),
  Q('earned', 10_000, { coins: 40 }),
  Q('best', 9, { gifts: 1 }),
  Q('gifts', 10, { coins: 40 }),
  Q('best', 10, { honeySec: 60 }),
  Q('expand', 2, { coins: 50 }),
  Q('earned', 100_000, { gifts: 2 }),
  Q('best', 11, { coins: 50 }),
  Q('eggs', 3, { gifts: 3 }),
  Q('merges', 250, { honeySec: 300 }),
  Q('best', 12, { coins: 60 }),
  Q('earned', 1e6, { gifts: 3 }),
  Q('worlds', 2, { coins: 80 }),
  Q('expand', 4, { honeySec: 300 }),
  Q('best', 13, { gifts: 3 }),
  Q('eggs', 5, { coins: 60 }),
  Q('merges', 600, { honeySec: 600 }),
  Q('best', 15, { gifts: 3 }),
  Q('expand', 6, { coins: 80 }),
  Q('earned', 1e9, { honeySec: 600 }),
  Q('best', 17, { gifts: 4 }),
  Q('worlds', 3, { coins: 100 }),
  Q('merges', 1500, { honeySec: 900 }),
  Q('best', 20, { gifts: 4 }),
  Q('eggs', 12, { coins: 120 }),
  Q('expand', 10, { honeySec: 1200 }),
  Q('best', 23, { gifts: 5 }),
  Q('worlds', 4, { coins: 150 }),
  Q('best', 26, { honeySec: 1800 }),
  Q('expand', 14, { gifts: 5 }),
  Q('best', 30, { coins: 500 }),
];

/** Quest `i`; past the hand-made chain it continues with ever bigger merge goals. */
export function questAt(i: number): Quest {
  if (i < QUESTS.length) return QUESTS[i];
  const k = i - QUESTS.length + 1;
  const rewards: QuestReward[] = [{ coins: 60 }, { gifts: 3 }, { honeySec: 900 }];
  return Q('merges', 3000 + k * 500, rewards[k % 3]);
}

export function questValue(s: State, kind: QuestKind): number {
  switch (kind) {
    case 'merges': return s.merges;
    case 'best': return s.best;
    case 'spawns': return s.spawns;
    case 'expand': return totalExpansions(s);
    case 'worlds': return s.hives.length;
    case 'earned': return s.earned;
    case 'gifts': return s.gifts;
    case 'eggs': return s.spawnLevel;
  }
}

export const questDone = (s: State) => questValue(s, questAt(s.quest).kind) >= questAt(s.quest).n;

export interface QuestPayout {
  coins: number;
  honey: number;
  /** Cells (active hive) where gift boxes landed. */
  giftCells: number[];
}

/** Claims the current quest's reward (coins are paid by the caller's profile). */
export function claimQuest(s: State, rng: () => number = Math.random): QuestPayout | null {
  if (!questDone(s)) return null;
  const { reward } = questAt(s.quest);
  const out: QuestPayout = { coins: reward.coins ?? 0, honey: 0, giftCells: [] };
  if (reward.honeySec) out.honey = Math.max(50, Math.round(rate(s) * reward.honeySec));
  for (let k = 0; k < (reward.gifts ?? 0); k++) {
    const i = place(hive(s), -s.spawnLevel, rng);
    if (i >= 0) out.giftCells.push(i);
    else out.honey += Math.max(50, Math.round(rate(s) * 60)); // no room: honey instead
  }
  s.honey += out.honey;
  s.quest++;
  return out;
}

// ───────── weekly festival (driven by the ISO week, no server) ─────────
export const FLOWERS = ['tulip', 'lavender', 'sunflower', 'daisy', 'blossom', 'poppy'] as const;
export type Flower = (typeof FLOWERS)[number];
export const FESTIVAL_BOOST = 2;
export const FESTIVAL_GOAL = 400;
export const FESTIVAL_COINS = 50;
export const FESTIVAL_REPEAT_COINS = 100;

/** ISO-8601 week of a timestamp (local calendar date). */
export function isoWeek(ms: number): { year: number; week: number } {
  const d = new Date(ms);
  const day = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dow); // Thursday of this week decides the year
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return { year: day.getUTCFullYear(), week: Math.ceil(((day.getTime() - yearStart) / 864e5 + 1) / 7) };
}

export const weekKey = (ms: number) => {
  const w = isoWeek(ms);
  return w.year * 100 + w.week;
};
export const flowerOf = (key: number): Flower => FLOWERS[(key % 100) % FLOWERS.length];

/** Seconds until the festival ends (next local Monday 00:00). */
export function festivalLeft(ms: number): number {
  const d = new Date(ms);
  const dow = d.getDay() || 7;
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 8 - dow);
  return Math.max(0, (end.getTime() - ms) / 1000);
}

/** Starts this week's festival when the week changed. Returns true when a new one began. */
export function syncFestival(s: State, ms: number): boolean {
  const key = weekKey(ms);
  const level = Math.max(1, s.best - 1 - ((key % 100) % 3));
  if (s.festival.key === key) {
    // a fast-growing (new) hive should not be stuck boosting bees it no longer has
    if (s.best - s.festival.level > 5) s.festival.level = level;
    return false;
  }
  s.festival = { key, level, merges: 0, claimed: false };
  return true;
}

export const festivalReady = (s: State) => s.festival.key > 0 && !s.festival.claimed && s.festival.merges >= FESTIVAL_GOAL;

/** Claims the festival bee (or coins if this flower is already collected). */
export function claimFestival(s: State): { flower: Flower; isNew: boolean; coins: number } | null {
  if (!festivalReady(s)) return null;
  const flower = flowerOf(s.festival.key);
  const isNew = !s.flowers.includes(flower);
  if (isNew) s.flowers.push(flower);
  s.festival.claimed = true;
  return { flower, isNew, coins: isNew ? FESTIVAL_COINS : FESTIVAL_REPEAT_COINS };
}

// ───────── save / load ─────────
export function sanitize(raw: unknown, now: number): State {
  const d = newState(now);
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const n = (v: unknown, def: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def;
  const best = Math.floor(n(o.best, 1, 1, MAX_LEVEL));
  const spawnLevel = Math.floor(n(o.spawnLevel, 1, 1, MAX_LEVEL - 4));
  const readHive = (h: Record<string, unknown>): Hive => {
    const expansion = Math.floor(n(h.expansion, 0, 0, GRIDS.length - 1));
    const [c, r] = GRIDS[expansion];
    const cells = Array<number>(c * r).fill(0);
    if (Array.isArray(h.cells))
      for (let i = 0; i < cells.length; i++) cells[i] = Math.trunc(n(h.cells[i], 0, -MAX_LEVEL, MAX_LEVEL));
    return { cells, expansion };
  };
  // v1 saves kept a single hive at the top level
  const rawHives = Array.isArray(o.hives) ? o.hives : [o];
  const hives = rawHives
    .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
    .slice(0, WORLDS.length)
    .map(readHive);
  if (!hives.length) hives.push(d.hives[0]);
  const f = (o.festival && typeof o.festival === 'object' ? o.festival : {}) as Record<string, unknown>;
  return {
    honey: n(o.honey, d.honey, 0, 1e300),
    hives,
    world: Math.floor(n(o.world, 0, 0, hives.length - 1)),
    spawnLevel,
    spawns: Math.floor(n(o.spawns, 0, 0, 1e9)),
    best,
    merges: Math.floor(n(o.merges, 0, 0, 1e12)),
    lastSeen: n(o.lastSeen, now, 0, now),
    gifts: Math.floor(n(o.gifts, 0, 0, 1e12)),
    earned: n(o.earned, 0, 0, 1e300),
    quest: Math.floor(n(o.quest, 0, 0, 1e6)),
    festival: {
      key: Math.floor(n(f.key, 0, 0, 1e7)),
      level: Math.floor(n(f.level, 0, 0, MAX_LEVEL)),
      merges: Math.floor(n(f.merges, 0, 0, 1e9)),
      claimed: f.claimed === true,
    },
    flowers: Array.isArray(o.flowers)
      ? [...new Set(o.flowers.filter((x): x is Flower => (FLOWERS as readonly unknown[]).includes(x)))]
      : [],
  };
}

// ───────── simple greedy player for balancing ─────────
/**
 * One "player action" step: open gifts, claim quests, merge any pair, build worlds, buy
 * upgrades, else buy an egg. Plays in the newest world; older hives are only expanded.
 */
export function autoPlay(s: State, rng: () => number = Math.random): string {
  const h = hive(s);
  const gift = h.cells.findIndex((c) => c < 0);
  if (gift >= 0) return openGift(s, gift), 'gift';
  if (claimQuest(s, rng)) return 'quest';
  for (let i = 0; i < h.cells.length; i++) {
    if (h.cells[i] <= 0) continue;
    const j = h.cells.findIndex((c, k) => k !== i && c === h.cells[i]);
    if (j >= 0 && merge(s, i, j, rng)) return 'merge';
  }
  const r60 = rate(s) * 60;
  const w = nextWorld(s);
  if (w >= 0 && s.best >= WORLDS[w].unlock && WORLDS[w].cost <= s.honey + r60) return unlockWorld(s) ? 'world' : 'save';
  // save up for an expansion when the hive is getting full, or for a spawn upgrade within a minute's honey
  if (expandCost(s) <= s.honey + r60 || (freeCells(h).length <= 4 && expandCost(s) < Infinity))
    return expand(s) ? 'expand' : 'save';
  if (spawnUpCost(s) <= s.honey + r60) return upgradeSpawn(s) ? 'upgrade' : 'save';
  for (let k = 0; k < s.hives.length; k++) if (k !== s.world && expandCost(s, k) <= s.honey * 0.25) return expand(s, k), 'expand';
  if (spawn(s, rng) >= 0) return 'spawn';
  return 'wait';
}

export const BEE_NAMES = {
  en: ['Larva', 'Worker', 'Forager', 'Nurse', 'Builder', 'Guard', 'Scout', 'Drone', 'Fanner', 'Harvester',
    'Waxsmith', 'Pollen Knight', 'Nectar Sage', 'Comb Architect', 'Royal Guard', 'Sky Dancer', 'Amber Lord', 'Sun Bee', 'Golden Elder', 'Queen',
    'Crystal Wing', 'Storm Rider', 'Moon Keeper', 'Star Weaver', 'Aurora Bee', 'Comet Bee', 'Nebula Sage', 'Celestial Guard', 'Eternal Bloom', 'Hive Empress'],
  tr: ['Larva', 'İşçi', 'Toplayıcı', 'Bakıcı', 'Yapıcı', 'Muhafız', 'Kâşif', 'Erkek Arı', 'Yelpazeci', 'Hasatçı',
    'Mumcu', 'Polen Şövalyesi', 'Nektar Bilgesi', 'Petek Mimarı', 'Kraliyet Muhafızı', 'Gök Dansçısı', 'Kehribar Beyi', 'Güneş Arısı', 'Altın Bilge', 'Kraliçe',
    'Kristal Kanat', 'Fırtına Süvarisi', 'Ay Bekçisi', 'Yıldız Dokuyucu', 'Kutup Işığı', 'Kuyruklu Yıldız', 'Bulutsu Bilgesi', 'Göksel Muhafız', 'Sonsuz Çiçek', 'Kovan İmparatoriçesi'],
};
