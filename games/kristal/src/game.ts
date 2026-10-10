/**
 * Kristal — pure game logic.
 *
 * The snowflake lives on a hexagonal lattice around a fixed centre cell. Ring r (r = 1..n) has 6r
 * cells, split into 6 sides of r cells. One side of every ring together forms the WEDGE: cell
 * (r, j) with j = 0..r-1, i.e. the lattice point (r-j)·d0 + j·d1. Its 6 rotations fill the flake.
 * The whole board state is therefore just a bitmask over the wedge cells (≤ 21 bits).
 *
 * With mirror symmetry the wedge state is kept symmetric under (r, j) → (r, (r-j) mod r), so the
 * rotated copies also form 12-fold patterns. Pressing a cell XORs its "press mask" into the state;
 * targets are XORs of press masks, so they are always reachable, and the minimal number of
 * presses (par) is found by Gaussian elimination over GF(2) plus a nullspace search.
 */
export const LEVELS = 150;

export interface Cell {
  r: number; // ring 1..n
  j: number; // position on the wedge side 0..r-1
  a: number; // coordinate along d0 (= r - j)
  b: number; // coordinate along d1 (= j)
}

export interface Config {
  n: number; // rings
  neighbours: boolean; // pressing also toggles wedge neighbours (Lights Out rule)
  mirror: boolean; // 12-fold (rotation + mirror) symmetry
}

export interface Level extends Config {
  level: number;
  target: number;
  par: number;
  solution: number[]; // minimal set of cells to press from the empty board
}

export const cellCount = (n: number) => (n * (n + 1)) / 2;
export const cellIndex = (r: number, j: number) => (r * (r - 1)) / 2 + j;

export function wedgeCells(n: number): Cell[] {
  const out: Cell[] = [];
  for (let r = 1; r <= n; r++) for (let j = 0; j < r; j++) out.push({ r, j, a: r - j, b: j });
  return out;
}

/** Index of the mirror image of wedge cell i (cells on a mirror axis map to themselves). */
export function mirrorOf(i: number, n: number): number {
  const { r, j } = wedgeCells(n)[i];
  return cellIndex(r, (r - j) % r);
}

/** Hex neighbours of wedge cell i that are also wedge cells (centre and outside excluded). */
export function neighboursOf(i: number, n: number): number[] {
  const { a, b } = wedgeCells(n)[i];
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const out: number[] = [];
  for (const [da, db] of steps) {
    const na = a + da;
    const nb = b + db;
    if (na >= 1 && nb >= 0 && na + nb <= n) out.push(cellIndex(na + nb, nb));
  }
  return out;
}

/** Bitmask of wedge cells toggled by pressing cell i. */
export function pressMask(i: number, cfg: Config): number {
  const set = [i, ...(cfg.neighbours ? neighboursOf(i, cfg.n) : [])];
  let m = 0;
  for (const c of set) {
    m |= 1 << c;
    if (cfg.mirror) m |= 1 << mirrorOf(c, cfg.n);
  }
  return m;
}

export const press = (state: number, i: number, cfg: Config) => state ^ pressMask(i, cfg);

export function popcount(x: number): number {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
}

/**
 * Minimal-weight x with XOR_{i in x} cols[i] = target over GF(2), or null if unreachable.
 * Gaussian elimination to reduced row echelon form, then all nullspace combinations are tried
 * (nullity is tiny here) to find the solution with the fewest presses.
 */
export function solveGF2(cols: number[], target: number, bits: number): number[] | null {
  const m = cols.length;
  // Row r: which variables affect bit r, plus the right-hand side.
  const rows: { v: number; rhs: number }[] = [];
  for (let r = 0; r < bits; r++) {
    let v = 0;
    for (let c = 0; c < m; c++) if ((cols[c] >> r) & 1) v |= 1 << c;
    rows.push({ v, rhs: (target >> r) & 1 });
  }
  const pivots: number[] = []; // pivots[k] = variable of row k
  let k = 0;
  for (let c = 0; c < m && k < rows.length; c++) {
    const p = rows.findIndex((row, idx) => idx >= k && (row.v >> c) & 1);
    if (p < 0) continue;
    [rows[k], rows[p]] = [rows[p], rows[k]];
    for (let r = 0; r < rows.length; r++) {
      if (r !== k && (rows[r].v >> c) & 1) {
        rows[r].v ^= rows[k].v;
        rows[r].rhs ^= rows[k].rhs;
      }
    }
    pivots.push(c);
    k++;
  }
  for (let r = k; r < rows.length; r++) if (rows[r].rhs) return null;
  let particular = 0;
  pivots.forEach((c, r) => rows[r].rhs && (particular |= 1 << c));
  const pivotSet = new Set(pivots);
  const basis: number[] = [];
  for (let f = 0; f < m; f++) {
    if (pivotSet.has(f)) continue;
    let vec = 1 << f;
    pivots.forEach((c, r) => (rows[r].v >> f) & 1 && (vec |= 1 << c));
    basis.push(vec);
  }
  let best = particular;
  const limit = basis.length <= 16 ? 1 << basis.length : 1;
  for (let s = 1; s < limit; s++) {
    let x = particular;
    for (let t = 0; t < basis.length; t++) if ((s >> t) & 1) x ^= basis[t];
    if (popcount(x) < popcount(best)) best = x;
  }
  const out: number[] = [];
  for (let c = 0; c < m; c++) if ((best >> c) & 1) out.push(c);
  return out;
}

/** Fewest presses that turn `state` into `target` (null if impossible). */
export function solve(state: number, target: number, cfg: Config): number[] | null {
  const n = cellCount(cfg.n);
  const cols = Array.from({ length: n }, (_, i) => pressMask(i, cfg));
  return solveGF2(cols, state ^ target, n);
}

export function stars(taps: number, par: number): number {
  if (taps <= par) return 3;
  if (taps <= par + Math.max(2, Math.ceil(par / 2))) return 2;
  return 1;
}

// ───────────────────────── levels ─────────────────────────
interface Band {
  from: number;
  to: number;
  n: number;
  neighbours: boolean;
  mirror: boolean;
  k: [number, number];
  /** Gentle intro bands: at most this many lit wedge cells, so the target reads as a sparse shape. */
  maxOn?: number;
}
const BANDS: Band[] = [
  { from: 1, to: 6, n: 3, neighbours: false, mirror: false, k: [2, 4] },
  { from: 7, to: 14, n: 4, neighbours: false, mirror: false, k: [3, 6] },
  // First neighbour levels: two or three presses on a sparse target, so the new rule is felt
  // (a tap lights a little cluster, the second tap carves it) without a near-full flake.
  { from: 15, to: 24, n: 3, neighbours: true, mirror: false, k: [2, 3], maxOn: 3 },
  { from: 25, to: 39, n: 4, neighbours: true, mirror: false, k: [2, 5] },
  { from: 40, to: 54, n: 4, neighbours: true, mirror: true, k: [2, 4] },
  { from: 55, to: 89, n: 5, neighbours: true, mirror: false, k: [3, 7] },
  { from: 90, to: 119, n: 5, neighbours: true, mirror: true, k: [3, 6] },
  { from: 120, to: 150, n: 6, neighbours: true, mirror: true, k: [4, 8] },
];

export function levelConfig(level: number): Config & { taps: number; maxOn: number } {
  const L = Math.max(1, Math.min(LEVELS, Math.floor(level)));
  const b = BANDS.find((x) => L >= x.from && L <= x.to)!;
  const span = b.k[1] - b.k[0] + 1;
  const taps = b.k[0] + Math.floor(((L - b.from) * span) / (b.to - b.from + 1));
  return { n: b.n, neighbours: b.neighbours, mirror: b.mirror, taps, maxOn: b.maxOn ?? cellCount(b.n) };
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic: level N is the same for everyone. Levels past LEVELS reuse the last band. */
export function generateLevel(level: number): Level {
  const cfg = levelConfig(level);
  const rng = mulberry32(level * 7919 + 17);
  const n = cellCount(cfg.n);
  let best: Level | null = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let target = 0;
    for (const c of order.slice(0, cfg.taps)) target = press(target, c, cfg);
    if (!target) continue;
    const solution = solve(0, target, cfg)!;
    const lvl: Level = { level, n: cfg.n, neighbours: cfg.neighbours, mirror: cfg.mirror, target, par: solution.length, solution };
    const sparse = popcount(target) <= cfg.maxOn;
    const bestSparse = best !== null && popcount(best.target) <= cfg.maxOn;
    if (!best || (sparse && !bestSparse) || (sparse === bestSparse && lvl.par > best.par)) best = lvl;
    if (sparse && lvl.par >= Math.max(1, cfg.taps - 1)) break;
  }
  return best!;
}

/** Lattice positions (unit spacing, y down, first spoke pointing up) of the 6 copies of cell i. */
export function cellCopies(i: number, n: number): { x: number; y: number }[] {
  const { a, b } = wedgeCells(n)[i];
  const dir = (k: number) => {
    const t = ((-90 + 60 * k) * Math.PI) / 180;
    return [Math.cos(t), Math.sin(t)];
  };
  return [0, 1, 2, 3, 4, 5].map((k) => {
    const [x0, y0] = dir(k);
    const [x1, y1] = dir(k + 1);
    return { x: a * x0 + b * x1, y: a * y0 + b * y1 };
  });
}
