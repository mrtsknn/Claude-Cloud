/**
 * Makas — pure simulation and level generator (no DOM).
 * A rail network is a directed graph laid out in grid units: tunnels at the top, switches
 * (two outgoing branches, flipped by the player), merges and coloured stations at the bottom.
 * Trains run along edges at a constant speed; at a switch they take the branch it points to.
 */

export type Kind = 'tunnel' | 'switch' | 'merge' | 'station';
export interface GNode { kind: Kind; x: number; y: number; out: number[]; color: number }
export interface Edge { from: number; to: number; len: number }
export interface Net { nodes: GNode[]; edges: Edge[]; w: number; h: number }
export interface TrainSpec { t: number; tunnel: number; color: number; speed: number; target: number }
export interface Level {
  n: number;
  colors: number;
  goal: number;
  net: Net;
  trains: TrainSpec[];
  switches: number[];
  /** Initial switch states, indexed by node id. */
  start: number[];
}

export const LEVEL_COUNT = 150;
export const HEARTS = 3;
export const CRASH_DIST = 0.45;

// ───────────────────────── rng ─────────────────────────
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

// ───────────────────────── geometry ─────────────────────────
const SAMPLES = 24;
interface Sample { x: number; y: number; s: number }
const sampleCache = new WeakMap<Edge, Sample[]>();

function bezier(a: GNode, b: GNode, t: number) {
  const k = (b.y - a.y) * 0.5;
  const u = 1 - t;
  const p1y = a.y + k;
  const p2y = b.y - k;
  return {
    x: u * u * u * a.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * b.y,
  };
}

function samplesFor(net: Net, e: Edge): Sample[] {
  let s = sampleCache.get(e);
  if (s) return s;
  const a = net.nodes[e.from];
  const b = net.nodes[e.to];
  s = [];
  let acc = 0;
  let prev = bezier(a, b, 0);
  for (let i = 0; i <= SAMPLES; i++) {
    const p = bezier(a, b, i / SAMPLES);
    acc += Math.hypot(p.x - prev.x, p.y - prev.y);
    s.push({ x: p.x, y: p.y, s: acc });
    prev = p;
  }
  sampleCache.set(e, s);
  return s;
}

/** Point and heading at distance d along edge ei (clamped). */
export function pointOnEdge(net: Net, ei: number, d: number) {
  const s = samplesFor(net, net.edges[ei]);
  const total = s[s.length - 1].s;
  const dd = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < s.length - 1 && s[i].s < dd) i++;
  const a = s[i - 1];
  const b = s[i];
  const k = b.s > a.s ? (dd - a.s) / (b.s - a.s) : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, a: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** Polyline of an edge (for drawing). */
export function edgePath(net: Net, ei: number) {
  return samplesFor(net, net.edges[ei]);
}

function addEdge(net: Net, from: number, to: number) {
  const e: Edge = { from, to, len: 0 };
  e.len = samplesFor(net, e)[SAMPLES].s;
  net.edges.push(e);
  net.nodes[from].out.push(net.edges.length - 1);
}

/** Station node ids reachable from a node. */
export function reachable(net: Net, from: number): number[] {
  const seen = new Set<number>();
  const res: number[] = [];
  const stack = [from];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    if (net.nodes[n].kind === 'station') res.push(n);
    for (const ei of net.nodes[n].out) stack.push(net.edges[ei].to);
  }
  return res.sort((a, b) => a - b);
}

// ───────────────────────── simulation ─────────────────────────
export interface Train { id: number; idx: number; color: number; speed: number; edge: number; d: number; target: number }
export type EvKind = 'spawn' | 'deliver' | 'wrong' | 'crash' | 'win' | 'lose';
export interface Ev { kind: EvKind; x: number; y: number; color: number }

export interface Sim {
  lv: Level;
  time: number;
  next: number;
  trains: Train[];
  sw: number[];
  hearts: number;
  delivered: number;
  lost: number;
  status: 'play' | 'win' | 'lose';
  /** Oracle mode: switches set themselves for each train's target (used to validate levels). */
  auto: boolean;
  gap: number;
  /** In oracle mode: index of the first train that could not be routed cleanly, else -1. */
  conflict: number;
  lastPass: { t: number; state: number }[];
}

export function createSim(lv: Level, opts: { auto?: boolean; hearts?: number; gap?: number } = {}): Sim {
  return {
    lv,
    time: 0,
    next: 0,
    trains: [],
    sw: lv.start.slice(),
    hearts: opts.hearts ?? HEARTS,
    delivered: 0,
    lost: 0,
    status: 'play',
    auto: !!opts.auto,
    gap: opts.gap ?? 0,
    conflict: -1,
    lastPass: lv.net.nodes.map(() => ({ t: -1e9, state: -1 })),
  };
}

export function flip(sim: Sim, node: number): boolean {
  if (sim.lv.net.nodes[node]?.kind !== 'switch' || sim.status !== 'play') return false;
  sim.sw[node] = 1 - sim.sw[node];
  return true;
}

/** Where a train is in grid units. */
export const trainPos = (sim: Sim, tr: Train) => pointOnEdge(sim.lv.net, tr.edge, tr.d);

/** The switch states that send a train from `node` to `target`: [switch, state][] in order. */
export function route(net: Net, from: number, target: number): [number, number][] | null {
  if (from === target) return [];
  const n = net.nodes[from];
  for (let i = 0; i < n.out.length; i++) {
    const r = route(net, net.edges[n.out[i]].to, target);
    if (r) return n.kind === 'switch' ? [[from, i], ...r] : r;
  }
  return null;
}

let trainIds = 1;

export function step(sim: Sim, dt: number): Ev[] {
  const ev: Ev[] = [];
  if (sim.status !== 'play') return ev;
  const { net, trains } = sim.lv;
  sim.time += dt;
  while (sim.next < trains.length && trains[sim.next].t <= sim.time) {
    const spec = trains[sim.next];
    const tunnel = net.nodes[spec.tunnel];
    sim.trains.push({ id: trainIds++, idx: sim.next, color: spec.color, speed: spec.speed, edge: tunnel.out[0], d: (sim.time - spec.t) * spec.speed, target: spec.target });
    ev.push({ kind: 'spawn', x: tunnel.x, y: tunnel.y, color: spec.color });
    sim.next++;
  }
  const loseHeart = () => {
    sim.hearts = Math.max(0, sim.hearts - 1);
  };
  for (const tr of sim.trains.slice()) {
    tr.d += tr.speed * dt;
    let e = net.edges[tr.edge];
    while (tr.d >= e.len) {
      tr.d -= e.len;
      const node = net.nodes[e.to];
      if (node.kind === 'station') {
        sim.trains.splice(sim.trains.indexOf(tr), 1);
        if (node.color === tr.color) {
          sim.delivered++;
          ev.push({ kind: 'deliver', x: node.x, y: node.y, color: tr.color });
        } else {
          sim.lost++;
          loseHeart();
          ev.push({ kind: 'wrong', x: node.x, y: node.y, color: tr.color });
          if (sim.auto && sim.conflict < 0) sim.conflict = tr.idx;
        }
        break;
      }
      if (node.kind === 'switch') {
        if (sim.auto) {
          const r = route(net, e.to, tr.target);
          const want = r && r.length ? r[0][1] : sim.sw[e.to];
          const last = sim.lastPass[e.to];
          if (last.state >= 0 && last.state !== want && sim.time - last.t < sim.gap && sim.conflict < 0) sim.conflict = tr.idx;
          sim.sw[e.to] = want;
        }
        sim.lastPass[e.to] = { t: sim.time, state: sim.sw[e.to] };
        tr.edge = node.out[sim.sw[e.to]];
      } else tr.edge = node.out[0];
      e = net.edges[tr.edge];
    }
  }
  // collisions: any two trains closer than CRASH_DIST
  const pos = sim.trains.map((tr) => trainPos(sim, tr));
  const dead = new Set<number>();
  for (let i = 0; i < sim.trains.length; i++) {
    for (let j = i + 1; j < sim.trains.length; j++) {
      if (dead.has(i) || dead.has(j)) continue;
      if (Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y) < CRASH_DIST) {
        dead.add(i).add(j);
        sim.lost += 2;
        loseHeart();
        ev.push({ kind: 'crash', x: (pos[i].x + pos[j].x) / 2, y: (pos[i].y + pos[j].y) / 2, color: sim.trains[i].color });
        if (sim.auto && sim.conflict < 0) sim.conflict = Math.max(sim.trains[i].idx, sim.trains[j].idx);
      }
    }
  }
  if (dead.size) sim.trains = sim.trains.filter((_, i) => !dead.has(i));

  if (sim.delivered >= sim.lv.goal) {
    sim.status = 'win';
    ev.push({ kind: 'win', x: 0, y: 0, color: 0 });
  } else if (sim.hearts <= 0 || (sim.next >= trains.length && sim.trains.length === 0)) {
    sim.status = 'lose';
    ev.push({ kind: 'lose', x: 0, y: 0, color: 0 });
  }
  return ev;
}

/** Continue after losing: one heart back, the track is cleared, the schedule goes on. */
export function continueSim(sim: Sim) {
  sim.hearts = 1;
  sim.trains = [];
  sim.status = 'play';
  if (sim.next < sim.lv.trains.length) {
    // the next train appears shortly instead of after a long gap
    const shift = Math.max(0, sim.lv.trains[sim.next].t - sim.time - 1.5);
    for (let i = sim.next; i < sim.lv.trains.length; i++) sim.lv.trains[i].t -= shift;
  }
}

export const starsFor = (hearts: number, continued: boolean) => (continued ? 1 : Math.max(1, Math.min(3, hearts)));

// ───────────────────────── generator ─────────────────────────
export function params(n: number) {
  const stations = Math.min(7, 2 + Math.floor((n + 2) / 8));
  const colors = Math.min(6, stations, 2 + Math.floor(n / 14));
  return {
    stations,
    colors,
    twoTunnels: n >= 25 && (n >= 60 || n % 3 !== 0),
    speed: 1 + Math.min(1, (n - 1) * 0.008),
    interval: Math.max(1.6, 4.4 - n * 0.02),
    goal: Math.min(25, 5 + Math.floor(n / 7)),
    varied: n >= 45,
    gap: Math.max(0.75, 1.3 - n * 0.004),
  };
}

type Tree = { leaf: true; x: number; d: number } | { leaf: false; l: Tree; r: Tree; x: number; d: number };

function buildTree(n: number, r: () => number, d: number, counter: { x: number }): Tree {
  if (n === 1) return { leaf: true, x: counter.x++, d };
  const lo = Math.max(1, Math.floor(n / 2) - (n >= 4 ? 1 : 0));
  const hi = Math.min(n - 1, Math.ceil(n / 2) + (n >= 4 ? 1 : 0));
  const left = lo + Math.floor(r() * (hi - lo + 1));
  const l = buildTree(left, r, d + 1, counter);
  const rt = buildTree(n - left, r, d + 1, counter);
  return { leaf: false, l, r: rt, x: (l.x + rt.x) / 2, d };
}
const depthOf = (t: Tree): number => (t.leaf ? t.d : Math.max(depthOf(t.l), depthOf(t.r)));
const leaves = (t: Tree): number => (t.leaf ? 1 : leaves(t.l) + leaves(t.r));

const Y0 = 1.2;
const ROW = 1.4;

export function generateLevel(n: number): Level {
  const p = params(n);
  const r = rng(n * 7919 + 13);
  const tree = buildTree(p.stations, r, 0, { x: 0 });
  const maxD = depthOf(tree);
  const shift = p.twoTunnels ? 1.1 : 0;
  const yOf = (t: Tree) => (t.leaf ? Y0 + shift + (maxD - 1) * ROW + ROW + 0.2 : Y0 + (t.d > 0 ? shift : 0) + t.d * ROW);
  const net: Net = { nodes: [], edges: [], w: p.stations - 1, h: 0 };
  const add = (kind: Kind, x: number, y: number, color = -1) => net.nodes.push({ kind, x, y, out: [], color }) - 1;

  const tunnelA = add('tunnel', tree.x, 0);
  // station colours: every colour at least once, extra stations repeat colours
  const stationColors: number[] = [];
  for (let i = 0; i < p.stations; i++) stationColors.push(i < p.colors ? i : Math.floor(r() * p.colors));
  for (let i = stationColors.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [stationColors[i], stationColors[j]] = [stationColors[j], stationColors[i]];
  }
  const nodeOf = new Map<Tree, number>();
  const place = (t: Tree): number => {
    if (t.leaf) {
      const id = add('station', t.x, yOf(t), stationColors[t.x]);
      nodeOf.set(t, id);
      return id;
    }
    const id = add('switch', t.x, yOf(t));
    nodeOf.set(t, id);
    place(t.l);
    place(t.r);
    return id;
  };
  const root = place(tree);
  addEdge(net, tunnelA, root);
  let tunnelB = -1;
  let side: Tree | null = null;
  if (p.twoTunnels && !tree.leaf) {
    const right = leaves(tree.r) >= leaves(tree.l) ? r() < 0.7 : r() < 0.3;
    side = right ? tree.r : tree.l;
    const c = net.nodes[nodeOf.get(side)!];
    const m = add('merge', c.x, Y0 + 1.15);
    const bx = Math.max(-0.5, Math.min(net.w + 0.5, c.x + (right ? 0.9 : -0.9)));
    tunnelB = add('tunnel', bx, 0);
    addEdge(net, tunnelB, m);
    // root → merge → side child; the other child straight from root
    const link = (t: Tree, parent: number) => {
      if (t.leaf) return;
      for (const ch of [t.l, t.r]) {
        if (t === tree && ch === side) {
          addEdge(net, parent, m);
          addEdge(net, m, nodeOf.get(ch)!);
        } else addEdge(net, parent, nodeOf.get(ch)!);
        link(ch, nodeOf.get(ch)!);
      }
    };
    link(tree, root);
  } else {
    const link = (t: Tree) => {
      if (t.leaf) return;
      for (const ch of [t.l, t.r]) {
        addEdge(net, nodeOf.get(t)!, nodeOf.get(ch)!);
        link(ch);
      }
    };
    link(tree);
  }
  net.h = Math.max(...net.nodes.map((nd) => nd.y));

  const switches = net.nodes.flatMap((nd, i) => (nd.kind === 'switch' ? [i] : []));
  const start = net.nodes.map(() => 0);
  for (const s of switches) start[s] = r() < 0.5 ? 0 : 1;

  // schedule
  const reachA = reachable(net, tunnelA);
  const reachB = tunnelB >= 0 ? reachable(net, tunnelB) : [];
  const count = p.goal + 12;
  const trains: TrainSpec[] = [];
  let t = 1.4;
  for (let i = 0; i < count; i++) {
    const fromB = tunnelB >= 0 && r() < 0.45;
    const pool = fromB ? reachB : reachA;
    const target = pool[Math.floor(r() * pool.length)];
    const speed = p.speed * (p.varied ? [0.8, 1, 1, 1.2][Math.floor(r() * 4)] : 1);
    trains.push({ t: +t.toFixed(3), tunnel: fromB ? tunnelB : tunnelA, color: net.nodes[target].color, speed, target });
    t += p.interval * (0.8 + r() * 0.4) * (tunnelB >= 0 ? 0.8 : 1);
  }
  const lv: Level = { n, colors: p.colors, goal: p.goal, net, trains, switches, start };
  // Validate with an oracle that routes every train perfectly: no crash, no wrong station,
  // and enough time between two trains that need a switch in different positions.
  for (let iter = 0; iter < 400; iter++) {
    const bad = oracle(lv, p.gap);
    if (bad < 0) break;
    for (let j = bad; j < trains.length; j++) trains[j].t = +(trains[j].t + 0.4).toFixed(3);
  }
  return lv;
}

/** Runs the level with perfect routing; returns the first train index that conflicts, or -1. */
export function oracle(lv: Level, gap = params(lv.n).gap): number {
  const sim = createSim(lv, { auto: true, hearts: 999, gap });
  const goal = lv.goal;
  lv.goal = Infinity;
  try {
    while (sim.next < lv.trains.length || sim.trains.length) {
      step(sim, 1 / 30);
      if (sim.conflict >= 0) return sim.conflict;
      if (sim.time > 3600) return lv.trains.length - 1;
    }
    return -1;
  } finally {
    lv.goal = goal;
  }
}
