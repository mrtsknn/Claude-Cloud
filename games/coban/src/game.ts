/**
 * Çoban / Herd — pure, deterministic herding simulation (no DOM).
 * World is a fixed 360×640 meadow. The pen sits near the top with a gate in its bottom wall.
 * Everything advances in fixed steps of DT with a seeded RNG stored in the state, so the same
 * level + the same inputs always produce the same outcome.
 */
export const W = 360;
export const H = 640;
export const DT = 1 / 60;
export const LEVEL_COUNT = 120;
export const SHEEP_R = 9;
export const DOG_R = 10;
export const DOG_SPEED = 175;
export const FLEE_R = 85;
export const WOLF_R = 80;
export const CONTINUE_SECONDS = 15;

export interface Vec { x: number; y: number }
export interface Seg { a: Vec; b: Vec }
export interface Circle { x: number; y: number; r: number; kind: 'pond' | 'bush' }
export interface Pen { x: number; y: number; w: number; h: number; gx: number; gw: number }
export interface Sheep { x: number; y: number; vx: number; vy: number; heading: number; black: boolean; penned: boolean }
export interface Wolf { edge: 'left' | 'right'; phase: number; x: number; y: number; hidden: number }
export interface Level {
  level: number;
  pen: Pen;
  fences: Seg[];
  circles: Circle[];
  sheep: Vec[];
  black: number;
  wolves: number;
  dog: Vec;
  timeLimit: number;
  seed: number;
}
export interface State {
  level: number;
  pen: Pen;
  fences: Seg[];
  circles: Circle[];
  walls: Seg[]; // pen walls (block everyone)
  gateLine: Seg; // blocks the dog only
  sheep: Sheep[];
  wolves: Wolf[];
  dog: { x: number; y: number; vx: number; vy: number };
  target: Vec | null;
  time: number; // seconds elapsed
  timeLimit: number;
  rng: number;
  ticks: number;
  result: 'win' | 'lose' | null;
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
export const penCenter = (p: Pen): Vec => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
export const insidePen = (p: Pen, v: Vec, m = SHEEP_R) => v.x > p.x + m && v.x < p.x + p.w - m && v.y > p.y + m && v.y < p.y + p.h - m;

// ───────────────────────── level generator ─────────────────────────
export function levelParams(n: number) {
  return {
    sheep: Math.min(16, 3 + Math.floor((n - 1) / 6)),
    fences: Math.min(4, Math.floor(n / 9)),
    ponds: Math.min(3, Math.floor((n + 5) / 15)),
    bushes: Math.min(5, Math.floor(n / 7)),
    black: n >= 12 ? 1 + Math.floor(n / 50) : 0,
    wolves: n >= 25 ? (n >= 70 ? 2 : 1) : 0,
  };
}

/** Grid BFS from the gate entrance with obstacles inflated by the sheep radius. */
export function reachable(pen: Pen, fences: Seg[], circles: Circle[], points: Vec[]): boolean {
  const C = 8, cols = Math.ceil(W / C), rows = Math.ceil(H / C);
  const segs = [...fences, ...penWalls(pen)];
  const blocked = (x: number, y: number) => {
    if (insidePen(pen, { x, y }, 0)) return true;
    for (const c of circles) if (len(x - c.x, y - c.y) < c.r + SHEEP_R) return true;
    for (const s of segs) {
      const q = closestOnSeg({ x, y }, s);
      if (len(x - q.x, y - q.y) < SHEEP_R + 1) return true;
    }
    return false;
  };
  const cell = (v: Vec) => Math.floor(clamp(v.y, 0, H - 1) / C) * cols + Math.floor(clamp(v.x, 0, W - 1) / C);
  const seen = new Uint8Array(cols * rows);
  const start = cell({ x: pen.gx, y: pen.y + pen.h + 14 });
  const queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    const cx = i % cols, cy = (i / cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 1 || ny < 1 || nx >= cols - 1 || ny >= rows - 1) continue;
      const j = ny * cols + nx;
      if (seen[j]) continue;
      seen[j] = 1;
      if (blocked(nx * C + C / 2, ny * C + C / 2)) continue;
      seen[j] = 2;
      queue.push(j);
    }
  }
  seen[start] = 2;
  return points.every((p) => seen[cell(p)] === 2);
}

export function generateLevel(n: number): Level {
  const P = levelParams(n);
  for (let attempt = 0; ; attempt++) {
    const r = { rng: n * 7919 + attempt * 104729 + 17 };
    const rand = (a: number, b: number) => a + rngNext(r) * (b - a);
    const pw = 120, ph = 84;
    const px = rand(24, W - 24 - pw), py = rand(36, 70);
    const pen: Pen = { x: px, y: py, w: pw, h: ph, gx: px + pw / 2 + rand(-18, 18), gw: 64 };
    const dog = { x: W / 2 + rand(-60, 60), y: H - 40 };
    const keepClear = (x: number, y: number, m: number) =>
      x > pen.x - m && x < pen.x + pen.w + m && y < pen.y + pen.h + m + 40; // pen + area in front of the gate
    const circles: Circle[] = [];
    const place = (kind: Circle['kind'], rMin: number, rMax: number) => {
      for (let k = 0; k < 30; k++) {
        const c: Circle = { x: rand(30, W - 30), y: rand(200, H - 110), r: rand(rMin, rMax), kind };
        if (keepClear(c.x, c.y, c.r + 10)) continue;
        if (circles.some((o) => len(o.x - c.x, o.y - c.y) < o.r + c.r + 40)) continue;
        circles.push(c);
        return;
      }
    };
    for (let i = 0; i < P.ponds; i++) place('pond', 26, 40);
    for (let i = 0; i < P.bushes; i++) place('bush', 12, 18);
    const fences: Seg[] = [];
    for (let i = 0; i < P.fences; i++) {
      for (let k = 0; k < 30; k++) {
        const cx = rand(50, W - 50), cy = rand(200, H - 120), L = rand(60, 110), a = rngNext(r) < 0.5 ? 0 : rand(-0.6, 0.6) + Math.PI / 2;
        const s: Seg = { a: { x: cx - (Math.cos(a) * L) / 2, y: cy - (Math.sin(a) * L) / 2 }, b: { x: cx + (Math.cos(a) * L) / 2, y: cy + (Math.sin(a) * L) / 2 } };
        if (keepClear(cx, cy, L / 2 + 10)) continue;
        if (circles.some((o) => len(closestOnSeg(o, s).x - o.x, closestOnSeg(o, s).y - o.y) < o.r + 30)) continue;
        if (fences.some((f) => len(f.a.x + f.b.x - s.a.x - s.b.x, f.a.y + f.b.y - s.a.y - s.b.y) / 2 < 90)) continue;
        fences.push(s);
        break;
      }
    }
    const blockedAt = (x: number, y: number, m: number) =>
      circles.some((o) => len(o.x - x, o.y - y) < o.r + m) ||
      fences.some((f) => { const q = closestOnSeg({ x, y }, f); return len(q.x - x, q.y - y) < m; });
    const sheep: Vec[] = [];
    const groups = 1 + Math.floor(P.sheep / 6);
    const centers = Array.from({ length: groups }, () => ({ x: rand(60, W - 60), y: rand(250, H - 130) }));
    for (let i = 0, k = 0; i < P.sheep && k < 2000; k++) {
      const c = centers[i % groups];
      const x = clamp(c.x + rand(-55, 55), 20, W - 20), y = clamp(c.y + rand(-55, 55), 200, H - 30);
      if (blockedAt(x, y, SHEEP_R + 8) || insidePen(pen, { x, y }, -20)) continue;
      if (len(x - dog.x, y - dog.y) < FLEE_R + 15) continue;
      if (sheep.some((o) => len(o.x - x, o.y - y) < SHEEP_R * 2 + 6)) continue;
      sheep.push({ x, y });
      i++;
    }
    if (sheep.length < P.sheep) continue;
    if (!reachable(pen, fences, circles, [...sheep, dog])) continue;
    const timeLimit = Math.round(30 + P.sheep * 6.5 + P.fences * 3 + P.ponds * 3 + P.black * 8 + P.wolves * 8);
    return { level: n, pen, fences, circles, sheep, black: P.black, wolves: P.wolves, dog, timeLimit, seed: n * 31337 + attempt };
  }
}

export function createState(L: Level): State {
  const pen = L.pen;
  return {
    level: L.level,
    pen,
    fences: L.fences,
    circles: L.circles,
    walls: penWalls(pen),
    gateLine: { a: { x: pen.gx - pen.gw / 2, y: pen.y + pen.h }, b: { x: pen.gx + pen.gw / 2, y: pen.y + pen.h } },
    sheep: L.sheep.map((p, i) => ({ x: p.x, y: p.y, vx: 0, vy: 0, heading: (i * 2.399) % (Math.PI * 2), black: i < L.black, penned: false })),
    wolves: Array.from({ length: L.wolves }, (_, i) => ({ edge: i % 2 ? 'right' : 'left', phase: i * 2.1, x: 0, y: 0, hidden: 0 }) as Wolf),
    dog: { x: L.dog.x, y: L.dog.y, vx: 0, vy: 0 },
    target: null,
    time: 0,
    timeLimit: L.timeLimit,
    rng: L.seed,
    ticks: 0,
    result: null,
  };
}

export const pennedCount = (s: State) => s.sheep.reduce((n, sh) => n + (sh.penned ? 1 : 0), 0);
export const timeLeft = (s: State) => Math.max(0, s.timeLimit - s.time);

export function starsFor(s: State): number {
  const f = timeLeft(s) / s.timeLimit;
  return f >= 0.45 ? 3 : f >= 0.2 ? 2 : 1;
}

// ───────────────────────── collisions ─────────────────────────
function collide(o: { x: number; y: number; vx: number; vy: number }, r: number, s: State, dog: boolean) {
  for (const c of s.circles) {
    const dx = o.x - c.x, dy = o.y - c.y, d = len(dx, dy) || 1e-6;
    if (d < c.r + r) {
      o.x = c.x + (dx / d) * (c.r + r);
      o.y = c.y + (dy / d) * (c.r + r);
    }
  }
  const segs = dog ? [...s.fences, ...s.walls, s.gateLine] : [...s.fences, ...s.walls];
  for (const g of segs) {
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
  o.x = clamp(o.x, r, W - r);
  o.y = clamp(o.y, r, H - r);
}

// ───────────────────────── step ─────────────────────────
/** Advances the simulation by one fixed step. Returns the number of sheep penned this step. */
export function step(s: State): number {
  if (s.result) return 0;
  s.ticks++;
  s.time = s.ticks * DT;
  const d = s.dog;

  // dog runs toward the finger
  if (s.target) {
    const dx = s.target.x - d.x, dy = s.target.y - d.y, l = len(dx, dy);
    const sp = Math.min(DOG_SPEED, l * 6);
    d.vx = l > 0.5 ? (dx / l) * sp : 0;
    d.vy = l > 0.5 ? (dy / l) * sp : 0;
  } else { d.vx *= 0.8; d.vy *= 0.8; }
  d.x += d.vx * DT;
  d.y += d.vy * DT;
  collide(d, DOG_R, s, true);

  // wolves patrol the side edges; the dog chases them off for a while
  for (const w of s.wolves) {
    if (w.hidden > 0) { w.hidden -= DT; continue; }
    w.x = w.edge === 'left' ? 14 : W - 14;
    w.y = H * 0.55 + Math.sin(s.time * 0.35 + w.phase) * H * 0.3;
    if (len(w.x - d.x, w.y - d.y) < 70) w.hidden = 5;
  }

  let newly = 0;
  const pc = penCenter(s.pen);
  for (const sh of s.sheep) {
    let ax = 0, ay = 0, fear = 0;
    const max = sh.black ? 62 : 112;
    if (sh.penned) {
      const dx = pc.x - sh.x, dy = pc.y - sh.y, l = len(dx, dy);
      if (l > 16) { ax += (dx / l) * 18; ay += (dy / l) * 18; }
    } else {
      const flee = (fx: number, fy: number, R: number) => {
        const dx = sh.x - fx, dy = sh.y - fy, l = len(dx, dy) || 1e-6;
        if (l >= R) return;
        const k = Math.sqrt(1 - l / R);
        ax += (dx / l) * max * k * 1.4;
        ay += (dy / l) * max * k * 1.4;
        fear = Math.max(fear, k);
      };
      flee(d.x, d.y, FLEE_R);
      for (const w of s.wolves) if (w.hidden <= 0) flee(w.x, w.y, WOLF_R);
      // cohesion with nearby free sheep
      let cx = 0, cy = 0, cn = 0;
      for (const o of s.sheep) {
        if (o === sh || o.penned) continue;
        const l = len(o.x - sh.x, o.y - sh.y);
        if (l < 70) { cx += o.x; cy += o.y; cn++; }
      }
      if (cn) {
        const dx = cx / cn - sh.x, dy = cy / cn - sh.y, l = len(dx, dy);
        if (l > 18) { ax += (dx / l) * 14; ay += (dy / l) * 14; }
      }
      // wander (grazing) when calm
      sh.heading += (rngNext(s) - 0.5) * 0.5;
      const calm = 1 - fear;
      ax += Math.cos(sh.heading) * 9 * calm;
      ay += Math.sin(sh.heading) * 9 * calm;
      // shy away from ponds and the field edge
      for (const c of s.circles) {
        if (c.kind !== 'pond') continue;
        const dx = sh.x - c.x, dy = sh.y - c.y, l = len(dx, dy) || 1e-6, gap = l - c.r - SHEEP_R;
        if (gap < 22) { ax += (dx / l) * (22 - gap) * 2.5; ay += (dy / l) * (22 - gap) * 2.5; }
      }
      if (sh.x < 24) ax += (24 - sh.x) * 2;
      if (sh.x > W - 24) ax -= (sh.x - W + 24) * 2;
      if (sh.y > H - 24) ay -= (sh.y - H + 24) * 2;
      if (sh.y < 24) ay += (24 - sh.y) * 2;
    }
    // separation
    for (const o of s.sheep) {
      if (o === sh) continue;
      const dx = sh.x - o.x, dy = sh.y - o.y, l = len(dx, dy);
      if (l < SHEEP_R * 2.4 && l > 0) { const k = (SHEEP_R * 2.4 - l) / (SHEEP_R * 2.4); ax += (dx / l) * 60 * k; ay += (dy / l) * 60 * k; }
    }
    const lerp = fear > 0 ? 0.2 : 0.08;
    sh.vx += (ax - sh.vx) * lerp;
    sh.vy += (ay - sh.vy) * lerp;
    const v = len(sh.vx, sh.vy);
    if (v > max) { sh.vx *= max / v; sh.vy *= max / v; }
    sh.x += sh.vx * DT;
    sh.y += sh.vy * DT;
    // dog body pushes sheep
    const ddx = sh.x - d.x, ddy = sh.y - d.y, dl = len(ddx, ddy);
    if (dl < SHEEP_R + DOG_R && dl > 0) { sh.x = d.x + (ddx / dl) * (SHEEP_R + DOG_R); sh.y = d.y + (ddy / dl) * (SHEEP_R + DOG_R); }
    collide(sh, SHEEP_R, s, false);
    if (!sh.penned && insidePen(s.pen, sh)) { sh.penned = true; newly++; }
    if (Math.abs(sh.vx) + Math.abs(sh.vy) > 3) sh.heading = sh.penned || fear > 0 ? Math.atan2(sh.vy, sh.vx) : sh.heading;
  }
  // hard sheep–sheep overlap resolution
  for (let i = 0; i < s.sheep.length; i++)
    for (let j = i + 1; j < s.sheep.length; j++) {
      const a = s.sheep[i], b = s.sheep[j];
      const dx = b.x - a.x, dy = b.y - a.y, l = len(dx, dy);
      if (l < SHEEP_R * 2 && l > 0) {
        const push = (SHEEP_R * 2 - l) / 2;
        a.x -= (dx / l) * push; a.y -= (dy / l) * push;
        b.x += (dx / l) * push; b.y += (dy / l) * push;
      }
    }

  if (pennedCount(s) === s.sheep.length) s.result = 'win';
  else if (s.time >= s.timeLimit) s.result = 'lose';
  return newly;
}

/** Extra time after a "continue". */
export function addTime(s: State, sec = CONTINUE_SECONDS) {
  s.timeLimit = s.time + sec;
  s.result = null;
}

// ───────────────────────── bot (tests + demo) ─────────────────────────
/** A simple shepherd: picks the free sheep farthest from the gate and pushes it toward it. */
export function botTarget(s: State): Vec | null {
  const free = s.sheep.filter((x) => !x.penned);
  if (!free.length) return null;
  const pen = s.pen;
  const gateY = pen.y + pen.h;
  const stage = { x: pen.gx, y: gateY + 46 };
  const dist = (p: Vec) => len(p.x - stage.x, p.y - stage.y);
  const sh = free.reduce((a, b) => (dist(b) > dist(a) ? b : a));
  const lined = Math.abs(sh.x - pen.gx) < pen.gw * 0.3 && sh.y > gateY && sh.y < gateY + 70;
  const aim = lined ? { x: pen.gx, y: pen.y } : stage;
  let ux = sh.x - aim.x, uy = sh.y - aim.y;
  const ul = len(ux, uy) || 1;
  ux /= ul; uy /= ul;
  const behind = { x: sh.x + ux * 34, y: sh.y + uy * 34 };
  const d = s.dog;
  // dog in front of the sheep: walk around it instead of pushing it the wrong way
  const fx = d.x - sh.x, fy = d.y - sh.y;
  if (fx * -ux + fy * -uy > 0 && len(fx, fy) < 90) {
    const side = fx * -uy + fy * ux > 0 ? 1 : -1;
    return { x: clamp(sh.x - uy * side * 70 + ux * 20, 12, W - 12), y: clamp(sh.y + ux * side * 70 + uy * 20, 12, H - 12) };
  }
  return { x: clamp(behind.x, 12, W - 12), y: clamp(behind.y, 12, H - 12) };
}
