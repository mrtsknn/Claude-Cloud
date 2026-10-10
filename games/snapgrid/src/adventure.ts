/**
 * Adventure mode: 200 generated-then-verified levels plus a date-seeded daily challenge.
 *
 * Every level is a pre-filled 8×8 board (mirror-symmetric so it reads as "designed"), with
 * gems and ice embedded in filled cells, one or two goals and a fixed number of pieces.
 * The piece sequence depends only on the level seed — never on the board — so the exact
 * pieces the player sees are the ones the verification bot solved the level with.
 */
import {
  COLORS,
  SHAPES,
  SIZE,
  applyPiece,
  canPlace,
  emptyBoard,
  fitsAnywhere,
  fullLines,
  seededRng,
  type Board,
  type GameState,
  type Piece,
  type PlaceResult,
  type Rng,
} from './game.ts';

export type GoalType = 'gems' | 'lines' | 'ice' | 'score';
export interface Goal {
  type: GoalType;
  target: number;
}

export interface LevelDef {
  /** 1..LEVEL_COUNT, or 0 for the daily challenge. */
  id: number;
  seed: number;
  board: Board;
  ice: number[];
  gems: number[];
  goals: Goal[];
  /** Pieces available. */
  limit: number;
  /** Pieces the verification bot needed (used for tuning; never shown). */
  botUsed: number;
}

export interface Progress {
  gems: number;
  lines: number;
  ice: number;
  score: number;
}

export const LEVEL_COUNT = 200;
export const CONTINUE_PIECES = 3;

// ───────────────────────── piece sequence ─────────────────────────

/** Adventure pieces lean small/medium: puzzles are about where, not about luck. */
const ADV_WEIGHTS = SHAPES.map((s) => (s.cells.length >= 9 ? 0.4 : s.cells.length >= 6 ? 0.7 : s.weight + 1));
const ADV_TOTAL = ADV_WEIGHTS.reduce((a, b) => a + b, 0);

/** Piece #i of a level's sequence (pure function of seed and index). */
export function seqPiece(seed: number, i: number): Piece {
  const rng = seededRng((Math.imul(seed, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0);
  rng();
  let roll = rng() * ADV_TOTAL;
  let k = SHAPES.length - 1;
  for (let j = 0; j < SHAPES.length; j++) {
    roll -= ADV_WEIGHTS[j];
    if (roll < 0) {
      k = j;
      break;
    }
  }
  const sh = SHAPES[k];
  return { cells: sh.cells, w: sh.w, h: sh.h, color: 1 + Math.floor(rng() * COLORS) };
}

/** Next tray from the sequence: up to 3 pieces, never more than the pieces left. */
export function dealSeq(seed: number, from: number, left: number): (Piece | null)[] {
  return [0, 1, 2].map((k) => (k < left ? seqPiece(seed, from + k) : null));
}

// ───────────────────────── run state ─────────────────────────

export interface Run {
  def: LevelDef;
  game: GameState;
  prog: Progress;
  /** Pieces placed (boosters don't count). */
  used: number;
  limit: number;
  /** Next index into the piece sequence. */
  seqPos: number;
  continues: number;
}

export function startRun(def: LevelDef): Run {
  const tray = dealSeq(def.seed, 0, def.limit);
  return {
    def,
    game: { board: def.board.slice(), ice: def.ice.slice(), gems: def.gems.slice(), tray, score: 0, streak: 0, moves: 0, lines: 0 },
    prog: { gems: 0, lines: 0, ice: 0, score: 0 },
    used: 0,
    limit: def.limit,
    seqPos: tray.filter(Boolean).length,
    continues: 0,
  };
}

/** Folds a placement/booster result into the run's goal progress. */
export function track(run: Run, res: PlaceResult) {
  run.prog.gems += res.gemCells.length;
  run.prog.ice += res.iceBroken;
  run.prog.lines += res.lineCount;
  run.prog.score = res.state.score;
}

/** Places tray `slot` at (row, col) in a run; refills from the sequence. Mutates `run`. */
export function runPlace(run: Run, slot: number, row: number, col: number): PlaceResult | null {
  const piece = run.game.tray[slot];
  if (!piece) return null;
  const res = applyPiece(run.game, piece, row, col);
  if (!res) return null;
  run.used++;
  const tray = run.game.tray.map((p, i) => (i === slot ? null : p));
  res.state = { ...res.state, moves: run.game.moves + 1, tray };
  if (tray.every((p) => p === null)) {
    res.state.tray = dealSeq(run.def.seed, run.seqPos, run.limit - run.used);
    run.seqPos += res.state.tray.filter(Boolean).length;
  }
  run.game = res.state;
  track(run, res);
  return res;
}

export function goalValue(g: Goal, p: Progress) {
  return Math.min(g.target, p[g.type]);
}
export const goalsMet = (run: Pick<Run, 'def' | 'prog'>) => run.def.goals.every((g) => goalValue(g, run.prog) >= g.target);
export const piecesLeft = (run: Run) => run.limit - run.used;
export function runStuck(run: Run) {
  return run.game.tray.every((p) => p === null || !fitsAnywhere(run.game.board, p));
}

/** Stars by pieces left: ≥25 % of the limit → 3, ≥10 % → 2, else 1. Continues cap at 1. */
export function starsFor(run: Pick<Run, 'limit' | 'used' | 'continues' | 'def'>) {
  if (run.continues > 0) return 1;
  const left = run.def.limit - run.used;
  if (left >= Math.ceil(run.def.limit * 0.25)) return 3;
  if (left >= Math.ceil(run.def.limit * 0.1)) return 2;
  return 1;
}

/** Adds the paid continue: +3 pieces (and the next tray if the current one is used up). */
export function addPieces(run: Run, n = CONTINUE_PIECES) {
  run.limit += n;
  run.continues++;
  if (run.game.tray.every((p) => p === null)) {
    const tray = dealSeq(run.def.seed, run.seqPos, run.limit - run.used);
    run.seqPos += tray.filter(Boolean).length;
    run.game = { ...run.game, tray };
  }
}

// ───────────────────────── bot ─────────────────────────

/** Heuristic value of the board after a move, given the run's goals. */
function evaluate(run: Run, res: PlaceResult, restTray: (Piece | null)[]): number {
  const { board, ice, gems } = res.state;
  const goals = new Set(run.def.goals.map((g) => g.type));
  let h = res.lineCount * 40 + res.gained * (goals.has('score') ? 2 : 0.2);
  if (goals.has('gems')) h += res.gemCells.length * 260;
  if (goals.has('ice')) h += res.iceBroken * 200 + res.crackedCells.length * 90;
  if (goals.has('lines')) h += res.lineCount * 160;

  // Pull towards lines that hold targets: the fuller such a line, the better.
  const want = (i: number) => (goals.has('gems') && gems?.[i] ? 1 : 0) + (goals.has('ice') && ice?.[i] ? 1 : 0);
  for (let k = 0; k < SIZE; k++) {
    let rowT = 0;
    let colT = 0;
    let rowF = 0;
    let colF = 0;
    for (let j = 0; j < SIZE; j++) {
      const ri = k * SIZE + j;
      const ci = j * SIZE + k;
      rowT += want(ri);
      colT += want(ci);
      if (board[ri]) rowF++;
      if (board[ci]) colF++;
    }
    if (rowT) h += rowT * rowF * rowF * 0.9;
    if (colT) h += colT * colF * colF * 0.9;
    // Generic: nearly-full lines are good, half-full ones clutter.
    h += (rowF >= 6 ? rowF : 0) + (colF >= 6 ? colF : 0);
  }

  // Holes: empty cells boxed in on 3+ sides are hard to use.
  let holes = 0;
  let filled = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (board[r * SIZE + c]) {
        filled++;
        continue;
      }
      let walls = 0;
      if (r === 0 || board[(r - 1) * SIZE + c]) walls++;
      if (r === SIZE - 1 || board[(r + 1) * SIZE + c]) walls++;
      if (c === 0 || board[r * SIZE + c - 1]) walls++;
      if (c === SIZE - 1 || board[r * SIZE + c + 1]) walls++;
      if (walls >= 3) holes++;
    }
  h -= holes * 14 + filled * 1.5;
  for (const p of restTray) if (p && !fitsAnywhere(board, p)) h -= 600;
  return h;
}

/** Best (slot, row, col) for the run's current tray, or null when stuck. */
export function botMove(run: Run): { slot: number; row: number; col: number } | null {
  let best: { slot: number; row: number; col: number } | null = null;
  let bestH = -Infinity;
  run.game.tray.forEach((piece, slot) => {
    if (!piece) return;
    const rest = run.game.tray.filter((_, i) => i !== slot);
    for (let r = 0; r <= SIZE - piece.h; r++)
      for (let c = 0; c <= SIZE - piece.w; c++) {
        if (!canPlace(run.game.board, piece, r, c)) continue;
        const res = applyPiece(run.game, piece, r, c)!;
        const h = evaluate(run, res, rest);
        if (h > bestH) {
          bestH = h;
          best = { slot, row: r, col: c };
        }
      }
  });
  return best;
}

/** Plays a level greedily. Returns whether all goals were met within `limit` pieces. */
export function botSolve(def: LevelDef, limit = def.limit): { solved: boolean; used: number } {
  const run = startRun({ ...def, limit });
  while (!goalsMet(run) && run.used < run.limit) {
    const m = botMove(run);
    if (!m) break;
    runPlace(run, m.slot, m.row, m.col);
  }
  return { solved: goalsMet(run), used: run.used };
}


// ───────────────────────── generator ─────────────────────────

export interface Spec {
  goals: GoalType[];
  /** 0 (first levels) … 20 (last levels). */
  tier: number;
  /** Piece limit = bot pieces × slack (+3 floor). */
  slack: number;
  /** Preferred bot length in pieces; the generator picks the closest candidate. */
  length: number;
}

/** Symmetric pre-filled board: coloured blobs mirrored left↔right (and sometimes top↕bottom). */
function prefill(rng: Rng, density: number): Board {
  const board = emptyBoard();
  const both = rng() < 0.35;
  const half = both ? SIZE / 2 : SIZE;
  const want = Math.round(SIZE * SIZE * density);
  let guard = 0;
  const set = (r: number, c: number, color: number) => {
    const spots: [number, number][] = [[r, c], [r, SIZE - 1 - c]];
    if (both) spots.push([SIZE - 1 - r, c], [SIZE - 1 - r, SIZE - 1 - c]);
    for (const [rr, cc] of spots) board[rr * SIZE + cc] = color;
  };
  while (board.filter(Boolean).length < want && guard++ < 200) {
    const color = 1 + Math.floor(rng() * COLORS);
    let r = Math.floor(rng() * half);
    let c = Math.floor(rng() * (SIZE / 2));
    const len = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < len; k++) {
      set(r, c, color);
      if (rng() < 0.5) r = Math.max(0, Math.min(half - 1, r + (rng() < 0.5 ? -1 : 1)));
      else c = Math.max(0, Math.min(SIZE / 2 - 1, c + (rng() < 0.5 ? -1 : 1)));
    }
  }
  // Never start with a full line (it would clear on the first move for free).
  for (let pass = 0; pass < 3; pass++) {
    const { rows, cols } = fullLines(board);
    for (const r of rows) {
      const c = Math.floor(rng() * (SIZE / 2));
      board[r * SIZE + c] = 0;
      board[r * SIZE + SIZE - 1 - c] = 0;
    }
    for (const c of cols) board[Math.floor(rng() * SIZE) * SIZE + c] = 0;
  }
  return board;
}

/** Picks `n` target cells, favouring fuller lines (reachable) and spreading over rows. */
function pickCells(rng: Rng, board: Board, from: number[], n: number): number[] {
  const fill = (i: number) => {
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    let k = 0;
    for (let j = 0; j < SIZE; j++) k += (board[r * SIZE + j] ? 1 : 0) + (board[j * SIZE + c] ? 1 : 0);
    return k;
  };
  const pool = from.map((i) => ({ i, w: Math.pow(fill(i), 1.5) }));
  const out: number[] = [];
  const perRow = new Map<number, number>();
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let roll = rng() * total;
    let k = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      roll -= pool[j].w;
      if (roll < 0) {
        k = j;
        break;
      }
    }
    const { i } = pool.splice(k, 1)[0];
    const row = Math.floor(i / SIZE);
    if ((perRow.get(row) ?? 0) >= 2 && pool.length >= n - out.length) continue;
    perRow.set(row, (perRow.get(row) ?? 0) + 1);
    out.push(i);
  }
  return out;
}

function targetFor(type: GoalType, tier: number, rng: Rng) {
  const jitter = Math.floor(rng() * 2);
  switch (type) {
    case 'gems':
      return Math.min(12, 3 + Math.floor(tier * 0.42) + jitter);
    case 'ice':
      return Math.min(8, 2 + Math.floor(tier * 0.28) + jitter);
    case 'lines':
      return Math.min(14, 3 + Math.floor(tier * 0.5) + jitter);
    case 'score':
      return Math.min(800, 100 + tier * 28 + jitter * 20);
  }
}

/** Builds one candidate level; null if the board can't host the goals. */
function build(id: number, seed: number, spec: Spec, shrink: number): LevelDef | null {
  const rng = seededRng(seed);
  const density = Math.min(0.5, 0.28 + spec.tier * 0.01 + rng() * 0.08);
  const board = prefill(rng, density);
  const ice = new Array(SIZE * SIZE).fill(0);
  const gems = new Array(SIZE * SIZE).fill(0);
  const filled = board.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const goals: Goal[] = [];
  for (const type of spec.goals) {
    const target = Math.max(1, Math.round(targetFor(type, spec.tier, rng) * shrink));
    if (type === 'gems' || type === 'ice') {
      const free = filled.filter((i) => !ice[i] && !gems[i]);
      const cells = pickCells(rng, board, free, target);
      if (cells.length < target) return null;
      for (const i of cells) {
        if (type === 'gems') gems[i] = 1;
        else ice[i] = 2;
      }
    }
    goals.push({ type, target });
  }
  return { id, seed, board, ice, gems, goals, limit: 0, botUsed: 0 };
}

/**
 * Generates a level: tries seeded layout variants, keeps those the bot solves in a
 * mobile-friendly number of pieces, and picks the one closest to the wanted length.
 * The piece limit is then bot pieces × slack, re-verified at that exact limit.
 */
export function generate(id: number, baseSeed: number, spec: Spec, variants = 16): LevelDef {
  for (let attempt = 0; attempt < 12; attempt++) {
    // Each failed round relaxes: smaller targets first, then a longer allowed length.
    const shrink = Math.max(0.4, 1 - attempt * 0.15);
    const maxUsed = Math.max(spec.length + 8, 14) + Math.max(0, attempt - 4) * 4;
    let best: { def: LevelDef; used: number } | null = null;
    for (let v = 0; v < variants; v++) {
      const def = build(id, (baseSeed + v * 7919) >>> 0, spec, shrink);
      if (!def) continue;
      const trial = botSolve(def, 60);
      if (!trial.solved || trial.used > maxUsed) continue;
      if (!best || Math.abs(trial.used - spec.length) < Math.abs(best.used - spec.length)) best = { def, used: trial.used };
      if (Math.abs(trial.used - spec.length) <= 1) break;
    }
    if (best) {
      let limit = Math.max(best.used + 3, Math.ceil(best.used * spec.slack));
      // Partial last trays can change greedy choices; verify at the real limit.
      while (!botSolve(best.def, limit).solved) limit++;
      return { ...best.def, limit, botUsed: best.used };
    }
  }
  throw new Error(`level ${id}: no solvable layout`);
}

/** Goal plan for the first ten levels (onboarding), then a repeating pattern of ten. */
const INTRO: GoalType[][] = [['lines'], ['gems'], ['lines'], ['gems'], ['score'], ['ice'], ['gems'], ['ice'], ['lines'], ['gems', 'ice']];
const CYCLE: GoalType[][] = [['gems'], ['lines'], ['ice'], ['gems'], ['score'], ['gems', 'lines'], ['ice'], ['gems'], ['ice', 'score'], ['gems', 'ice']];

export function levelSpec(n: number): Spec {
  const goals = n <= 10 ? INTRO[n - 1] : CYCLE[(n - 1) % 10];
  const tier = n <= 10 ? (n - 1) * 0.25 : Math.min(20, 2 + (n - 11) / 10.5);
  const boss = n % 10 === 0;
  // Sawtooth inside each block of ten: a breather after every boss.
  const length = Math.round((n <= 10 ? 6 + n * 0.6 : 11 + tier * 0.6) + ((n - 1) % 10) * 0.4 + (boss ? 2 : 0));
  const slack = Math.max(1.25, 1.9 - n * 0.0035) - (boss && n > 10 ? 0.08 : 0);
  return { goals, tier, slack, length };
}

export const levelSeed = (n: number) => Math.imul(n, 2654435761) >>> 0;

/** Hash a YYYY-MM-DD key into a seed. */
export function daySeed(day: string): number {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const DAILY_GOALS: GoalType[][] = [['gems', 'lines'], ['ice', 'score'], ['gems', 'ice'], ['lines', 'score'], ['gems', 'score'], ['ice', 'lines']];

/** The daily challenge for a calendar day: same puzzle for everyone, mid-game difficulty. */
export function generateDaily(day: string): LevelDef {
  const seed = daySeed(day);
  const rng = seededRng(seed);
  const spec: Spec = { goals: DAILY_GOALS[Math.floor(rng() * DAILY_GOALS.length)], tier: 6 + Math.floor(rng() * 4), slack: 1.4, length: 16 };
  return generate(0, seed, spec, 8);
}

/** Coins for finishing the daily challenge on a given streak day. */
export const dailyReward = (streak: number) => 40 + Math.min(7, streak) * 10;

export interface DailyState {
  /** Day key of the last completed challenge. */
  last: string;
  streak: number;
  bestStreak: number;
}

export function loadDaily(raw: unknown): DailyState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<DailyState>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  return { last: typeof r.last === 'string' ? r.last : '', streak: n(r.streak), bestStreak: n(r.bestStreak) };
}

/** Streak to show today: alive if the last win was today or yesterday. */
export const liveStreak = (s: DailyState, today: string, yesterday: string) => (s.last === today || s.last === yesterday ? s.streak : 0);

/** Records a daily win. Only the first win of a day pays coins and grows the streak. */
export function completeDaily(s: DailyState, today: string, yesterday: string): { state: DailyState; reward: number } {
  if (s.last === today) return { state: s, reward: 0 };
  const streak = s.last === yesterday ? s.streak + 1 : 1;
  return { state: { last: today, streak, bestStreak: Math.max(s.bestStreak, streak) }, reward: dailyReward(streak) };
}

// ───────────────────────── packing (levels.json) ─────────────────────────

export interface PackedLevel {
  /** seed */
  s: number;
  /** 64 chars: board colour 0–7 */
  b: string;
  /** 64 chars: '.' none, 'g' gem, 'i' ice */
  x: string;
  /** goals as "type:target" */
  g: string[];
  /** piece limit */
  l: number;
  /** bot pieces */
  u: number;
}

export function packLevel(d: LevelDef): PackedLevel {
  return {
    s: d.seed,
    b: d.board.join(''),
    x: d.board.map((_, i) => (d.gems[i] ? 'g' : d.ice[i] ? 'i' : '.')).join(''),
    g: d.goals.map((g) => `${g.type}:${g.target}`),
    l: d.limit,
    u: d.botUsed,
  };
}

export function unpackLevel(id: number, p: PackedLevel): LevelDef {
  return {
    id,
    seed: p.s,
    board: [...p.b].map(Number),
    gems: [...p.x].map((ch) => (ch === 'g' ? 1 : 0)),
    ice: [...p.x].map((ch) => (ch === 'i' ? 2 : 0)),
    goals: p.g.map((s) => {
      const [type, target] = s.split(':');
      return { type: type as GoalType, target: Number(target) };
    }),
    limit: p.l,
    botUsed: p.u,
  };
}
