import { describe, expect, it } from 'vitest';
import {
  LEVEL_COUNT,
  canPlace,
  emptyPlacement,
  generateLevel,
  hintStep,
  isMirrorTrivial,
  isSolved,
  occupants,
  paramsFor,
  pickup,
  place,
  solve,
  stars,
  torque,
  type Level,
} from './game';

const lvl = (o: Partial<Level>): Level => ({ n: 3, stack: false, blocked: [], fixed: [], tray: [], solution: [], ...o });

describe('torque', () => {
  it('sums weight × distance of fixed and placed weights', () => {
    const L = lvl({ fixed: [{ d: -2, w: 3 }], tray: [2, 5] });
    expect(torque(L, [null, null])).toBe(-6);
    expect(torque(L, [3, null])).toBe(0);
    expect(torque(L, [3, 1])).toBe(5);
  });

  it('is solved only when every weight hangs and torque is zero', () => {
    const L = lvl({ tray: [2, 1] });
    expect(isSolved(L, [null, null])).toBe(false);
    expect(isSolved(L, [-1, null])).toBe(false);
    expect(isSolved(L, [-1, 2])).toBe(true);
    expect(isSolved(L, [-1, 1])).toBe(false);
  });
});

describe('placement rules', () => {
  const L = lvl({ blocked: [2], fixed: [{ d: -3, w: 1 }], tray: [1, 2, 3] });
  it('rejects pivot, out-of-range, blocked and occupied pegs', () => {
    const pos = emptyPlacement(L);
    expect(canPlace(L, pos, 0, 0)).toBe(false);
    expect(canPlace(L, pos, 0, 4)).toBe(false);
    expect(canPlace(L, pos, 0, 2)).toBe(false);
    expect(canPlace(L, pos, 0, -3)).toBe(false);
    expect(canPlace(L, pos, 0, 1)).toBe(true);
    const p1 = place(L, pos, 0, 1)!;
    expect(canPlace(L, p1, 1, 1)).toBe(false);
    expect(canPlace(L, p1, 0, 3)).toBe(false); // already placed
  });

  it('pickup returns a weight to the tray', () => {
    const p = place(L, emptyPlacement(L), 1, -1)!;
    expect(pickup(p, 1)).toEqual([null, null, null]);
    expect(pickup(p, 0)).toBeNull();
  });
});

describe('stacking', () => {
  const L = lvl({ stack: true, blocked: [-1], fixed: [{ d: 2, w: 2 }], tray: [1, 1, 4] });
  it('lets weights share a peg and add up', () => {
    let pos = place(L, emptyPlacement(L), 0, 2)!;
    pos = place(L, pos, 1, 2)!;
    expect(occupants(L, pos, 2)).toBe(3);
    expect(torque(L, pos)).toBe(8);
    pos = place(L, pos, 2, -2)!;
    expect(isSolved(L, pos)).toBe(true);
  });
  it('still blocks blocked pegs', () => {
    expect(canPlace(L, emptyPlacement(L), 0, -1)).toBe(false);
  });
});

describe('solver and hints', () => {
  it('finds a balancing placement and reports impossible ones', () => {
    const L = lvl({ tray: [3, 1, 2] });
    const s = solve(L, emptyPlacement(L))!;
    expect(isSolved(L, s)).toBe(true);
    expect(solve(lvl({ tray: [9, 1] }), [null, null])).toBeNull();
  });

  it('hint places a weight consistent with a solution and clears blockers', () => {
    const L = generateLevel(12);
    const wrong = emptyPlacement(L);
    // Put weight 0 somewhere that cannot be completed, if possible.
    const locked = L.tray.map(() => false);
    const h = hintStep(L, wrong, locked)!;
    expect(h).not.toBeNull();
    let pos = wrong.slice();
    for (const k of h.clear) pos[k] = null;
    pos[h.i] = null;
    pos = place(L, pos, h.i, h.d)!;
    expect(solve(L, pos)).not.toBeNull();
  });
});

describe('levels', () => {
  const levels = Array.from({ length: LEVEL_COUNT }, (_, i) => generateLevel(i + 1));

  it('every level is solvable by its construction and by the solver', () => {
    levels.forEach((L, i) => {
      let pos = emptyPlacement(L);
      L.solution.forEach((d, k) => {
        const next = place(L, pos, k, d);
        expect(next, `level ${i + 1} weight ${k}`).not.toBeNull();
        pos = next!;
      });
      expect(isSolved(L, pos), `level ${i + 1}`).toBe(true);
      expect(isSolved(L, emptyPlacement(L))).toBe(false);
      expect(solve(L, emptyPlacement(L)), `solver level ${i + 1}`).not.toBeNull();
      for (const w of [...L.tray, ...L.fixed.map((f) => f.w)]) expect(w >= 1 && w <= 9).toBe(true);
    });
  });

  it('is deterministic', () => {
    expect(generateLevel(42)).toEqual(generateLevel(42));
    expect(generateLevel(42)).not.toEqual(generateLevel(43));
  });

  it('ramps gently and adds stacking + blocked pegs from level 30', () => {
    expect(levels[0].n).toBe(3);
    expect(levels[0].tray.length).toBe(2);
    expect(levels[149].n).toBe(6);
    expect(levels.slice(0, 29).every((L) => !L.stack && !L.blocked.length)).toBe(true);
    expect(levels.slice(29).every((L) => L.stack && L.blocked.length > 0)).toBe(true);
    expect(paramsFor(150).count).toBeGreaterThanOrEqual(paramsFor(1).count);
  });

  it('rarely allows the obvious mirror solution', () => {
    const trivial = levels.filter(isMirrorTrivial).length;
    expect(trivial / levels.length).toBeLessThanOrEqual(0.05);
  });
});

describe('stars', () => {
  it('rates moves against par', () => {
    expect(stars(4, 4)).toBe(3);
    expect(stars(6, 4)).toBe(2);
    expect(stars(9, 4)).toBe(1);
  });
});
