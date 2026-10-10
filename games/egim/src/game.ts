/**
 * Eğim / Tilt — pure game logic. A walled grid holds marbles; tilting the board rolls every
 * marble in that direction until it hits a wall or another marble (2048-style, front marble
 * first). A marble rolling over a cup of its own colour drops in; over another colour's cup it
 * rolls past; over a pit it is lost. Goal: sink every marble.
 */

export const FLOOR = 0;
export const WALL = 1;
export const PIT = 2;
/** Cup of colour c is encoded as CUP + c. */
export const CUP = 10;

export type Dir = 0 | 1 | 2 | 3; // up, right, down, left
export const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export interface Marble {
  p: number; // cell index y*w+x
  c: number; // colour 0..3
}

export interface Level {
  n: number;
  w: number;
  h: number;
  cells: number[];
  marbles: Marble[];
  par: number;
  solution: Dir[];
}

export interface MarbleMove {
  c: number;
  from: number;
  to: number; // last cell reached (the cup / pit cell when it dropped)
  fate: 'stay' | 'sunk' | 'pit';
}

export interface TiltResult {
  marbles: Marble[];
  moves: MarbleMove[];
  sunk: number;
  lost: number;
  changed: boolean;
}

export function tilt(lv: Pick<Level, 'w' | 'h' | 'cells'>, marbles: Marble[], dir: Dir): TiltResult {
  const [dx, dy] = DIRS[dir];
  const { w, h, cells } = lv;
  const proj = (p: number) => (p % w) * dx + Math.floor(p / w) * dy;
  const order = marbles.map((_, i) => i).sort((a, b) => proj(marbles[b].p) - proj(marbles[a].p));
  const occ = new Set(marbles.map((m) => m.p));
  const moves: MarbleMove[] = new Array(marbles.length);
  const out: Marble[] = [];
  let sunk = 0;
  let lost = 0;
  let changed = false;
  for (const i of order) {
    const m = marbles[i];
    occ.delete(m.p);
    let x = m.p % w;
    let y = Math.floor(m.p / w);
    let fate: MarbleMove['fate'] = 'stay';
    for (;;) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
      const np = ny * w + nx;
      const cell = cells[np];
      if (cell === WALL || occ.has(np)) break;
      x = nx;
      y = ny;
      if (cell === PIT) {
        fate = 'pit';
        break;
      }
      if (cell === CUP + m.c) {
        fate = 'sunk';
        break;
      }
    }
    const to = y * w + x;
    if (to !== m.p || fate !== 'stay') changed = true;
    moves[i] = { c: m.c, from: m.p, to, fate };
    if (fate === 'stay') {
      occ.add(to);
      out.push({ p: to, c: m.c });
    } else if (fate === 'sunk') sunk++;
    else lost++;
  }
  out.sort((a, b) => a.p - b.p);
  return { marbles: out, moves, sunk, lost, changed };
}

export const keyOf = (ms: Marble[]) =>
  ms
    .map((m) => m.p * 4 + m.c)
    .sort((a, b) => a - b)
    .join(',');

/** Shortest tilt sequence that sinks every marble without losing one; null if none (within cap). */
export function solve(lv: Pick<Level, 'w' | 'h' | 'cells'>, start: Marble[], cap = 30000): Dir[] | null {
  if (start.length === 0) return [];
  const seen = new Map<string, { prev: string; dir: Dir } | null>();
  const k0 = keyOf(start);
  seen.set(k0, null);
  let frontier: { k: string; ms: Marble[] }[] = [{ k: k0, ms: start }];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const { k, ms } of frontier) {
      for (const dir of [0, 1, 2, 3] as Dir[]) {
        const r = tilt(lv, ms, dir);
        if (!r.changed || r.lost) continue;
        const nk = keyOf(r.marbles);
        if (seen.has(nk)) continue;
        seen.set(nk, { prev: k, dir });
        if (r.marbles.length === 0) {
          const path: Dir[] = [];
          let cur: string = nk;
          for (let s = seen.get(cur); s; s = seen.get(cur)) {
            path.push(s.dir);
            cur = s.prev;
          }
          return path.reverse();
        }
        if (seen.size > cap) return null;
        next.push({ k: nk, ms: r.marbles });
      }
    }
    frontier = next;
  }
  return null;
}

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

export const LEVEL_COUNT = 150;

export function paramsFor(n: number) {
  const colors = n <= 8 ? 1 : n <= 30 ? 2 : n <= 75 ? 3 : 4;
  const perColor = n <= 3 ? 1 : n <= 8 ? 2 : n <= 50 ? (n % 3 === 0 ? 2 : 1) + (n > 20 ? 1 : 0) : 2;
  const pits = n < 15 ? 0 : n < 40 ? 1 : n < 100 ? 2 : 3;
  const size = n <= 5 ? 5 : n <= 20 ? 6 : n <= 60 ? 7 : 8;
  const walls = 0.1 + Math.min(0.1, n / 1000);
  const minPar = Math.min(3 + Math.floor(n / 15), 10);
  return { colors, perColor, pits, w: size, h: size + (n > 40 ? 1 : 0), walls, minPar };
}

function candidate(n: number, rng: () => number): Omit<Level, 'par' | 'solution'> {
  const P = paramsFor(n);
  const { w, h } = P;
  const cells = new Array(w * h).fill(FLOOR);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) cells[y * w + x] = WALL;
  const inner: number[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) inner.push(y * w + x);
  const take = () => {
    for (let i = 0; i < 50; i++) {
      const p = inner[Math.floor(rng() * inner.length)];
      if (cells[p] === FLOOR) return p;
    }
    return inner.find((p) => cells[p] === FLOOR)!;
  };
  const nWalls = Math.round(inner.length * P.walls);
  for (let i = 0; i < nWalls; i++) cells[take()] = WALL;
  for (let c = 0; c < P.colors; c++) cells[take()] = CUP + c;
  for (let i = 0; i < P.pits; i++) cells[take()] = PIT;
  const marbles: Marble[] = [];
  const used = new Set<number>();
  for (let c = 0; c < P.colors; c++)
    for (let k = 0; k < P.perColor; k++) {
      let p = take();
      while (used.has(p)) p = take();
      used.add(p);
      marbles.push({ p, c });
    }
  marbles.sort((a, b) => a.p - b.p);
  return { n, w, h, cells, marbles };
}

const cache = new Map<number, Level>();

/** Deterministic level n (1-based): random boards rejected until BFS par fits the ramp. */
export function generateLevel(n: number): Level {
  const hit = cache.get(n);
  if (hit) return hit;
  const P = paramsFor(n);
  const rng = mulberry32(n * 7919 + 17);
  let best: Level | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const c = candidate(n, rng);
    const sol = solve(c, c.marbles, 8000);
    if (!sol || sol.length < 3) continue;
    const lv: Level = { ...c, par: sol.length, solution: sol };
    if (!best || lv.par > best.par) best = lv;
    if (lv.par >= P.minPar && lv.par <= P.minPar + 6) {
      best = lv;
      break;
    }
  }
  if (!best) throw new Error(`no level ${n}`);
  cache.set(n, best);
  return best;
}

/** 3 stars at par, 2 within par+2 (or 1.5×par), else 1. */
export function starsFor(tilts: number, par: number) {
  if (tilts <= par) return 3;
  if (tilts <= Math.max(par + 2, Math.ceil(par * 1.5))) return 2;
  return 1;
}
