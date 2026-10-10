/**
 * Fener — pure game logic. A level is a square grid of STREET, WINDOW and WALL cells plus a
 * tray of lamps. Each lamp has a light pattern; placed on a street cell it lights the windows
 * its pattern covers. Solved = every lamp placed and every window lit exactly once.
 * Levels are built solution-first, so every level is solvable by construction.
 */
export const STREET = 0;
export const WINDOW = 1;
export const WALL = 2;
export type Cell = typeof STREET | typeof WINDOW | typeof WALL;

export type Pattern = 'plus' | 'hbar' | 'vbar' | 'diag';
/** Introduction order: one new pattern at a time. */
export const PATTERN_ORDER: Pattern[] = ['plus', 'hbar', 'vbar', 'diag'];
export const PATTERNS: Record<Pattern, readonly (readonly [number, number])[]> = {
  plus: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  hbar: [[0, -2], [0, -1], [0, 1], [0, 2]],
  vbar: [[-2, 0], [-1, 0], [1, 0], [2, 0]],
  diag: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
};

export interface Pos { r: number; c: number }
export interface Lamp extends Pos { type: Pattern }
/** Placement of each tray lamp (same index as `Level.tray`), or null while in the tray. */
export type Placement = (Pos | null)[];

export interface Level {
  level: number;
  size: number;
  cells: Cell[];
  tray: Pattern[];
  /** solution[i] is where tray[i] goes in the generator's solution. */
  solution: Pos[];
}

export type Rng = () => number;

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

/** Board cells (row-major indices) a lamp of `type` at r,c covers, clipped to the board. */
export function patternCells(size: number, type: Pattern, r: number, c: number): number[] {
  const out: number[] = [];
  for (const [dr, dc] of PATTERNS[type]) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc);
  }
  return out;
}

/** How many times each cell is lit. Only windows count; streets and walls stay 0. */
export function coverage(size: number, cells: readonly Cell[], lamps: readonly Lamp[]): number[] {
  const counts = new Array<number>(size * size).fill(0);
  for (const l of lamps) for (const i of patternCells(size, l.type, l.r, l.c)) if (cells[i] === WINDOW) counts[i]++;
  return counts;
}

export function lampsOf(level: Level, placement: Placement): Lamp[] {
  const out: Lamp[] = [];
  placement.forEach((p, i) => p && out.push({ type: level.tray[i], r: p.r, c: p.c }));
  return out;
}

export interface Evaluation {
  counts: number[];
  lit: number;
  dark: number;
  /** Windows lit two or more times ("too bright"). */
  double: number[];
  windows: number;
  allPlaced: boolean;
  solved: boolean;
}

export function evaluate(level: Level, placement: Placement): Evaluation {
  const counts = coverage(level.size, level.cells, lampsOf(level, placement));
  let lit = 0;
  let dark = 0;
  let windows = 0;
  const double: number[] = [];
  level.cells.forEach((cell, i) => {
    if (cell !== WINDOW) return;
    windows++;
    if (counts[i] === 0) dark++;
    else if (counts[i] === 1) lit++;
    else double.push(i);
  });
  const allPlaced = placement.length === level.tray.length && placement.every(Boolean);
  return { counts, lit, dark, double, windows, allPlaced, solved: allPlaced && dark === 0 && double.length === 0 };
}

/** Lamp `idx` may stand on r,c if it is an on-board street cell not taken by another lamp. */
export function canPlace(level: Level, placement: Placement, idx: number, r: number, c: number): boolean {
  const { size } = level;
  if (r < 0 || c < 0 || r >= size || c >= size) return false;
  if (level.cells[r * size + c] !== STREET) return false;
  return placement.every((p, i) => i === idx || !p || p.r !== r || p.c !== c);
}

export interface HintMove {
  idx: number;
  pos: Pos;
  /** Lamps to send back to the tray first (one standing on the target cell). */
  evict: number[];
}

/**
 * Next correct lamp from the generator's solution, given what the player has placed.
 * Locked lamps (earlier hints) are never moved.
 */
export function hintMove(level: Level, placement: Placement, locked: readonly boolean[]): HintMove | null {
  const { tray, solution } = level;
  const satisfied = (j: number) =>
    placement.some((p, i) => p && tray[i] === tray[j] && p.r === solution[j].r && p.c === solution[j].c);
  // Lamps already on some solution spot of their own type stay where they are.
  const onSolution = (i: number) => {
    const p = placement[i];
    return !!p && solution.some((s, j) => tray[j] === tray[i] && s.r === p.r && s.c === p.c);
  };
  for (let j = 0; j < tray.length; j++) {
    if (satisfied(j)) continue;
    const type = tray[j];
    const candidates = tray.map((_, i) => i).filter((i) => tray[i] === type && !locked[i]);
    const idx =
      candidates.find((i) => !placement[i]) ?? candidates.find((i) => !onSolution(i)) ?? candidates[0];
    if (idx === undefined) continue;
    const pos = solution[j];
    const evict = placement
      .map((p, i) => (p && i !== idx && p.r === pos.r && p.c === pos.c ? i : -1))
      .filter((i) => i >= 0);
    return { idx, pos: { ...pos }, evict };
  }
  return null;
}

export function applyHint(placement: Placement, move: HintMove): Placement {
  const next = placement.slice();
  for (const i of move.evict) next[i] = null;
  next[move.idx] = { ...move.pos };
  return next;
}

// ───────────────────────── level generation ─────────────────────────

export const LEVEL_COUNT = 200;

export interface LevelParams {
  size: number;
  lamps: number;
  patterns: Pattern[];
  walls: boolean;
}

/** Gentle ramp: board 6→9, lamps 2→9, one new light pattern at a time, trees from level 20. */
export function levelParams(level: number): LevelParams {
  const size = level <= 30 ? 6 : level <= 80 ? 7 : level <= 140 ? 8 : 9;
  const lamps =
    level <= 2 ? 2 : level <= 6 ? 3 : level <= 15 ? 4 : level <= 30 ? 5 : level <= 60 ? 6 : level <= 100 ? 7 : level <= 150 ? 8 : 9;
  const n = level < 4 ? 1 : level < 8 ? 2 : level < 16 ? 3 : 4;
  return { size, lamps, patterns: PATTERN_ORDER.slice(0, n), walls: level >= 20 };
}

/** The level that first uses a pattern, so it can be featured there. */
export const introLevel = (p: Pattern) => [1, 4, 8, 16][PATTERN_ORDER.indexOf(p)];

const MIN_LIT = 3;

/** Street cells where a lamp of `type` would light at least MIN_LIT windows. */
function plausibleSpots(size: number, cells: Cell[], type: Pattern): number {
  let n = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== STREET) continue;
    const lit = patternCells(size, type, Math.floor(i / size), i % size).filter((k) => cells[k] === WINDOW).length;
    if (lit >= MIN_LIT) n++;
  }
  return n;
}

function tryBuild(level: number, p: LevelParams, rng: Rng): Level | null {
  const { size, lamps: k } = p;
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const types: Pattern[] = [];
  for (let i = 0; i < k; i++) types.push(pick(p.patterns));
  const newest = p.patterns[p.patterns.length - 1];
  if (level === introLevel(newest)) types[0] = newest; // the new pattern always shows up on its first level
  if (new Set(types).size < Math.min(2, p.patterns.length)) return null;

  const lamps: Lamp[] = [];
  const taken = new Set<number>();
  for (const type of types) {
    // Keep lamps off the outer ring most of the time so patterns aren't wasted off-board.
    const inset = rng() < 0.85 ? 1 : 0;
    const r = inset + Math.floor(rng() * (size - 2 * inset));
    const c = inset + Math.floor(rng() * (size - 2 * inset));
    if (taken.has(r * size + c)) return null;
    taken.add(r * size + c);
    lamps.push({ type, r, c });
  }
  const hits = new Array<number>(size * size).fill(0);
  for (const l of lamps) for (const i of patternCells(size, l.type, l.r, l.c)) hits[i]++;
  const cells: Cell[] = hits.map((h, i) => (h === 1 && !taken.has(i) ? WINDOW : STREET));
  for (const l of lamps) {
    const lit = patternCells(size, l.type, l.r, l.c).filter((i) => cells[i] === WINDOW).length;
    if (lit < MIN_LIT) return null;
  }
  // Trees: decorate some free street cells (never a solution spot). They also remove options.
  if (p.walls) {
    for (let i = 0; i < cells.length; i++) if (cells[i] === STREET && !taken.has(i) && rng() < 0.14) cells[i] = WALL;
  }
  const streets = cells.filter((x) => x === STREET).length;
  if (streets < k + 4) return null;
  // Not trivially forced: most lamps must have more than one believable spot.
  const ambiguous = lamps.filter((l) => plausibleSpots(size, cells, l.type) >= 2).length;
  if (ambiguous < Math.ceil(k * 0.6)) return null;

  // Tray order is a shuffle of the solution's lamps.
  const order = lamps.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    level,
    size,
    cells,
    tray: order.map((i) => lamps[i].type),
    solution: order.map((i) => ({ r: lamps[i].r, c: lamps[i].c })),
  };
}

const cache = new Map<number, Level>();

/** Deterministic: every player gets the same level N. */
export function generateLevel(level: number): Level {
  const hit = cache.get(level);
  if (hit) return hit;
  const p = levelParams(level);
  const rng = seededRng(level * 104_729 + 7);
  for (let attempt = 0; attempt < 20_000; attempt++) {
    const lvl = tryBuild(level, p, rng);
    if (lvl) {
      cache.set(level, lvl);
      return lvl;
    }
  }
  throw new Error(`could not generate level ${level}`);
}

/** 3 stars: no hint and at most 3 undos/pick-ups-back. 2: at most one hint. 1: otherwise. */
export function starsFor(hints: number, undos: number): 1 | 2 | 3 {
  if (hints === 0 && undos <= 3) return 3;
  if (hints <= 1) return 2;
  return 1;
}
