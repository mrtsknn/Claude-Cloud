/**
 * Buz — pure game logic (no DOM). A character slides on an ice grid until something stops it.
 *
 * Tiles: '.' ice · '#' rock (stops before) · '*' snow (stops on) · 'x' cracked ice (turns into
 * water once you leave it) · '~' water (fall) · '^' '>' 'v' '<' arrows (redirect) ·
 * '1'..'4' portals (each id twice; you pop out of the twin and keep sliding).
 * The igloo stops you; reaching it with every fish collected wins.
 */
export type Dir = 0 | 1 | 2 | 3; // up, right, down, left
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const LEVEL_COUNT = 200;

export interface Level {
  n: number;
  w: number;
  h: number;
  tiles: string[]; // one char per cell, index = y * w + x
  start: number;
  igloo: number;
  fish: number[];
  par: number;
}

export interface State {
  pos: number;
  got: number; // bitmask over level.fish
  broken: number; // bitmask over cracked cells (crackIndex order)
}

export interface SlideResult {
  state: State;
  path: number[]; // every cell entered, in order (portal twin included)
  fell: boolean;
  won: boolean;
  collected: number[]; // fish indexes picked up during this slide
}

const ARROW: Record<string, Dir> = { '^': 0, '>': 1, v: 2, '<': 3 };

export function initialState(level: Level): State {
  return { pos: level.start, got: 0, broken: 0 };
}

const crackCache = new WeakMap<Level, Map<number, number>>();
/** cell -> bit index for cracked tiles. */
export function crackIndex(level: Level): Map<number, number> {
  let m = crackCache.get(level);
  if (!m) {
    m = new Map();
    level.tiles.forEach((t, i) => t === 'x' && m!.set(i, m!.size));
    crackCache.set(level, m);
  }
  return m;
}

export const allFish = (level: Level) => (1 << level.fish.length) - 1;

/** Effective tile at a cell given broken cracked ice. */
export function tileAt(level: Level, state: State, cell: number): string {
  const t = level.tiles[cell];
  if (t === 'x') {
    const b = crackIndex(level).get(cell)!;
    return state.broken & (1 << b) ? '~' : 'x';
  }
  return t;
}

function twin(level: Level, cell: number): number {
  const id = level.tiles[cell];
  for (let i = 0; i < level.tiles.length; i++) if (i !== cell && level.tiles[i] === id) return i;
  return cell;
}

/** Slides from the current position. Returns null if the move goes nowhere (or loops forever). */
export function slide(level: Level, state: State, dir: Dir): SlideResult | null {
  const { w, h } = level;
  const cracks = crackIndex(level);
  let p = state.pos;
  let d = dir;
  let got = state.got;
  let broken = state.broken;
  const path: number[] = [];
  const collected: number[] = [];
  let fell = false;
  const limit = w * h * 4;
  for (let steps = 0; ; steps++) {
    if (steps > limit) return null;
    const x = (p % w) + DX[d];
    const y = Math.floor(p / w) + DY[d];
    if (x < 0 || y < 0 || x >= w || y >= h) break;
    const n = y * w + x;
    if (level.tiles[n] === '#') break;
    // leaving cracked ice breaks it
    const cb = cracks.get(p);
    if (cb !== undefined) broken |= 1 << cb;
    p = n;
    path.push(p);
    const t = tileAt(level, { pos: p, got, broken }, p);
    if (t === '~') {
      fell = true;
      break;
    }
    const fi = level.fish.indexOf(p);
    if (fi >= 0 && !(got & (1 << fi))) {
      got |= 1 << fi;
      collected.push(fi);
    }
    if (p === level.igloo || t === '*') break;
    if (t in ARROW) d = ARROW[t];
    else if (t >= '1' && t <= '4') {
      p = twin(level, p);
      path.push(p);
    }
  }
  if (!path.length) return null;
  const won = !fell && p === level.igloo && got === allFish(level);
  return { state: { pos: p, got, broken }, path, fell, won, collected };
}

/** Shortest list of moves from `state` to a win (BFS over position × fish × broken ice). */
export function solve(level: Level, state: State, maxStates = 400_000): Dir[] | null {
  const cells = level.w * level.h;
  const fishBits = level.fish.length;
  const key = (s: State) => s.pos + cells * (s.got + (s.broken << fishBits));
  const seen = new Map<number, { prev: number; dir: Dir }>();
  const startKey = key(state);
  seen.set(startKey, { prev: -1, dir: 0 });
  let queue: [State, number][] = [[state, startKey]];
  while (queue.length) {
    const next: [State, number][] = [];
    for (const [s, k] of queue) {
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        const r = slide(level, s, d);
        if (!r || r.fell) continue;
        const nk = key(r.state);
        if (seen.has(nk)) continue;
        seen.set(nk, { prev: k, dir: d });
        if (r.won) {
          const moves: Dir[] = [];
          let c = nk;
          while (c !== startKey) {
            const e = seen.get(c)!;
            moves.unshift(e.dir);
            c = e.prev;
          }
          return moves;
        }
        if (seen.size > maxStates) return null;
        next.push([r.state, nk]);
      }
    }
    queue = next;
  }
  return null;
}

// ───────────────────────── generator ─────────────────────────
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

export function levelParams(n: number) {
  return {
    w: n <= 8 ? 5 : n <= 40 ? 6 : 7,
    h: n <= 8 ? 7 : n <= 40 ? 8 : 9,
    rocks: 0.1 + Math.min(0.08, n * 0.0008),
    snow: n >= 5 ? 1 + (n % 3) : 0,
    cracked: n >= 25 ? 1 + Math.min(3, Math.floor((n - 25) / 30)) : 0,
    water: n >= 35 ? 1 + (n % 2) : 0,
    arrows: n >= 60 ? 1 + Math.min(2, Math.floor((n - 60) / 40)) : 0,
    portals: n >= 100 ? (n >= 150 ? 2 : 1) : 0,
    fish: Math.min(6, 1 + Math.floor((n + 4) / 12)),
    walk: Math.min(11, 3 + Math.floor(n / 22)),
    minPar: Math.min(8, 3 + Math.floor(n / 28)),
  };
}

function attempt(n: number, rnd: () => number): Level | null {
  const P = levelParams(n);
  const { w, h } = P;
  const cells = w * h;
  const tiles: string[] = Array(cells).fill('.');
  const ri = (k: number) => Math.floor(rnd() * k);
  const free = () => {
    for (let i = 0; i < 50; i++) {
      const c = ri(cells);
      if (tiles[c] === '.') return c;
    }
    return -1;
  };
  for (let i = 0; i < cells; i++) if (rnd() < P.rocks) tiles[i] = '#';
  const place = (ch: string, k: number) => {
    for (let i = 0; i < k; i++) {
      const c = free();
      if (c >= 0) tiles[c] = ch;
    }
  };
  place('*', P.snow);
  place('x', P.cracked);
  place('~', P.water);
  for (let i = 0; i < P.arrows; i++) place('^>v<'[ri(4)], 1);
  for (let i = 0; i < P.portals; i++) {
    const a = free();
    if (a < 0) continue;
    tiles[a] = String(i + 1);
    const b = free();
    if (b < 0) tiles[a] = '.';
    else tiles[b] = String(i + 1);
  }
  const start = free();
  if (start < 0) return null;
  // Random walk with the real rules; fish go on cells it passes, the igloo where it ends.
  const probe: Level = { n, w, h, tiles, start, igloo: -1, fish: [], par: 0 };
  let s = initialState(probe);
  const passed: number[] = [];
  for (let k = 0; k < P.walk; k++) {
    const dirs = ([0, 1, 2, 3] as Dir[]).sort(() => rnd() - 0.5);
    let moved = false;
    for (const d of dirs) {
      const r = slide(probe, s, d);
      if (!r || r.fell || r.state.pos === s.pos) continue;
      s = r.state;
      passed.push(...r.path.filter((c) => tiles[c] === '.' || tiles[c] === '*'));
      moved = true;
      break;
    }
    if (!moved) return null;
  }
  const igloo = s.pos;
  if (igloo === start || (tiles[igloo] !== '.' && tiles[igloo] !== '*')) return null;
  tiles[igloo] = '.';
  const pool = [...new Set(passed)].filter((c) => c !== igloo && c !== start);
  if (!pool.length) return null;
  const fish: number[] = [];
  // later cells first so the route has to be walked to the end
  for (let i = 0; i < P.fish && pool.length; i++) {
    const j = i === 0 ? pool.length - 1 - ri(Math.min(3, pool.length)) : ri(pool.length);
    fish.push(pool.splice(j, 1)[0]);
  }
  const level: Level = { n, w, h, tiles, start, igloo, fish, par: 0 };
  const sol = solve(level, initialState(level), 120_000);
  if (!sol) return null;
  level.par = sol.length;
  return level;
}

const cache = new Map<number, Level>();
/** Deterministic level n (1-based). Always solvable, par >= 3. */
export function generateLevel(n: number): Level {
  const hit = cache.get(n);
  if (hit) return hit;
  const rnd = mulberry32(n * 7919 + 17);
  const P = levelParams(n);
  let best: Level | null = null;
  for (let i = 0; i < 600; i++) {
    const l = attempt(n, rnd);
    if (!l || l.par < 3) continue;
    if (l.par >= P.minPar) {
      best = l;
      break;
    }
    if (!best || l.par > best.par) best = l;
  }
  if (!best) throw new Error(`level ${n}: no solvable layout`);
  cache.set(n, best);
  return best;
}

/** 3 stars at par, 2 within a small margin, else 1. */
export function starsFor(swipes: number, par: number): number {
  if (swipes <= par) return 3;
  if (swipes <= par + Math.max(2, Math.ceil(par / 3))) return 2;
  return 1;
}
