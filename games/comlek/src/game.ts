/**
 * Pure pottery logic: a pot is a lathe profile — radius per row (row 0 = bottom), all in
 * normalised units (1 ≈ the wheel radius). Height is derived from the shape: squeezing clay in
 * makes it rise, pulling it out spreads it wide and low (a soft volume rule). Targets come from
 * seeded parametric curves; the score is the IoU of the two silhouettes. Also here: customer
 * orders, decoration bands and the compact collection format — all testable without a DOM.
 */
export const ROWS = 60;
export const START_R = 0.88;
export const MIN_R = 0.06;
/** Widest the clay can be pulled (wide bowls and plates live up here). */
export const MAX_R = 1.3;
export const BASE_H = 0.55;
/** How much squeezed (thinner) clay rises. */
const GROW = 0.35;
/** How strongly widened clay settles lower (exponent on the area ratio). */
const SPREAD = 1.6;
const MIN_H = 0.14;
export const LEVEL_COUNT = 120;

export type Profile = number[];

export const startProfile = (): Profile => Array.from({ length: ROWS }, (_, i) => (i === ROWS - 1 ? START_R * 0.96 : START_R));

const meanSq = (p: Profile) => p.reduce((s, r) => s + r * r, 0) / p.length;
const START_A = meanSq(startProfile());

/**
 * Height (0..1 of the stage) of a profile. Thinner clay rises gently; clay pulled wider than the
 * starting lump spreads out and sinks much faster, so wide bowls come out low (as on a real wheel).
 */
export function heightOf(p: Profile): number {
  const ratio = START_A / Math.max(meanSq(p), 1e-4);
  const h = ratio >= 1 ? BASE_H * (1 + GROW * (ratio - 1)) : BASE_H * Math.pow(ratio, SPREAD);
  return Math.max(MIN_H, Math.min(1, h));
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

/**
 * Pull the clay outward: a finger placed inside the rim and dragged out drags the nearby rows
 * with it (limit x − k·dy², capped at MAX_R). Rows already wider than the limit are untouched.
 */
export function pull(p: Profile, row: number, x: number, amount: number, k = 0.012): Profile {
  const out = p.slice();
  const tip = Math.min(MAX_R, x);
  const a = Math.min(1, Math.max(0, amount));
  for (let i = Math.max(0, Math.floor(row - 9)); i <= Math.min(ROWS - 1, Math.ceil(row + 9)); i++) {
    const limit = Math.min(MAX_R, tip - k * (i - row) ** 2);
    if (out[i] < limit) out[i] += (limit - out[i]) * a;
  }
  return out;
}

/** Fractional row under a stage height y (0..1) for a profile of height h. */
export const rowAt = (h: number, y: number) => (y / h) * ROWS - 0.5;

/**
 * Throwing rings: the finger leaves fine alternating ridges around the contact row.
 * `rings` is a per-row 0..1 intensity, mutated copy returned.
 */
export function groove(rings: number[], row: number, amount: number): number[] {
  const out = rings.slice();
  for (let i = Math.max(0, Math.floor(row - 4)); i <= Math.min(ROWS - 1, Math.ceil(row + 4)); i++) {
    const w = Math.exp(-(((i - row) / 2.6) ** 2)) * (i % 2 ? 0.45 : 1);
    out[i] = Math.min(1, out[i] + amount * w);
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
export const KINDS: Kind[] = ['cup', 'bowl', 'vase', 'pitcher'];
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
  let hi = 0.85;
  if (kind === 'cup') {
    const r0 = v(0.45, 0.65);
    const taper = v(-0.1, 0.12) * (0.4 + c);
    const lip = v(0, 0.08) * c;
    f = (t) => r0 + taper * t + lip * smoothstep(0.85, 1, t);
  } else if (kind === 'bowl') {
    // Wide and low: a narrow foot opening into a rim pulled well past the starting lump.
    const foot = v(0.5, 0.62);
    const rim = v(1.14, 1.25);
    const curve = v(0.32, 0.55);
    const lip = v(0, 0.04) * c;
    hi = MAX_R - 0.04;
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
  const profile = Array.from({ length: ROWS }, (_, i) => Math.max(0.12, Math.min(hi, f((i + 0.5) / ROWS))));
  return { kind, profile };
}

/** Rough name for a free-form pot (free studio): wide & low → bowl, necked → vase / pitcher. */
export function classify(p: Profile): Kind {
  const h = heightOf(p);
  const top = p[ROWS - 1];
  const lower = Math.max(...p.slice(0, Math.floor(ROWS * 0.55)));
  const neck = Math.min(...p.slice(Math.floor(ROWS * 0.5), ROWS - 3));
  if (h < 0.5 && top >= lower * 0.95) return 'bowl';
  if (neck < lower * 0.75) return top > neck * 1.25 && h < 0.85 ? 'pitcher' : 'vase';
  return 'cup';
}

// ───────────────────────── customer orders ─────────────────────────
/** Customers and per-kind request variants; the names/texts live in i18n. */
export const CUSTOMER_COUNT = 12;
export const REQUEST_VARIANTS = 3;
export interface Order {
  customer: number;
  kind: Kind;
  variant: number;
}

/** Deterministic order for a level: who is asking and which request text for the target kind. */
export function orderFor(level: number): Order {
  const R = rng(level * 40503 + 17);
  return { customer: Math.floor(R() * CUSTOMER_COUNT), kind: kindFor(level), variant: Math.floor(R() * REQUEST_VARIANTS) };
}

/**
 * Coins for a delivered order: scales with the match (70% → 10, 100% → 37), +5 for a 3-star
 * pot and a +5 tip when it is decorated. Below 70% the customer does not take it (0).
 */
export function orderReward(pct: number, decorated: boolean): number {
  if (pct < 70) return 0;
  const p = Math.min(100, pct);
  return Math.round(10 + (p - 70) * 0.9) + (p >= 92 ? 5 : 0) + (decorated ? 5 : 0);
}

// ───────────────────────── decoration ─────────────────────────
/** Paint colours (index-stored so saved pots stay compact). */
export const PAINTS = ['#24418f', '#1f8a7a', '#c4432f', '#e6a633', '#f6f0e4', '#2a2730', '#6f9a3a', '#c06a7a'];
export type Stamp = 'dots' | 'waves' | 'zigzag' | 'leaves';
export const STAMPS: Stamp[] = ['dots', 'waves', 'zigzag', 'leaves'];
export type BandKind = 'ring' | Stamp;
/** A painted band: kind, first row, height in rows, paint index. */
export interface Band {
  k: BandKind;
  r: number;
  h: number;
  c: number;
}
/** Glaze (base skin) + painted bands, bottom to top in paint order. */
export interface Decor {
  g: string;
  b: Band[];
}
export const MAX_BANDS = 40;
export const RING_H = 3;
export const STAMP_H = 7;

const clampRow = (row: number, h: number) => Math.max(0, Math.min(ROWS - h, Math.round(row - h / 2 + 0.5)));
const paintIndex = (c: number) => Math.max(0, Math.min(PAINTS.length - 1, Math.floor(c)));

/**
 * Lay a ring of paint at `row` (the brush). Strokes merge: if the last band is a ring of the
 * same colour that touches this one it grows instead of adding a new band.
 */
export function paintRing(d: Decor, row: number, color: number): Decor {
  const c = paintIndex(color);
  const r = clampRow(row, RING_H);
  const last = d.b[d.b.length - 1];
  if (last && last.k === 'ring' && last.c === c && r <= last.r + last.h && r + RING_H >= last.r) {
    const lo = Math.min(last.r, r);
    const hi = Math.max(last.r + last.h, r + RING_H);
    if (lo === last.r && hi === last.r + last.h) return d;
    return { ...d, b: [...d.b.slice(0, -1), { k: 'ring', r: lo, h: hi - lo, c }] };
  }
  if (d.b.length >= MAX_BANDS) return d;
  return { ...d, b: [...d.b, { k: 'ring', r, h: RING_H, c }] };
}

/** Press a pattern stamp as a band centred on `row`. */
export function addStamp(d: Decor, kind: Stamp, row: number, color: number): Decor {
  if (d.b.length >= MAX_BANDS) return d;
  return { ...d, b: [...d.b, { k: kind, r: clampRow(row, STAMP_H), h: STAMP_H, c: paintIndex(color) }] };
}

export const undoBand = (d: Decor): Decor => ({ ...d, b: d.b.slice(0, -1) });

/** Paint index of the topmost ring covering `row`, or −1 (glaze shows through). */
export function ringAt(d: Decor, row: number): number {
  for (let i = d.b.length - 1; i >= 0; i--) {
    const b = d.b[i];
    if (b.k === 'ring' && row >= b.r && row < b.r + b.h) return b.c;
  }
  return -1;
}

// ───────────────────────── collection ─────────────────────────
export interface SavedPot {
  id: string;
  /** Encoded profile (see encodeProfile). */
  p: string;
  d: Decor;
  /** 'o' = customer order, 'f' = free studio. */
  m: 'o' | 'f';
  k: Kind;
  /** Match % (orders only). */
  pct?: number;
  lv?: number;
  /** Customer index (orders only). */
  cu?: number;
  /** Request variant (orders only). */
  rq?: number;
  /** Saved at (ms). */
  t: number;
}
export const SHELF_MAX = 240;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 12 bits per row, two url-safe base64 chars each → 120 chars per pot. */
export function encodeProfile(p: Profile): string {
  let s = '';
  for (let i = 0; i < ROWS; i++) {
    const q = Math.max(0, Math.min(4095, Math.round((Math.max(0, p[i] ?? 0) / MAX_R) * 4095)));
    s += B64[q >> 6] + B64[q & 63];
  }
  return s;
}

export function decodeProfile(s: string): Profile | null {
  if (typeof s !== 'string' || s.length !== ROWS * 2) return null;
  const out: Profile = [];
  for (let i = 0; i < ROWS; i++) {
    const a = B64.indexOf(s[i * 2]);
    const b = B64.indexOf(s[i * 2 + 1]);
    if (a < 0 || b < 0) return null;
    out.push((((a << 6) | b) / 4095) * MAX_R);
  }
  return out;
}

const isKind = (k: unknown): k is Kind => KINDS.includes(k as Kind);
const BAND_KINDS: BandKind[] = ['ring', ...STAMPS];
const int = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Validates one stored pot (anything malformed → null, so a corrupt save never crashes). */
export function parsePot(raw: unknown): SavedPot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !decodeProfile(o.p as string) || !isKind(o.k) || (o.m !== 'o' && o.m !== 'f') || !int(o.t, 0, 1e14)) return null;
  const d = o.d as Record<string, unknown> | undefined;
  if (!d || typeof d.g !== 'string' || !Array.isArray(d.b)) return null;
  const bands: Band[] = [];
  for (const b of d.b.slice(0, MAX_BANDS) as Record<string, unknown>[]) {
    if (!b || !BAND_KINDS.includes(b.k as BandKind) || !int(b.r, 0, ROWS - 1) || !int(b.h, 1, ROWS) || !int(b.c, 0, PAINTS.length - 1)) continue;
    bands.push({ k: b.k as BandKind, r: b.r as number, h: b.h as number, c: b.c as number });
  }
  const pot: SavedPot = { id: o.id, p: o.p as string, d: { g: d.g, b: bands }, m: o.m, k: o.k, t: o.t as number };
  if (int(o.pct, 0, 100)) pot.pct = o.pct as number;
  if (int(o.lv, 1, LEVEL_COUNT)) pot.lv = o.lv as number;
  if (int(o.cu, 0, CUSTOMER_COUNT - 1)) pot.cu = o.cu as number;
  if (int(o.rq, 0, REQUEST_VARIANTS - 1)) pot.rq = o.rq as number;
  return pot;
}

export function parseShelf(raw: unknown): SavedPot[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parsePot).filter((p): p is SavedPot => !!p).slice(0, SHELF_MAX);
}

/** Newest first; the oldest pots fall off past SHELF_MAX. */
export const addToShelf = (shelf: SavedPot[], pot: SavedPot): SavedPot[] => [pot, ...shelf.filter((p) => p.id !== pot.id)].slice(0, SHELF_MAX);

export function makePot(o: { profile: Profile; decor: Decor; mode: 'o' | 'f'; kind: Kind; pct?: number; level?: number; order?: Order; now: number }): SavedPot {
  const pot: SavedPot = { id: o.now.toString(36), p: encodeProfile(o.profile), d: { g: o.decor.g, b: o.decor.b.map((b) => ({ ...b })) }, m: o.mode, k: o.kind, t: o.now };
  if (o.mode === 'o') {
    if (o.pct !== undefined) pot.pct = o.pct;
    if (o.level !== undefined) pot.lv = o.level;
    if (o.order) {
      pot.cu = o.order.customer;
      pot.rq = o.order.variant;
    }
  }
  return pot;
}
