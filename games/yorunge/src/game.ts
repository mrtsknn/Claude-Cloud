// Yörünge — deterministic orbit/fly physics. No DOM; driven by fixed STEP ticks from main.ts.
// World units: the playfield is WORLD_W wide, y grows upward, planets are generated upward.

export const WORLD_W = 400;
export const STEP = 1 / 120;
export const FLY_SPEED = 520;
/** Current planet sits this fraction of the view height above the bottom edge. */
export const CAM_ANCHOR = 0.25;
/** How far outside the view the satellite may go before it counts as lost. */
export const MARGIN = 40;
export const STAR_R = 24;
export const PERFECT = 0.3; // impact parameter < 30% of the ring radius
const MAX_FLIGHT = 3.5;

export interface Planet { x: number; y: number; r: number; ring: number; omega: number; hue: number }
/** `seg` = index of the planet the star leads to (it sits between seg-1 and seg). */
export interface Star { x: number; y: number; taken: boolean; seg: number }
export interface Sat {
  flying: boolean;
  planet: number; // current (or last) planet
  angle: number;
  dir: 1 | -1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number; // flight time
}
export type Phase = 'ready' | 'play' | 'over';
export interface GameState {
  rng: number;
  planets: Planet[];
  stars: Star[];
  sat: Sat;
  phase: Phase;
  score: number;
  reached: number; // highest planet index captured
  combo: number;
  perfects: number; // scored captures that were perfect
  starsTaken: number;
  continued: boolean;
  viewH: number;
  camY: number; // smoothed camera bottom edge
  time: number;
}

export type GameEvent =
  | { type: 'capture'; planet: number; perfect: boolean; scored: boolean; impact: number }
  | { type: 'star'; index: number }
  | { type: 'lost' };

// ───────────── rng (mulberry32, state kept in GameState so runs are reproducible) ─────────────
function rand(s: GameState) {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Difficulty 0..1, reached slowly (planet 70). */
export const difficulty = (i: number) => clamp(i / 70, 0, 1);

function makePlanet(s: GameState, i: number): Planet {
  const d = difficulty(i);
  const ring = lerp(72, 54, d) + (rand(s) - 0.5) * 14;
  const r = ring * (0.36 + rand(s) * 0.12);
  const omega = lerp(1.7, 2.9, d) + rand(s) * 0.4;
  const hue = Math.floor(rand(s) * 6);
  if (i === 0) return { x: WORLD_W / 2, y: 0, r, ring, omega, hue };
  const p = s.planets[i - 1];
  const dy = p.ring + ring + lerp(55, 100, d) + rand(s) * 45;
  const dx = (rand(s) * 2 - 1) * lerp(100, 180, d);
  const x = clamp(p.x + dx, ring + 14, WORLD_W - ring - 14);
  return { x, y: p.y + dy, r, ring, omega, hue: hue === p.hue ? (hue + 1) % 6 : hue };
}

/** Planets/stars are generated lazily a few ahead of the satellite. */
export function ensurePlanets(s: GameState, upTo: number) {
  while (s.planets.length <= upTo) {
    const i = s.planets.length;
    const pl = makePlanet(s, i);
    s.planets.push(pl);
    if (i >= 2 && rand(s) < 0.45) {
      const p = s.planets[i - 1];
      const len = Math.hypot(pl.x - p.x, pl.y - p.y);
      const off = (rand(s) * 2 - 1) * 40;
      s.stars.push({ x: (p.x + pl.x) / 2 - ((pl.y - p.y) / len) * off, y: (p.y + pl.y) / 2 + ((pl.x - p.x) / len) * off, taken: false, seg: i });
    }
  }
}

export function newGame(seed: number, viewH = 800): GameState {
  const s: GameState = {
    rng: seed | 0,
    planets: [],
    stars: [],
    sat: { flying: false, planet: 0, angle: -Math.PI / 2, dir: 1, x: 0, y: 0, vx: 0, vy: 0, t: 0 },
    phase: 'ready',
    score: 0,
    reached: 0,
    combo: 0,
    perfects: 0,
    starsTaken: 0,
    continued: false,
    viewH,
    camY: 0,
    time: 0,
  };
  ensurePlanets(s, 6);
  placeOnOrbit(s);
  s.camY = camTarget(s);
  return s;
}

export function camTarget(s: GameState) {
  return s.planets[s.sat.planet].y - s.viewH * CAM_ANCHOR;
}

function placeOnOrbit(s: GameState) {
  const p = s.planets[s.sat.planet];
  s.sat.x = p.x + Math.cos(s.sat.angle) * p.ring;
  s.sat.y = p.y + Math.sin(s.sat.angle) * p.ring;
}

/** Unit tangent of motion on the orbit at `angle` for rotation direction `dir` (+1 = CCW, y up). */
export function tangent(angle: number, dir: 1 | -1) {
  return { x: -Math.sin(angle) * dir, y: Math.cos(angle) * dir };
}

export function start(s: GameState) {
  if (s.phase === 'ready') s.phase = 'play';
}

/** Tap: leave the orbit along the tangent. Returns false when not possible. */
export function release(s: GameState) {
  if (s.phase !== 'play' || s.sat.flying) return false;
  const tg = tangent(s.sat.angle, s.sat.dir);
  s.sat.flying = true;
  s.sat.vx = tg.x * FLY_SPEED;
  s.sat.vy = tg.y * FLY_SPEED;
  s.sat.t = 0;
  return true;
}

/** Is the point inside planet `p`'s capture ring? */
export function inRing(p: Planet, x: number, y: number) {
  return (x - p.x) ** 2 + (y - p.y) ** 2 <= p.ring * p.ring;
}

/** Advance one fixed STEP. Mutates `s`, returns what happened. */
export function step(s: GameState): GameEvent[] {
  const ev: GameEvent[] = [];
  s.time += STEP;
  const sat = s.sat;
  if (s.phase !== 'over') {
    if (!sat.flying) {
      const p = s.planets[sat.planet];
      sat.angle += sat.dir * p.omega * STEP;
      if (sat.angle > Math.PI) sat.angle -= Math.PI * 2;
      if (sat.angle < -Math.PI) sat.angle += Math.PI * 2;
      placeOnOrbit(s);
    } else {
      sat.x += sat.vx * STEP;
      sat.y += sat.vy * STEP;
      sat.t += STEP;
      s.stars.forEach((st, index) => {
        if (!st.taken && (st.x - sat.x) ** 2 + (st.y - sat.y) ** 2 < STAR_R * STAR_R) {
          st.taken = true;
          s.score++;
          s.starsTaken++;
          ev.push({ type: 'star', index });
        }
      });
      const hit = captureCheck(s);
      if (hit >= 0) {
        const p = s.planets[hit];
        const rx = sat.x - p.x;
        const ry = sat.y - p.y;
        const cross = (rx * sat.vy - ry * sat.vx) / FLY_SPEED; // signed impact parameter
        const perfect = Math.abs(cross) < p.ring * PERFECT;
        sat.flying = false;
        sat.planet = hit;
        sat.angle = Math.atan2(ry, rx);
        sat.dir = cross >= 0 ? 1 : -1;
        placeOnOrbit(s);
        const scored = hit > s.reached;
        if (scored) {
          s.score++;
          s.reached = hit;
          if (perfect) s.perfects++;
        }
        s.combo = perfect ? s.combo + 1 : 0;
        ensurePlanets(s, hit + 6);
        ev.push({ type: 'capture', planet: hit, perfect, scored, impact: Math.abs(cross) / p.ring });
      } else if (isLost(s)) {
        s.phase = 'over';
        s.combo = 0;
        ev.push({ type: 'lost' });
      }
    }
  }
  s.camY += (camTarget(s) - s.camY) * (1 - Math.exp(-STEP * 4.5));
  return ev;
}

function captureCheck(s: GameState) {
  const { sat } = s;
  const lo = Math.max(0, sat.planet - 2);
  const hi = Math.min(s.planets.length - 1, sat.planet + 6);
  for (let i = lo; i <= hi; i++) {
    if (i !== sat.planet && inRing(s.planets[i], sat.x, sat.y)) return i;
  }
  return -1;
}

/** Off-screen relative to where the camera is heading (not the lagging smoothed one). */
export function isLost(s: GameState) {
  const { x, y, t } = s.sat;
  const bottom = camTarget(s);
  return x < -MARGIN || x > WORLD_W + MARGIN || y < bottom - MARGIN || y > bottom + s.viewH + MARGIN || t > MAX_FLIGHT;
}

/** One continue per run: back into orbit around the last planet. */
export function continueRun(s: GameState) {
  if (s.phase !== 'over' || s.continued) return false;
  s.continued = true;
  s.phase = 'play';
  s.sat.flying = false;
  s.sat.angle = -Math.PI / 2;
  s.sat.t = 0;
  placeOnOrbit(s);
  return true;
}

/** Simulate releasing at `angle` from the current orbit; returns the captured planet (or -1). */
export function simulateRelease(s: GameState, angle: number) {
  const c: GameState = { ...s, planets: s.planets.slice(), stars: s.stars.map((st) => ({ ...st })), sat: { ...s.sat } };
  c.phase = 'play';
  c.sat.flying = false;
  c.sat.angle = angle;
  placeOnOrbit(c);
  release(c);
  while (c.sat.flying && c.phase === 'play') {
    for (const e of step(c)) if (e.type === 'capture') return { planet: e.planet, impact: e.impact };
  }
  return { planet: -1, impact: 1 };
}

/** Release angles (sampled every 2°) that land on the next planet; the best is the most central. */
export function hitAngles(s: GameState, target = s.sat.planet + 1) {
  const hits: number[] = [];
  let best: number | null = null;
  let bestImpact = Infinity;
  for (let k = 0; k < 180; k++) {
    const a = -Math.PI + (k * Math.PI) / 90;
    const r = simulateRelease(s, a);
    if (r.planet !== target) continue;
    hits.push(a);
    if (r.impact < bestImpact) {
      bestImpact = r.impact;
      best = a;
    }
  }
  return { hits, best };
}

// ───────────── missions (level mode) ─────────────
// Level n replays the same seeded generator with seed n and asks for planet levelTarget(n).
export const LEVEL_COUNT = 100;
export const levelTarget = (n: number) => 8 + n;
export const newLevel = (n: number, viewH = 800) => newGame(n, viewH);

export const levelDone = (s: GameState, target: number) => s.reached >= target;

/** 1 star for reaching the target, +1 for perfect captures on a third of the hops, +1 for half the stars on the way. */
export function levelStars(s: GameState, target: number) {
  const onRoute = s.stars.filter((st) => st.seg <= target);
  const taken = onRoute.filter((st) => st.taken).length;
  const perfectGoal = Math.ceil(target / 3);
  const starGoal = Math.ceil(onRoute.length / 2);
  return 1 + (s.perfects >= perfectGoal ? 1 : 0) + (taken >= starGoal ? 1 : 0);
}
