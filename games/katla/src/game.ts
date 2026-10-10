/**
 * Katla (Fold) — pure puzzle logic. A sheet is a set of grid cells; each cell holds a stack of
 * paper layers (bottom → top). A layer is encoded as `front * 4 + back` (colors 0..3): the face
 * pointing up is the "front" of the encoding, so flipping a layer swaps the two halves.
 * Folding mirrors one side of a grid line onto the other: the moving stacks are reversed, every
 * layer flipped, and laid on top. Sheets are always normalized (min x = min y = 0).
 */
export type Layer = number;
export interface Cell {
  x: number;
  y: number;
  s: Layer[];
}
export type Sheet = Cell[];
/** axis 'v' = vertical line x = at, 'h' = horizontal line y = at. dir 1 = the low side (left/top) folds over. */
export interface Move {
  axis: 'v' | 'h';
  at: number;
  dir: 1 | -1;
}

export const layer = (front: number, back: number): Layer => front * 4 + back;
export const face = (l: Layer) => l >> 2;
export const flip = (l: Layer): Layer => ((l & 3) << 2) | (l >> 2);
export const topColor = (c: Cell) => face(c.s[c.s.length - 1]);
/** Color seen on the flap's underside while it turns over (bottom layer's other face). */
export const underColor = (c: Cell) => c.s[0] & 3;

export function dims(sheet: Sheet) {
  let w = 0;
  let h = 0;
  for (const c of sheet) {
    w = Math.max(w, c.x + 1);
    h = Math.max(h, c.y + 1);
  }
  return { w, h };
}

export function normalize(cells: Cell[]): { sheet: Sheet; dx: number; dy: number } {
  let dx = Infinity;
  let dy = Infinity;
  for (const c of cells) {
    dx = Math.min(dx, c.x);
    dy = Math.min(dy, c.y);
  }
  const sheet = cells.map((c) => ({ x: c.x - dx, y: c.y - dy, s: c.s })).sort((a, b) => a.y - b.y || a.x - b.x);
  return { sheet, dx, dy };
}

export const moving = (c: { x: number; y: number }, m: Move) => {
  const v = m.axis === 'v' ? c.x : c.y;
  return m.dir === 1 ? v < m.at : v >= m.at;
};

export function isValid(sheet: Sheet, m: Move) {
  const { w, h } = dims(sheet);
  const n = m.axis === 'v' ? w : h;
  return Number.isInteger(m.at) && m.at >= 1 && m.at <= n - 1 && (m.dir === 1 || m.dir === -1);
}

/** Folds without normalizing (positions stay in the input's coordinates). */
export function foldRaw(sheet: Sheet, m: Move): Cell[] {
  const out = new Map<number, Cell>();
  const key = (x: number, y: number) => (x + 64) * 256 + (y + 64);
  for (const c of sheet) if (!moving(c, m)) out.set(key(c.x, c.y), { x: c.x, y: c.y, s: c.s.slice() });
  for (const c of sheet) {
    if (!moving(c, m)) continue;
    const x = m.axis === 'v' ? 2 * m.at - 1 - c.x : c.x;
    const y = m.axis === 'h' ? 2 * m.at - 1 - c.y : c.y;
    const flap = c.s.slice().reverse().map(flip);
    const k = key(x, y);
    const under = out.get(k);
    if (under) under.s.push(...flap);
    else out.set(k, { x, y, s: flap });
  }
  return [...out.values()];
}

export function fold(sheet: Sheet, m: Move) {
  return normalize(foldRaw(sheet, m));
}

export function movesOf(sheet: Sheet): Move[] {
  const { w, h } = dims(sheet);
  const out: Move[] = [];
  for (let at = 1; at < w; at++) out.push({ axis: 'v', at, dir: 1 }, { axis: 'v', at, dir: -1 });
  for (let at = 1; at < h; at++) out.push({ axis: 'h', at, dir: 1 }, { axis: 'h', at, dir: -1 });
  return out;
}

export const stateKey = (s: Sheet) => s.map((c) => `${c.x},${c.y}:${c.s.join('.')}`).join('|');
export const visibleKey = (s: Sheet) => s.map((c) => `${c.x},${c.y}:${topColor(c)}`).join('|');
/** Target = visible colors only, stored as single-layer cells. */
export const visibleSheet = (s: Sheet): Sheet => s.map((c) => ({ x: c.x, y: c.y, s: [layer(topColor(c), topColor(c))] }));

/** Lower bound on folds needed to shrink a span of n down to t (each fold keeps ≥ half). */
function axisBound(n: number, t: number) {
  if (n < t) return Infinity;
  let k = 0;
  while (n > t) {
    n = Math.ceil(n / 2);
    k++;
  }
  return k;
}

/** True when the target can no longer be reached (spans only shrink). */
export function deadEnd(sheet: Sheet, target: Sheet) {
  const a = dims(sheet);
  const b = dims(target);
  if (a.w < b.w || a.h < b.h) return true;
  return a.w === b.w && a.h === b.h && visibleKey(sheet) !== visibleKey(target);
}

export interface SolveResult {
  par: number;
  path: Move[];
  /** How many distinct first moves start an optimal solution. */
  goodFirst: number;
  firstCount: number;
}

/**
 * Solver state. Only the top face and the underside of each stack can ever become visible
 * (a flap's underside lands face up; a stack's bottom never moves), so a cell is reduced to
 * 1 + top * 4 + under (0 = empty) on a dense w×h grid.
 */
interface Grid {
  w: number;
  h: number;
  c: Uint8Array;
}

function toGrid(sheet: Sheet): Grid {
  const { w, h } = dims(sheet);
  const c = new Uint8Array(w * h);
  for (const cell of sheet) c[cell.y * w + cell.x] = 1 + topColor(cell) * 4 + underColor(cell);
  return { w, h, c };
}

function foldGrid(g: Grid, m: Move): Grid {
  const { w, h } = g;
  const v = m.axis === 'v';
  const n = v ? w : h;
  const lo = m.dir === 1 ? m.at : Math.min(0, 2 * m.at - n); // min raw coordinate on the folded axis
  const n2 = Math.max(m.at, n - m.at);
  const W = v ? n2 : w;
  const H = v ? h : n2;
  const c = new Uint8Array(W * H);
  // stationary side first
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const val = g.c[y * w + x];
      if (!val) continue;
      const p = v ? x : y;
      if ((m.dir === 1 ? p < m.at : p >= m.at)) continue;
      const nx = v ? x - lo : x;
      const ny = v ? y : y - lo;
      c[ny * W + nx] = val;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const val = g.c[y * w + x];
      if (!val) continue;
      const p = v ? x : y;
      if (!(m.dir === 1 ? p < m.at : p >= m.at)) continue;
      const mp = 2 * m.at - 1 - p - lo;
      const nx = v ? mp : x;
      const ny = v ? y : mp;
      const t = (val - 1) >> 2;
      const u = (val - 1) & 3;
      const i = ny * W + nx;
      const under = c[i];
      c[i] = under ? 1 + u * 4 + ((under - 1) & 3) : 1 + u * 4 + t;
    }
  return crop({ w: W, h: H, c });
}

/** Trims empty border rows/columns (odd shapes can leave the mirrored edge empty). */
function crop(g: Grid): Grid {
  let x0 = g.w, y0 = g.h, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (g.c[y * g.w + x]) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  if (x0 === 0 && y0 === 0 && x1 === g.w - 1 && y1 === g.h - 1) return g;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const c = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c[y * w + x] = g.c[(y + y0) * g.w + x + x0];
  return { w, h, c };
}

const gridKey = (g: Grid) => g.w + ':' + String.fromCharCode(...g.c);
const gridVisible = (g: Grid) => g.w + ':' + String.fromCharCode(...Array.from(g.c, (v) => (v ? 1 + ((v - 1) >> 2) : 0)));

function gridMoves(w: number, h: number): Move[] {
  const out: Move[] = [];
  for (let at = 1; at < w; at++) out.push({ axis: 'v', at, dir: 1 }, { axis: 'v', at, dir: -1 });
  for (let at = 1; at < h; at++) out.push({ axis: 'h', at, dir: 1 }, { axis: 'h', at, dir: -1 });
  return out;
}

/** Layered BFS with span pruning. Returns null if not solvable within maxDepth or the state cap. */
export function solve(start: Sheet, target: Sheet, maxDepth = 8, cap = 400_000): SolveResult | null {
  const tg = toGrid(target);
  const goal = gridVisible(tg);
  const g0 = toGrid(start);
  if (gridVisible(g0) === goal) return { par: 0, path: [], goodFirst: 0, firstCount: 0 };
  const firstMoves = gridMoves(g0.w, g0.h);
  type Node = { g: Grid; parent: Node | null; move: Move | null; mask: number };
  const seen = new Set<string>([gridKey(g0)]);
  let layer: Node[] = [{ g: g0, parent: null, move: null, mask: 0 }];
  let total = 0;
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = new Map<string, Node>();
    for (const node of layer) {
      const list = node.parent ? gridMoves(node.g.w, node.g.h) : firstMoves;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        const g = foldGrid(node.g, m);
        if (depth + axisBound(g.w, tg.w) + axisBound(g.h, tg.h) > maxDepth) continue;
        const k = gridKey(g);
        if (seen.has(k)) continue;
        const mask = node.parent ? node.mask : 1 << i;
        const ex = next.get(k);
        if (ex) ex.mask |= mask;
        else next.set(k, { g, parent: node, move: m, mask });
      }
    }
    let found: Node | null = null;
    let mask = 0;
    for (const [k, node] of next) {
      seen.add(k);
      if (node.g.w === tg.w && node.g.h === tg.h && gridVisible(node.g) === goal) {
        found ??= node;
        mask |= node.mask;
      }
    }
    if (found) {
      const path: Move[] = [];
      for (let n: Node | null = found; n && n.move; n = n.parent) path.unshift(n.move);
      let bits = 0;
      for (let b = mask; b; b &= b - 1) bits++;
      return { par: depth, path, goodFirst: bits, firstCount: firstMoves.length };
    }
    total += next.size;
    if (!next.size || total > cap) return null;
    layer = [...next.values()];
  }
  return null;
}

// ───────────────────────── generator ─────────────────────────
export const LEVEL_COUNT = 150;

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Level {
  n: number;
  sheet: Sheet;
  target: Sheet;
  par: number;
  solution: Move[];
}

export function foldsFor(n: number) {
  return n <= 8 ? 2 : n <= 35 ? 3 : n <= 75 ? 4 : n <= 115 ? 5 : 6;
}

function sizeFor(n: number, r: () => number): [number, number] {
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  if (n <= 3) return pick([[3, 2], [2, 3]]);
  if (n <= 12) return pick([[3, 3], [3, 4], [4, 3]]);
  if (n <= 35) return pick([[4, 4], [3, 5], [4, 3], [5, 3]]);
  if (n <= 75) return pick([[4, 5], [5, 4], [4, 4], [5, 5]]);
  if (n <= 115) return pick([[5, 5], [4, 6], [6, 4], [5, 6]]);
  return pick([[5, 6], [6, 5], [6, 6]]);
}

function pattern(kind: number, x: number, y: number, w: number, h: number, r: () => number) {
  switch (kind) {
    case 1: return x < w / 2 ? 0 : 1;
    case 2: return y < h / 2 ? 0 : 1;
    case 3: return (x + y) % 2;
    case 4: return y % 2;
    case 5: return x % 2;
    case 6: return x + y < (w + h) / 2 - 1 ? 0 : 1;
    case 7: return r() < 0.35 ? 1 : 0;
    default: return 0;
  }
}

function makeSheet(n: number, r: () => number): Sheet {
  const [w, h] = sizeFor(n, r);
  const frontKind = n <= 6 ? 0 : 1 + Math.floor(r() * 7);
  const backKind = n <= 40 ? 0 : r() < 0.5 ? 0 : 1 + Math.floor(r() * 6);
  const holes = new Set<string>();
  if (n > 25 && r() < 0.5) {
    const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
    const count = 1 + Math.floor(r() * 2);
    for (let i = 0; i < count; i++) {
      const [cx, cy] = corners[Math.floor(r() * 4)];
      holes.add(`${cx},${cy}`);
    }
  }
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (holes.has(`${x},${y}`)) continue;
      cells.push({ x, y, s: [layer(pattern(frontKind, x, y, w, h, r), 2 + pattern(backKind, x, y, w, h, r))] });
    }
  return normalize(cells).sheet;
}

/**
 * Seeded generator: random natural folds produce the target, BFS finds par, trivial (par < 2) and
 * ambiguous targets are rejected. Runs offline (scripts/gen-levels.mts → src/levels.json) so the
 * game never blocks on a search; tests check the shipped file still matches.
 */
export function generateLevel(n: number, attempts = 80): Level {
  const want = foldsFor(n);
  let best: Level | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const r = rng(n * 7919 + attempt * 104729 + 17);
    const sheet = makeSheet(n, r);
    let cur = sheet;
    for (let i = 0; i < want; i++) {
      // Natural paper folds: the flap is never wider than the part it lands on.
      const { w, h } = dims(cur);
      const ms = movesOf(cur).filter((m) => {
        const n = m.axis === 'v' ? w : h;
        const flap = m.dir === 1 ? m.at : n - m.at;
        return flap <= n - flap;
      });
      if (!ms.length) break;
      cur = fold(cur, ms[Math.floor(r() * ms.length)]).sheet;
    }
    if (cur.length < 2) continue;
    const target = visibleSheet(cur);
    if (visibleKey(target) === visibleKey(sheet)) continue;
    const res = solve(sheet, target, want);
    if (!res || res.par < 2) continue; // trivial
    // ambiguous: too many different openings already lead to an optimal solution
    if (res.goodFirst > Math.max(2, res.firstCount / 3)) continue;
    const lvl = { n, sheet, target, par: res.par, solution: res.path };
    if (!best || lvl.par > best.par || (lvl.par === best.par && lvl.target.length > best.target.length)) best = lvl;
    if (lvl.par >= want && lvl.target.length >= 3) break;
  }
  if (!best) {
    // Fallback (never hit for 1..150, guarded by tests): a plain two-fold square.
    const sheet = makeSheet(1, rng(n));
    const a = fold(sheet, { axis: 'v', at: 1, dir: 1 }).sheet;
    const target = visibleSheet(fold(a, { axis: 'h', at: 1, dir: 1 }).sheet);
    best = { n, sheet, target, par: 2, solution: [{ axis: 'v', at: 1, dir: 1 }, { axis: 'h', at: 1, dir: 1 }] };
  }
  return best;
}

// ───────────────────────── compact level file ─────────────────────────
export interface PackedLevel {
  s: number[][]; // [x, y, front, back]
  t: number[][]; // [x, y, color]
  p: number;
  m: string[]; // e.g. "v2+" = vertical line 2, low side folds
}
export const encodeMove = (m: Move) => `${m.axis}${m.at}${m.dir === 1 ? '+' : '-'}`;
export const decodeMove = (s: string): Move => ({ axis: s[0] as 'v' | 'h', at: Number(s.slice(1, -1)), dir: s.endsWith('+') ? 1 : -1 });
export const packLevel = (l: Level): PackedLevel => ({
  s: l.sheet.map((c) => [c.x, c.y, face(c.s[0]), c.s[0] & 3]),
  t: l.target.map((c) => [c.x, c.y, topColor(c)]),
  p: l.par,
  m: l.solution.map(encodeMove),
});
export const unpackLevel = (n: number, p: PackedLevel): Level => ({
  n,
  sheet: p.s.map(([x, y, f, b]) => ({ x, y, s: [layer(f, b)] })),
  target: p.t.map(([x, y, c]) => ({ x, y, s: [layer(c, c)] })),
  par: p.p,
  solution: p.m.map(decodeMove),
});

export function starsFor(folds: number, par: number) {
  return folds <= par ? 3 : folds <= par + 2 ? 2 : 1;
}
