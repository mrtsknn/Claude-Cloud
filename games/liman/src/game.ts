/**
 * Liman — pure game logic. A ship has columns of stacked containers (index 0 = bottom).
 * Each container goes to a port (1 = first stop) and weighs 1–3. Before sailing:
 *  1. order: in every column, earlier ports must sit above later ports;
 *  2. balance: |right − left| weight ≤ tolerance (an odd centre column is neutral).
 * Everything is deterministic per level so every player gets the same level N.
 */
export interface Box { id: number; port: number; w: number }
export interface Ship { cols: Box[][]; dock: Box[] }
export interface Level { level: number; ports: number; height: number; tol: number; ncols: number; boxes: number }
/** Move the container `id` onto column `to`, or back to the dock when `to` is -1. */
export interface Move { id: number; to: number }
export type Rng = () => number;

export const MAX_LEVEL = 150;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stack height pattern per difficulty tier (added to 3): early levels stay short, late ones mix in tall stacks. */
const HEIGHT_PATTERN: [number, number[]][] = [
  [6, [0]],
  [30, [0, 1, 0, 1, 1]],
  [80, [1, 0, 2, 1, 1, 2]],
  [MAX_LEVEL, [1, 2, 2, 1, 2, 0, 2]],
];

/**
 * Difficulty ramp: 2 ports & 4 boxes → 4 ports & 14 boxes, heavier boxes, tighter limits.
 * Stacks are 3–5 high; the column count follows so the spare deck space shrinks over time.
 */
export function levelParams(level: number): Level {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const p = (l - 1) / (MAX_LEVEL - 1);
  const ports = l <= 8 ? 2 : l <= 40 ? 3 : 4;
  const boxes = l === 1 ? 4 : Math.min(14, Math.round(5 + 9 * p + (l % 4 === 0 ? 1 : 0)));
  const slack = Math.max(1, Math.round(5 - 4 * p));
  const pattern = HEIGHT_PATTERN.find(([upTo]) => l <= upTo)![1];
  const height = 3 + pattern[l % pattern.length];
  const minCols = l <= 35 ? 3 : 4;
  const ncols = Math.max(minCols, Math.min(6, Math.ceil((boxes + slack) / height)));
  const tol = l <= 10 ? 2 : l <= 60 ? 1 : l % 3 === 0 ? 0 : 1;
  return { level: l, ports, height, tol, ncols, boxes };
}

const maxWeight = (level: number) => (level <= 3 ? 1 : level <= 20 ? 2 : 3);

/** -1 left half, +1 right half, 0 for the neutral centre column. */
export const side = (c: number, ncols: number) => (ncols % 2 === 1 && c === (ncols - 1) / 2 ? 0 : c < ncols / 2 ? -1 : 1);

export function balance(ship: Ship): { left: number; right: number; diff: number } {
  let left = 0;
  let right = 0;
  ship.cols.forEach((col, c) => {
    const w = col.reduce((s, b) => s + b.w, 0);
    const s = side(c, ship.cols.length);
    if (s < 0) left += w;
    else if (s > 0) right += w;
  });
  return { left, right, diff: right - left };
}

/** Ids of containers that block an earlier port's container beneath them. */
export function orderViolations(ship: Ship): Set<number> {
  const bad = new Set<number>();
  for (const col of ship.cols) {
    let minBelow = Infinity;
    for (const b of col) {
      if (b.port > minBelow) bad.add(b.id);
      minBelow = Math.min(minBelow, b.port);
    }
  }
  return bad;
}

export function check(ship: Ship, lv: Level) {
  const order = orderViolations(ship).size === 0;
  const bal = Math.abs(balance(ship).diff) <= lv.tol;
  return { loaded: ship.dock.length === 0, order, balance: bal, ok: ship.dock.length === 0 && order && bal };
}

export function locate(ship: Ship, id: number): { col: number; index: number } | null {
  const d = ship.dock.findIndex((b) => b.id === id);
  if (d >= 0) return { col: -1, index: d };
  for (let c = 0; c < ship.cols.length; c++) {
    const i = ship.cols[c].findIndex((b) => b.id === id);
    if (i >= 0) return { col: c, index: i };
  }
  return null;
}

/** Only dock boxes and the top box of a column can move; columns have a height limit. */
export function canMove(ship: Ship, lv: Level, m: Move): boolean {
  const at = locate(ship, m.id);
  if (!at || at.col === m.to) return false;
  if (at.col >= 0 && at.index !== ship.cols[at.col].length - 1) return false;
  if (m.to === -1) return true;
  return m.to >= 0 && m.to < ship.cols.length && ship.cols[m.to].length < lv.height;
}

export function applyMove(ship: Ship, lv: Level, m: Move): Ship | null {
  if (!canMove(ship, lv, m)) return null;
  const at = locate(ship, m.id)!;
  const next: Ship = { cols: ship.cols.map((c) => c.slice()), dock: ship.dock.slice() };
  const [box] = at.col === -1 ? next.dock.splice(at.index, 1) : next.cols[at.col].splice(at.index, 1);
  if (m.to === -1) next.dock.push(box);
  else next.cols[m.to].push(box);
  return next;
}

/** Places `pool` onto the given columns (kept as-is) so that both rules hold. */
function placeAll(cols: Box[][], pool: Box[], lv: Level): Move[] | null {
  const items = pool.slice().sort((a, b) => b.port - a.port || b.w - a.w);
  const n = cols.length;
  const sides = cols.map((_, c) => side(c, n));
  const h = cols.map((c) => c.length);
  const top = cols.map((c) => (c.length ? c[c.length - 1].port : Infinity));
  const rest: number[] = new Array(items.length + 1).fill(0);
  for (let i = items.length - 1; i >= 0; i--) rest[i] = rest[i + 1] + items[i].w;
  let diff = 0;
  cols.forEach((col, c) => col.forEach((b) => (diff += sides[c] * b.w)));
  const failed = new Set<string>();
  const plan: number[] = [];
  const dfs = (i: number): boolean => {
    if (Math.abs(diff) - rest[i] > lv.tol) return false;
    if (i === items.length) return true;
    const key = `${i}|${diff}|${h.join(',')}|${top.join(',')}`;
    if (failed.has(key)) return false;
    const box = items[i];
    const tried = new Set<string>();
    // Prefer the side that fixes the balance first.
    const order = cols.map((_, c) => c).sort((a, b) => sides[a] * diff * box.w - sides[b] * diff * box.w);
    for (const c of order) {
      if (h[c] >= lv.height || top[c] < box.port) continue;
      const sig = `${sides[c]}:${h[c]}:${top[c]}`;
      if (tried.has(sig)) continue;
      tried.add(sig);
      const prevTop = top[c];
      h[c]++;
      top[c] = box.port;
      diff += sides[c] * box.w;
      plan.push(c);
      if (dfs(i + 1)) return true;
      plan.pop();
      diff -= sides[c] * box.w;
      top[c] = prevTop;
      h[c]--;
    }
    failed.add(key);
    return false;
  };
  if (!dfs(0)) return null;
  return items.map((b, i) => ({ id: b.id, to: plan[i] }));
}

/**
 * Shortest-ish plan from any state: keep as much of the ship as possible, re-stowing the
 * fewest top containers to the dock, then load the rest. Null only if nothing works.
 */
export function solve(ship: Ship, lv: Level): Move[] | null {
  const n = ship.cols.length;
  // Minimum removals per column so the remaining stack obeys the order rule.
  const minR = ship.cols.map((col) => {
    let ok = 0;
    let minBelow = Infinity;
    for (const b of col) {
      if (b.port > minBelow) break;
      minBelow = Math.min(minBelow, b.port);
      ok++;
    }
    return col.length - ok;
  });
  const tryRemoval = (r: number[]): Move[] | null => {
    const kept = ship.cols.map((col, c) => col.slice(0, col.length - r[c]));
    const removed: Move[] = [];
    const pool = ship.dock.slice();
    ship.cols.forEach((col, c) => {
      for (let k = 0; k < r[c]; k++) {
        const b = col[col.length - 1 - k];
        removed.push({ id: b.id, to: -1 });
        pool.push(b);
      }
    });
    const rest = placeAll(kept, pool, lv);
    return rest ? [...removed, ...rest] : null;
  };
  // Enumerate up to 3 extra removals, cheapest first; fall back to unloading everything.
  const vectors: number[][] = [];
  const rec = (c: number, acc: number[], extra: number) => {
    if (c === n) return vectors.push(acc.slice());
    for (let e = 0; e <= extra && minR[c] + e <= ship.cols[c].length; e++) {
      acc.push(minR[c] + e);
      rec(c + 1, acc, extra - e);
      acc.pop();
    }
  };
  rec(0, [], 3);
  vectors.sort((a, b) => a.reduce((s, x) => s + x, 0) - b.reduce((s, x) => s + x, 0));
  for (const r of vectors) {
    const res = tryRemoval(r);
    if (res) return res;
  }
  return tryRemoval(ship.cols.map((c) => c.length));
}

function shuffle<T>(arr: T[], rng: Rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * The "no thought" strategy: take the dock containers in the order they are shown and drop each
 * one on a legal column (order rule kept, room left) that best evens the balance; ties go to the
 * shorter, then the leftmost column. True when that alone gives a ship that may sail.
 */
export function greedySolves(ship: Ship, lv: Level): boolean {
  let s: Ship = { cols: ship.cols.map((c) => c.slice()), dock: ship.dock.slice() };
  for (const box of ship.dock) {
    const diff = balance(s).diff;
    let best = -1;
    let bestScore = Infinity;
    for (let c = 0; c < s.cols.length; c++) {
      const col = s.cols[c];
      if (col.length >= lv.height || (col.length && col[col.length - 1].port < box.port)) continue;
      const score = Math.abs(diff + side(c, s.cols.length) * box.w) * 100 + col.length;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best < 0) return false;
    s = applyMove(s, lv, { id: box.id, to: best })!;
  }
  return check(s, lv).ok;
}

/** From this level on, a dock that the greedy strategy loads correctly is rejected. */
export const GREEDY_FROM = 6;

/** Builds a valid loaded ship first, then empties it onto the dock in shuffled order. */
export function generateLevel(level: number): { lv: Level; ship: Ship; solution: Ship } {
  const lv = levelParams(level);
  const rng = mulberry32(level * 7919 + 17);
  const wMax = maxWeight(lv.level);
  const empty = () => Array.from({ length: lv.ncols }, () => [] as Box[]);
  for (let attempt = 0; attempt < 400; attempt++) {
    const ports = Array.from({ length: lv.boxes }, (_, i) => (i < lv.ports ? i + 1 : 1 + Math.floor(rng() * lv.ports)));
    const boxes: Box[] = ports.map((port, id) => ({ id, port, w: 1 + Math.floor(rng() * wMax) }));
    const cols: Box[][] = empty();
    for (const b of boxes) {
      const open = cols.map((_, c) => c).filter((c) => cols[c].length < lv.height);
      cols[open[Math.floor(rng() * open.length)]].push(b);
    }
    for (const col of cols) col.sort((a, b) => b.port - a.port);
    const solution: Ship = { cols, dock: [] };
    // Nudge weights toward balance; reject if still off.
    for (let k = 0; k < 20 && Math.abs(balance(solution).diff) > lv.tol; k++) {
      const d = balance(solution).diff;
      const heavy = cols.flatMap((col, c) => (side(c, lv.ncols) === Math.sign(d) ? col : [])).filter((b) => b.w > 1);
      if (!heavy.length) break;
      heavy[Math.floor(rng() * heavy.length)].w--;
    }
    if (Math.abs(balance(solution).diff) > lv.tol) continue;
    // Must use both sides, otherwise there is nothing to think about.
    if (lv.level > 1 && cols.filter((c, i) => c.length && side(i, lv.ncols) !== 0).length < 2) continue;
    // Reject docks that load correctly when simply taken left to right (greedySolves).
    for (let k = 0; k < 12; k++) {
      const ship: Ship = { cols: empty(), dock: shuffle(boxes.map((b) => ({ ...b })), rng) };
      if (lv.level < GREEDY_FROM || !greedySolves(ship, lv)) return { lv, ship, solution };
    }
  }
  throw new Error(`level ${level}: generation failed`);
}

/** 3 stars for a clean run at par; −1 for using undo/hints, −1 for extra moves. */
export function stars(moves: number, par: number, undos: number, hints: number): number {
  let s = 3;
  if (undos > 0 || hints > 0) s--;
  if (moves > par) s--;
  return Math.max(1, s);
}
