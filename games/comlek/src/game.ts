/**
 * Pure pottery logic: a pot is a lathe profile — radius per row (row 0 = bottom), all in
 * normalised units (1 = max wheel radius). Height is derived from the shape so squeezing clay
 * in makes it rise (a soft volume rule). Targets come from seeded parametric curves; the score
 * is the IoU of the two silhouettes.
 */
export const ROWS = 60;
export const START_R = 0.88;
export const MIN_R = 0.06;
export const BASE_H = 0.55;
const GROW = 0.35;
export const LEVEL_COUNT = 120;

export type Profile = number[];

export const startProfile = (): Profile => Array.from({ length: ROWS }, (_, i) => (i === ROWS - 1 ? START_R * 0.96 : START_R));

const meanSq = (p: Profile) => p.reduce((s, r) => s + r * r, 0) / p.length;
const START_A = meanSq(startProfile());

/** Height (0..1 of the stage) of a profile: thinner clay rises — volume roughly conserved. */
export function heightOf(p: Profile): number {
  const a = Math.max(meanSq(p), 1e-4);
  return Math.min(1, BASE_H * (1 + GROW * (START_A / a - 1)));
}

/** Relative volume (1 = the starting lump). */
export const volumeOf = (p: Profile) => (meanSq(p) * heightOf(p)) / (START_A * BASE_H);

/**
 * Press the clay at fractional `row` with the finger `x` away from the axis. The fingertip is
 * round: rows further from the touch are limited less (x + k·dy²), so strokes stay smooth.
 * Wider rows move toward that limit; `amount` 0..1 is how far this step goes.
 */
export function push(p: Profile, row: number, x: number, amount: number, k = 0.015): Profile {
  const out = p.slice();
  const tip = Math.max(MIN_R, x);
  const a = Math.min(1, Math.max(0, amount));
  for (let i = Math.max(0, Math.floor(row - 8)); i <= Math.min(ROWS - 1, Math.ceil(row + 8)); i++) {
    const limit = tip + k * (i - row) ** 2;
    if (out[i] > limit) out[i] += (limit - out[i]) * a;
  }
  return out;
}

/** Radius at a normalised stage height y (0..1), 0 above the pot. */
export function radiusAt(p: Profile, h: number, y: number): number {
  if (y < 0 || y >= h) return 0;
  const f = (y / h) * ROWS - 0.5;
  const i = Math.max(0, Math.min(ROWS - 1, Math.floor(f)));
  const j = Math.min(ROWS - 1, i + 1);
  const t = Math.max(0, Math.min(1, f - i));
  return p[i] * (1 - t) + p[j] * t;
}

/** Silhouette IoU of two profiles (0..1). */
export function matchScore(a: Profile, b: Profile, samples = 240): number {
  const ha = heightOf(a);
  const hb = heightOf(b);
  let inter = 0;
  let union = 0;
  for (let s = 0; s < samples; s++) {
    const y = (s + 0.5) / samples;
    const ra = radiusAt(a, ha, y);
    const rb = radiusAt(b, hb, y);
    inter += Math.min(ra, rb);
    union += Math.max(ra, rb);
  }
  return union ? inter / union : 1;
}

export const matchPercent = (a: Profile, b: Profile) => Math.round(matchScore(a, b) * 100);

/** Stars from match %: 70 / 82 / 92; 0 = failed. */
export const starsFor = (pct: number) => (pct >= 92 ? 3 : pct >= 82 ? 2 : pct >= 70 ? 1 : 0);

// ───────────────────────── targets ─────────────────────────
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Kind = 'cup' | 'bowl' | 'vase' | 'pitcher';
const gauss = (t: number, c: number, w: number) => Math.exp(-(((t - c) / w) ** 2));
const smoothstep = (a: number, b: number, t: number) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

export function kindFor(level: number): Kind {
  if (level <= 3) return (['cup', 'bowl', 'cup'] as Kind[])[level - 1];
  const kinds: Kind[] = level < 15 ? ['cup', 'bowl', 'vase'] : ['cup', 'bowl', 'vase', 'pitcher', 'vase', 'pitcher'];
  return kinds[Math.floor(rng(level * 7919)() * kinds.length)];
}

/** Deterministic target shape for a level; complexity (necks, bellies, lips) grows with n. */
export function targetFor(level: number): { kind: Kind; profile: Profile } {
  const R = rng(level * 2654435761);
  const c = Math.min(1, (level - 1) / 80);
  const kind = kindFor(level);
  const v = (a: number, b: number) => a + (b - a) * R();
  let f: (t: number) => number;
  if (kind === 'cup') {
    const r0 = v(0.45, 0.65);
    const taper = v(-0.1, 0.12) * (0.4 + c);
    const lip = v(0, 0.08) * c;
    f = (t) => r0 + taper * t + lip * smoothstep(0.85, 1, t);
  } else if (kind === 'bowl') {
    const foot = v(0.3, 0.42);
    const rim = v(0.72, 0.84);
    const curve = v(0.5, 0.8);
    const lip = v(0, 0.05) * c;
    f = (t) => foot + (rim - foot) * Math.pow(t, curve) + lip * smoothstep(0.9, 1, t);
  } else if (kind === 'vase') {
    const base = v(0.35, 0.45);
    const belly = v(0.25, 0.4);
    const bellyAt = v(0.3, 0.5);
    const neck = v(0.15, 0.32) * (0.5 + c);
    const neckAt = v(0.72, 0.85);
    const flare = v(0, 0.14) * c;
    f = (t) => base + belly * gauss(t, bellyAt, 0.28) - neck * gauss(t, neckAt, 0.14 - 0.04 * c) + flare * smoothstep(0.88, 1, t);
  } else {
    const base = v(0.45, 0.55);
    const belly = v(0.2, 0.3);
    const neckAt = v(0.6, 0.72);
    const neck = v(0.3, 0.45) * (0.6 + 0.4 * c);
    const flare = v(0.08, 0.2) * (0.5 + c);
    f = (t) => base + belly * gauss(t, 0.3, 0.25) - neck * smoothstep(neckAt - 0.2, neckAt, t) + flare * smoothstep(0.86, 1, t);
  }
  const profile = Array.from({ length: ROWS }, (_, i) => Math.max(0.12, Math.min(0.85, f((i + 0.5) / ROWS))));
  return { kind, profile };
}
