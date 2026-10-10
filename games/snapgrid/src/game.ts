/**
 * Snapgrid — pure game logic (no DOM). Everything here is deterministic given an RNG,
 * which keeps it unit-testable and easy to save/restore.
 */
export const SIZE = 8;
export const COLORS = 7;

export type Board = number[]; // SIZE*SIZE, 0 = empty, 1..COLORS = filled with color
export type Cell = readonly [row: number, col: number];

export interface Piece {
  cells: Cell[];
  w: number;
  h: number;
  color: number;
}

export interface GameState {
  board: Board;
  tray: (Piece | null)[];
  score: number;
  streak: number;
  moves: number;
  lines: number;
  /** Adventure only: ice hit points per cell (2 = fresh ice, 1 = cracked, 0 = none). */
  ice?: number[];
  /** Adventure only: 1 where a gem is embedded in a filled cell. */
  gems?: number[];
}

export interface PlaceResult {
  state: GameState;
  rows: number[];
  cols: number[];
  /** Board indices that were emptied (deduplicated). */
  clearedCells: number[];
  /** Colors of cleared cells, aligned with `clearedCells` (for particles). */
  clearedColors: number[];
  /** Ice cells that were hit but stay on the board (cracked). */
  crackedCells: number[];
  /** Gems collected by this move (board indices). */
  gemCells: number[];
  /** Ice blocks fully broken by this move. */
  iceBroken: number;
  gained: number;
  lineCount: number;
  boardCleared: boolean;
}

export type Rng = () => number;

/** [shape, weight]. Shapes are drawn with '#' and '.'; weights tune difficulty. */
const RAW_SHAPES: [string[], number][] = [
  [['#'], 2],
  [['##'], 3],
  [['#', '#'], 3],
  [['###'], 3],
  [['#', '#', '#'], 3],
  [['####'], 2],
  [['#', '#', '#', '#'], 2],
  [['#####'], 1],
  [['#', '#', '#', '#', '#'], 1],
  [['##', '##'], 4],
  [['###', '###'], 1],
  [['##', '##', '##'], 1],
  [['###', '###', '###'], 1],
  [['##', '#.'], 2],
  [['##', '.#'], 2],
  [['#.', '##'], 2],
  [['.#', '##'], 2],
  [['#.', '#.', '##'], 2],
  [['.#', '.#', '##'], 2],
  [['##', '#.', '#.'], 2],
  [['##', '.#', '.#'], 2],
  [['###', '#..'], 2],
  [['###', '..#'], 2],
  [['#..', '###'], 2],
  [['..#', '###'], 2],
  [['###', '.#.'], 2],
  [['.#.', '###'], 2],
  [['#.', '##', '#.'], 2],
  [['.#', '##', '.#'], 2],
  [['##.', '.##'], 2],
  [['.##', '##.'], 2],
  [['#.', '##', '.#'], 2],
  [['.#', '##', '#.'], 2],
  [['###', '#..', '#..'], 1],
  [['###', '..#', '..#'], 1],
  [['#..', '#..', '###'], 1],
  [['..#', '..#', '###'], 1],
];

export const SHAPES: { cells: Cell[]; w: number; h: number; weight: number }[] = RAW_SHAPES.map(([rows, weight]) => {
  const cells: Cell[] = [];
  rows.forEach((line, r) => [...line].forEach((ch, c) => ch === '#' && cells.push([r, c])));
  return { cells, w: Math.max(...rows.map((l) => l.length)), h: rows.length, weight };
});

const TOTAL_WEIGHT = SHAPES.reduce((s, sh) => s + sh.weight, 0);

export function emptyBoard(): Board {
  return new Array(SIZE * SIZE).fill(0);
}

export function randomPiece(rng: Rng): Piece {
  let roll = rng() * TOTAL_WEIGHT;
  let shape = SHAPES[SHAPES.length - 1];
  for (const sh of SHAPES) {
    roll -= sh.weight;
    if (roll < 0) {
      shape = sh;
      break;
    }
  }
  return { cells: shape.cells, w: shape.w, h: shape.h, color: 1 + Math.floor(rng() * COLORS) };
}

export function canPlace(board: Board, piece: Piece, row: number, col: number): boolean {
  for (const [dr, dc] of piece.cells) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE || board[r * SIZE + c] !== 0) return false;
  }
  return true;
}

export function fitsAnywhere(board: Board, piece: Piece): boolean {
  for (let r = 0; r <= SIZE - piece.h; r++) {
    for (let c = 0; c <= SIZE - piece.w; c++) if (canPlace(board, piece, r, c)) return true;
  }
  return false;
}

/** Rows/cols that would be full after placing `piece` at (row, col). Used for the preview glow. */
export function previewLines(board: Board, piece: Piece, row: number, col: number) {
  const next = board.slice();
  for (const [dr, dc] of piece.cells) next[(row + dr) * SIZE + col + dc] = piece.color;
  return fullLines(next);
}

export function fullLines(board: Board) {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let i = 0; i < SIZE; i++) {
    let rowFull = true;
    let colFull = true;
    for (let j = 0; j < SIZE; j++) {
      if (board[i * SIZE + j] === 0) rowFull = false;
      if (board[j * SIZE + i] === 0) colFull = false;
    }
    if (rowFull) rows.push(i);
    if (colFull) cols.push(i);
  }
  return { rows, cols };
}

/** Points for clearing `n` lines at once: 10, 30, 60, 100… multiplied by the combo streak. */
export function lineScore(n: number, streak: number) {
  return ((10 * n * (n + 1)) / 2) * Math.max(1, streak);
}

export const BOARD_CLEAR_BONUS = 300;

/**
 * Deals a new tray of 3. Tries to guarantee at least one piece fits, and eases off big
 * shapes when the board is crowded, so a loss always feels like the player's own doing.
 */
export function dealTray(board: Board, rng: Rng): Piece[] {
  const filled = board.filter((v) => v !== 0).length / board.length;
  let best: Piece[] = [];
  let bestFits = -1;
  for (let attempt = 0; attempt < 24; attempt++) {
    const tray = [randomPiece(rng), randomPiece(rng), randomPiece(rng)];
    if (filled > 0.45 && attempt < 12 && tray.some((p) => p.cells.length >= 6)) continue;
    const fits = tray.filter((p) => fitsAnywhere(board, p)).length;
    if (fits > bestFits) {
      best = tray;
      bestFits = fits;
    }
    if (fits >= 2 || (fits >= 1 && attempt > 8)) break;
  }
  return best;
}

export function newGame(rng: Rng): GameState {
  const board = emptyBoard();
  return { board, tray: dealTray(board, rng), score: 0, streak: 0, moves: 0, lines: 0 };
}

/**
 * Removes `cells` from the board the way a line clear does: ice loses one hit point (and
 * only leaves once it is gone), gems inside emptied cells are collected.
 */
function clearCells(board: Board, ice: number[] | undefined, gems: number[] | undefined, cells: Iterable<number>) {
  const clearedCells: number[] = [];
  const clearedColors: number[] = [];
  const crackedCells: number[] = [];
  const gemCells: number[] = [];
  let iceBroken = 0;
  for (const i of cells) {
    if (!board[i]) continue;
    if (ice && ice[i] > 0) {
      ice[i]--;
      if (ice[i] > 0) {
        crackedCells.push(i);
        continue;
      }
      iceBroken++;
    }
    if (gems && gems[i]) {
      gems[i] = 0;
      gemCells.push(i);
    }
    clearedCells.push(i);
    clearedColors.push(board[i]);
    board[i] = 0;
  }
  return { clearedCells, clearedColors, crackedCells, gemCells, iceBroken };
}

/**
 * Drops `piece` at (row, col) and resolves line clears. Does not touch the tray or the move
 * counter, so boosters (single block) can reuse it.
 */
export function applyPiece(state: GameState, piece: Piece, row: number, col: number): PlaceResult | null {
  if (!canPlace(state.board, piece, row, col)) return null;
  const board = state.board.slice();
  const ice = state.ice?.slice();
  const gems = state.gems?.slice();
  for (const [dr, dc] of piece.cells) board[(row + dr) * SIZE + col + dc] = piece.color;

  const { rows, cols } = fullLines(board);
  const hit = new Set<number>();
  for (const r of rows) for (let c = 0; c < SIZE; c++) hit.add(r * SIZE + c);
  for (const c of cols) for (let r = 0; r < SIZE; r++) hit.add(r * SIZE + c);
  const cleared = clearCells(board, ice, gems, hit);

  const lineCount = rows.length + cols.length;
  const streak = lineCount > 0 ? state.streak + 1 : 0;
  const boardCleared = lineCount > 0 && board.every((v) => v === 0);
  const gained = piece.cells.length + lineScore(lineCount, streak) + (boardCleared ? BOARD_CLEAR_BONUS : 0);
  return {
    state: { ...state, board, ice, gems, score: state.score + gained, streak, lines: state.lines + lineCount },
    rows,
    cols,
    ...cleared,
    gained,
    lineCount,
    boardCleared,
  };
}

/**
 * Places tray piece `slot`. When the tray empties, `refill` deals the next one (endless:
 * the fair random dealer; adventure: the level's fixed piece sequence).
 */
export function place(
  state: GameState,
  slot: number,
  row: number,
  col: number,
  rng: Rng,
  refill: (s: GameState) => (Piece | null)[] = (s) => dealTray(s.board, rng),
): PlaceResult | null {
  const piece = state.tray[slot];
  if (!piece) return null;
  const res = applyPiece(state, piece, row, col);
  if (!res) return null;
  const next = { ...res.state, moves: state.moves + 1, tray: state.tray.map((p, i) => (i === slot ? null : p)) };
  if (next.tray.every((p) => p === null)) next.tray = refill(next);
  res.state = next;
  return res;
}

/** Bomb booster: clears the 3×3 area around (row, col). Ice loses a hit point as usual. */
export function bomb(state: GameState, row: number, col: number): PlaceResult {
  const board = state.board.slice();
  const ice = state.ice?.slice();
  const gems = state.gems?.slice();
  const area: number[] = [];
  for (let r = row - 1; r <= row + 1; r++)
    for (let c = col - 1; c <= col + 1; c++) if (r >= 0 && c >= 0 && r < SIZE && c < SIZE) area.push(r * SIZE + c);
  const cleared = clearCells(board, ice, gems, area);
  const gained = (cleared.clearedCells.length + cleared.crackedCells.length) * 2;
  return {
    state: { ...state, board, ice, gems, score: state.score + gained },
    rows: [],
    cols: [],
    ...cleared,
    gained,
    lineCount: 0,
    boardCleared: false,
  };
}

/** How many (piece, position) placements the tray still has — drives the danger warning. */
export function countPlacements(board: Board, tray: (Piece | null)[], cap = Infinity): number {
  let n = 0;
  for (const p of tray) {
    if (!p) continue;
    for (let r = 0; r <= SIZE - p.h; r++)
      for (let c = 0; c <= SIZE - p.w; c++) if (canPlace(board, p, r, c) && ++n >= cap) return n;
  }
  return n;
}

export const DOT: Readonly<Piece> = { cells: [[0, 0]], w: 1, h: 1, color: 1 };

export function isGameOver(state: GameState): boolean {
  return state.tray.every((p) => p === null || !fitsAnywhere(state.board, p));
}

/** Small seedable RNG (mulberry32) for tests and reproducible bug reports. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * "Second chance" tray: three small pieces that each fit somewhere right now. A completely
 * full board can't exist (it would have cleared), so a single block always fits.
 */
export function rescueTray(board: Board, rng: Rng): Piece[] {
  const fitting = SHAPES.filter((sh) => sh.cells.length <= 4 && fitsAnywhere(board, { ...sh, color: 1 }));
  const pool = fitting.length ? fitting : [SHAPES[0]];
  return [0, 1, 2].map(() => {
    const sh = pool[Math.floor(rng() * pool.length)];
    return { cells: sh.cells, w: sh.w, h: sh.h, color: 1 + Math.floor(rng() * COLORS) };
  });
}

/** A placement for `piece` close to the board centre, used by the first-run hint. */
export function suggestPlacement(board: Board, piece: Piece): { row: number; col: number } | null {
  let best: { row: number; col: number } | null = null;
  let bestD = Infinity;
  for (let r = 0; r <= SIZE - piece.h; r++) {
    for (let c = 0; c <= SIZE - piece.w; c++) {
      if (!canPlace(board, piece, r, c)) continue;
      const d = Math.abs(r + piece.h / 2 - SIZE / 2) + Math.abs(c + piece.w / 2 - SIZE / 2);
      if (d < bestD) {
        bestD = d;
        best = { row: r, col: c };
      }
    }
  }
  return best;
}
