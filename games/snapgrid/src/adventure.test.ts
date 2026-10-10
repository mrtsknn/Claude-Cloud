import { describe, expect, it } from 'vitest';
import packed from './levels.json';
import {
  CONTINUE_PIECES,
  LEVEL_COUNT,
  addPieces,
  botSolve,
  completeDaily,
  dailyReward,
  dealSeq,
  generate,
  generateDaily,
  goalsMet,
  levelSeed,
  levelSpec,
  liveStreak,
  loadDaily,
  packLevel,
  runPlace,
  runStuck,
  seqPiece,
  starsFor,
  startRun,
  type LevelDef,
  type PackedLevel,
} from './adventure';
import { getLevel, dailyLevel } from './levels';
import { SIZE, bomb, countPlacements, emptyBoard, fullLines, seededRng, type Piece } from './game';
import { BOOSTERS, STARTER_BOOSTERS, buyBooster, claimFree, freeAvailable, loadInventory, shuffleTray, useBooster } from './boosters';

const bar = (len: number, color = 1): Piece => ({ cells: Array.from({ length: len }, (_, i) => [0, i] as const), w: len, h: 1, color });
const dot: Piece = { cells: [[0, 0]], w: 1, h: 1, color: 2 };

/** A hand-made level: row 0 filled except (0,0); the gem/ice at (0,7). */
function testLevel(over: Partial<LevelDef> = {}): LevelDef {
  const board = emptyBoard();
  for (let c = 1; c < SIZE; c++) board[c] = 3;
  return { id: 1, seed: 1, board, ice: new Array(64).fill(0), gems: new Array(64).fill(0), goals: [{ type: 'lines', target: 1 }], limit: 5, botUsed: 1, ...over };
}

describe('level pack', () => {
  const levels = Array.from({ length: LEVEL_COUNT }, (_, i) => getLevel(i + 1));

  it('ships exactly 200 levels', () => {
    expect((packed as PackedLevel[]).length).toBe(LEVEL_COUNT);
  });

  it('every level is well-formed', () => {
    for (const l of levels) {
      const { rows, cols } = fullLines(l.board);
      expect(rows.length + cols.length, `level ${l.id} starts with a full line`).toBe(0);
      expect(l.goals.length).toBeGreaterThan(0);
      for (let i = 0; i < 64; i++) {
        if (l.gems[i] || l.ice[i]) expect(l.board[i], `level ${l.id}: target on empty cell`).toBeGreaterThan(0);
        expect(l.gems[i] && l.ice[i]).toBeFalsy();
      }
      for (const g of l.goals) {
        expect(g.target).toBeGreaterThan(0);
        if (g.type === 'gems') expect(l.gems.filter(Boolean).length).toBeGreaterThanOrEqual(g.target);
        if (g.type === 'ice') expect(l.ice.filter(Boolean).length).toBeGreaterThanOrEqual(g.target);
      }
      expect(l.limit).toBeGreaterThanOrEqual(l.botUsed + 3);
      expect(l.limit).toBeLessThanOrEqual(50);
    }
  });

  it('every level is solvable by the greedy bot within its piece limit', () => {
    const failed: number[] = [];
    for (const l of levels) if (!botSolve(l).solved) failed.push(l.id);
    expect(failed).toEqual([]);
  });

  it('teaches every goal type in the first ten levels and ramps up', () => {
    const types = new Set(levels.slice(0, 10).flatMap((l) => l.goals.map((g) => g.type)));
    expect([...types].sort()).toEqual(['gems', 'ice', 'lines', 'score']);
    const target = (from: number, to: number) => {
      const ls = levels.slice(from, to).filter((l) => l.goals[0].type === 'gems');
      return ls.reduce((s, l) => s + l.goals[0].target, 0) / ls.length;
    };
    expect(target(150, 200)).toBeGreaterThan(target(10, 50));
  });

  it('the generator is deterministic (pack matches a fresh run)', () => {
    for (const n of [1, 2, 7, 50]) {
      expect(packLevel(generate(n, levelSeed(n), levelSpec(n)))).toEqual((packed as PackedLevel[])[n - 1]);
    }
  });
});

describe('piece sequence', () => {
  it('depends only on seed and index', () => {
    expect(seqPiece(42, 3)).toEqual(seqPiece(42, 3));
    const a = Array.from({ length: 12 }, (_, i) => seqPiece(42, i).cells.length).join();
    const b = Array.from({ length: 12 }, (_, i) => seqPiece(43, i).cells.length).join();
    expect(a).not.toEqual(b);
  });

  it('never deals more pieces than are left', () => {
    expect(dealSeq(1, 0, 2).filter(Boolean)).toHaveLength(2);
    expect(dealSeq(1, 0, 0).filter(Boolean)).toHaveLength(0);
  });
});

describe('goals', () => {
  it('collects a gem when its line clears', () => {
    const def = testLevel({ goals: [{ type: 'gems', target: 1 }] });
    def.gems[7] = 1;
    const run = startRun(def);
    run.game.tray = [dot, null, null];
    expect(goalsMet(run)).toBe(false);
    const res = runPlace(run, 0, 0, 0)!;
    expect(res.gemCells).toEqual([7]);
    expect(run.prog.gems).toBe(1);
    expect(goalsMet(run)).toBe(true);
  });

  it('ice needs two clears and stays on the board after the first', () => {
    const def = testLevel({ goals: [{ type: 'ice', target: 1 }] });
    def.ice[7] = 2;
    const run = startRun(def);
    run.game.tray = [dot, dot, dot];
    const first = runPlace(run, 0, 0, 0)!;
    expect(first.crackedCells).toEqual([7]);
    expect(run.game.board[7]).toBeGreaterThan(0);
    expect(run.game.ice![7]).toBe(1);
    expect(run.prog.ice).toBe(0);
    // refill row 0 (cells 0..6) and clear again
    run.game.board = run.game.board.map((v, i) => (i > 0 && i < 7 ? 4 : v));
    const second = runPlace(run, 1, 0, 0)!;
    expect(second.iceBroken).toBe(1);
    expect(run.game.board[7]).toBe(0);
    expect(goalsMet(run)).toBe(true);
  });

  it('counts lines and score', () => {
    const def = testLevel({ goals: [{ type: 'lines', target: 1 }, { type: 'score', target: 15 }] });
    def.board[63] = 1; // keep the board from being wiped (no perfect bonus)
    const run = startRun(def);
    run.game.tray = [dot, null, null];
    runPlace(run, 0, 0, 0);
    expect(run.prog.lines).toBe(1);
    expect(run.prog.score).toBe(11);
    expect(goalsMet(run)).toBe(false);
  });

  it('uses up pieces and refills only from the sequence', () => {
    const def = testLevel({ limit: 4 });
    const run = startRun(def);
    expect(run.game.tray.filter(Boolean)).toHaveLength(3);
    run.game.tray = [dot, dot, dot];
    runPlace(run, 0, 5, 0);
    runPlace(run, 1, 5, 2);
    runPlace(run, 2, 5, 4);
    expect(run.used).toBe(3);
    expect(run.game.tray.filter(Boolean)).toHaveLength(1); // only one piece left
  });

  it('stars by pieces left; a continue caps at one star', () => {
    const def = testLevel({ limit: 20 });
    const run = startRun(def);
    run.used = 10;
    expect(starsFor(run)).toBe(3);
    run.used = 17;
    expect(starsFor(run)).toBe(2);
    run.used = 19;
    expect(starsFor(run)).toBe(1);
    run.used = 2;
    run.continues = 1;
    expect(starsFor(run)).toBe(1);
  });

  it('continue adds three pieces and deals them when the hand is empty', () => {
    const def = testLevel({ limit: 1 });
    const run = startRun(def);
    run.game.tray = [dot, null, null];
    runPlace(run, 0, 5, 5);
    expect(run.game.tray.every((p) => p === null)).toBe(true);
    addPieces(run);
    expect(run.limit).toBe(1 + CONTINUE_PIECES);
    expect(run.game.tray.filter(Boolean)).toHaveLength(3);
    expect(runStuck(run)).toBe(false);
  });
});

describe('boosters', () => {
  it('new players get the starter pack; stored counts are respected', () => {
    const fresh = loadInventory(null);
    expect([fresh.bomb, fresh.shuffle, fresh.single]).toEqual([STARTER_BOOSTERS, STARTER_BOOSTERS, STARTER_BOOSTERS]);
    expect(loadInventory({ bomb: 5, shuffle: 0, single: 'x' }).single).toBe(0);
    expect(loadInventory({ bomb: 5 }).bomb).toBe(5);
  });

  it('use, buy with coins and one free claim a day', () => {
    const inv = loadInventory({ bomb: 1, shuffle: 0, single: 0 });
    expect(useBooster(inv, 'bomb')).toBe(true);
    expect(useBooster(inv, 'bomb')).toBe(false);
    let coins = 160;
    const spend = (n: number) => (coins >= n ? ((coins -= n), true) : false);
    expect(buyBooster(inv, 'bomb', spend)).toBe(true);
    expect(coins).toBe(10);
    expect(buyBooster(inv, 'shuffle', spend)).toBe(false);
    expect(freeAvailable(inv, 'single', '2026-10-10')).toBe(true);
    expect(claimFree(inv, 'single', '2026-10-10')).toBe(true);
    expect(claimFree(inv, 'single', '2026-10-10')).toBe(false);
    expect(claimFree(inv, 'single', '2026-10-11')).toBe(true);
    expect(inv.single).toBe(2);
    for (const b of BOOSTERS) expect(b.price).toBeGreaterThanOrEqual(100);
  });

  it('bomb clears a 3×3 area, collects gems and cracks ice', () => {
    const board = emptyBoard().fill(2);
    const gems = new Array(64).fill(0);
    const ice = new Array(64).fill(0);
    gems[3 * 8 + 3] = 1;
    ice[4 * 8 + 4] = 2;
    const res = bomb({ board, tray: [], score: 0, streak: 0, moves: 0, lines: 0, gems, ice }, 4, 3);
    expect(res.clearedCells).toHaveLength(8);
    expect(res.gemCells).toEqual([27]);
    expect(res.crackedCells).toEqual([36]);
    expect(res.state.board[36]).toBe(2);
    // corner: only 4 cells exist
    expect(bomb({ board: emptyBoard().fill(1), tray: [], score: 0, streak: 0, moves: 0, lines: 0 }, 0, 0).clearedCells).toHaveLength(4);
  });

  it('shuffle deals a full fresh tray in endless and keeps the count in adventure', () => {
    const board = emptyBoard();
    expect(shuffleTray(board, [dot, null, null], seededRng(1), false).filter(Boolean)).toHaveLength(3);
    expect(shuffleTray(board, [null, dot, bar(2)], seededRng(1), true).filter(Boolean)).toHaveLength(2);
  });

  it('counts possible placements for the danger warning', () => {
    const board = emptyBoard().fill(1);
    board[0] = 0;
    board[1] = 0;
    expect(countPlacements(board, [dot, bar(2), bar(3)])).toBe(3);
    expect(countPlacements(emptyBoard(), [dot, null, null], 5)).toBe(5);
  });
});

describe('daily challenge', () => {
  it('is the same puzzle all day and differs between days', () => {
    const a = generateDaily('2026-10-10');
    expect(packLevel(a)).toEqual(packLevel(generateDaily('2026-10-10')));
    expect(packLevel(a)).not.toEqual(packLevel(generateDaily('2026-10-11')));
    expect(dailyLevel('2026-10-10')).toBe(dailyLevel('2026-10-10'));
  });

  it('is always solvable and has two goals', () => {
    for (let d = 1; d <= 14; d++) {
      const def = generateDaily(`2026-11-${String(d).padStart(2, '0')}`);
      expect(def.goals).toHaveLength(2);
      expect(botSolve(def).solved).toBe(true);
    }
  });

  it('streak grows on consecutive days, resets after a gap, pays once a day', () => {
    let s = loadDaily(null);
    let r = completeDaily(s, '2026-10-10', '2026-10-09');
    expect(r.reward).toBe(dailyReward(1));
    s = r.state;
    expect(completeDaily(s, '2026-10-10', '2026-10-09').reward).toBe(0);
    s = completeDaily(s, '2026-10-11', '2026-10-10').state;
    expect(s.streak).toBe(2);
    expect(liveStreak(s, '2026-10-12', '2026-10-11')).toBe(2);
    expect(liveStreak(s, '2026-10-14', '2026-10-13')).toBe(0);
    r = completeDaily(s, '2026-10-14', '2026-10-13');
    expect(r.state.streak).toBe(1);
    expect(r.state.bestStreak).toBe(2);
  });
});
