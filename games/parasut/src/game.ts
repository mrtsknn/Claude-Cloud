/**
 * Paraşüt — pure, deterministic jump physics. World: x 0..100 (left→right), y = altitude
 * above the sea (deck height 0). Fixed 1/60 s steps so the game, the tests and the
 * generator's landability check all run the exact same simulation.
 */
export const W = 100;
export const START_Y = 100;
export const DT = 1 / 60;
const G = 40;
const FREE_TERMINAL = 45;
const CHUTE_VY = 9;
const CUT_TERMINAL = 55;
const DRIFT = { free: 0.3, chute: 1, cut: 0.2 } as const;
const DRIFT_RATE = { free: 1.5, chute: 2, cut: 1 } as const;
const MAX_T = 40;

export type Phase = 'free' | 'chute' | 'cut';

export interface Pad {
  x0: number; // centre at t = 0
  w: number; // deck width
  speed: number; // units/s, bounces between the screen edges
  dir: 1 | -1;
  points: number;
}

export interface Obstacle {
  kind: 'cloud' | 'bird';
  x0: number;
  y: number;
  r: number;
  vx: number;
  push: number; // lateral velocity added on first touch
}

export interface Jump {
  n: number;
  startX: number;
  wind: number; // base wind (units/s, + = right)
  gust: number; // gust amplitude
  gustFreq: number;
  pads: Pad[];
  obstacles: Obstacle[];
  /** A tap timeline (seconds after the drop) that lands; proof the jump is landable. */
  solution: number[];
}

export interface Diver {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: Phase;
  hits: number; // bitmask of obstacles already touched
}

export type Outcome =
  | { kind: 'land'; pad: number; dx: number; bull: boolean; t: number; x: number }
  | { kind: 'splash'; t: number; x: number; reason: 'water' | 'freefall' };

// ───────────────────────── rng ─────────────────────────
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── world ─────────────────────────
export const windAt = (j: Jump, t: number) => j.wind + j.gust * Math.sin(t * j.gustFreq);

export function padX(p: Pad, t: number): number {
  const L = W - p.w;
  if (L <= 0) return W / 2;
  const u = p.x0 - p.w / 2 + p.speed * t * p.dir;
  const m = ((u % (2 * L)) + 2 * L) % (2 * L);
  return (m <= L ? m : 2 * L - m) + p.w / 2;
}

export function obstacleX(o: Obstacle, t: number): number {
  const span = W + 30;
  const u = o.x0 + 15 + o.vx * t;
  return (((u % span) + span) % span) - 15;
}

export const bullRadius = (p: Pad) => Math.max(1.2, p.w * 0.15);

// ───────────────────────── diver ─────────────────────────
export const newDiver = (j: Jump): Diver => ({ t: 0, x: j.startX, y: START_Y, vx: 0, vy: 0, phase: 'free', hits: 0 });

/** One tap: free fall → open chute; chute → cut away (once). Returns what happened. */
export function tap(d: Diver): 'open' | 'cut' | null {
  if (d.phase === 'free') return (d.phase = 'chute'), 'open';
  if (d.phase === 'chute') return (d.phase = 'cut'), 'cut';
  return null;
}

/** Advances one fixed step. Returns the index of an obstacle touched this step, or -1. */
export function step(d: Diver, j: Jump, dt = DT): number {
  const ph = d.phase;
  if (ph === 'free') d.vy = Math.min(FREE_TERMINAL, d.vy + G * dt);
  else if (ph === 'cut') d.vy = Math.min(CUT_TERMINAL, d.vy + G * dt);
  else d.vy += (CHUTE_VY - d.vy) * (1 - Math.exp(-4 * dt));
  const target = windAt(j, d.t) * DRIFT[ph];
  d.vx += (target - d.vx) * (1 - Math.exp(-DRIFT_RATE[ph] * dt));
  d.x += d.vx * dt;
  d.y -= d.vy * dt;
  d.t += dt;
  // keep the diver on screen: the edges act like soft walls
  if (d.x < 1) (d.x = 1), (d.vx = Math.abs(d.vx) * 0.3);
  if (d.x > W - 1) (d.x = W - 1), (d.vx = -Math.abs(d.vx) * 0.3);
  let touched = -1;
  j.obstacles.forEach((o, i) => {
    if (d.hits & (1 << i)) return;
    const dx = d.x - obstacleX(o, d.t);
    const dy = d.y - o.y;
    if (dx * dx + dy * dy < (o.r + 1.5) ** 2) {
      d.hits |= 1 << i;
      d.vx += o.push;
      touched = i;
    }
  });
  return touched;
}

/** Touchdown check once y <= 0: best pad under the diver, else splash. */
export function landing(d: Diver, j: Jump): Outcome {
  if (d.phase === 'free') return { kind: 'splash', t: d.t, x: d.x, reason: 'freefall' };
  let best: Outcome | null = null;
  j.pads.forEach((p, i) => {
    const dx = d.x - padX(p, d.t);
    if (Math.abs(dx) > p.w / 2) return;
    const bull = Math.abs(dx) <= bullRadius(p);
    if (!best || (best.kind === 'land' && Math.abs(dx) < Math.abs(best.dx))) best = { kind: 'land', pad: i, dx, bull, t: d.t, x: d.x };
  });
  return best ?? { kind: 'splash', t: d.t, x: d.x, reason: 'water' };
}

/** Runs a whole jump with taps at the given times (seconds after the drop). */
export function simulate(j: Jump, taps: number[]): Outcome {
  const d = newDiver(j);
  let k = 0;
  while (d.t < MAX_T) {
    while (k < taps.length && taps[k] <= d.t + 1e-9) tap(d), k++;
    step(d, j);
    if (d.y <= 0) return landing(d, j);
  }
  return { kind: 'splash', t: d.t, x: d.x, reason: 'water' };
}

// ───────────────────────── scoring ─────────────────────────
/** Points for a landing; combo counts consecutive bullseyes (returned updated). */
export function scoreLanding(pad: Pad, bull: boolean, combo: number): { points: number; combo: number } {
  if (!bull) return { points: pad.points, combo: 0 };
  const c = combo + 1;
  return { points: pad.points * 2 + 10 * (c - 1), combo: c };
}

// ───────────────────────── generator ─────────────────────────
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function rawJump(n: number, r: () => number, ease: number): Jump {
  const d = n * ease;
  const sign = r() < 0.5 ? -1 : 1;
  const wind = sign * clamp(1.5 + 0.35 * d, 1.5, 9) * (0.75 + r() * 0.5);
  const count = n < 3 ? 2 : 1 + Math.floor(r() * 3);
  const pads: Pad[] = [];
  for (let i = 0; i < count; i++) {
    const w = clamp((24 - d * 0.6) * (0.65 + r() * 0.55), 7, 26);
    pads.push({
      x0: 15 + r() * 70,
      w,
      speed: clamp(4 + d * 0.7, 4, 22) * (0.6 + r() * 0.6),
      dir: r() < 0.5 ? -1 : 1,
      points: w >= 18 ? 10 : w >= 12 ? 20 : 30,
    });
  }
  const obstacles: Obstacle[] = [];
  if (n >= 5) {
    const clouds = Math.min(2, Math.floor((n - 5) / 6) + 1);
    for (let i = 0; i < clouds; i++)
      obstacles.push({ kind: 'cloud', x0: r() * W, y: 30 + r() * 50, r: 6 + r() * 3, vx: (r() - 0.5) * 4, push: (r() < 0.5 ? -1 : 1) * 5 });
  }
  if (n >= 10) {
    const birds = n >= 20 ? 2 : 1;
    for (let i = 0; i < birds; i++)
      obstacles.push({ kind: 'bird', x0: r() * W, y: 20 + r() * 55, r: 2.5, vx: (r() < 0.5 ? -1 : 1) * (8 + r() * 6), push: (r() < 0.5 ? -1 : 1) * 7 });
  }
  return { n, startX: 15 + r() * 70, wind, gust: Math.min(3, 0.15 * d), gustFreq: 0.6 + r() * 0.8, pads, obstacles, solution: [] };
}

/** Tap timelines that land: open-only first, then open + cut. */
export function findSolutions(j: Jump, limit = 99): number[][] {
  const found: number[][] = [];
  for (let a = 0.05; a <= 2.6 && found.length < limit; a += 0.05) {
    if (simulate(j, [a]).kind === 'land') found.push([+a.toFixed(2)]);
  }
  if (found.length >= 2) return found;
  for (let a = 0.05; a <= 2.6; a += 0.15)
    for (let b = a + 0.2; b <= a + 12; b += 0.25) {
      if (simulate(j, [a, b]).kind === 'land') found.push([+a.toFixed(2), +b.toFixed(2)]);
      if (found.length >= limit) return found;
    }
  return found;
}

/** Jump n (0-based difficulty) for a seed; always landable (needs ≥ 2 winning timelines). */
export function generateJump(n: number, seed: number): Jump {
  const r = rng(seed * 2654435761 + n * 97 + 13);
  for (let attempt = 0; attempt < 30; attempt++) {
    const j = rawJump(n, r, attempt < 15 ? 1 : 0.6);
    const sols = findSolutions(j, 2);
    if (sols.length >= 2) return { ...j, solution: sols[Math.floor(sols.length / 2)] };
  }
  // Fallback: calm air and a wide raft right under the drop point.
  const j: Jump = { n, startX: 50, wind: 0, gust: 0, gustFreq: 1, pads: [{ x0: 50, w: 24, speed: 0, dir: 1, points: 10 }], obstacles: [], solution: [] };
  return { ...j, solution: findSolutions(j, 1)[0] };
}

// ───────────────────────── challenge levels ─────────────────────────
export const LEVEL_COUNT = 100;
export const levelGoal = (level: number) => 3 + Math.floor((level - 1) / 25);
export const levelJump = (level: number, i: number) => generateJump(Math.floor((level - 1) * 0.45) + i, level * 1000 + i);
export function levelStars(goal: number, bulls: number) {
  return 1 + (bulls >= Math.ceil(goal / 3) ? 1 : 0) + (bulls >= Math.ceil((2 * goal) / 3) ? 1 : 0);
}
