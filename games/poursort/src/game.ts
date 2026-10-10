/**
 * Pour Sort — pure game logic. Tubes are arrays of color ids from bottom to top.
 * Everything is deterministic given a seed, so every player gets the same level N.
 */
export const CAPACITY = 4;
export const MAX_COLORS = 12;

export type Tube = number[];
export type Tubes = Tube[];
export type Move = readonly [from: number, to: number];
export type Rng = () => number;

export const top = (t: Tube) => t[t.length - 1];

/** Length of the same-colored run at the top of a tube. */
export function topRun(t: Tube): number {
  let n = 0;
  for (let i = t.length - 1; i >= 0 && t[i] === top(t); i--) n++;
  return n;
}

export function isComplete(t: Tube): boolean {
  return t.length === CAPACITY && topRun(t) === CAPACITY;
}

export function canPour(tubes: Tubes, from: number, to: number): boolean {
  if (from === to) return false;
  const a = tubes[from];
  const b = tubes[to];
  if (!a || !b || a.length === 0 || b.length >= CAPACITY) return false;
  if (isComplete(a)) return false;
  return b.length === 0 || top(b) === top(a);
}

/** Returns the new tubes and how many units moved, or null when the pour is illegal. */
export function pour(tubes: Tubes, from: number, to: number): { tubes: Tubes; amount: number } | null {
  if (!canPour(tubes, from, to)) return null;
  const amount = Math.min(topRun(tubes[from]), CAPACITY - tubes[to].length);
  const next = tubes.map((t) => t.slice());
  const color = top(next[from]);
  next[from].length -= amount;
  for (let i = 0; i < amount; i++) next[to].push(color);
  return { tubes: next, amount };
}

export function isSolved(tubes: Tubes): boolean {
  return tubes.every((t) => t.length === 0 || isComplete(t));
}

/** Moves that change something meaningful (skips pouring a uniform tube into an empty one). */
export function usefulMoves(tubes: Tubes): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < tubes.length; from++) {
    const a = tubes[from];
    if (a.length === 0 || isComplete(a)) continue;
    const uniform = topRun(a) === a.length;
    for (let to = 0; to < tubes.length; to++) {
      if (!canPour(tubes, from, to)) continue;
      if (uniform && tubes[to].length === 0) continue;
      moves.push([from, to]);
    }
  }
  return moves;
}

export function hasMoves(tubes: Tubes): boolean {
  return usefulMoves(tubes).length > 0;
}

const key = (tubes: Tubes) =>
  tubes
    .map((t) => t.join(','))
    .sort()
    .join('|');

/**
 * Depth-first solver with a visited set. Returns a move list, or null when the state is
 * unsolvable (or too large to search within `budget` states). Used to validate generated
 * levels and to power the in-game hint.
 */
export function solve(start: Tubes, budget = 200_000): Move[] | null {
  const seen = new Set<string>();
  const path: Move[] = [];
  let explored = 0;

  const score = (tubes: Tubes, [from, to]: Move) => {
    // Prefer pours onto a matching color, then completing tubes; avoid splitting into empties.
    const b = tubes[to];
    let s = b.length === 0 ? 0 : 2;
    if (b.length > 0 && topRun(b) === b.length) s += 2;
    if (topRun(tubes[from]) + b.length >= CAPACITY) s += 1;
    return -s;
  };

  const dfs = (tubes: Tubes): boolean => {
    if (isSolved(tubes)) return true;
    if (++explored > budget) return false;
    const k = key(tubes);
    if (seen.has(k)) return false;
    seen.add(k);
    const moves = usefulMoves(tubes).sort((m1, m2) => score(tubes, m1) - score(tubes, m2));
    for (const m of moves) {
      const res = pour(tubes, m[0], m[1])!;
      path.push(m);
      if (dfs(res.tubes)) return true;
      path.pop();
    }
    return false;
  };

  return dfs(start) ? path.slice() : null;
}

/** Number of colors for a level: a gentle ramp from 2 to 12. */
export function colorsForLevel(level: number): number {
  const steps = [2, 3, 4, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 7];
  if (level <= steps.length) return steps[level - 1];
  if (level < 25) return 8;
  if (level < 40) return 9;
  if (level < 60) return 10;
  if (level < 90) return 11;
  return MAX_COLORS;
}

export const EMPTY_TUBES = 2;

export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds level `level` deterministically: shuffles all units, deals them into tubes, and
 * keeps only deals that are solvable and not trivially pre-sorted.
 */
export function generateLevel(level: number): Tubes {
  const colors = colorsForLevel(level);
  const empties = EMPTY_TUBES;
  const rng = seededRng(level * 7919 + 13);
  for (let attempt = 0; attempt < 200; attempt++) {
    const units: number[] = [];
    for (let c = 1; c <= colors; c++) for (let i = 0; i < CAPACITY; i++) units.push(c);
    for (let i = units.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [units[i], units[j]] = [units[j], units[i]];
    }
    const tubes: Tubes = [];
    for (let c = 0; c < colors; c++) tubes.push(units.slice(c * CAPACITY, (c + 1) * CAPACITY));
    for (let e = 0; e < empties; e++) tubes.push([]);
    // Reject deals that start with a finished tube or with long runs (too easy / boring).
    if (tubes.some((t) => t.length && topRun(t) >= 3)) continue;
    if (tubes.some((t) => new Set(t).size === 1 && t.length === CAPACITY)) continue;
    if (solve(tubes, 60_000)) return tubes;
  }
  throw new Error(`could not generate level ${level}`);
}
