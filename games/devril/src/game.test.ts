import { describe, expect, it } from 'vitest';
import {
  LEVEL_COUNT,
  generateLevel,
  hintFor,
  paramsFor,
  simulate,
  solve,
  starsFor,
  tapsBetween,
  type Dir,
  type Level,
} from './game';

// A 3x3 board, tiles in an L: (0,0) → (1,0) → (2,0) → (2,1)
const L: Pick<Level, 'size' | 'tiles' | 'start'> = {
  size: 3,
  start: 0,
  tiles: [
    { x: 0, y: 0, locked: false },
    { x: 1, y: 0, locked: false },
    { x: 2, y: 0, locked: false },
    { x: 2, y: 1, locked: false },
  ],
};

describe('simulator', () => {
  it('topples the whole chain when each tile points at the next', () => {
    const c = simulate(L, [1, 1, 2, 0]);
    expect(c.order).toEqual([0, 1, 2, 3]);
    expect(c.allFell).toBe(true);
  });

  it('stops at the board edge', () => {
    const c = simulate(L, [0, 1, 2, 0]);
    expect(c.order).toEqual([0]);
    expect(c.end).toBe('edge');
    expect(c.allFell).toBe(false);
  });

  it('stops on an empty cell', () => {
    const c = simulate(L, [1, 2, 2, 0]);
    expect(c.order).toEqual([0, 1]);
    expect(c.end).toBe('empty');
  });

  it('stops on an already fallen tile', () => {
    const c = simulate(L, [1, 3, 2, 0]);
    expect(c.order).toEqual([0, 1]);
    expect(c.end).toBe('fallen');
  });

  it('the last tile may face anywhere', () => {
    for (const d of [0, 1, 2, 3] as Dir[]) expect(simulate(L, [1, 1, 2, d]).allFell).toBe(true);
  });
});

describe('solver', () => {
  it('finds the cheapest clockwise taps', () => {
    expect(tapsBetween(0, 1)).toBe(1);
    expect(tapsBetween(1, 0)).toBe(3);
    const s = solve(L, [0, 1, 2, 3])!;
    expect(s.cost).toBe(1);
    expect(simulate(L, s.dirs).allFell).toBe(true);
    expect(s.path).toEqual([0, 1, 2, 3]);
  });

  it('respects locked tiles', () => {
    const locked = { ...L, tiles: L.tiles.map((t, i) => ({ ...t, locked: i === 1 })) };
    expect(solve(locked, [1, 2, 2, 0])).toBeNull();
    expect(solve(locked, [1, 1, 2, 0])!.cost).toBe(0);
  });

  it('reports impossible boards', () => {
    const split = { size: 3, start: 0, tiles: [{ x: 0, y: 0, locked: false }, { x: 2, y: 2, locked: false }] };
    expect(solve(split, [0, 0])).toBeNull();
  });

  it('matches brute force on small levels', () => {
    let checked = 0;
    for (let lv = 1; lv <= LEVEL_COUNT && checked < 12; lv++) {
      const level = generateLevel(lv);
      const free = level.tiles.map((t, i) => (t.locked ? -1 : i)).filter((i) => i >= 0);
      if (free.length > 8) continue;
      checked++;
      let best = Infinity;
      const dirs = level.scrambled.slice();
      const total = 4 ** free.length;
      for (let m = 0; m < total; m++) {
        let cost = 0;
        let k = m;
        for (const i of free) {
          dirs[i] = ((level.scrambled[i] + (k % 4)) % 4) as Dir;
          cost += k % 4;
          k = Math.floor(k / 4);
        }
        if (cost < best && simulate(level, dirs).allFell) best = cost;
      }
      expect(best).toBe(level.par);
    }
    expect(checked).toBeGreaterThan(3);
  });
});

describe('stars', () => {
  it('rates taps against par', () => {
    expect(starsFor(4, 5)).toBe(3);
    expect(starsFor(5, 5)).toBe(3);
    expect(starsFor(8, 5)).toBe(2);
    expect(starsFor(9, 5)).toBe(1);
  });
});

describe('level generation', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(generateLevel(42))).toBe(JSON.stringify({ ...generateLevel(42) }));
    expect(generateLevel(42).tiles).not.toEqual(generateLevel(43).tiles);
  });

  it('level 1 is a one-tap tutorial', () => {
    const l = generateLevel(1);
    expect(l.size).toBe(4);
    expect(l.tiles).toHaveLength(4);
    expect(l.par).toBe(1);
  });

  it('ramps difficulty gently', () => {
    for (let lv = 2; lv <= LEVEL_COUNT; lv++) {
      const a = paramsFor(lv - 1);
      const b = paramsFor(lv);
      expect(b.size).toBeGreaterThanOrEqual(a.size);
      expect(b.size * b.size).toBeGreaterThan(b.tiles);
    }
    expect(paramsFor(1).locks).toBe(0);
    expect(paramsFor(LEVEL_COUNT).size).toBe(8);
    expect(paramsFor(LEVEL_COUNT).locks).toBeGreaterThan(0);
  });

  it(`every one of the ${LEVEL_COUNT} levels is valid`, () => {
    const seen = new Set<string>();
    for (let lv = 1; lv <= LEVEL_COUNT; lv++) {
      const l = generateLevel(lv);
      const p = paramsFor(lv);
      // fits the grid, no overlaps
      expect(l.size).toBe(p.size);
      expect(l.tiles).toHaveLength(p.tiles);
      const cells = new Set(l.tiles.map((t) => t.y * l.size + t.x));
      expect(cells.size).toBe(l.tiles.length);
      for (const t of l.tiles) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThan(l.size);
        expect(t.y).toBeLessThan(l.size);
      }
      expect(l.tiles.filter((t) => t.locked)).toHaveLength(p.locks);
      expect(l.tiles[l.start].locked).toBe(false);
      // solution topples everything; scrambled state does not
      expect(simulate(l, l.solution).allFell).toBe(true);
      expect(simulate(l, l.scrambled).allFell).toBe(false);
      // locked tiles already correct
      l.tiles.forEach((t, i) => t.locked && expect(l.scrambled[i]).toBe(l.solution[i]));
      // par is the solver's optimum, positive, and no worse than restoring the generated solution
      const restore = l.solution.reduce<number>((s, d, i) => s + tapsBetween(l.scrambled[i], d), 0);
      const lastIdx = simulate(l, l.solution).order.at(-1)!;
      const restoreNoLast = restore - tapsBetween(l.scrambled[lastIdx], l.solution[lastIdx]);
      expect(l.par).toBeGreaterThan(0);
      expect(l.par).toBeLessThanOrEqual(restoreNoLast);
      const s = solve(l, l.scrambled, 2_000_000)!;
      expect(s.cost).toBe(l.par);
      expect(simulate(l, s.dirs).allFell).toBe(true);
      seen.add(JSON.stringify(l.tiles));
    }
    expect(seen.size).toBe(LEVEL_COUNT);
  });

  it('hints point at a wrong tile and following them solves the level', () => {
    for (const lv of [1, 7, 30, 90, 160, 200]) {
      const l = generateLevel(lv);
      let dirs = l.scrambled.slice();
      for (let k = 0; k < l.tiles.length && !simulate(l, dirs).allFell; k++) {
        const h = hintFor(l, dirs)!;
        expect(h).not.toBeNull();
        expect(l.tiles[h.tile].locked).toBe(false);
        expect(dirs[h.tile]).not.toBe(h.dir);
        dirs = dirs.slice();
        dirs[h.tile] = h.dir;
      }
      expect(simulate(l, dirs).allFell).toBe(true);
    }
  });
});
