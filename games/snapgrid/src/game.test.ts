import { describe, expect, it } from 'vitest';
import {
  BOARD_CLEAR_BONUS,
  SIZE,
  SHAPES,
  canPlace,
  dealTray,
  emptyBoard,
  fitsAnywhere,
  isGameOver,
  lineScore,
  newGame,
  place,
  rescueTray,
  seededRng,
  suggestPlacement,
  type GameState,
  type Piece,
} from './game';

const bar = (len: number, color = 1): Piece => ({
  cells: Array.from({ length: len }, (_, i) => [0, i] as const),
  w: len,
  h: 1,
  color,
});
const dot: Piece = { cells: [[0, 0]], w: 1, h: 1, color: 2 };

function stateWith(board: number[], tray: (Piece | null)[], extra: Partial<GameState> = {}): GameState {
  return { board, tray, score: 0, streak: 0, moves: 0, lines: 0, ...extra };
}

describe('shapes', () => {
  it('every shape has consistent bounds and at least one cell', () => {
    for (const s of SHAPES) {
      expect(s.cells.length).toBeGreaterThan(0);
      for (const [r, c] of s.cells) {
        expect(r).toBeLessThan(s.h);
        expect(c).toBeLessThan(s.w);
      }
    }
  });
});

describe('placement', () => {
  it('rejects out-of-bounds and overlapping placements', () => {
    const board = emptyBoard();
    expect(canPlace(board, bar(3), 0, SIZE - 3)).toBe(true);
    expect(canPlace(board, bar(3), 0, SIZE - 2)).toBe(false);
    expect(canPlace(board, bar(3), -1, 0)).toBe(false);
    board[2] = 1;
    expect(canPlace(board, bar(3), 0, 0)).toBe(false);
  });

  it('scores cells placed and keeps streak at 0 without a clear', () => {
    const res = place(stateWith(emptyBoard(), [bar(3), dot, dot]), 0, 4, 0, seededRng(1))!;
    expect(res.gained).toBe(3);
    expect(res.state.streak).toBe(0);
    expect(res.state.tray[0]).toBeNull();
  });

  it('clears a completed row and a column at the same time', () => {
    const board = emptyBoard();
    for (let c = 1; c < SIZE; c++) board[c] = 3; // row 0 except (0,0)
    for (let r = 1; r < SIZE; r++) board[r * SIZE] = 4; // col 0 except (0,0)
    const res = place(stateWith(board, [dot, dot, dot]), 0, 0, 0, seededRng(1))!;
    expect(res.rows).toEqual([0]);
    expect(res.cols).toEqual([0]);
    expect(res.clearedCells).toHaveLength(SIZE * 2 - 1);
    expect(res.boardCleared).toBe(true);
    expect(res.gained).toBe(1 + lineScore(2, 1) + BOARD_CLEAR_BONUS);
  });

  it('builds a combo streak across consecutive clears', () => {
    const board = emptyBoard();
    for (let c = 1; c < SIZE; c++) board[c] = 1;
    board[SIZE * SIZE - 1] = 1; // keep board from being fully cleared
    const res = place(stateWith(board, [dot, dot, dot], { streak: 2 }), 0, 0, 0, seededRng(1))!;
    expect(res.state.streak).toBe(3);
    expect(res.gained).toBe(1 + lineScore(1, 3));
  });

  it('deals a fresh tray once all three pieces are used', () => {
    const res = place(stateWith(emptyBoard(), [dot, null, null]), 0, 0, 0, seededRng(7))!;
    expect(res.state.tray.every((p) => p !== null)).toBe(true);
  });
});

describe('game over & dealing', () => {
  it('detects when nothing in the tray fits', () => {
    const board = emptyBoard().fill(1);
    board[0] = 0;
    expect(isGameOver(stateWith(board, [bar(2), null, null]))).toBe(true);
    expect(isGameOver(stateWith(board, [bar(2), dot, null]))).toBe(false);
  });

  it('tries to deal at least one piece that fits on a crowded board', () => {
    const board = emptyBoard().fill(1);
    for (let c = 0; c < 3; c++) board[c] = 0; // only a 1x3 gap
    const rng = seededRng(42);
    let dealtPlayable = 0;
    for (let i = 0; i < 50; i++) if (dealTray(board, rng).some((p) => fitsAnywhere(board, p))) dealtPlayable++;
    expect(dealtPlayable).toBeGreaterThan(35);
  });

  it('a fresh game always has three playable pieces', () => {
    const g = newGame(seededRng(3));
    expect(g.tray).toHaveLength(3);
    expect(isGameOver(g)).toBe(false);
  });
});

describe('second chance', () => {
  it('rescue tray pieces all fit on a crowded board', () => {
    const board = emptyBoard().fill(1);
    board[0] = 0;
    board[1] = 0;
    board[20] = 0;
    const tray = rescueTray(board, seededRng(5));
    expect(tray).toHaveLength(3);
    for (const p of tray) expect(fitsAnywhere(board, p)).toBe(true);
  });

  it('suggests a valid placement near the centre', () => {
    const s = suggestPlacement(emptyBoard(), dot)!;
    expect(canPlace(emptyBoard(), dot, s.row, s.col)).toBe(true);
    expect(s.row).toBeGreaterThanOrEqual(3);
    expect(s.row).toBeLessThanOrEqual(4);
  });
});
