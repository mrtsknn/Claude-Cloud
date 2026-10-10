// Pure game logic for Karışım: colour science (sRGB ⇄ OKLab), drop mixing, deterministic levels.
// No DOM access here so everything is unit-testable.

export type Lab = [number, number, number];

export interface Pigment {
  id: string;
  hex: string;
}

/** Paint tubes, in the order they unlock. */
export const PIGMENTS: Pigment[] = [
  { id: 'white', hex: '#ffffff' },
  { id: 'black', hex: '#1c1d22' },
  { id: 'cyan', hex: '#00a6d6' },
  { id: 'magenta', hex: '#d6247a' },
  { id: 'yellow', hex: '#ffd21f' },
  { id: 'red', hex: '#e0342f' },
  { id: 'blue', hex: '#2346c8' },
  { id: 'green', hex: '#1f9e57' },
  { id: 'orange', hex: '#ff7a1a' },
  { id: 'violet', hex: '#6d3fc0' },
  { id: 'brown', hex: '#7a4a2a' },
];

export const LEVEL_COUNT = 150;
/** Default OKLab distance under which the bowl counts as matching the target. */
export const MATCH_DE = 0.02;
/**
 * A level's tolerance is half the distance to the nearest cheaper recipe (capped at MATCH_DE),
 * so no cheaper mix can ever solve it. Recipes whose nearest cheaper neighbour is closer than
 * this are "trivially near" a simpler recipe and rejected.
 */
export const MIN_GAP = 0.011;
export const MAX_DROPS = 30;
/**
 * Minimum OKLab chroma of a target. Near-greys (e.g. white + black, or complementary mixes)
 * all read as "some grey" on a phone screen, so the generator rejects them.
 */
export const MIN_CHROMA = 0.05;
/** Closeness at which the UI shows the "almost!" cue. */
export const ALMOST = 0.95;
/** Distance at which the meter bottoms out. */
const FAR_DE = 0.45;

// ───────────────────────── colour ─────────────────────────
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** sRGB 0..255 → OKLab (Björn Ottosson). */
export function rgbToOklab([R, G, B]: [number, number, number]): Lab {
  const r = toLinear(R / 255);
  const g = toLinear(G / 255);
  const b = toLinear(B / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → sRGB 0..255 (unclamped floats). */
export function oklabToRgb([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [r, g, bl].map((c) => toGamma(Math.min(1, Math.max(0, c))) * 255) as [number, number, number];
}

export const hexToOklab = (hex: string) => rgbToOklab(hexToRgb(hex));
export const oklabToHex = (lab: Lab) => rgbToHex(oklabToRgb(lab));

export function deltaE(p: Lab, q: Lab) {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Weighted average of the given colours in OKLab; null for an empty bowl. */
export function mix(counts: number[], labs: Lab[]): Lab | null {
  let n = 0;
  const acc: Lab = [0, 0, 0];
  counts.forEach((c, i) => {
    if (!c) return;
    n += c;
    for (let k = 0; k < 3; k++) acc[k] += c * labs[i][k];
  });
  return n ? [acc[0] / n, acc[1] / n, acc[2] / n] : null;
}

export const isMatch = (mixLab: Lab | null, target: Lab, tol = MATCH_DE) => !!mixLab && deltaE(mixLab, target) <= tol;

export const chroma = (lab: Lab) => Math.hypot(lab[1], lab[2]);

/**
 * 0..1 "how close" value for the meter; exactly 1 only when matched.
 * Late levels match within a ΔE the eye can barely see, so the meter is the real guide: it
 * blends a linear scale (useful far away) with a log scale relative to the level's tolerance
 * (fine-grained up close). Above ALMOST the bowl is within ~1.5× the tolerance.
 */
export function closeness(mixLab: Lab | null, target: Lab, tol = MATCH_DE) {
  if (!mixLab) return 0;
  const d = deltaE(mixLab, target);
  if (d <= tol) return 1;
  const lin = 1 - d / FAR_DE;
  const log = 1 - Math.log(d / tol) / Math.log(FAR_DE / tol);
  return Math.min(0.99, Math.max(0, 0.55 * lin + 0.45 * log));
}

export function stars(drops: number, par: number) {
  return drops <= par ? 3 : drops <= par + 2 ? 2 : 1;
}

// ───────────────────────── levels ─────────────────────────
export interface Level {
  n: number;
  /** Indices into PIGMENTS, in tube order. */
  tubes: number[];
  /** Drops per tube that produce the target exactly. */
  recipe: number[];
  target: Lab;
  par: number;
  /** Match tolerance (OKLab ΔE) for this level. */
  tol: number;
}

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

function shuffle<T>(a: T[], r: () => number) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function tubesForLevel(n: number) {
  return n <= 10 ? 2 : n <= 30 ? 3 : n <= 60 ? 4 : n <= 100 ? 5 : 6;
}

function poolForLevel(n: number) {
  return n <= 10 ? 5 : n <= 40 ? 7 : n <= 80 ? 9 : PIGMENTS.length;
}

/** Calls fn for every drop vector over `k` tubes with 1..maxTotal drops. */
function forEachRecipe(k: number, maxTotal: number, fn: (c: number[]) => void) {
  const c = new Array<number>(k).fill(0);
  const rec = (i: number, left: number) => {
    if (i === k - 1) {
      for (let v = 0; v <= left; v++) {
        c[i] = v;
        fn(c);
      }
      c[i] = 0;
      return;
    }
    for (let v = 0; v <= left; v++) {
      c[i] = v;
      rec(i + 1, left - v);
    }
    c[i] = 0;
  };
  rec(0, maxTotal);
}

/** Distance from the target to the closest mix using fewer than `par` drops (stops early under `floor`). */
export function cheaperGap(labs: Lab[], target: Lab, par: number, floor = 0) {
  let best = Infinity;
  forEachRecipe(labs.length, par - 1, (c) => {
    if (best < floor) return;
    const m = mix(c, labs);
    if (m) best = Math.min(best, deltaE(m, target));
  });
  return best;
}

function attempt(n: number, r: () => number, drops: number): Level | null {
  const k = tubesForLevel(n);
  const pool = shuffle(Array.from({ length: poolForLevel(n) }, (_, i) => i), r);
  const tubes = pool.slice(0, k);
  // Later levels may hide one decoy tube that isn't in the recipe.
  const decoy = n > 20 && k >= 4 && r() < 0.4 ? 1 : 0;
  const used = Math.max(2, Math.min(k - decoy, drops));
  const recipe = new Array<number>(k).fill(0);
  const order = shuffle(tubes.map((_, i) => i), r);
  for (let i = 0; i < used; i++) recipe[order[i]] = 1;
  for (let left = drops - used; left > 0; left--) recipe[order[Math.floor(r() * used)]]++;
  if (recipe.reduce(gcd) !== 1) return null;
  const labs = tubes.map((p) => hexToOklab(PIGMENTS[p].hex));
  const target = mix(recipe, labs)!;
  if (target[0] < 0.32) return null; // muddy near-black targets are no fun to read
  if (chroma(target) < MIN_CHROMA) return null; // near-greys are hard to tell apart
  const gap = cheaperGap(labs, target, drops, MIN_GAP);
  if (gap < MIN_GAP) return null;
  return { n, tubes, recipe, target, par: drops, tol: Math.min(MATCH_DE, gap / 2) };
}

export function generateLevel(n: number): Level {
  if (n <= 1) {
    const tubes = [4, 2]; // yellow + cyan → soft green: obvious first mix
    const labs = tubes.map((p) => hexToOklab(PIGMENTS[p].hex));
    return { n: 1, tubes, recipe: [1, 1], target: mix([1, 1], labs)!, par: 2, tol: MATCH_DE };
  }
  const p = Math.min(n, LEVEL_COUNT);
  const r = rng(n * 2654435761 + 12345);
  // 2–3 drops early, 8–10 at the end.
  let drops = Math.min(10, 2 + Math.floor(((p - 1) * 7) / (LEVEL_COUNT - 1)) + (r() < 0.5 ? 0 : 1));
  for (;;) {
    for (let i = 0; i < 300; i++) {
      const lvl = attempt(n, r, drops);
      if (lvl) return lvl;
    }
    drops--;
  }
}

/**
 * Next useful tube to tap: the recipe tube furthest behind its share of the smallest recipe
 * multiple that still fits the current drops. Returns -1 when a decoy tube was used, in which
 * case the bowl must be emptied first.
 */
export function hintDrop(counts: number[], recipe: number[]) {
  if (counts.some((c, i) => c > 0 && recipe[i] === 0)) return -1;
  let k = 1;
  recipe.forEach((rv, i) => rv && (k = Math.max(k, Math.ceil(counts[i] / rv))));
  let best = -1;
  let bestDef = 0;
  recipe.forEach((rv, i) => {
    if (!rv) return;
    const def = (k * rv - counts[i]) / rv;
    if (def > bestDef + 1e-9) {
      best = i;
      bestDef = def;
    }
  });
  return best;
}

/** Tube indices of a full solution from an empty bowl, in hint order. */
export function solution(recipe: number[]) {
  const counts = recipe.map(() => 0);
  const seq: number[] = [];
  for (let i = hintDrop(counts, recipe); i >= 0; i = hintDrop(counts, recipe)) {
    counts[i]++;
    seq.push(i);
  }
  return seq;
}
