/**
 * Terazi — pure game logic (no DOM). A plank on a central pivot has pegs at integer distances
 * −N…−1, 1…N. Net torque = Σ weight × distance; the level is solved when every tray weight
 * hangs on the plank and the torque is exactly 0. Levels are generated deterministically per
 * level number: a zero-torque solution is built first, then the weights are handed to the tray.
 */

export interface Fixed {
  d: number;
  w: number;
}

export interface Level {
  /** Half-span: pegs at −n…−1 and 1…n. */
  n: number;
  /** Several weights may share one peg (and pegs with fixed weights accept more). */
  stack: boolean;
  blocked: number[];
  fixed: Fixed[];
  /** Tray weights, in tray order (shuffled). */
  tray: number[];
  /** A known solution: peg per tray weight. */
  solution: number[];
}

/** Peg per tray weight, null while the weight is still in the tray. */
export type Placement = (number | null)[];

export const LEVEL_COUNT = 150;
export const MAX_WEIGHT = 9;

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

export function pegs(n: number): number[] {
  const out: number[] = [];
  for (let d = -n; d <= n; d++) if (d !== 0) out.push(d);
  return out;
}

export function torque(level: Level, pos: Placement): number {
  let t = 0;
  for (const f of level.fixed) t += f.w * f.d;
  pos.forEach((d, i) => {
    if (d !== null) t += level.tray[i] * d;
  });
  return t;
}

/** Weights hanging on peg d (fixed + placed). */
export function occupants(level: Level, pos: Placement, d: number): number {
  let c = 0;
  for (const f of level.fixed) if (f.d === d) c++;
  for (const p of pos) if (p === d) c++;
  return c;
}

export function isOpen(level: Level, d: number) {
  return Number.isInteger(d) && d !== 0 && Math.abs(d) <= level.n && !level.blocked.includes(d);
}

export function canPlace(level: Level, pos: Placement, i: number, d: number): boolean {
  if (i < 0 || i >= level.tray.length || pos[i] !== null) return false;
  if (!isOpen(level, d)) return false;
  return level.stack || occupants(level, pos, d) === 0;
}

export function place(level: Level, pos: Placement, i: number, d: number): Placement | null {
  if (!canPlace(level, pos, i, d)) return null;
  const next = pos.slice();
  next[i] = d;
  return next;
}

export function pickup(pos: Placement, i: number): Placement | null {
  if (pos[i] === null || pos[i] === undefined) return null;
  const next = pos.slice();
  next[i] = null;
  return next;
}

export function isSolved(level: Level, pos: Placement) {
  return pos.length === level.tray.length && pos.every((d) => d !== null) && torque(level, pos) === 0;
}

export function stars(moves: number, par: number) {
  return moves <= par ? 3 : moves <= par + 2 ? 2 : 1;
}

/**
 * Completes `pos` (placed weights stay) to a zero-torque placement, or null if impossible.
 * DFS over the unplaced weights, heaviest first, with a torque bound and symmetry breaking for
 * equal weights.
 */
export function solve(level: Level, pos: Placement, nodeLimit = 300_000): Placement | null {
  const free = level.tray.map((_, i) => i).filter((i) => pos[i] === null);
  free.sort((a, b) => level.tray[b] - level.tray[a] || a - b);
  const open = pegs(level.n).filter((d) => isOpen(level, d));
  const used = new Map<number, number>();
  for (const d of open) used.set(d, occupants(level, pos, d));
  const rest: number[] = [];
  let sum = 0;
  for (let k = free.length - 1; k >= 0; k--) {
    sum += level.tray[free[k]];
    rest[k] = sum;
  }
  rest[free.length] = 0;
  const out = pos.slice();
  let nodes = 0;
  const dfs = (k: number, t: number, minPeg: number): boolean => {
    if (++nodes > nodeLimit) return false;
    if (k === free.length) return t === 0;
    if (Math.abs(t) > rest[k] * level.n) return false;
    const i = free[k];
    const w = level.tray[i];
    const sameAsNext = k + 1 < free.length && level.tray[free[k + 1]] === w;
    for (const d of open) {
      if (d < minPeg) continue;
      if (!level.stack && used.get(d)! > 0) continue;
      used.set(d, used.get(d)! + 1);
      out[i] = d;
      if (dfs(k + 1, t + w * d, sameAsNext ? d : -Infinity)) return true;
      used.set(d, used.get(d)! - 1);
    }
    out[i] = null;
    return false;
  };
  return dfs(0, torque(level, pos), -Infinity) ? out : null;
}

/**
 * The next hint: a weight and the peg it belongs on. Keeps the player's placements when they
 * still lead to a solution; otherwise solves around the locked weights only and lists the
 * unlocked weights that must go back to the tray (`clear`).
 */
export function hintStep(level: Level, pos: Placement, locked: boolean[]): { i: number; d: number; clear: number[] } | null {
  const kept = solve(level, pos);
  if (kept) {
    const i = kept.findIndex((d, k) => pos[k] === null && d !== null);
    if (i >= 0) return { i, d: kept[i]!, clear: [] };
  }
  const base = pos.map((d, k) => (locked[k] ? d : null));
  const sol = solve(level, base);
  if (!sol) return null;
  // Prefer a weight still in the tray; else one placed on the wrong peg.
  let i = sol.findIndex((_, k) => !locked[k] && pos[k] === null);
  if (i < 0) i = sol.findIndex((d, k) => !locked[k] && pos[k] !== d);
  if (i < 0) return null;
  const d = sol[i]!;
  const clear = pos
    .map((_, k) => k)
    .filter((k) => k !== i && !locked[k] && pos[k] !== null && (pos[k] !== sol[k] || (!level.stack && pos[k] === d)));
  return { i, d, clear };
}

/** "Obvious" level: no net fixed torque and the tray pairs up into equal weights to mirror. */
export function isMirrorTrivial(level: Level) {
  const fixedT = level.fixed.reduce((s, f) => s + f.w * f.d, 0);
  if (fixedT !== 0) return false;
  const counts = new Map<number, number>();
  for (const w of level.tray) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.values()].every((c) => c % 2 === 0);
}

export interface LevelParams {
  n: number;
  count: number;
  fixed: number;
  blocked: number;
  stack: boolean;
  maxW: number;
}

export function paramsFor(level: number, rand: () => number = () => 0.5): LevelParams {
  const L = Math.max(1, level);
  const pick = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  if (L === 1) return { n: 3, count: 2, fixed: 0, blocked: 0, stack: false, maxW: 3 };
  if (L <= 4) return { n: 3, count: 3, fixed: 0, blocked: 0, stack: false, maxW: 4 };
  if (L <= 10) return { n: 3, count: pick(3, 4), fixed: pick(0, 1), blocked: 0, stack: false, maxW: 6 };
  if (L <= 29) return { n: 4, count: pick(4, 5), fixed: 1, blocked: 0, stack: false, maxW: 9 };
  if (L <= 60) return { n: 5, count: pick(4, 6), fixed: pick(1, 2), blocked: 1, stack: true, maxW: 9 };
  if (L <= 100) return { n: 6, count: pick(5, 6), fixed: pick(1, 2), blocked: pick(1, 2), stack: true, maxW: 9 };
  return { n: 6, count: pick(6, 7), fixed: 2, blocked: 2, stack: true, maxW: 9 };
}

function shuffle<T>(arr: T[], rand: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateLevel(levelNo: number): Level {
  const rand = mulberry32(levelNo * 7919 + 17);
  const p = paramsFor(levelNo, rand);
  let fallback: Level | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const all = pegs(p.n);
    const blocked = shuffle(all.slice(), rand).slice(0, p.blocked);
    const open = all.filter((d) => !blocked.includes(d));
    const fixedPegs = shuffle(open.slice(), rand).slice(0, p.fixed);
    const fixed = fixedPegs.map((d) => ({ d, w: 1 + Math.floor(rand() * p.maxW) }));
    // Pegs for the solution.
    const freeForTray = p.stack ? open : open.filter((d) => !fixedPegs.includes(d));
    let solPegs: number[];
    if (p.stack) {
      solPegs = [];
      const distinct = shuffle(freeForTray.slice(), rand);
      for (let k = 0; k < p.count; k++) {
        // ~30% of weights share a peg already used by the solution or a fixed weight.
        const shared = [...solPegs, ...fixedPegs];
        if (shared.length && rand() < 0.3) solPegs.push(shared[Math.floor(rand() * shared.length)]);
        else solPegs.push(distinct[k % distinct.length]);
      }
    } else {
      if (freeForTray.length < p.count) continue;
      solPegs = shuffle(freeForTray.slice(), rand).slice(0, p.count);
    }
    const weights = solPegs.map(() => 1 + Math.floor(rand() * p.maxW));
    // The last weight balances everything; try its peg among the remaining options.
    let t = fixed.reduce((s, f) => s + f.w * f.d, 0);
    for (let k = 0; k < p.count - 1; k++) t += weights[k] * solPegs[k];
    const usedPegs = new Set([...solPegs.slice(0, -1), ...fixedPegs]);
    const lastOptions = shuffle(
      (p.stack ? open : freeForTray.filter((d) => !usedPegs.has(d))).filter((d) => {
        const w = -t / d;
        return Number.isInteger(w) && w >= 1 && w <= p.maxW;
      }),
      rand,
    );
    if (!lastOptions.length) continue;
    const lastPeg = lastOptions[0];
    solPegs[p.count - 1] = lastPeg;
    weights[p.count - 1] = -t / lastPeg;
    // Shuffle the tray, keeping the solution aligned.
    const order = shuffle(weights.map((_, k) => k), rand);
    const level: Level = {
      n: p.n,
      stack: p.stack,
      blocked: blocked.sort((a, b) => a - b),
      fixed,
      tray: order.map((k) => weights[k]),
      solution: order.map((k) => solPegs[k]),
    };
    fallback ??= level;
    if (levelNo > 1 && isMirrorTrivial(level)) continue;
    if (p.count >= 3 && new Set(level.tray).size === 1) continue;
    // Level 1 teaches leverage: unequal weights at unequal distances.
    if (levelNo === 1 && (level.tray[0] === level.tray[1] || Math.abs(level.solution[0]) === Math.abs(level.solution[1]))) continue;
    return level;
  }
  return fallback!;
}

export function emptyPlacement(level: Level): Placement {
  return level.tray.map(() => null);
}
