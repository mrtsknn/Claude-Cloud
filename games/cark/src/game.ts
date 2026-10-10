// Pure game logic for Çark / Cogwork: gear-chain puzzle on a square peg grid.
//
// Nodes are the motor, clocks, fixed belt pulleys and the gears the player places. Gears on
// orthogonally adjacent pegs mesh and turn in opposite directions; the two pulleys of a belt
// turn the SAME direction. A plain square grid is bipartite, so belts are what make direction
// a real puzzle: crossing a belt flips a region's natural parity, and a loop that reaches both
// pulleys through gears forces a gear both ways — the whole group jams.

export type Dir = 1 | -1; // 1 = clockwise
export interface Clock { cell: number; dir: Dir }
export interface Level {
  n: number;
  cols: number;
  rows: number;
  motor: number;
  clocks: Clock[];
  rocks: number[];
  belts: [number, number][];
  tray: number; // gears available
  par: number; // fewest gears that solve it
  solution: number[]; // a par-sized solution (used for hints)
}
export interface Evaluation {
  /** turning direction of every node driven by the motor (absent = idle) */
  dir: Map<number, Dir>;
  /** nodes in a group with a direction conflict */
  jammed: Set<number>;
  clockOk: boolean[];
  won: boolean;
}

export const LEVEL_COUNT = 150;

export const rc = (lv: { cols: number }, cell: number) => [Math.floor(cell / lv.cols), cell % lv.cols] as const;

export function neighbors(lv: { cols: number; rows: number }, cell: number): number[] {
  const [r, c] = rc(lv, cell);
  const out: number[] = [];
  if (r > 0) out.push(cell - lv.cols);
  if (r < lv.rows - 1) out.push(cell + lv.cols);
  if (c > 0) out.push(cell - 1);
  if (c < lv.cols - 1) out.push(cell + 1);
  return out;
}

/**
 * Does the straight belt between two pulleys pass over `cell`? Belts are drawn as a thick strap
 * from hub to hub, so any peg whose centre lies within ~0.6 cells of that segment is covered.
 */
export function beltCrosses(lv: { cols: number }, belt: [number, number], cell: number): boolean {
  const [a, b] = belt;
  if (cell === a || cell === b) return false;
  const [ar, ac] = rc(lv, a);
  const [br, bc] = rc(lv, b);
  const [pr, pc] = rc(lv, cell);
  const dr = br - ar;
  const dc = bc - ac;
  const len2 = dr * dr + dc * dc;
  const k = Math.max(0, Math.min(1, ((pr - ar) * dr + (pc - ac) * dc) / len2));
  const er = ar + k * dr - pr;
  const ec = ac + k * dc - pc;
  return er * er + ec * ec < 0.6 * 0.6;
}

type Board = Pick<Level, 'cols' | 'rows' | 'motor' | 'clocks' | 'rocks' | 'belts'>;

function fixedCells(lv: Board): Set<number> {
  return new Set([lv.motor, ...lv.clocks.map((c) => c.cell), ...lv.belts.flat()]);
}

/** Can a gear be placed on this peg? */
export function isFreePeg(lv: Board, cell: number, gears: Iterable<number>): boolean {
  if (cell < 0 || cell >= lv.cols * lv.rows) return false;
  if (lv.rocks.includes(cell) || fixedCells(lv).has(cell)) return false;
  for (const g of gears) if (g === cell) return false;
  return true;
}

/** Signed BFS over every connected group: parity propagation + jam (conflict) detection. */
export function evaluate(lv: Board, gears: Iterable<number>): Evaluation {
  const nodes = new Set<number>([...fixedCells(lv), ...gears]);
  const partner = new Map<number, number>();
  for (const [a, b] of lv.belts) {
    partner.set(a, b);
    partner.set(b, a);
  }
  const rel = new Map<number, number>();
  const dir = new Map<number, Dir>();
  const jammed = new Set<number>();
  for (const start of nodes) {
    if (rel.has(start)) continue;
    rel.set(start, 1);
    const group = [start];
    let conflict = false;
    for (let i = 0; i < group.length; i++) {
      const c = group[i];
      const links: [number, number][] = neighbors(lv, c).filter((n) => nodes.has(n)).map((n) => [n, -rel.get(c)!]);
      const p = partner.get(c);
      if (p !== undefined) links.push([p, rel.get(c)!]);
      for (const [n, want] of links) {
        const have = rel.get(n);
        if (have === undefined) {
          rel.set(n, want);
          group.push(n);
        } else if (have !== want) conflict = true;
      }
    }
    if (conflict) group.forEach((g) => jammed.add(g));
    else if (group.includes(lv.motor)) {
      const m = rel.get(lv.motor)!;
      for (const g of group) dir.set(g, (rel.get(g)! * m) as Dir);
    }
  }
  const clockOk = lv.clocks.map((c) => dir.get(c.cell) === c.dir);
  return { dir, jammed, clockOk, won: jammed.size === 0 && clockOk.every(Boolean) };
}

export function starsFor(used: number, par: number): number {
  return used <= par ? 3 : used <= par + 1 ? 2 : 1;
}

// ───────────────────────── solver ─────────────────────────

/** Shortest chain of new gears linking the driven network to `target` with the right turn. */
function connect(lv: Board, gears: Set<number>, target: Clock): number[] | null {
  const ev = evaluate(lv, gears);
  if (ev.jammed.size) return null;
  const partner = new Map<number, number>();
  for (const [a, b] of lv.belts) {
    partner.set(a, b);
    partner.set(b, a);
  }
  const blocked = new Set([...lv.rocks, ...lv.clocks.map((c) => c.cell), lv.motor]);
  const key = (cell: number, d: Dir) => cell * 2 + (d > 0 ? 1 : 0);
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const deque: [number, Dir][] = [];
  for (const [cell, d] of ev.dir) {
    dist.set(key(cell, d), 0);
    deque.push([cell, d]);
  }
  // 0-1 BFS: placing a gear costs 1, riding an idle belt costs 0.
  const push = (cell: number, d: Dir, from: number, cost: number, front: boolean) => {
    const k = key(cell, d);
    const nd = dist.get(from)! + cost;
    if (dist.has(k) && dist.get(k)! <= nd) return;
    dist.set(k, nd);
    prev.set(k, from);
    if (front) deque.unshift([cell, d]);
    else deque.push([cell, d]);
  };
  let goal = -1;
  let goalDist = Infinity;
  while (deque.length) {
    const [cell, d] = deque.shift()!;
    const k = key(cell, d);
    const here = dist.get(k)!;
    if (here >= goalDist) continue;
    for (const n of neighbors(lv, cell)) {
      const nd = -d as Dir;
      if (n === target.cell) {
        if (nd === target.dir && here < goalDist) {
          goal = k;
          goalDist = here;
        }
        continue;
      }
      if (blocked.has(n) || ev.dir.has(n) || gears.has(n)) continue;
      // don't touch a driven node that would disagree
      if (neighbors(lv, n).some((m) => ev.dir.has(m) && ev.dir.get(m) !== d && m !== cell)) continue;
      if (partner.has(n)) {
        push(n, nd, k, 0, true);
        push(partner.get(n)!, nd, key(n, nd), 0, true);
      } else push(n, nd, k, 1, false);
    }
  }
  if (goal < 0) return null;
  const path: number[] = [];
  for (let k = goal; prev.has(k); k = prev.get(k)!) {
    if (!partner.has(k >> 1)) path.push(k >> 1);
  }
  return path;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Fewest gears found (greedy shortest chains, every clock order tried); validated by evaluate(). */
export function solve(lv: Board, start: Iterable<number> = []): number[] | null {
  let best: number[] | null = null;
  const base = [...start];
  for (const order of permutations(lv.clocks)) {
    const gears = new Set(base);
    let ok = true;
    for (const clock of order) {
      const ev = evaluate(lv, gears);
      if (ev.dir.get(clock.cell) === clock.dir) continue;
      const path = connect(lv, gears, clock);
      if (!path) {
        ok = false;
        break;
      }
      path.forEach((c) => gears.add(c));
    }
    if (!ok || !evaluate(lv, gears).won) continue;
    const added = [...gears].filter((g) => !base.includes(g));
    if (!best || added.length < best.length) best = added;
  }
  return best;
}

// ───────────────────────── generation ─────────────────────────

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const parity = (lv: { cols: number }, cell: number) => {
  const [r, c] = rc(lv, cell);
  return (r + c) % 2;
};
const manhattan = (lv: { cols: number }, a: number, b: number) => {
  const [ar, ac] = rc(lv, a);
  const [br, bc] = rc(lv, b);
  return Math.abs(ar - br) + Math.abs(ac - bc);
};

export function generateLevel(n: number): Level {
  const rand = rng(n * 7919 + 1301);
  const t = Math.min(1, (n - 1) / (LEVEL_COUNT - 1));
  const cols = 5 + Math.round(2 * t);
  const rows = 6 + Math.round(3 * t);
  const size = cols * rows;
  const nClocks = n < 12 ? 1 : n < 40 ? (rand() < 0.5 ? 1 : 2) : n < 90 ? 2 : rand() < 0.5 ? 2 : 3;
  const nBelts = n < 8 ? 0 : n < 40 ? (rand() < 0.6 ? 1 : 0) : n < 90 ? 1 : rand() < 0.4 ? 2 : 1;
  const nRocks = n < 3 ? 0 : Math.round(size * (0.05 + 0.13 * t));
  const minPar = n === 1 ? 2 : n < 6 ? 3 : 3 + Math.round(t * 5) + nClocks;
  const maxPar = n === 1 ? 3 : n < 6 ? 4 : 99;
  const slack = n <= 30 ? 3 : n <= 90 ? 2 : 1;

  for (let attempt = 0; attempt < 2000; attempt++) {
    const free = Array.from({ length: size }, (_, i) => i);
    const take = (ok: (c: number) => boolean) => {
      const options = free.filter(ok);
      if (!options.length) return -1;
      const c = options[Math.floor(rand() * options.length)];
      free.splice(free.indexOf(c), 1);
      return c;
    };
    const lvl = { cols, rows };
    const motor = take(() => true);
    const clocks: Clock[] = [];
    for (let i = 0; i < nClocks; i++) {
      const cell = take((c) => manhattan(lvl, c, motor) >= 3 && clocks.every((k) => manhattan(lvl, c, k.cell) >= 3));
      if (cell < 0) break;
      const natural: Dir = parity(lvl, cell) === parity(lvl, motor) ? 1 : -1;
      // With belts the first clock always needs the "wrong" parity, so the belt matters.
      const dir: Dir = nBelts === 0 ? natural : i === 0 ? (-natural as Dir) : rand() < 0.5 ? 1 : -1;
      clocks.push({ cell, dir });
    }
    if (clocks.length < nClocks) continue;
    const belts: [number, number][] = [];
    for (let i = 0; i < nBelts; i++) {
      const a = take((c) => [motor, ...clocks.map((k) => k.cell)].every((f) => manhattan(lvl, c, f) >= 2));
      const b = a < 0 ? -1 : take((c) => parity(lvl, c) !== parity(lvl, a) && manhattan(lvl, a, c) >= 3);
      if (b < 0) break;
      belts.push([a, b]);
    }
    if (belts.length < nBelts) continue;
    const rocks: number[] = [];
    // Rocks never sit under a belt: the strap would have to pass straight through them.
    for (let i = 0; i < nRocks; i++) {
      const rock = take((c) => belts.every((bl) => !beltCrosses(lvl, bl, c)));
      if (rock >= 0) rocks.push(rock);
    }
    rocks.sort((a, b) => a - b);
    const board: Board = { cols, rows, motor, clocks, rocks, belts };
    const solution = solve(board);
    if (!solution || solution.length < minPar || solution.length > maxPar) continue;
    // Every belt should be part of the answer, otherwise it's just scenery.
    const ev = evaluate(board, solution);
    if (!belts.every(([a]) => ev.dir.has(a))) continue;
    return { n, ...board, tray: solution.length + slack, par: solution.length, solution };
  }
  throw new Error(`level ${n}: generation failed`);
}
