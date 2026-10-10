/**
 * Gelgit / Tide — pure game logic. No DOM, no randomness outside the seeded generator, so every
 * rule is unit-testable and every beach is reproducible from its seed.
 *
 * Grid cells (row-major, `idx = row * COLS + col`):
 *   SEA    – the sea at the top of the beach; water starts here (distance 0)
 *   SAND   – open beach; walls can be built here; water flows through
 *   ROCK   – permanent wall
 *   CASTLE – to be protected; water washes it away (and keeps flowing)
 * Walls live in a separate `walls` array (durability 0..WALL_HP, 0 = no wall).
 */
export const COLS = 9;
export const ROWS = 13;
export const N = COLS * ROWS;

export const SAND = 0;
export const SEA = 1;
export const ROCK = 2;
export const CASTLE = 3;

export const WALL_HP = 2;
export const START_BUCKETS = 6;
export const START_REACH = 4;
export const CASTLES = 3;
export const PERFECT_BONUS = 2;
export const CONTINUE_BUCKETS = 5;

export interface GameState {
  seed: number;
  terrain: number[];
  walls: number[];
  /** Walls placed during the current build phase (removable for a refund). */
  fresh: number[];
  buckets: number;
  round: number;
  reach: number;
  score: number;
  /** Castles washed by the most recent wave (restored by "continue"). */
  lastLost: number[];
  continued: boolean;
}

/** Max BFS steps the wave travels from the sea in a given round. */
export const reachFor = (round: number) => START_REACH + round - 1;
/** Buckets gained after surviving `round`; slowly shrinks to 2. */
/** Durability a wave knocks off each wall it touches: storms grow stronger late in the game. */
export const powerFor = (round: number) => 1 + Math.floor((round - 1) / 8);
export const incomeFor = (round: number) => Math.max(1, 4 - Math.floor(round / 3));

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rowOf = (i: number) => Math.floor(i / COLS);
export const colOf = (i: number) => i % COLS;

export function neighbours(i: number): number[] {
  const r = rowOf(i);
  const c = colOf(i);
  const out: number[] = [];
  if (r > 0) out.push(i - COLS);
  if (r < ROWS - 1) out.push(i + COLS);
  if (c > 0) out.push(i - 1);
  if (c < COLS - 1) out.push(i + 1);
  return out;
}

/**
 * BFS from every sea cell through cells that are not rock, sea or walled, up to `reach` steps.
 * Returns the step distance per cell (sea = 0, unreached = -1).
 */
export function flood(terrain: number[], walls: number[], reach: number): Int16Array {
  const dist = new Int16Array(N).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < N; i++) {
    if (terrain[i] === SEA) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (dist[i] >= reach) continue;
    for (const n of neighbours(i)) {
      if (dist[n] !== -1 || terrain[n] === ROCK || terrain[n] === SEA || walls[n] > 0) continue;
      dist[n] = dist[i] + 1;
      queue.push(n);
    }
  }
  return dist;
}

export const castleCells = (terrain: number[]) => terrain.flatMap((t, i) => (t === CASTLE ? [i] : []));
export const castlesLeft = (s: GameState) => castleCells(s.terrain).length;
export const isOver = (s: GameState) => castlesLeft(s) === 0;

/** Castles the coming wave would wash away with the current walls (the live preview). */
export function threatened(s: GameState, dist = flood(s.terrain, s.walls, s.reach)): number[] {
  return castleCells(s.terrain).filter((i) => dist[i] >= 0);
}

export const canBuild = (s: GameState, i: number) =>
  i >= 0 && i < N && s.terrain[i] === SAND && s.walls[i] === 0 && s.buckets > 0;

/** Build a wall on sand (costs 1 bucket) or remove a wall placed this phase (refund). */
export function toggleWall(s: GameState, i: number): GameState | null {
  if (s.fresh.includes(i)) {
    const walls = s.walls.slice();
    walls[i] = 0;
    return { ...s, walls, fresh: s.fresh.filter((f) => f !== i), buckets: s.buckets + 1 };
  }
  if (!canBuild(s, i)) return null;
  const walls = s.walls.slice();
  walls[i] = WALL_HP;
  return { ...s, walls, fresh: [...s.fresh, i], buckets: s.buckets - 1 };
}

export interface WaveResult {
  state: GameState;
  dist: Int16Array;
  washed: number[];
  /** Wall cells that lost durability, and those of them that collapsed. */
  eroded: number[];
  broken: number[];
  gained: number;
  perfect: boolean;
  /** The state the wave started from (for drawing it). */
  before: GameState;
}

export function runWave(s: GameState): WaveResult {
  const dist = flood(s.terrain, s.walls, s.reach);
  const terrain = s.terrain.slice();
  const walls = s.walls.slice();
  const washed = castleCells(terrain).filter((i) => dist[i] >= 0);
  for (const i of washed) terrain[i] = SAND;
  const eroded: number[] = [];
  const broken: number[] = [];
  for (let i = 0; i < N; i++) {
    if (walls[i] > 0 && neighbours(i).some((n) => dist[n] >= 0)) {
      walls[i] = Math.max(0, walls[i] - powerFor(s.round));
      eroded.push(i);
      if (walls[i] === 0) broken.push(i);
    }
  }
  const survivors = castleCells(terrain).length;
  const perfect = washed.length === 0 && survivors > 0;
  const gained = survivors + (perfect ? PERFECT_BONUS : 0);
  const round = s.round + 1;
  const state: GameState = {
    ...s,
    terrain,
    walls,
    fresh: [],
    buckets: s.buckets + incomeFor(s.round),
    round,
    reach: reachFor(round),
    score: s.score + gained,
    lastLost: washed,
  };
  return { state, dist, washed, eroded, broken, gained, perfect, before: s };
}

/** One rewarded continue per game: the last washed castles come back, plus some buckets. */
export function continueGame(s: GameState): GameState {
  const terrain = s.terrain.slice();
  const walls = s.walls.slice();
  for (const i of s.lastLost) {
    terrain[i] = CASTLE;
    walls[i] = 0;
  }
  return { ...s, terrain, walls, buckets: s.buckets + CONTINUE_BUCKETS, lastLost: [], continued: true };
}

/**
 * Greedy defender: repeatedly places the single wall that best pushes castles out of reach
 * (score = how far the nearest water path to each castle is, minus flooded area). Used to
 * guarantee generated beaches are defensible, by the tests, and by the store-screenshot script.
 */
export function greedyDefend(s: GameState, budget = s.buckets): number[] {
  const walls = s.walls.slice();
  const placed: number[] = [];
  const castles = castleCells(s.terrain);
  const value = () => {
    const far = flood(s.terrain, walls, 999);
    let v = 0;
    let wet = 0;
    for (const c of castles) v += far[c] < 0 ? s.reach + 2 : Math.min(far[c], s.reach + 1);
    for (let i = 0; i < N; i++) if (far[i] > 0 && far[i] <= s.reach) wet++;
    return v * 1000 - wet;
  };
  while (placed.length < budget) {
    const dist = flood(s.terrain, walls, s.reach);
    if (!castles.some((c) => dist[c] >= 0)) break;
    let bestI = -1;
    let bestV = -Infinity;
    for (let i = 0; i < N; i++) {
      if (s.terrain[i] !== SAND || walls[i] > 0 || dist[i] < 1) continue;
      walls[i] = WALL_HP;
      const v = value();
      walls[i] = 0;
      if (v > bestV) {
        bestV = v;
        bestI = i;
      }
    }
    if (bestI < 0) break;
    walls[bestI] = WALL_HP;
    placed.push(bestI);
  }
  return placed;
}

function emptyState(seed: number, terrain: number[]): GameState {
  return {
    seed,
    terrain,
    walls: new Array(N).fill(0),
    fresh: [],
    buckets: START_BUCKETS,
    round: 1,
    reach: reachFor(1),
    score: 0,
    lastLost: [],
    continued: false,
  };
}

/** Sea depth per column (cells), a gentle random walk so the shoreline wobbles. */
export function seaDepths(terrain: number[]): number[] {
  return Array.from({ length: COLS }, (_, c) => {
    let d = 0;
    while (d < ROWS && terrain[d * COLS + c] === SEA) d++;
    return d;
  });
}

function generateTerrain(rnd: () => number): number[] {
  const terrain = new Array(N).fill(SAND);
  let d = 2 + Math.floor(rnd() * 2);
  for (let c = 0; c < COLS; c++) {
    if (c > 0) d = Math.max(2, Math.min(4, d + Math.floor(rnd() * 3) - 1));
    for (let r = 0; r < d; r++) terrain[r * COLS + c] = SEA;
  }
  const free = (i: number) => terrain[i] === SAND;
  const rocks = 4 + Math.floor(rnd() * 3);
  for (let k = 0, tries = 0; k < rocks && tries < 100; tries++) {
    const i = (4 + Math.floor(rnd() * (ROWS - 4))) * COLS + Math.floor(rnd() * COLS);
    if (!free(i) || neighbours(i).some((n) => terrain[n] === SEA)) continue;
    terrain[i] = ROCK;
    k++;
    // Rocks like company: sometimes a second one next to it.
    const n = neighbours(i)[Math.floor(rnd() * 4) % neighbours(i).length];
    if (rnd() < 0.4 && free(n) && rowOf(n) >= 4) terrain[n] = ROCK;
  }
  const castles: number[] = [];
  for (let tries = 0; castles.length < CASTLES && tries < 200; tries++) {
    const i = (5 + Math.floor(rnd() * (ROWS - 8))) * COLS + 1 + Math.floor(rnd() * (COLS - 2));
    // No rock right next to a castle: a castle in a one-cell rock pocket could be held forever.
    if (!free(i) || neighbours(i).some((n) => terrain[n] !== SAND)) continue;
    if (castles.some((c) => Math.abs(rowOf(c) - rowOf(i)) + Math.abs(colOf(c) - colOf(i)) < 3)) continue;
    terrain[i] = CASTLE;
    castles.push(i);
  }
  return terrain;
}

/**
 * A beach from a seed. Retries (deterministically) until round 1 is interesting and fair:
 * every castle can eventually be reached by water, at least one is threatened by the first
 * wave, and the greedy defender can save them all with fewer than the starting buckets.
 */
export function newGame(seed: number): GameState {
  const rnd = mulberry32(seed);
  for (let attempt = 0; ; attempt++) {
    const s = emptyState(seed, generateTerrain(rnd));
    const castles = castleCells(s.terrain);
    if (castles.length !== CASTLES) continue;
    const far = flood(s.terrain, s.walls, 999);
    if (castles.some((c) => far[c] < 0)) continue;
    if (threatened(s).length === 0) continue;
    const plan = greedyDefend(s, START_BUCKETS - 1);
    const after = s.walls.slice();
    for (const p of plan) after[p] = WALL_HP;
    if (threatened(s, flood(s.terrain, after, s.reach)).length === 0 || attempt > 500) return s;
  }
}
