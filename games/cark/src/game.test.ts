import { describe, expect, it } from 'vitest';
import { LEVEL_COUNT, evaluate, generateLevel, isFreePeg, solve, starsFor } from './game';

// 5 columns x 4 rows; cell = r * 5 + c
const board = { cols: 5, rows: 4, motor: 0, clocks: [{ cell: 3, dir: -1 as const }], rocks: [], belts: [] as [number, number][] };

describe('parity propagation', () => {
  it('meshed gears alternate direction from the clockwise motor', () => {
    const ev = evaluate(board, [1, 2]);
    expect(ev.dir.get(0)).toBe(1);
    expect(ev.dir.get(1)).toBe(-1);
    expect(ev.dir.get(2)).toBe(1);
    expect(ev.dir.get(3)).toBe(-1);
    expect(ev.jammed.size).toBe(0);
  });

  it('unconnected gears stay idle', () => {
    const ev = evaluate(board, [2, 12]);
    expect(ev.dir.has(2)).toBe(false);
    expect(ev.dir.has(12)).toBe(false);
  });

  it('belt pulleys turn the same way', () => {
    const lv = { ...board, belts: [[1, 8]] as [number, number][] };
    const ev = evaluate(lv, []);
    expect(ev.dir.get(1)).toBe(-1);
    expect(ev.dir.get(8)).toBe(-1);
  });
});

describe('jams', () => {
  it('a loop with an odd number of flips jams the whole group', () => {
    // pulleys 1 and 8 (opposite parity) share a belt; gears 2, 3 close the loop the wrong way
    const lv = { ...board, clocks: [], belts: [[1, 8]] as [number, number][] };
    const ev = evaluate(lv, [2, 3]);
    expect(ev.jammed.has(0)).toBe(true);
    expect(ev.jammed.has(2)).toBe(true);
    expect(ev.dir.size).toBe(0);
  });

  it('even square loops never jam', () => {
    const ev = evaluate(board, [1, 5, 6]);
    expect(ev.jammed.size).toBe(0);
  });

  it('a jam blocks the win even if clocks look right', () => {
    const lv = { ...board, belts: [[11, 18]] as [number, number][] };
    expect(evaluate(lv, [1, 2]).won).toBe(true);
    expect(evaluate(lv, [1, 2, 16, 17]).won).toBe(false); // separate jammed group
  });
});

describe('win check', () => {
  it('needs every clock driven in its direction', () => {
    expect(evaluate(board, [1]).won).toBe(false);
    expect(evaluate(board, [1, 2]).won).toBe(true);
    const wrong = { ...board, clocks: [{ cell: 3, dir: 1 as const }] };
    expect(evaluate(wrong, [1, 2]).clockOk).toEqual([false]);
  });

  it('stars compare gears used with par', () => {
    expect(starsFor(4, 4)).toBe(3);
    expect(starsFor(5, 4)).toBe(2);
    expect(starsFor(7, 4)).toBe(1);
  });

  it('pegs with rocks or fixed parts are not free', () => {
    const lv = { ...board, rocks: [6] };
    expect(isFreePeg(lv, 6, [])).toBe(false);
    expect(isFreePeg(lv, 0, [])).toBe(false);
    expect(isFreePeg(lv, 7, [7])).toBe(false);
    expect(isFreePeg(lv, 7, [])).toBe(true);
  });

  it('solver routes through a belt when the clock needs the other parity', () => {
    const lv = { ...board, clocks: [{ cell: 19, dir: 1 as const }], belts: [[5, 12]] as [number, number][] };
    const s = solve(lv)!;
    expect(s).not.toBeNull();
    expect(evaluate(lv, s).won).toBe(true);
  });
});

describe('levels', () => {
  it(`all ${LEVEL_COUNT} levels are solvable with exactly par gears`, () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const lv = generateLevel(n);
      expect(lv.solution.length, `level ${n}`).toBe(lv.par);
      expect(new Set(lv.solution).size).toBe(lv.par);
      expect(lv.solution.every((c) => isFreePeg(lv, c, []))).toBe(true);
      expect(evaluate(lv, lv.solution).won, `level ${n}`).toBe(true);
      expect(lv.tray).toBeGreaterThanOrEqual(lv.par);
    }
  });

  it('ramps up: bigger boards, more clocks, belts later', () => {
    const first = generateLevel(1);
    const last = generateLevel(LEVEL_COUNT);
    expect([first.cols, first.rows]).toEqual([5, 6]);
    expect([last.cols, last.rows]).toEqual([7, 9]);
    expect(first.belts.length).toBe(0);
    const clocks = Array.from({ length: LEVEL_COUNT }, (_, i) => generateLevel(i + 1).clocks.length);
    expect(Math.max(...clocks)).toBe(3);
  });

  it('is deterministic', () => {
    for (const n of [1, 17, 88, 150]) expect(generateLevel(n)).toEqual(generateLevel(n));
  });
});
