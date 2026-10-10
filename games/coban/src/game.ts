/**
 * Çoban / Herd — pure, deterministic herding simulation (no DOM).
 * World is a fixed 360×640 meadow. The pen sits near the top with a gate in its bottom wall.
 * Everything advances in fixed steps of DT with a seeded RNG stored in the state, so the same
 * level + the same inputs always produce the same outcome.
 *
 * Two modes: `level` (pen every animal before the clock runs out) and `rush` (endless waves,
 * pen as many as possible before too many wander off).
 */
export const W = 360;
export const H = 640;
export const DT = 1 / 60;
export const LEVEL_COUNT = 120;
export const SHEEP_R = 9;
export const DOG_R = 10;
export const DOG_SPEED = 175;
export const DOG_ACCEL = 11; // 1/s — how quickly the dog reaches the finger's speed
export const FLEE_R = 85;
export const WOLF_R = 80;
export const CONTINUE_SECONDS = 15;
export const BARK_R = 125;
export const BARK_CD = 4;
export const BARK_SCARE = 0.7;
export const BUTTON_R = 16;
/** Minimum free lane the generator leaves between obstacles and walls. */
export const LANE = 56;
export const RUSH_MISS_LIMIT = 3;
export const RUSH_LIFE = 40;

/** First level each feature appears on (each gets a one-time tip in the UI). */
export const FEATURE_LEVEL = { bark: 3, lamb: 8, black: 12, mud: 16, goat: 20, wolf: 25, gate: 32, goose: 40 } as const;
export type Feature = keyof typeof FEATURE_LEVEL;

export type Kind = 'sheep' | 'black' | 'lamb' | 'goat' | 'goose';
export const KIND: Record<Kind, { r: number; max: number; flee: number; wander: number; cohesion: number }> = {
  sheep: { r: SHEEP_R, max: 112, flee: FLEE_R, wander: 9, cohesion: 14 },
  black: { r: SHEEP_R, max: 62, flee: FLEE_R, wander: 9, cohesion: 14 },
  lamb: { r: 6.5, max: 96, flee: 72, wander: 6, cohesion: 10 },
  goat: { r: SHEEP_R, max: 120, flee: 80, wander: 15, cohesion: 7 },
  goose: { r: 7, max: 150, flee: 100, wander: 10, cohesion: 34 },
};

export interface Vec { x: number; y: number }
export interface Seg { a: Vec; b: Vec }
export interface Circle { x: number; y: number; r: number; kind: 'pond' | 'bush' | 'mud'; hedge?: boolean }
export interface Pen { x: number; y: number; w: number; h: number; gx: number; gw: number }
export interface Spawn { x: number; y: number; kind: Kind; mother: number }
export interface Animal {
  id: number;
  kind: Kind;
  x: number; y: number; vx: number; vy: number;
  heading: number;
  penned: boolean;
  mother: number; // id of the mother (lambs), -1 otherwise
  scare: number; // seconds left of bark panic
  sx: number; sy: number; // where the bark came from
  hop: number; // goat jump animation (seconds left)
  life: number; // rush: seconds before it wanders off (Infinity in levels)
  pennedAt: number;
  gone: boolean;
}
/** @deprecated alias kept for readability in older call sites. */
export type Sheep = Animal;
export interface Wolf { edge: 'left' | 'right'; phase: number; x: number; y: number; hidden: number }
export interface Level {
  level: number;
  pen: Pen;
  fences: Seg[];
  circles: Circle[];
  animals: Spawn[];
  wolves: number;
  dog: Vec;
  button: Vec | null;
  timeLimit: number;
  seed: number;
}
export interface DogStats { speed: number; barkR: number; barkCd: number }
export type GameEvent =
  | { type: 'pen'; kind: Kind; x: number; y: number }
  | { type: 'bark'; scared: number }
  | { type: 'gate' }
  | { type: 'hop' }
  | { type: 'escape'; x: number; y: number }
  | { type: 'wave'; n: number };
export interface Rush { wave: number; next: number; missed: number; limit: number; score: number; nextId: number }
export interface State {
  mode: 'level' | 'rush';
  level: number;
  pen: Pen;
  fences: Seg[];
  circles: Circle[];
  walls: Seg[]; // pen walls (block everyone)
  gateLine: Seg; // blocks the dog always, animals while the gate is closed
  button: Vec | null;
  gateOpen: boolean;
  sheep: Animal[];
  wolves: Wolf[];
  dog: { x: number; y: number; vx: number; vy: number };
  stats: DogStats;
  barkEnabled: boolean;
  barkCd: number;
  barkAt: number; // time of the last bark (-1 = never)
  target: Vec | null;
  time: number; // seconds elapsed
  timeLimit: number;
  rng: number;
  ticks: number;
  result: 'win' | 'lose' | null;
  rush: Rush | null;
  events: GameEvent[];
}

// ───────────────────────── rng / vec helpers ─────────────────────────
export function rngNext(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const len = (x: number, y: number) => Math.hypot(x, y);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function closestOnSeg(p: Vec, s: Seg): Vec {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2, 0, 1);
  return { x: s.a.x + dx * t, y: s.a.y + dy * t };
}
const ptSeg = (p: Vec, s: Seg) => { const q = closestOnSeg(p, s); return len(p.x - q.x, p.y - q.y); };
function segsCross(a: Seg, b: Seg) {
  const d = (p: Vec, q: Vec, r: Vec) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(b.a, b.b, a.a), d2 = d(b.a, b.b, a.b), d3 = d(a.a, a.b, b.a), d4 = d(a.a, a.b, b.b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
export const segDist = (a: Seg, b: Seg) => (segsCross(a, b) ? 0 : Math.min(ptSeg(a.a, b), ptSeg(a.b, b), ptSeg(b.a, a), ptSeg(b.b, a)));

export function penWalls(p: Pen): Seg[] {
  const { x, y, w, h, gx, gw } = p;
  const b = y + h;
  return [
    { a: { x, y }, b: { x: x + w, y } },
    { a: { x, y }, b: { x, y: b } },
    { a: { x: x + w, y }, b: { x: x + w, y: b } },
    { a: { x, y: b }, b: { x: gx - gw / 2, y: b } },
    { a: { x: gx + gw / 2, y: b }, b: { x: x + w, y: b } },
  ];
}
/** The hedgerow the pen is set into: closes the top of the meadow on both sides of the pen. */
export function hedgeRow(p: Pen): Seg[] {
  const y = p.y + p.h;
  return [
    { a: { x: 0, y }, b: { x: p.x, y } },
    { a: { x: p.x + p.w, y }, b: { x: W, y } },
  ];
}
export const penCenter = (p: Pen): Vec => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
export const insidePen = (p: Pen, v: Vec, m = SHEEP_R) => v.x > p.x + m && v.x < p.x + p.w - m && v.y > p.y + m && v.y < p.y + p.h - m;
export const gateEntrance = (p: Pen): Vec => ({ x: p.gx, y: p.y + p.h + 14 });
export const blocks = (c: Circle) => c.kind !== 'mud';
export const inMud = (s: { circles: Circle[] }, v: Vec) => s.circles.some((c) => c.kind === 'mud' && len(v.x - c.x, v.y - c.y) < c.r);

// ───────────────────────── distance field (path-aware "downhill to the gate") ─────────────────────────
export const CELL = 8;
const COLS = Math.ceil(W / CELL), ROWS = Math.ceil(H / CELL);
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const cellOf = (v: Vec) => Math.floor(clamp(v.y, 0, H - 1) / CELL) * COLS + Math.floor(clamp(v.x, 0, W - 1) / CELL);
const cellCenter = (i: number): Vec => ({ x: (i % COLS) * CELL + CELL / 2, y: Math.floor(i / COLS) * CELL + CELL / 2 });

/** Blocked-cell grid for a body of radius r. Pen interior counts as blocked (it is reached via the gate). */
function blockedGrid(pen: Pen, fences: Seg[], circles: Circle[], r: number, extra: Seg[] = []): Uint8Array {
  const segs = [...fences, ...penWalls(pen), ...hedgeRow(pen), ...extra];
  const g = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < g.length; i++) {
    const { x, y } = cellCenter(i);
    const cx = i % COLS, cy = (i / COLS) | 0;
    let b = cx < 1 || cy < 1 || cx >= COLS - 1 || cy >= ROWS - 1 || insidePen(pen, { x, y }, 0);
    if (!b) for (const c of circles) if (blocks(c) && len(x - c.x, y - c.y) < c.r + r) { b = true; break; }
    if (!b) for (const s of segs) if (ptSeg({ x, y }, s) < r + 1) { b = true; break; }
    g[i] = b ? 1 : 0;
  }
  return g;
}

/** BFS distances (in cells, 8-neighbour) from `from`; -1 = blocked/unreachable. */
function bfs(blocked: Uint8Array, from: number, stopAt = -1): Int16Array {
  const d = new Int16Array(COLS * ROWS).fill(-1);
  d[from] = 0;
  const q = new Int32Array(COLS * ROWS);
  let h = 0, t = 0;
  q[t++] = from;
  while (h < t) {
    const i = q[h++];
    if (i === stopAt) break;
    const cx = i % COLS, cy = (i / COLS) | 0;
    for (const [dx, dy] of N8) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (d[j] >= 0 || blocked[j]) continue;
      if (dx && dy && (blocked[cy * COLS + nx] || blocked[ny * COLS + cx])) continue; // no corner cutting
      d[j] = d[i] + 1;
      q[t++] = j;
    }
  }
  return d;
}

/** Field value at a point; if the point's own cell is blocked (hugging an obstacle) use the best neighbour. */
function fieldAt(f: Int16Array, v: Vec): number {
  const i = cellOf(v);
  if (f[i] >= 0) return f[i];
  const cx = i % COLS, cy = (i / COLS) | 0;
  let best = -1;
  for (let r = 1; r <= 2; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const v2 = f[ny * COLS + nx];
        if (v2 >= 0 && (best < 0 || v2 < best)) best = v2;
      }
  return best;
}

/** Point `steps` cells further down the field from v (toward the gate). */
function downhill(f: Int16Array, v: Vec, steps: number): Vec {
  let i = cellOf(v);
  if (f[i] < 0) {
    const cx = i % COLS, cy = (i / COLS) | 0;
    let best = -1;
    for (let r = 1; r <= 2 && best < 0; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const j = ny * COLS + nx;
          if (f[j] >= 0 && (best < 0 || f[j] < f[best])) best = j;
        }
    if (best < 0) return v;
    i = best;
  }
  for (let k = 0; k < steps && f[i] > 0; k++) {
    const cx = i % COLS, cy = (i / COLS) | 0;
    let best = i;
    for (const [dx, dy] of N8) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (f[j] >= 0 && f[j] < f[best]) best = j;
    }
    if (best === i) break;
    i = best;
  }
  return cellCenter(i);
}

/** True when every point can walk (sheep-sized) to the gate. */
export function reachable(pen: Pen, fences: Seg[], circles: Circle[], points: Vec[]): boolean {
  const f = bfs(blockedGrid(pen, fences, circles, SHEEP_R), cellOf(gateEntrance(pen)));
  return points.every((p) => f[cellOf(p)] >= 0);
}

/** Total walking distance (px) from each point to the gate — used to size the time limit. */
export function pathLengths(pen: Pen, fences: Seg[], circles: Circle[], points: Vec[]): number[] {
  const f = bfs(blockedGrid(pen, fences, circles, SHEEP_R), cellOf(gateEntrance(pen)));
  return points.map((p) => Math.max(0, fieldAt(f, p)) * CELL);
}

// ───────────────────────── level generator ─────────────────────────
export function levelParams(n: number) {
  const total = Math.min(16, 3 + Math.floor((n - 1) / 6));
  const black = n >= FEATURE_LEVEL.black ? 1 + Math.floor(n / 50) : 0;
  const lambs = n < FEATURE_LEVEL.lamb ? 0 : n < 20 ? 1 : n % 4 === 1 ? 0 : 1 + (n >= 60 ? 1 : 0);
  const goats = n < FEATURE_LEVEL.goat ? 0 : n < FEATURE_LEVEL.gate ? 1 + (n % 2) : n % 3 === 0 ? 0 : 1 + Math.floor(n / 60);
  const geese = n < FEATURE_LEVEL.goose ? 0 : n === FEATURE_LEVEL.goose ? 3 : n % 3 === 1 ? 0 : 2 + Math.floor((n - 40) / 40);
  const sheep = Math.max(lambs, total - black - lambs - goats - geese);
  return {
    total: sheep + black + lambs + goats + geese,
    sheep,
    black,
    lambs,
    goats,
    geese,
    fences: Math.min(4, Math.floor(n / 9)),
    ponds: Math.min(3, Math.floor((n + 5) / 15)),
    bushes: Math.min(5, Math.floor(n / 7)),
    mud: n < FEATURE_LEVEL.mud ? 0 : n === FEATURE_LEVEL.mud ? 1 : n % 5 === 0 ? 0 : Math.min(2, 1 + Math.floor((n - 16) / 40)),
    gate: n === FEATURE_LEVEL.gate || (n > FEATURE_LEVEL.gate && n % 3 === 2),
    wolves: n >= FEATURE_LEVEL.wolf ? (n >= 70 ? 2 : 1) : 0,
  };
}

/**
 * Seconds allowed for a level: sized from the walking distance of every animal to the gate and
 * what is in the way. Tuned against the herding bot (see game.test.ts): it needs ~25 % of the
 * limit on average and never more than 85 %, so a player has room for mistakes.
 */
export function timeLimitFor(n: number, paths: number[], button: boolean): number {
  const P = levelParams(n);
  const walk = paths.reduce((a, b) => a + b, 0) / paths.length; // mean distance to the gate
  const far = Math.max(...paths);
  return Math.round(
    18 + far * 0.03 + walk * 0.03 + P.total * 3 + P.black * 4 + P.lambs * 2 + P.goats * 3 + P.geese * 1.5 +
      P.fences * 1.5 + P.ponds + P.mud * 2 + P.wolves * 5 + (button ? 6 : 0),
  );
}

/**
 * Hedges that round off the meadow's corners, so no animal can get wedged where the dog can't
 * reach behind it.
 */
export function cornerHedges(pen: Pen): Circle[] {
  return [
    { x: -6, y: pen.y + pen.h - 6, r: 38, kind: 'bush', hedge: true },
    { x: W + 6, y: pen.y + pen.h - 6, r: 38, kind: 'bush', hedge: true },
    { x: -6, y: H + 6, r: 40, kind: 'bush', hedge: true },
    { x: W + 6, y: H + 6, r: 40, kind: 'bush', hedge: true },
  ];
}

export function generateLevel(n: number): Level {
  const P = levelParams(n);
  for (let attempt = 0; ; attempt++) {
    const r = { rng: n * 7919 + attempt * 104729 + 17 };
    const rand = (a: number, b: number) => a + rngNext(r) * (b - a);
    const pw = 120, ph = 84;
    // pen hugs the top edge (nothing can slip behind it) and leaves wide lanes on both sides
    const px = rand(60, W - 60 - pw), py = 2;
    const pen: Pen = { x: px, y: py, w: pw, h: ph, gx: px + pw / 2 + rand(-18, 18), gw: 64 };
    const dog = { x: W / 2 + rand(-60, 60), y: H - 40 };
    const keepClear = (x: number, y: number, m: number) =>
      x > pen.x - m && x < pen.x + pen.w + m && y < pen.y + pen.h + m + 40; // pen + area in front of the gate
    const circles: Circle[] = cornerHedges(pen);
    const place = (kind: Circle['kind'], rMin: number, rMax: number) => {
      for (let k = 0; k < 40; k++) {
        // blocking obstacles leave a lane (≥ LANE) to the edges and to each other: no dead-end pockets
        const rr = rand(rMin, rMax), m = kind === 'mud' ? 30 : rr + LANE;
        const c: Circle = { x: rand(m, W - m), y: rand(200, H - 110), r: rr, kind };
        if (keepClear(c.x, c.y, c.r + 10)) continue;
        if (circles.some((o) => len(o.x - c.x, o.y - c.y) < o.r + c.r + (kind === 'mud' || o.kind === 'mud' ? 12 : LANE))) continue;
        circles.push(c);
        return;
      }
    };
    for (let i = 0; i < P.ponds; i++) place('pond', 26, 40);
    for (let i = 0; i < P.bushes; i++) place('bush', 12, 18);
    for (let i = 0; i < P.mud; i++) place('mud', 28, 38);
    const fences: Seg[] = [];
    for (let i = 0; i < P.fences; i++) {
      for (let k = 0; k < 30; k++) {
        const cx = rand(50, W - 50), cy = rand(200, H - 120), L = rand(60, 110), a = rngNext(r) < 0.5 ? 0 : rand(-0.6, 0.6) + Math.PI / 2;
        const s: Seg = { a: { x: cx - (Math.cos(a) * L) / 2, y: cy - (Math.sin(a) * L) / 2 }, b: { x: cx + (Math.cos(a) * L) / 2, y: cy + (Math.sin(a) * L) / 2 } };
        if (keepClear(cx, cy, L / 2 + 10)) continue;
        if (Math.min(s.a.x, s.b.x) < LANE || Math.max(s.a.x, s.b.x) > W - LANE || Math.max(s.a.y, s.b.y) > H - LANE) continue;
        if (circles.some((o) => ptSeg(o, s) < o.r + (o.kind === 'mud' ? 6 : LANE))) continue;
        if (fences.some((f) => segDist(f, s) < LANE)) continue;
        fences.push(s);
        break;
      }
    }
    const blockedAt = (x: number, y: number, m: number) =>
      circles.some((o) => blocks(o) && len(o.x - x, o.y - y) < o.r + m) || fences.some((f) => ptSeg({ x, y }, f) < m);
    // herd composition: specials replace plain sheep; lambs spawn next to their mother
    const kinds: Kind[] = [
      ...Array<Kind>(P.black).fill('black'),
      ...Array<Kind>(P.sheep).fill('sheep'),
      ...Array<Kind>(P.goats).fill('goat'),
      ...Array<Kind>(P.geese).fill('goose'),
    ];
    const animals: Spawn[] = [];
    const groups = 1 + Math.floor(P.total / 6);
    const centers = Array.from({ length: groups }, () => ({ x: rand(60, W - 60), y: rand(250, H - 130) }));
    const free = (x: number, y: number, rad: number) =>
      !blockedAt(x, y, rad + 8) && !insidePen(pen, { x, y }, -20) && len(x - dog.x, y - dog.y) >= FLEE_R + 15 &&
      !animals.some((o) => len(o.x - x, o.y - y) < KIND[o.kind].r + rad + 6);
    const geeseCenter = { x: rand(60, W - 60), y: rand(260, H - 150) };
    for (let i = 0, k = 0; i < kinds.length && k < 3000; k++) {
      const kind = kinds[i];
      const c = kind === 'goose' ? geeseCenter : centers[i % groups];
      const spread = kind === 'goose' ? 30 : 55;
      const x = clamp(c.x + rand(-spread, spread), 20, W - 20), y = clamp(c.y + rand(-spread, spread), 200, H - 30);
      if (!free(x, y, KIND[kind].r)) continue;
      animals.push({ x, y, kind, mother: -1 });
      i++;
    }
    if (animals.length < kinds.length) continue;
    // lambs: next to a plain sheep (their mother)
    const mothers = animals.map((a, i) => (a.kind === 'sheep' ? i : -1)).filter((i) => i >= 0);
    for (let l = 0; l < P.lambs; l++) {
      const m = mothers[l];
      for (let k = 0; k < 60; k++) {
        const a = rand(0, Math.PI * 2), dd = rand(23, 30), x = animals[m].x + Math.cos(a) * dd, y = animals[m].y + Math.sin(a) * dd;
        if (x < 20 || x > W - 20 || y > H - 30 || !free(x, y, KIND.lamb.r)) continue;
        animals.push({ x, y, kind: 'lamb', mother: m });
        break;
      }
    }
    if (animals.length < P.total) continue;
    let button: Vec | null = null;
    if (P.gate) {
      const g = gateEntrance(pen);
      for (let k = 0; k < 60 && !button; k++) {
        const b = { x: rand(40, W - 40), y: rand(260, H - 90) };
        // out of the way: far from the gate and from where the dog starts
        if (len(b.x - g.x, b.y - g.y) < 180 || len(b.x - dog.x, b.y - dog.y) < 150 || blockedAt(b.x, b.y, BUTTON_R + 12)) continue;
        if (animals.some((o) => len(o.x - b.x, o.y - b.y) < 30)) continue;
        button = b;
      }
      if (!button) continue;
    }
    const pts = [...animals, dog, ...(button ? [button] : [])];
    if (!reachable(pen, fences, circles, pts)) continue;
    const timeLimit = timeLimitFor(n, pathLengths(pen, fences, circles, animals), !!button);
    return { level: n, pen, fences, circles, animals, wolves: P.wolves, dog, button, timeLimit, seed: n * 31337 + attempt };
  }
}

// ───────────────────────── rush (endless) layout ─────────────────────────
export function generateRush(): Level {
  const pen: Pen = { x: 120, y: 2, w: 120, h: 86, gx: 180, gw: 70 };
  return {
    level: 0,
    pen,
    fences: [{ a: { x: 222, y: 420 }, b: { x: 312, y: 420 } }],
    circles: [
      ...cornerHedges(pen),
      { x: 84, y: 330, r: 30, kind: 'pond' },
      { x: 286, y: 290, r: 15, kind: 'bush' },
      { x: 70, y: 500, r: 14, kind: 'bush' },
      { x: 200, y: 520, r: 32, kind: 'mud' },
    ],
    animals: [],
    wolves: 0,
    dog: { x: W / 2, y: 300 },
    button: null,
    timeLimit: Infinity,
    seed: 4242,
  };
}

// ───────────────────────── dog upgrades ─────────────────────────
export const UPGRADE_MAX = 5;
export interface Upgrades { speed: number; bark: number; cd: number }
export const UPGRADE_PRICES = [40, 80, 150, 250, 400];
export function dogStats(u: Upgrades = { speed: 0, bark: 0, cd: 0 }): DogStats {
  const l = (v: number) => clamp(Math.floor(v) || 0, 0, UPGRADE_MAX);
  return { speed: DOG_SPEED * (1 + 0.05 * l(u.speed)), barkR: BARK_R + 13 * l(u.bark), barkCd: BARK_CD - 0.3 * l(u.cd) };
}

// ───────────────────────── state ─────────────────────────
function makeAnimal(id: number, sp: Spawn, mother: number, life: number): Animal {
  return {
    id, kind: sp.kind, x: sp.x, y: sp.y, vx: 0, vy: 0, heading: (id * 2.399) % (Math.PI * 2), penned: false, mother,
    scare: 0, sx: 0, sy: 0, hop: 0, life, pennedAt: 0, gone: false,
  };
}

export function createState(L: Level, stats: DogStats = dogStats(), mode: 'level' | 'rush' = 'level'): State {
  const pen = L.pen;
  return {
    mode,
    level: L.level,
    pen,
    fences: L.fences,
    circles: L.circles,
    walls: [...penWalls(pen), ...hedgeRow(pen)],
    gateLine: { a: { x: pen.gx - pen.gw / 2, y: pen.y + pen.h }, b: { x: pen.gx + pen.gw / 2, y: pen.y + pen.h } },
    button: L.button,
    gateOpen: !L.button,
    sheep: L.animals.map((p, i) => makeAnimal(i, p, p.mother, Infinity)),
    wolves: Array.from({ length: L.wolves }, (_, i) => ({ edge: i % 2 ? 'right' : 'left', phase: i * 2.1, x: 0, y: 0, hidden: 0 }) as Wolf),
    dog: { x: L.dog.x, y: L.dog.y, vx: 0, vy: 0 },
    stats,
    barkEnabled: mode === 'rush' || L.level >= FEATURE_LEVEL.bark,
    barkCd: 0,
    barkAt: -1,
    target: null,
    time: 0,
    timeLimit: L.timeLimit,
    rng: L.seed,
    ticks: 0,
    result: null,
    rush: mode === 'rush' ? { wave: 0, next: 0.6, missed: 0, limit: RUSH_MISS_LIMIT, score: 0, nextId: 0 } : null,
    events: [],
  };
}

export const createRushState = (stats: DogStats = dogStats()) => createState(generateRush(), stats, 'rush');

export const pennedCount = (s: State) => (s.rush ? s.rush.score : s.sheep.reduce((n, sh) => n + (sh.penned ? 1 : 0), 0));
export const timeLeft = (s: State) => Math.max(0, s.timeLimit - s.time);

export function starsFor(s: State): number {
  const f = timeLeft(s) / s.timeLimit;
  return f >= 0.45 ? 3 : f >= 0.2 ? 2 : 1;
}

// ───────────────────────── collisions ─────────────────────────
type Body = { x: number; y: number; vx: number; vy: number };
function pushOut(o: Body, g: Seg, r: number) {
  const q = closestOnSeg(o, g);
  const dx = o.x - q.x, dy = o.y - q.y, d = len(dx, dy);
  if (d < r) {
    const nx = d ? dx / d : 0, ny = d ? dy / d : 1;
    o.x = q.x + nx * r;
    o.y = q.y + ny * r;
    const vn = o.vx * nx + o.vy * ny;
    if (vn < 0) { o.vx -= vn * nx; o.vy -= vn * ny; }
  }
}
function collide(o: Body, r: number, s: State, who: 'dog' | 'animal' | 'goat'): boolean {
  for (const c of s.circles) {
    if (!blocks(c)) continue;
    const dx = o.x - c.x, dy = o.y - c.y, d = len(dx, dy) || 1e-6;
    if (d < c.r + r) {
      o.x = c.x + (dx / d) * (c.r + r);
      o.y = c.y + (dy / d) * (c.r + r);
    }
  }
  let overFence = false;
  if (who !== 'goat') for (const g of s.fences) pushOut(o, g, r);
  else for (const g of s.fences) if (ptSeg(o, g) < r + 2) overFence = true;
  for (const g of s.walls) pushOut(o, g, r);
  if (who === 'dog' || !s.gateOpen) pushOut(o, s.gateLine, r);
  o.x = clamp(o.x, r, W - r);
  o.y = clamp(o.y, r, H - r);
  return overFence;
}

// ───────────────────────── bark ─────────────────────────
export const barkReady = (s: State) => s.barkEnabled && s.barkCd <= 0 && !s.result;

/** The dog barks: every free animal in range panics away from it; wolves in range run off. */
export function bark(s: State): boolean {
  if (!barkReady(s)) return false;
  const d = s.dog, R = s.stats.barkR;
  s.barkCd = s.stats.barkCd;
  s.barkAt = s.time;
  let scared = 0;
  for (const a of s.sheep) {
    if (a.penned || a.gone || len(a.x - d.x, a.y - d.y) > R) continue;
    a.scare = BARK_SCARE;
    a.sx = d.x;
    a.sy = d.y;
    scared++;
  }
  for (const w of s.wolves) if (w.hidden <= 0 && len(w.x - d.x, w.y - d.y) < R * 1.3) w.hidden = 7;
  s.events.push({ type: 'bark', scared });
  return true;
}

// ───────────────────────── rush waves ─────────────────────────
function spawnWave(s: State) {
  const R = s.rush!;
  R.wave++;
  const n = Math.min(6, 2 + Math.floor(R.wave / 3));
  const roll = () => rngNext(s);
  // entry point: bottom edge or the lower part of a side edge
  const side = roll();
  const base = side < 0.5 ? { x: 60 + roll() * (W - 120), y: H - 34 } : { x: side < 0.75 ? 30 : W - 30, y: 400 + roll() * 180 };
  const kinds: Kind[] = [];
  for (let i = 0; i < n; i++) {
    const k = roll();
    kinds.push(R.wave >= 4 && k < 0.1 ? 'black' : R.wave >= 6 && k < 0.25 ? 'goat' : 'sheep');
  }
  if (R.wave >= 5 && roll() < 0.5) kinds.splice(0, 2, 'goose', 'goose');
  if (R.wave >= 8 && roll() < 0.4) kinds.push('goose');
  const lamb = R.wave >= 3 && roll() < 0.5;
  const ok = (x: number, y: number, r: number) =>
    x > 16 && x < W - 16 && y > 160 && y < H - 16 &&
    !s.circles.some((c) => blocks(c) && len(c.x - x, c.y - y) < c.r + r + 4) &&
    !s.fences.some((f) => ptSeg({ x, y }, f) < r + 4) &&
    !s.sheep.some((o) => len(o.x - x, o.y - y) < KIND[o.kind].r + r + 2);
  let firstSheep = -1;
  for (const kind of kinds) {
    for (let k = 0; k < 40; k++) {
      const x = base.x + (roll() - 0.5) * 80, y = base.y + (roll() - 0.5) * 60;
      if (!ok(x, y, KIND[kind].r)) continue;
      const a = makeAnimal(R.nextId++, { x, y, kind, mother: -1 }, -1, RUSH_LIFE);
      if (kind === 'sheep' && firstSheep < 0) firstSheep = a.id;
      s.sheep.push(a);
      break;
    }
  }
  if (lamb && firstSheep >= 0) {
    const m = s.sheep.find((a) => a.id === firstSheep)!;
    for (let k = 0; k < 30; k++) {
      const x = m.x + (roll() - 0.5) * 40, y = m.y + (roll() - 0.5) * 40;
      if (!ok(x, y, KIND.lamb.r)) continue;
      s.sheep.push(makeAnimal(R.nextId++, { x, y, kind: 'lamb', mother: firstSheep }, firstSheep, RUSH_LIFE));
      break;
    }
  }
  const wolves = R.wave >= 12 ? 2 : R.wave >= 6 ? 1 : 0;
  while (s.wolves.length < wolves) s.wolves.push({ edge: s.wolves.length % 2 ? 'right' : 'left', phase: s.wolves.length * 2.1, x: 0, y: 0, hidden: 3 });
  R.next = s.time + Math.max(8, 15 - R.wave * 0.4);
  s.events.push({ type: 'wave', n: R.wave });
}

/** Rush continue: one more miss allowed and the stragglers get a little more patience. */
export function rushContinue(s: State) {
  if (!s.rush) return;
  s.rush.missed = s.rush.limit - 1;
  for (const a of s.sheep) if (!a.penned) a.life = Math.max(a.life, 12);
  s.result = null;
}

// ───────────────────────── step ─────────────────────────
const PANIC_TURNS = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 0];
function probeBlocked(s: State, x: number, y: number, r: number, goat: boolean): boolean {
  if (x < r + 2 || x > W - r - 2 || y < r + 2 || y > H - r - 2) return true;
  for (const c of s.circles) if (blocks(c) && len(x - c.x, y - c.y) < c.r + r + 2) return true;
  for (const g of s.walls) if (ptSeg({ x, y }, g) < r + 2) return true;
  if (!goat) for (const g of s.fences) if (ptSeg({ x, y }, g) < r + 2) return true;
  return false;
}
/** Advances the simulation by one fixed step. Returns the number of animals penned this step. */
export function step(s: State): number {
  if (s.result) return 0;
  s.ticks++;
  s.time = s.ticks * DT;
  const d = s.dog;
  if (s.barkCd > 0) s.barkCd = Math.max(0, s.barkCd - DT);

  // dog accelerates toward the finger (slower in mud)
  const dogMud = inMud(s, d) ? 0.55 : 1;
  let tvx = 0, tvy = 0;
  if (s.target) {
    const dx = s.target.x - d.x, dy = s.target.y - d.y, l = len(dx, dy);
    const sp = Math.min(s.stats.speed * dogMud, l * 7);
    if (l > 0.5) { tvx = (dx / l) * sp; tvy = (dy / l) * sp; }
  }
  const k = 1 - Math.exp(-DOG_ACCEL * DT * (s.target ? 1 : 0.8));
  d.vx += (tvx - d.vx) * k;
  d.vy += (tvy - d.vy) * k;
  d.x += d.vx * DT;
  d.y += d.vy * DT;
  collide(d, DOG_R, s, 'dog');
  if (s.button && !s.gateOpen && len(d.x - s.button.x, d.y - s.button.y) < BUTTON_R + DOG_R * 0.5) {
    s.gateOpen = true;
    s.events.push({ type: 'gate' });
  }

  // wolves patrol the side edges; the dog (or a bark) chases them off for a while
  for (const w of s.wolves) {
    if (w.hidden > 0) { w.hidden -= DT; continue; }
    w.x = w.edge === 'left' ? 14 : W - 14;
    w.y = H * 0.55 + Math.sin(s.time * 0.35 + w.phase) * H * 0.3;
    if (len(w.x - d.x, w.y - d.y) < 70) w.hidden = 5;
  }

  if (s.rush) {
    const R = s.rush;
    const onField = s.sheep.some((a) => !a.penned);
    if (!onField && R.next - s.time > 2.5) R.next = s.time + 2.5;
    if (s.time >= R.next) spawnWave(s);
  }

  let newly = 0;
  const pc = penCenter(s.pen);
  const gate = gateEntrance(s.pen);
  for (const sh of s.sheep) {
    const K = KIND[sh.kind];
    const mud = inMud(s, sh) ? 0.5 : 1;
    let ax = 0, ay = 0, fear = 0;
    let max = K.max * mud;
    if (sh.penned) {
      const dx = pc.x - sh.x, dy = pc.y - sh.y, l = len(dx, dy);
      if (l > 16) { ax += (dx / l) * 18; ay += (dy / l) * 18; }
    } else {
      let px = 0, py = 0; // panic (flee) vector, steered along walls below
      const flee = (fx: number, fy: number, R: number, gain = 1.4) => {
        const dx = sh.x - fx, dy = sh.y - fy, l = len(dx, dy) || 1e-6;
        if (l >= R) return;
        const f = Math.sqrt(1 - l / R);
        px += (dx / l) * max * f * gain;
        py += (dy / l) * max * f * gain;
        fear = Math.max(fear, f);
      };
      if (sh.scare > 0) {
        sh.scare -= DT;
        max *= 1.3;
        const dx = sh.x - sh.sx, dy = sh.y - sh.sy, l = len(dx, dy) || 1e-6;
        px += (dx / l) * max * 2;
        py += (dy / l) * max * 2;
        fear = 1;
      }
      flee(d.x, d.y, K.flee);
      for (const w of s.wolves) if (w.hidden <= 0) flee(w.x, w.y, WOLF_R);
      const pl = len(px, py);
      if (pl > 1) {
        // cornered animals slip sideways along the wall instead of pressing into it
        const ux = px / pl, uy = py / pl;
        for (const a of PANIC_TURNS) {
          const c = Math.cos(a), sn = Math.sin(a);
          const rx = ux * c - uy * sn, ry = ux * sn + uy * c;
          if (a === PANIC_TURNS[PANIC_TURNS.length - 1] || !probeBlocked(s, sh.x + rx * 24, sh.y + ry * 24, K.r, sh.kind === 'goat')) {
            ax += rx * pl;
            ay += ry * pl;
            break;
          }
        }
      }
      // cohesion: geese stick to geese; everyone else to the flock
      let cx = 0, cy = 0, cn = 0;
      const goose = sh.kind === 'goose';
      const reach = goose ? 110 : 70;
      for (const o of s.sheep) {
        if (o === sh || o.penned || (o.kind === 'goose') !== goose) continue;
        const l = len(o.x - sh.x, o.y - sh.y);
        if (l < reach) { cx += o.x; cy += o.y; cn++; }
      }
      if (cn) {
        const dx = cx / cn - sh.x, dy = cy / cn - sh.y, l = len(dx, dy);
        if (l > (goose ? 12 : 18)) { ax += (dx / l) * K.cohesion; ay += (dy / l) * K.cohesion; }
      }
      // lambs follow their mother (or head for the gate once she is penned)
      if (sh.kind === 'lamb') {
        const m = s.sheep.find((o) => o.id === sh.mother && !o.gone);
        const goal = m && !m.penned ? m : len(sh.x - gate.x, sh.y - gate.y) < 44 ? pc : gate;
        const dx = goal.x - sh.x, dy = goal.y - sh.y, l = len(dx, dy) || 1e-6;
        const pull = m && !m.penned ? Math.min(70, Math.max(0, l - 16) * 2.2) : 22;
        ax += (dx / l) * pull * (1 - fear * 0.5);
        ay += (dy / l) * pull * (1 - fear * 0.5);
      }
      // wander (grazing) when calm
      sh.heading += (rngNext(s) - 0.5) * 0.5;
      const calm = 1 - fear;
      ax += Math.cos(sh.heading) * K.wander * calm;
      ay += Math.sin(sh.heading) * K.wander * calm;
      // shy away from ponds and the field edge
      for (const c of s.circles) {
        if (c.kind !== 'pond') continue;
        const dx = sh.x - c.x, dy = sh.y - c.y, l = len(dx, dy) || 1e-6, gap = l - c.r - K.r;
        if (gap < 22) { ax += (dx / l) * (22 - gap) * 2.5; ay += (dy / l) * (22 - gap) * 2.5; }
      }
      const E = 28;
      if (sh.x < E) ax += (E - sh.x) * 2.5;
      if (sh.x > W - E) ax -= (sh.x - W + E) * 2.5;
      if (sh.y > H - E) ay -= (sh.y - H + E) * 2.5;
      if (sh.y < E) ay += (E - sh.y) * 2.5;
      // …and from the hedgerow either side of the pen
      for (let w = 5; w < s.walls.length; w++) {
        const wall = s.walls[w];
        const q = closestOnSeg(sh, wall), dx = sh.x - q.x, dy = sh.y - q.y, l = len(dx, dy) || 1e-6, gap = l - K.r;
        if (gap < 14) { ax += (dx / l) * (14 - gap) * 2.5; ay += (dy / l) * (14 - gap) * 2.5; }
      }
    }
    // separation
    for (const o of s.sheep) {
      if (o === sh) continue;
      const rr = (K.r + KIND[o.kind].r) * 1.2;
      const dx = sh.x - o.x, dy = sh.y - o.y, l = len(dx, dy);
      if (l < rr && l > 0) { const f = (rr - l) / rr; ax += (dx / l) * 60 * f; ay += (dy / l) * 60 * f; }
    }
    const lerp = fear > 0 ? 0.2 : 0.08;
    sh.vx += (ax - sh.vx) * lerp;
    sh.vy += (ay - sh.vy) * lerp;
    // calm animals settle instead of trembling in place
    if (fear === 0 && !sh.penned) {
      const v = len(sh.vx, sh.vy);
      if (v < 4) { sh.vx *= 0.85; sh.vy *= 0.85; }
    }
    const v = len(sh.vx, sh.vy);
    if (v > max) { sh.vx *= max / v; sh.vy *= max / v; }
    sh.x += sh.vx * DT;
    sh.y += sh.vy * DT;
    // dog body pushes animals
    const ddx = sh.x - d.x, ddy = sh.y - d.y, dl = len(ddx, ddy);
    if (dl < K.r + DOG_R && dl > 0) { sh.x = d.x + (ddx / dl) * (K.r + DOG_R); sh.y = d.y + (ddy / dl) * (K.r + DOG_R); }
    const over = collide(sh, K.r, s, sh.kind === 'goat' ? 'goat' : 'animal');
    if (over && sh.hop <= 0) { sh.hop = 0.35; s.events.push({ type: 'hop' }); }
    if (sh.hop > 0) sh.hop -= DT;
    if (!sh.penned && insidePen(s.pen, sh, K.r)) {
      sh.penned = true;
      sh.pennedAt = s.time;
      sh.scare = 0;
      newly++;
      if (s.rush) s.rush.score++;
      s.events.push({ type: 'pen', kind: sh.kind, x: sh.x, y: sh.y });
    }
    if (Math.abs(sh.vx) + Math.abs(sh.vy) > 6) sh.heading = sh.penned || fear > 0 ? Math.atan2(sh.vy, sh.vx) : sh.heading;
    if (s.rush) {
      if (sh.penned && s.time - sh.pennedAt > 1.4) sh.gone = true;
      else if (!sh.penned && (sh.life -= DT) <= 0) {
        sh.gone = true;
        s.rush.missed++;
        s.events.push({ type: 'escape', x: sh.x, y: sh.y });
      }
    }
  }
  // hard overlap resolution
  for (let i = 0; i < s.sheep.length; i++)
    for (let j = i + 1; j < s.sheep.length; j++) {
      const a = s.sheep[i], b = s.sheep[j];
      const rr = KIND[a.kind].r + KIND[b.kind].r;
      const dx = b.x - a.x, dy = b.y - a.y, l = len(dx, dy);
      if (l < rr && l > 0) {
        const push = (rr - l) / 2;
        a.x -= (dx / l) * push; a.y -= (dy / l) * push;
        b.x += (dx / l) * push; b.y += (dy / l) * push;
      }
    }
  if (s.rush) {
    if (s.sheep.some((a) => a.gone)) s.sheep = s.sheep.filter((a) => !a.gone);
    if (s.rush.missed >= s.rush.limit) s.result = 'lose';
  } else if (pennedCount(s) === s.sheep.length) s.result = 'win';
  else if (s.time >= s.timeLimit) s.result = 'lose';
  return newly;
}

/** Extra time after a "continue". */
export function addTime(s: State, sec = CONTINUE_SECONDS) {
  s.timeLimit = s.time + sec;
  s.result = null;
}

// ───────────────────────── bot (tests, demo, store screenshots) ─────────────────────────
interface BotGrids { sheep: Int16Array; dogBlocked: Uint8Array }
const gridCache = new WeakMap<Pen, BotGrids>();
function grids(s: State): BotGrids {
  let g = gridCache.get(s.pen);
  if (!g) {
    g = {
      sheep: bfs(blockedGrid(s.pen, s.fences, s.circles, SHEEP_R), cellOf(gateEntrance(s.pen))),
      dogBlocked: blockedGrid(s.pen, s.fences, s.circles, DOG_R + 1, [s.gateLine]),
    };
    gridCache.set(s.pen, g);
  }
  return g;
}

interface Disk { x: number; y: number; r: number }
function clearLine(s: State, a: Vec, b: Vec, r: number, disk?: Disk): boolean {
  const ab = { a, b };
  if (disk && ptSeg(disk, ab) < disk.r) return false;
  for (const c of s.circles) if (blocks(c) && ptSeg(c, ab) < c.r + r) return false;
  for (const g of [...s.fences, ...s.walls, s.gateLine]) if (segDist(ab, g) < r) return false;
  return true;
}

/**
 * Where the dog should run next to reach `goal` without walking into an obstacle — and, when
 * `disk` is given, without cutting through the flock (so it doesn't push it the wrong way).
 */
function navigate(s: State, goal: Vec, disk?: Disk): Vec {
  const d = s.dog;
  const t = { x: clamp(goal.x, 12, W - 12), y: clamp(goal.y, 12, H - 12) };
  if (clearLine(s, d, t, DOG_R * 0.6, disk)) return t; // the dog slides along whatever it brushes
  const g = grids(s);
  let blocked = g.dogBlocked;
  if (disk) {
    blocked = blocked.slice();
    const r2 = disk.r * disk.r;
    for (let i = 0; i < blocked.length; i++) {
      const c = cellCenter(i);
      if ((c.x - disk.x) ** 2 + (c.y - disk.y) ** 2 < r2) blocked[i] = 1;
    }
  }
  const nearestFree = (from: number, p: Vec) => {
    if (!blocked[from]) return from;
    const f = bfs(new Uint8Array(COLS * ROWS), from);
    let best = -1;
    for (let i = 0; i < f.length; i++)
      if (!blocked[i] && f[i] >= 0 && (best < 0 || f[i] < f[best]) && clearLine(s, p, cellCenter(i), 2)) best = i;
    return best;
  };
  const gi = nearestFree(cellOf(t), t);
  const di = nearestFree(cellOf(d), d);
  if (gi < 0 || di < 0) return t;
  const f = bfs(blocked, gi, di);
  // walk down the field from the dog while it stays in line of sight
  let i = di;
  if (f[i] < 0) return disk ? navigate(s, goal) : t;
  let wp = cellCenter(i);
  for (let k = 0; k < 30 && f[i] > 0; k++) {
    const cx = i % COLS, cy = (i / COLS) | 0;
    let best = i;
    for (const [dx, dy] of N8) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (f[j] >= 0 && f[j] < f[best]) best = j;
    }
    if (best === i) break;
    i = best;
    const p = cellCenter(i);
    if (!clearLine(s, d, p, DOG_R - 1, disk && { ...disk, r: disk.r - 6 })) break;
    wp = p;
  }
  return f[i] === 0 && clearLine(s, d, t, DOG_R - 1) ? t : wp;
}

const botMemory = new WeakMap<State, { focus: number; until: number; backoff: number; orbit: number; orbitFocus: number }>();

export interface BotPlan { target: Vec | null; bark: boolean; why?: 'backoff' | 'around' | 'behind' }

/**
 * A decent shepherd: herds the group farthest (by walking distance) from the gate, standing
 * behind its centroid relative to the path to the gate and walking round the group (never
 * through it) when it is on the wrong side.
 */
export function botPlan(s: State): BotPlan {
  const free = s.sheep.filter((x) => !x.penned && !x.gone);
  if (!free.length) return { target: s.rush ? { x: W / 2, y: H * 0.55 } : null, bark: false };
  if (!s.gateOpen && s.button) return { target: navigate(s, s.button), bark: false };
  const g = grids(s);
  const pen = s.pen;
  const gate = gateEntrance(pen);
  const fd = (a: Vec) => { const v = fieldAt(g.sheep, a); return v < 0 ? 999 : v; };
  // rush: the one about to wander off first matters most
  const urgent = s.rush ? free.filter((a) => a.life < 9).sort((a, b) => a.life - b.life)[0] : undefined;
  // keep working on the same group for a while (no dithering between two equally far groups)
  const mem = botMemory.get(s) ?? { focus: -1, until: 0, backoff: 0, orbit: 0, orbitFocus: -1 };
  botMemory.set(s, mem);
  let far = urgent ?? free.find((a) => a.id === mem.focus && s.time < mem.until);
  if (!far) {
    far = free.reduce((a, b) => (fd(b) > fd(a) ? b : a));
    mem.focus = far.id;
    mem.until = s.time + 6;
  }
  const cluster = free.filter((a) => len(a.x - far.x, a.y - far.y) < 60);
  const C = { x: 0, y: 0 };
  for (const a of cluster) { C.x += a.x / cluster.length; C.y += a.y / cluster.length; }
  let rad = 0;
  for (const a of cluster) rad = Math.max(rad, len(a.x - C.x, a.y - C.y));
  const inside = { x: pen.gx, y: pen.y + pen.h * 0.4 };
  const nearGate = len(C.x - gate.x, C.y - gate.y) < 46 + rad && Math.abs(C.x - pen.gx) < pen.gw * 0.45 + rad * 0.5 && C.y > pen.y + pen.h - 4;
  const ahead = nearGate ? inside : downhill(g.sheep, C, 6);
  let ux = ahead.x - C.x, uy = ahead.y - C.y;
  const ul = len(ux, uy) || 1;
  ux /= ul; uy /= ul;
  const back0 = rad + (nearGate ? 22 : 30);
  const zone = rad + 70; // the dog walks round this disk to get behind the group
  const M = 11;
  const open = (p: Vec) => p.x >= M && p.x <= W - M && p.y >= M && p.y <= H - M && !g.dogBlocked[cellOf(p)];
  // stand behind the group; near a wall rotate the push until the dog fits
  let bx = 0, by = 0, found = false;
  let back = back0;
  const turns = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.45, -1.45];
  search: for (const k of [1, 0.72]) {
    back = Math.max(rad + DOG_R + SHEEP_R + 2, back0 * k);
    for (const da of turns) {
      const c = Math.cos(da), sn = Math.sin(da);
      bx = -ux * c + uy * sn;
      by = -uy * c - ux * sn;
      if (open({ x: C.x + bx * back, y: C.y + by * back })) { found = true; break search; }
    }
  }
  const d = s.dog;
  if (!found && s.time >= mem.backoff) mem.backoff = s.time + 1.5;
  if (s.time < mem.backoff) {
    // pinned in a pocket where the dog can't get behind: back off so the group calms down and
    // drifts out by itself, then come round again
    const away = rad + FLEE_R + 30;
    for (const [px, py] of [[ux, uy], [-uy, ux], [uy, -ux]]) {
      const p = { x: C.x + px * away, y: C.y + py * away };
      if (open(p)) return { target: navigate(s, p), bark: false, why: 'backoff' };
    }
    return { target: navigate(s, { x: C.x + ux * away, y: C.y + uy * away }), bark: false, why: 'backoff' };
  }
  const behind = { x: C.x + bx * back, y: C.y + by * back };
  const rx = d.x - C.x, ry = d.y - C.y, rl = len(rx, ry) || 1;
  const cos = (rx * bx + ry * by) / rl;
  if (cos < 0.8) {
    // wrong side: orbit round the group (wide, so it isn't pushed the wrong way) to get behind it
    const ang = Math.atan2(ry, rx);
    let diff = Math.atan2(by, bx) - ang;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const orbit = (sign: number, k: number) => {
      const a = ang + sign * Math.min(Math.abs(diff), k);
      const R = Math.max(zone, Math.min(rl, zone + 30));
      // squeeze the orbit where a wall or obstacle is in the way
      for (const r of [R, R * 0.8, R * 0.62, back]) {
        const p = { x: C.x + Math.cos(a) * r, y: C.y + Math.sin(a) * r };
        if (open(p)) return p;
      }
      return { x: C.x + Math.cos(a) * R, y: C.y + Math.sin(a) * R };
    };
    const room = (sign: number) => {
      let n = 0;
      for (let k = 1; k <= 6; k++) if (open(orbit(sign, (Math.abs(diff) * k) / 6))) n++;
      return n;
    };
    let sign = diff >= 0 ? 1 : -1;
    if (mem.orbit !== 0 && mem.orbitFocus === far.id) sign = mem.orbit;
    else if (room(-sign) > room(sign) + 1) sign = -sign;
    mem.orbit = sign;
    mem.orbitFocus = far.id;
    return { target: navigate(s, orbit(sign, 0.7)), bark: false, why: 'around' };
  }
  mem.orbit = 0;
  // bark when lined up close behind a group that is still far from the gate
  const lined = cos > 0.95 && rl < back + 22;
  const barkIt = barkReady(s) && lined && !nearGate && fd(C) > 14 && cluster.length >= 2;
  return { target: navigate(s, behind), bark: barkIt, why: 'behind' };
}

export function botTarget(s: State): Vec | null {
  return botPlan(s).target;
}

/** Runs the bot for one decision tick (every 6 steps in tests): steers and barks. */
export function botAct(s: State) {
  const p = botPlan(s);
  s.target = p.target;
  if (p.bark) bark(s);
}
