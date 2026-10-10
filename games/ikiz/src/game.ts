/**
 * İkiz (Twins) — pure game logic. Two boards side by side; one swipe moves the left twin in
 * the swipe direction and the right twin in the horizontally mirrored direction. A twin that
 * is blocked stays put. Win: both twins on their goals at the same time.
 *
 * Cells: '.' floor, '#' wall, '^' spikes (stepping on = restart), 'k' key, 'd' door
 * (blocks until that board's key is collected).
 */
export type Dir = 'U' | 'D' | 'L' | 'R';
export const DIRS: Dir[] = ['U', 'D', 'L', 'R'];
export const LEVEL_COUNT = 150;

export interface Board {
  cells: string[]; // length w*h, row-major
  start: number;
  goal: number;
}

export interface Level {
  n: number;
  w: number;
  h: number;
  boards: [Board, Board];
  par: number;
}

export interface State {
  pos: [number, number];
  keys: [boolean, boolean];
}

export interface StepResult {
  state: State;
  moved: [boolean, boolean];
  dead: boolean;
  won: boolean;
}

const DELTA: Record<Dir, [number, number]> = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
/** Right twin's direction: left/right swapped, up/down unchanged. */
export const mirror = (d: Dir): Dir => (d === 'L' ? 'R' : d === 'R' ? 'L' : d);

export const initialState = (lv: Level): State => ({ pos: [lv.boards[0].start, lv.boards[1].start], keys: [false, false] });

function moveOne(lv: Level, b: Board, pos: number, hasKey: boolean, d: Dir): number {
  const [dx, dy] = DELTA[d];
  const x = (pos % lv.w) + dx;
  const y = Math.floor(pos / lv.w) + dy;
  if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return pos;
  const np = y * lv.w + x;
  const c = b.cells[np];
  if (c === '#' || (c === 'd' && !hasKey)) return pos;
  return np;
}

export function step(lv: Level, s: State, d: Dir): StepResult {
  const pos: [number, number] = [s.pos[0], s.pos[1]];
  const keys: [boolean, boolean] = [s.keys[0], s.keys[1]];
  const moved: [boolean, boolean] = [false, false];
  let dead = false;
  for (const i of [0, 1] as const) {
    const b = lv.boards[i];
    const np = moveOne(lv, b, pos[i], keys[i], i === 0 ? d : mirror(d));
    moved[i] = np !== pos[i];
    pos[i] = np;
    if (b.cells[np] === 'k') keys[i] = true;
    if (b.cells[np] === '^') dead = true;
  }
  const won = !dead && pos[0] === lv.boards[0].goal && pos[1] === lv.boards[1].goal;
  return { state: { pos, keys }, moved, dead, won };
}

export const isWon = (lv: Level, s: State) => s.pos[0] === lv.boards[0].goal && s.pos[1] === lv.boards[1].goal;

const keyOf = (lv: Level, s: State) => ((s.pos[0] * lv.w * lv.h + s.pos[1]) << 2) | (s.keys[0] ? 1 : 0) | (s.keys[1] ? 2 : 0);

/** BFS over the joint state: shortest move list to a win (never stepping on spikes), or null. */
export function solve(lv: Level, from: State = initialState(lv)): Dir[] | null {
  if (isWon(lv, from)) return [];
  const prev = new Map<number, [number, Dir]>();
  const start = keyOf(lv, from);
  prev.set(start, [-1, 'U']);
  let frontier: State[] = [from];
  while (frontier.length) {
    const next: State[] = [];
    for (const s of frontier) {
      const k = keyOf(lv, s);
      for (const d of DIRS) {
        const r = step(lv, s, d);
        if (r.dead) continue;
        const nk = keyOf(lv, r.state);
        if (prev.has(nk)) continue;
        prev.set(nk, [k, d]);
        if (r.won) {
          const path: Dir[] = [];
          let cur = nk;
          while (cur !== start) {
            const [p, dd] = prev.get(cur)!;
            path.push(dd);
            cur = p;
          }
          return path.reverse();
        }
        next.push(r.state);
      }
    }
    frontier = next;
  }
  return null;
}

/** 3 stars at par, 2 within +50%, else 1. */
export const starsFor = (moves: number, par: number) => (moves <= par ? 3 : moves <= Math.ceil(par * 1.5) ? 2 : 1);

// ───────────────────────── generator ─────────────────────────
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

export interface LevelSpec {
  w: number;
  h: number;
  walls: number; // fraction
  spikes: number; // count per board
  keys: boolean;
  minPar: number;
  maxPar: number;
}

export function specFor(n: number): LevelSpec {
  const w = n <= 25 ? 5 : 6;
  const h = n <= 10 ? 5 : n <= 25 ? 6 : n <= 70 ? 7 : 8;
  const minPar = Math.min(4 + Math.floor(n / 8), 18);
  return {
    w,
    h,
    walls: 0.18 + Math.min(n, 100) * 0.0012,
    spikes: n < 21 ? 0 : n < 61 ? 1 + (n % 2) : 2,
    keys: n >= 61 && n % 3 !== 0,
    minPar,
    maxPar: minPar + (n <= 10 ? 1 : 6),
  };
}

function makeLevel(n: number, sp: LevelSpec, r: () => number): Level | null {
  const { w, h } = sp;
  const N = w * h;
  const mirrorIdx = (i: number) => Math.floor(i / w) * w + (w - 1 - (i % w));
  const left: string[] = Array.from({ length: N }, () => (r() < sp.walls ? '#' : '.'));
  // Right board: mirror image of the left with a share of tiles changed.
  const right: string[] = Array.from({ length: N }, (_, i) => {
    const c = left[mirrorIdx(i)];
    return r() < 0.35 ? (c === '#' ? '.' : r() < 0.6 ? '#' : '.') : c;
  });
  const boards: Board[] = [];
  for (const cells of [left, right]) {
    const free = () => {
      for (let t = 0; t < 200; t++) {
        const i = Math.floor(r() * N);
        if (cells[i] === '.') return i;
      }
      return -1;
    };
    const start = free();
    if (start < 0) return null;
    cells[start] = 'S';
    const goal = free();
    if (goal < 0) return null;
    cells[goal] = 'G';
    for (let s = 0; s < sp.spikes; s++) {
      const i = free();
      if (i >= 0) cells[i] = '^';
    }
    if (sp.keys && r() < 0.8) {
      const k = free();
      if (k >= 0) cells[k] = 'k';
      // door: a free tile next to the goal
      const gx = goal % w;
      const gy = Math.floor(goal / w);
      const nb = [
        [gx - 1, gy],
        [gx + 1, gy],
        [gx, gy - 1],
        [gx, gy + 1],
      ].filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h && cells[y * w + x] === '.');
      for (const [x, y] of nb) cells[y * w + x] = 'd';
    }
    cells[start] = '.';
    cells[goal] = '.';
    boards.push({ cells, start, goal });
  }
  return { n, w, h, boards: [boards[0], boards[1]], par: 0 };
}

const cache = new Map<number, Level>();

/** Deterministic level n (1-based). Retries seeds until par is in range; keeps the best fallback. */
export function generateLevel(n: number): Level {
  const hit = cache.get(n);
  if (hit) return hit;
  const sp = specFor(n);
  const r = rng(n * 7919 + 17);
  let best: Level | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const lv = makeLevel(n, sp, r);
    if (!lv) continue;
    const path = solve(lv);
    if (!path || path.length < 4) continue;
    lv.par = path.length;
    if (path.length >= sp.minPar && path.length <= sp.maxPar) {
      best = lv;
      break;
    }
    if (!best || Math.abs(lv.par - sp.minPar) < Math.abs(best.par - sp.minPar)) best = lv;
  }
  cache.set(n, best!);
  return best!;
}
