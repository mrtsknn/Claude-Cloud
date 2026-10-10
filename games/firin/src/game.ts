/**
 * Fırın — pure bakery simulation. No DOM, no timers: the UI calls `step(state, dt)` every frame
 * and the tap actions below. Customer arrivals and orders come from a seeded RNG consumed in a
 * fixed order, so every player (and the test bot) meets the same customers on a given level.
 */

export const ITEMS = ['bread', 'ring', 'croissant', 'cake', 'cookie'] as const;
export type Item = (typeof ITEMS)[number];

/** Seconds in the oven until golden. */
export const BAKE: Record<Item, number> = { bread: 3.5, ring: 4, croissant: 4.5, cake: 5.5, cookie: 3 };
/** Coins paid per item. */
export const PRICE: Record<Item, number> = { bread: 5, ring: 6, croissant: 8, cake: 12, cookie: 4 };
/** Order in which items unlock over the levels. */
const UNLOCK: Item[] = ['bread', 'ring', 'cookie', 'croissant', 'cake'];

export const LEVELS = 120;
export const LEVEL_TIME = 90;
export const CONTINUE_TIME = 20;
export const TRAY_SIZE = 3;

export interface LevelConfig {
  level: number;
  items: Item[];
  ovens: number;
  seats: number;
  maxOrder: number;
  patience: number; // seconds
  spawnGap: number; // seconds between arrivals
  burnAfter: number; // seconds an item stays golden before it burns
  target: number; // coins for 1 star
  stars: [number, number, number];
}

export function levelConfig(level: number): LevelConfig {
  const n = Math.max(1, Math.min(LEVELS, Math.floor(level)));
  const k = (n - 1) / (LEVELS - 1); // 0..1
  const items = UNLOCK.slice(0, Math.min(5, 2 + Math.floor((n - 1) / 6)));
  const ovens = n < 8 ? 3 : 4;
  const seats = n < 4 ? 2 : n < 25 ? 3 : 4;
  const maxOrder = n < 3 ? 1 : n < 12 ? 2 : 3;
  const patience = 30 - 12 * k;
  const spawnGap = 6 - 2.6 * k;
  const burnAfter = 6 - 3.5 * k;
  const target = Math.round((110 + n * 1.1) / 5) * 5;
  return {
    level: n,
    items,
    ovens,
    seats,
    maxOrder,
    patience,
    spawnGap,
    burnAfter,
    target,
    stars: [target, Math.round((target * 1.3) / 5) * 5, Math.round((target * 1.6) / 5) * 5],
  };
}

export function starsFor(cfg: LevelConfig, coins: number): number {
  return cfg.stars.filter((s) => coins >= s).length;
}

/** mulberry32 */
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

export interface Oven {
  item: Item | null;
  t: number; // seconds since the item went in
}
export type OvenPhase = 'empty' | 'baking' | 'ready' | 'burnt';

export interface Customer {
  id: number;
  look: number; // 0..5 colour index for drawing
  order: Item[];
  got: boolean[];
  patience: number;
  max: number;
}

export interface GameEvent {
  type: 'arrive' | 'bake' | 'ready' | 'burn' | 'pick' | 'trash' | 'fill' | 'serve' | 'leave' | 'reject';
  seat?: number;
  oven?: number;
  coins?: number;
  tip?: number;
  combo?: number;
}

export interface State {
  cfg: LevelConfig;
  time: number; // seconds left
  elapsed: number;
  ovens: Oven[];
  tray: Item[];
  seats: (Customer | null)[];
  nextArrival: number; // elapsed time of next arrival
  queue: Customer | null; // next customer, already rolled
  coins: number;
  served: number;
  lost: number;
  combo: number;
  bestCombo: number;
  nextId: number;
  rand: () => number;
  events: GameEvent[];
}

function rollCustomer(s: State): Customer {
  const r = s.rand;
  const size = 1 + Math.floor(r() * s.cfg.maxOrder);
  const order: Item[] = [];
  for (let i = 0; i < size; i++) order.push(s.cfg.items[Math.floor(r() * s.cfg.items.length)]);
  order.sort((a, b) => ITEMS.indexOf(a) - ITEMS.indexOf(b));
  const max = s.cfg.patience + order.length * 4;
  return { id: s.nextId++, look: Math.floor(r() * 6), order, got: order.map(() => false), patience: max, max };
}

export function newGame(level: number, seed = level * 7919): State {
  const cfg = levelConfig(level);
  const s: State = {
    cfg,
    time: LEVEL_TIME,
    elapsed: 0,
    ovens: Array.from({ length: cfg.ovens }, () => ({ item: null, t: 0 })),
    tray: [],
    seats: Array(cfg.seats).fill(null),
    nextArrival: 0.6,
    queue: null,
    coins: 0,
    served: 0,
    lost: 0,
    combo: 0,
    bestCombo: 0,
    nextId: 1,
    rand: rng(seed),
    events: [],
  };
  s.queue = rollCustomer(s);
  return s;
}

export function ovenPhase(s: State, o: Oven): OvenPhase {
  if (!o.item) return 'empty';
  const bake = BAKE[o.item];
  if (o.t < bake) return 'baking';
  return o.t < bake + s.cfg.burnAfter ? 'ready' : 'burnt';
}

export const isOver = (s: State) => s.time <= 0;

/** Advance the simulation; events from this step are appended to `s.events`. */
export function step(s: State, dt: number): void {
  if (isOver(s)) return;
  dt = Math.min(dt, s.time);
  s.time -= dt;
  s.elapsed += dt;
  s.ovens.forEach((o, i) => {
    if (!o.item) return;
    const before = ovenPhase(s, o);
    o.t += dt;
    const after = ovenPhase(s, o);
    if (before !== after) s.events.push({ type: after === 'ready' ? 'ready' : 'burn', oven: i });
  });
  s.seats.forEach((c, i) => {
    if (!c) return;
    c.patience -= dt;
    if (c.patience <= 0) {
      s.seats[i] = null;
      s.lost++;
      s.combo = 0;
      s.events.push({ type: 'leave', seat: i });
    }
  });
  if (s.elapsed >= s.nextArrival) {
    const free = s.seats.indexOf(null);
    if (free >= 0 && s.queue) {
      s.seats[free] = s.queue;
      s.events.push({ type: 'arrive', seat: free });
      s.queue = rollCustomer(s);
      s.nextArrival = s.elapsed + s.cfg.spawnGap * (0.75 + s.rand() * 0.5);
    }
  }
}

/** Put a dough item into the first free oven. */
export function bake(s: State, item: Item): number {
  if (isOver(s) || !s.cfg.items.includes(item)) return -1;
  const i = s.ovens.findIndex((o) => !o.item);
  if (i < 0) return -1;
  s.ovens[i] = { item, t: 0 };
  s.events.push({ type: 'bake', oven: i });
  return i;
}

/** Tap an oven: golden item → tray, burnt item → bin. */
export function tapOven(s: State, i: number): boolean {
  const o = s.ovens[i];
  if (!o || isOver(s)) return false;
  const ph = ovenPhase(s, o);
  if (ph === 'ready') {
    if (s.tray.length >= TRAY_SIZE) {
      s.events.push({ type: 'reject', oven: i });
      return false;
    }
    s.tray.push(o.item!);
    s.ovens[i] = { item: null, t: 0 };
    s.events.push({ type: 'pick', oven: i });
    return true;
  }
  if (ph === 'burnt') {
    s.ovens[i] = { item: null, t: 0 };
    s.events.push({ type: 'trash', oven: i });
    return true;
  }
  return false;
}

/** Throw away a tray item. */
export function trashTray(s: State, i: number): boolean {
  if (i < 0 || i >= s.tray.length) return false;
  s.tray.splice(i, 1);
  s.events.push({ type: 'trash' });
  return true;
}

/** How many of the tray's items this customer still wants. */
export function matches(c: Customer, tray: Item[]): number {
  const need = c.order.filter((_, i) => !c.got[i]);
  let n = 0;
  for (const it of tray) {
    const k = need.indexOf(it);
    if (k >= 0) {
      need.splice(k, 1);
      n++;
    }
  }
  return n;
}

/** Tap a customer: hand over every tray item they still need; pay when the order is complete. */
export function serve(s: State, seat: number): boolean {
  const c = s.seats[seat];
  if (!c || isOver(s)) return false;
  let moved = 0;
  for (let i = 0; i < c.order.length; i++) {
    if (c.got[i]) continue;
    const k = s.tray.indexOf(c.order[i]);
    if (k < 0) continue;
    s.tray.splice(k, 1);
    c.got[i] = true;
    moved++;
  }
  if (!moved) {
    s.events.push({ type: 'reject', seat });
    return false;
  }
  if (c.got.every(Boolean)) {
    const base = c.order.reduce((a, it) => a + PRICE[it], 0);
    const frac = c.patience / c.max;
    s.combo++;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    const tip = Math.round(base * (frac > 0.66 ? 0.5 : frac > 0.33 ? 0.25 : 0)) + Math.min(s.combo - 1, 5);
    s.coins += base + tip;
    s.served++;
    s.seats[seat] = null;
    s.events.push({ type: 'serve', seat, coins: base + tip, tip, combo: s.combo });
    // A freed seat fills sooner so the counter never sits empty for long.
    s.nextArrival = Math.min(s.nextArrival, s.elapsed + 1);
  } else s.events.push({ type: 'fill', seat });
  return true;
}

/** Extra time after a lost round (continue). */
export function addTime(s: State, sec = CONTINUE_TIME) {
  s.time += sec;
}

// ───────────────────────── greedy bot ─────────────────────────
export type Action = { kind: 'bake'; item: Item } | { kind: 'oven'; i: number } | { kind: 'serve'; seat: number } | { kind: 'trash'; i: number };

/** A simple greedy player: collect golden/burnt items, serve, then bake what is missing. */
export function botAction(s: State): Action | null {
  const ph = s.ovens.map((o) => ovenPhase(s, o));
  const burnt = ph.indexOf('burnt');
  if (burnt >= 0) return { kind: 'oven', i: burnt };
  // Serve the most impatient customer we can help.
  let best = -1;
  s.seats.forEach((c, i) => {
    if (c && matches(c, s.tray) > 0 && (best < 0 || c.patience < s.seats[best]!.patience)) best = i;
  });
  if (best >= 0) return { kind: 'serve', seat: best };
  // Demand still uncovered by tray + ovens.
  const need: Item[] = [];
  s.seats.forEach((c) => c && c.order.forEach((it, i) => !c.got[i] && need.push(it)));
  const supply = [...s.tray, ...s.ovens.filter((o) => o.item).map((o) => o.item!)];
  const ready = ph.indexOf('ready');
  if (ready >= 0 && s.tray.length < TRAY_SIZE) return { kind: 'oven', i: ready };
  if (s.tray.length >= TRAY_SIZE || (ready >= 0 && s.tray.length > 0)) {
    // Tray clogged with things nobody wants: bin one.
    const pool = [...need];
    const useless = s.tray.findIndex((it) => {
      const k = pool.indexOf(it);
      if (k >= 0) pool.splice(k, 1);
      return k < 0;
    });
    if (useless >= 0) return { kind: 'trash', i: useless };
  }
  for (const it of supply) {
    const k = need.indexOf(it);
    if (k >= 0) need.splice(k, 1);
  }
  if (need.length && s.ovens.some((o) => !o.item)) return { kind: 'bake', item: need[0] };
  return null;
}

export function apply(s: State, a: Action) {
  if (a.kind === 'bake') bake(s, a.item);
  else if (a.kind === 'oven') tapOven(s, a.i);
  else if (a.kind === 'serve') serve(s, a.seat);
  else trashTray(s, a.i);
}

/** Play a whole level with the bot, one tap every `reaction` seconds. Returns coins earned. */
export function botPlay(level: number, reaction = 0.6): State {
  const s = newGame(level);
  let cool = 0;
  const dt = 0.05;
  while (!isOver(s)) {
    step(s, dt);
    s.events.length = 0;
    cool -= dt;
    if (cool <= 0) {
      const a = botAction(s);
      if (a) {
        apply(s, a);
        cool = reaction;
      }
    }
  }
  return s;
}
