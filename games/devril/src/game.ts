/**
 * Devril / Topple — pure game logic: chain simulator, level generator, min-tap solver.
 *
 * A level is a set of domino tiles on a square grid. Each tile faces one of four directions.
 * Pushing the start tile makes it fall onto the adjacent cell in its direction; a standing tile
 * there falls in its own direction, and so on. The chain stops on an empty cell, off the board
 * or on an already fallen tile. All tiles fall ⇔ the directions trace a Hamiltonian path over
 * the tiles that begins at the start tile (the last tile may face anywhere).
 */

/** 0 = up, 1 = right, 2 = down, 3 = left (clockwise). */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export interface Tile {
  x: number;
  y: number;
  locked: boolean;
}

export interface Level {
  level: number;
  size: number;
  tiles: Tile[];
  /** Index of the tile the player pushes. */
  start: number;
  /** The generated solution (one valid all-fall configuration). */
  solution: Dir[];
  /** The scrambled directions the level starts from. */
  scrambled: Dir[];
  /** Minimum clockwise taps needed to make every tile fall. */
  par: number;
}

export const LEVEL_COUNT = 200;

export const rotateCw = (d: Dir): Dir => ((d + 1) % 4) as Dir;
export const rotateCcw = (d: Dir): Dir => ((d + 3) % 4) as Dir;
/** Clockwise taps to turn `from` into `to`. */
export const tapsBetween = (from: Dir, to: Dir) => (to - from + 4) % 4;

function tileMap(level: Pick<Level, 'size' | 'tiles'>) {
  const m = new Int32Array(level.size * level.size).fill(-1);
  level.tiles.forEach((t, i) => (m[t.y * level.size + t.x] = i));
  return m;
}

/** Tile index the given tile would hit, or -1 (empty cell / off board). */
export function target(level: Pick<Level, 'size' | 'tiles'>, i: number, dir: Dir, map = tileMap(level)) {
  const t = level.tiles[i];
  const x = t.x + DX[dir];
  const y = t.y + DY[dir];
  if (x < 0 || y < 0 || x >= level.size || y >= level.size) return -1;
  return map[y * level.size + x];
}

export interface Chain {
  /** Tile indices in the order they fall. */
  order: number[];
  /** Why the chain stopped after the last tile. */
  end: 'empty' | 'edge' | 'fallen';
  allFell: boolean;
}

export function simulate(level: Pick<Level, 'size' | 'tiles' | 'start'>, dirs: readonly Dir[]): Chain {
  const map = tileMap(level);
  const fallen = new Uint8Array(level.tiles.length);
  const order: number[] = [];
  let i = level.start;
  let end: Chain['end'] = 'edge';
  for (;;) {
    fallen[i] = 1;
    order.push(i);
    const t = level.tiles[i];
    const x = t.x + DX[dirs[i]];
    const y = t.y + DY[dirs[i]];
    if (x < 0 || y < 0 || x >= level.size || y >= level.size) { end = 'edge'; break; }
    const j = map[y * level.size + x];
    if (j < 0) { end = 'empty'; break; }
    if (fallen[j]) { end = 'fallen'; break; }
    i = j;
  }
  return { order, end, allFell: order.length === level.tiles.length };
}

export interface Solution {
  cost: number;
  dirs: Dir[];
  /** Path of tile indices from the start. */
  path: number[];
}

/**
 * Cheapest (fewest clockwise taps) way from `dirs` to an all-fall configuration, respecting
 * locked tiles. Branch-and-bound DFS over Hamiltonian paths with connectivity/dead-end pruning.
 * Returns null if impossible, or undefined if the node budget ran out.
 */
export function solve(level: Pick<Level, 'size' | 'tiles' | 'start'>, dirs: readonly Dir[], budget = 400_000): Solution | null | undefined {
  const n = level.tiles.length;
  const map = tileMap(level);
  const nbr: { j: number; d: Dir }[][] = level.tiles.map((_, i) => {
    const out: { j: number; d: Dir }[] = [];
    for (let d = 0; d < 4; d++) {
      const j = target(level, i, d as Dir, map);
      if (j >= 0) out.push({ j, d: d as Dir });
    }
    return out;
  });
  const cost = (i: number, d: Dir) => (level.tiles[i].locked ? (d === dirs[i] ? 0 : Infinity) : tapsBetween(dirs[i], d));
  const visited = new Uint8Array(n);
  const path: number[] = [level.start];
  const pathDirs: Dir[] = [];
  let best = Infinity;
  let bestPath: number[] = [];
  let bestDirs: Dir[] = [];
  let nodes = 0;
  let aborted = false;
  const stack = new Int32Array(n);
  const seen = new Uint8Array(n);

  function feasible(head: number, remaining: number) {
    // every unvisited tile reachable from head through unvisited tiles
    seen.fill(0);
    let sp = 0;
    stack[sp++] = head;
    seen[head] = 1;
    let reached = 0;
    while (sp) {
      const v = stack[--sp];
      for (const { j } of nbr[v]) {
        if (!visited[j] && !seen[j]) {
          seen[j] = 1;
          reached++;
          stack[sp++] = j;
        }
      }
    }
    if (reached !== remaining) return false;
    // at most one dead end (it must be the last tile); lower bound on remaining taps
    let ends = 0;
    let lb = 0;
    let maxMin = 0;
    for (let v = 0; v < n; v++) {
      if (visited[v]) continue;
      let deg = 0;
      let minOut = Infinity;
      for (const { j, d } of nbr[v]) {
        if (j === head) deg++;
        else if (!visited[j]) {
          deg++;
          const c = cost(v, d);
          if (c < minOut) minOut = c;
        }
      }
      if (deg <= 1) ends++;
      if (minOut === Infinity) minOut = 0; // can only be the last tile
      lb += minOut;
      if (minOut > maxMin) maxMin = minOut;
    }
    if (ends > 1) return false;
    return lb - maxMin;
  }

  function dfs(head: number, depth: number, spent: number) {
    if (aborted) return;
    if (depth === n) {
      if (spent < best) {
        best = spent;
        bestPath = path.slice();
        bestDirs = pathDirs.slice();
      }
      return;
    }
    if (++nodes > budget) {
      aborted = true;
      return;
    }
    const lb = feasible(head, n - depth);
    if (lb === false || spent + lb >= best) return;
    const options = nbr[head]
      .filter(({ j }) => !visited[j])
      .map(({ j, d }) => ({ j, d, c: cost(head, d) }))
      .filter((o) => o.c !== Infinity)
      .sort((a, b) => a.c - b.c);
    for (const o of options) {
      if (spent + o.c >= best) break;
      visited[o.j] = 1;
      path.push(o.j);
      pathDirs.push(o.d);
      dfs(o.j, depth + 1, spent + o.c);
      path.pop();
      pathDirs.pop();
      visited[o.j] = 0;
      if (aborted) return;
    }
  }

  visited[level.start] = 1;
  dfs(level.start, 1, 0);
  if (aborted) return undefined;
  if (best === Infinity) return null;
  const out = dirs.slice() as Dir[];
  bestPath.forEach((i, k) => {
    if (k < bestDirs.length) out[i] = bestDirs[k];
  });
  return { cost: best, dirs: out, path: bestPath };
}

// ───────────────────────── generation ─────────────────────────

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

export interface LevelParams {
  size: number;
  tiles: number;
  locks: number;
  /** How many tiles start in a wrong direction (at least). */
  wrong: number;
}

const BANDS = [
  { until: 12, size: 4 },
  { until: 35, size: 5 },
  { until: 75, size: 6 },
  { until: 130, size: 7 },
  { until: Infinity, size: 8 },
];

export function paramsFor(level: number): LevelParams {
  if (level === 1) return { size: 4, tiles: 4, locks: 0, wrong: 1 };
  if (level === 2) return { size: 4, tiles: 5, locks: 0, wrong: 2 };
  if (level === 3) return { size: 4, tiles: 6, locks: 0, wrong: 3 };
  let prev = 0;
  for (const b of BANDS) {
    if (level <= b.until) {
      const span = (b.until === Infinity ? LEVEL_COUNT : b.until) - prev;
      const t = Math.min(1, (level - prev - 1) / Math.max(1, span - 1));
      const cells = b.size * b.size;
      const tiles = Math.max(6, Math.round(cells * (0.36 + 0.24 * t)));
      const locks = level < 20 ? 0 : Math.min(Math.floor(tiles / 6), 1 + Math.floor((level - 20) / 35));
      const wrong = Math.min(tiles - 1 - locks, Math.round(tiles * Math.min(0.85, 0.4 + level * 0.004)));
      return { size: b.size, tiles, locks, wrong };
    }
    prev = b.until;
  }
  throw new Error('unreachable');
}

function randomWalk(size: number, length: number, rnd: () => number): { x: number; y: number }[] | null {
  const used = new Uint8Array(size * size);
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && !used[y * size + x];
  let x = Math.floor(rnd() * size);
  let y = Math.floor(rnd() * size);
  const out = [{ x, y }];
  used[y * size + x] = 1;
  while (out.length < length) {
    const opts: { x: number; y: number; deg: number }[] = [];
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (!free(nx, ny)) continue;
      let deg = 0;
      for (let e = 0; e < 4; e++) if (free(nx + DX[e], ny + DY[e])) deg++;
      opts.push({ x: nx, y: ny, deg });
    }
    if (!opts.length) return null;
    // Mostly Warnsdorff (hug walls, fewer dead ends), sometimes random for variety.
    let pick = opts[Math.floor(rnd() * opts.length)];
    if (rnd() < 0.55) {
      const minDeg = Math.min(...opts.map((o) => o.deg));
      const best = opts.filter((o) => o.deg === minDeg);
      pick = best[Math.floor(rnd() * best.length)];
    }
    x = pick.x;
    y = pick.y;
    used[y * size + x] = 1;
    out.push({ x, y });
  }
  return out;
}

function dirBetween(a: { x: number; y: number }, b: { x: number; y: number }): Dir {
  for (let d = 0; d < 4; d++) if (a.x + DX[d] === b.x && a.y + DY[d] === b.y) return d as Dir;
  throw new Error('not adjacent');
}

const cache = new Map<number, Level>();

/** Deterministic level for a 1-based level number. */
export function generateLevel(level: number): Level {
  const hit = cache.get(level);
  if (hit) return hit;
  const p = paramsFor(level);
  const rnd = mulberry32(level * 2654435761 + 977);
  for (let attempt = 0; attempt < 500; attempt++) {
    const cells = randomWalk(p.size, p.tiles, rnd);
    if (!cells) continue;
    const n = cells.length;
    // Shuffle tile order so array index doesn't leak the solution order.
    const order = cells.map((_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const slotOf = new Array<number>(n); // path position -> tile index
    order.forEach((pos, idx) => (slotOf[pos] = idx));
    const tiles: Tile[] = order.map((pos) => ({ ...cells[pos], locked: false }));
    const solution = new Array<Dir>(n);
    for (let k = 0; k < n; k++) {
      solution[slotOf[k]] = k < n - 1 ? dirBetween(cells[k], cells[k + 1]) : (Math.floor(rnd() * 4) as Dir);
    }
    const start = slotOf[0];
    // Locks on path tiles other than the start and the last.
    const lockable = Array.from({ length: n - 2 }, (_, k) => slotOf[k + 1]);
    for (let l = 0; l < p.locks && lockable.length; l++) {
      const idx = lockable.splice(Math.floor(rnd() * lockable.length), 1)[0];
      tiles[idx].locked = true;
    }
    // Scramble: pick `wrong` unlocked non-last tiles and rotate them.
    const scrambled = solution.slice();
    const candidates = Array.from({ length: n - 1 }, (_, k) => slotOf[k]).filter((i) => !tiles[i].locked);
    for (let w = 0; w < p.wrong && candidates.length; w++) {
      const idx = candidates.splice(Math.floor(rnd() * candidates.length), 1)[0];
      // Level 1: one tap fixes it (tutorial); early levels need 1-2 taps per tile, later 1-3.
      const off = level === 1 ? 3 : level <= 10 ? (rnd() < 0.6 ? 3 : 2) : 1 + Math.floor(rnd() * 3);
      scrambled[idx] = ((solution[idx] + off) % 4) as Dir;
    }
    scrambled[slotOf[n - 1]] = Math.floor(rnd() * 4) as Dir;
    const base = { size: p.size, tiles, start };
    if (simulate(base, scrambled).allFell) continue;
    const sol = solve(base, scrambled);
    if (!sol) continue;
    const lv: Level = { level, size: p.size, tiles, start, solution, scrambled, par: sol.cost };
    cache.set(level, lv);
    return lv;
  }
  throw new Error(`could not generate level ${level}`);
}

/**
 * 3 stars at or under par, 2 within par+3, otherwise 1. Hint turns are free (they are not
 * taps), so a level solved with any hint earns at most 2 stars — otherwise hints beat par.
 */
export function starsFor(taps: number, par: number, hinted = false): number {
  if (hinted) return Math.min(2, starsFor(taps, par));
  if (taps <= par) return 3;
  if (taps <= par + 3) return 2;
  return 1;
}

/**
 * Hint: the cheapest solution from the current state; returns one tile whose direction is wrong
 * (never the last tile of the chain, whose direction does not matter) and its correct direction.
 */
export function hintFor(level: Level, dirs: readonly Dir[]): { tile: number; dir: Dir } | null {
  const found = solve(level, dirs, 2_000_000);
  const sol = found ?? { dirs: level.solution, path: simulate(level, level.solution).order };
  for (const i of sol.path.slice(0, -1)) if (sol.dirs[i] !== dirs[i]) return { tile: i, dir: sol.dirs[i] };
  return null;
}
