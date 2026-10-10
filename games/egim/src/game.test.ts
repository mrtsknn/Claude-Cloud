import { describe, expect, it } from 'vitest';
import { CUP, FLOOR, PIT, WALL, generateLevel, keyOf, paramsFor, solve, starsFor, tilt, type Dir, type Marble } from './game';

// 5x3 corridor: walls around, row 1 is open.
const corridor = (mid: number[]) => {
  const w = 5 + mid.length;
  const cells = Array(w * 3).fill(WALL);
  for (let x = 1; x < w - 1; x++) cells[w + x] = mid[x - 1] ?? FLOOR;
  return { w, h: 3, cells };
};

describe('tilt', () => {
  it('rolls marbles until a wall, front marble first', () => {
    const lv = corridor([FLOOR, FLOOR, FLOOR, FLOOR]); // w=9, inner x 1..7
    const ms: Marble[] = [{ p: 9 + 1, c: 0 }, { p: 9 + 3, c: 1 }];
    const r = tilt(lv, ms, 1);
    expect(r.marbles.map((m) => m.p % 9).sort()).toEqual([6, 7]);
    expect(r.changed).toBe(true);
    expect(tilt(lv, r.marbles, 1).changed).toBe(false);
  });

  it('sinks into matching cup, rolls past other colours, loses in pits', () => {
    const lv = corridor([FLOOR, CUP + 1, FLOOR, FLOOR]);
    expect(tilt(lv, [{ p: 10, c: 0 }], 1).marbles[0].p).toBe(16); // rolls past cup of colour 1
    const s = tilt(lv, [{ p: 10, c: 1 }], 1);
    expect(s.sunk).toBe(1);
    expect(s.marbles).toHaveLength(0);
    const pit = corridor([FLOOR, PIT]);
    expect(tilt(pit, [{ p: 8, c: 0 }], 1).lost).toBe(1);
  });

  it('a sunk marble frees the way for the marble behind it', () => {
    const lv = corridor([FLOOR, FLOOR, CUP + 0, FLOOR]);
    const r = tilt(lv, [{ p: 10, c: 0 }, { p: 11, c: 0 }], 1);
    expect(r.sunk).toBe(2);
  });
});

describe('solve + generator', () => {
  it('finds the shortest solution', () => {
    const lv = corridor([FLOOR, FLOOR, CUP + 0]);
    expect(solve(lv, [{ p: 9, c: 0 }])).toEqual([1]);
  });

  it('levels are deterministic, solvable and non-trivial', () => {
    for (const n of [1, 2, 5, 12, 25, 40, 60, 90, 120, 150]) {
      const a = generateLevel(n);
      expect(keyOf(a.marbles)).toBe(keyOf(generateLevel(n).marbles));
      expect(a.par).toBeGreaterThanOrEqual(3);
      expect(new Set(a.marbles.map((m) => m.c)).size).toBe(paramsFor(n).colors);
      // replay the BFS solution
      let ms = a.marbles;
      for (const d of a.solution as Dir[]) {
        const r = tilt(a, ms, d);
        expect(r.lost).toBe(0);
        ms = r.marbles;
      }
      expect(ms).toHaveLength(0);
    }
  });

  it('ramps: pits and 4 colours appear later', () => {
    expect(paramsFor(1).colors).toBe(1);
    expect(paramsFor(150).colors).toBe(4);
    expect(generateLevel(1).cells.includes(PIT)).toBe(false);
    expect(generateLevel(120).cells.includes(PIT)).toBe(true);
  });

  it('stars by tilts vs par', () => {
    expect(starsFor(5, 5)).toBe(3);
    expect(starsFor(7, 5)).toBe(2);
    expect(starsFor(20, 5)).toBe(1);
  });
});
