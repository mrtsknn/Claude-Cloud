import { describe, expect, it } from 'vitest';
import { LEVEL_COUNT, generateLevel, initialState, slide, solve, starsFor, type Level } from './game';

const L = (rows: string[], start: number, igloo: number, fish: number[]): Level => ({
  n: 0,
  w: rows[0].length,
  h: rows.length,
  tiles: rows.join('').split(''),
  start,
  igloo,
  fish,
  par: 0,
});

describe('slide rules', () => {
  it('slides until rock or edge, collecting fish on the way', () => {
    const l = L(['.....', '..#..'], 0, 9, [2]);
    const r = slide(l, initialState(l), 1)!;
    expect(r.state.pos).toBe(4);
    expect(r.path).toEqual([1, 2, 3, 4]);
    expect(r.collected).toEqual([0]);
    expect(slide(l, initialState(l), 0)).toBeNull(); // edge right away
  });
  it('snow stops on it, rock stops before it', () => {
    const l = L(['..*..', '.....', '..#..'], 0, 14, []);
    expect(slide(l, initialState(l), 1)!.state.pos).toBe(2);
    const s = { pos: 7, got: 0, broken: 0 };
    expect(slide(l, s, 2)).toBeNull();
  });
  it('igloo stops and wins only with all fish', () => {
    const l = L(['....'], 0, 3, [1]);
    expect(slide(l, initialState(l), 1)!.won).toBe(true);
    const l2 = L(['....', '....'], 0, 3, [5]);
    const r = slide(l2, initialState(l2), 1)!;
    expect(r.state.pos).toBe(3);
    expect(r.won).toBe(false);
  });
  it('cracked ice breaks after leaving it; water makes you fall', () => {
    const l = L(['.x.#', '~...'], 0, 7, []);
    const a = slide(l, initialState(l), 1)!; // 0 -> 2, passes cracked at 1
    expect(a.state.pos).toBe(2);
    expect(a.state.broken).toBe(1);
    const back = slide(l, a.state, 3)!;
    expect(back.fell).toBe(true);
    const down = slide(l, initialState(l), 2)!;
    expect(down.fell).toBe(true);
  });
  it('arrows redirect and portals teleport', () => {
    const arrow = L(['..v', '...', '...'], 0, 4, []);
    expect(slide(arrow, initialState(arrow), 1)!.state.pos).toBe(8);
    const portal = L(['.1...', '#####', '...1.'], 0, 14, []);
    const r = slide(portal, initialState(portal), 1)!;
    expect(r.state.pos).toBe(14);
    expect(r.won).toBe(true);
  });
});

describe('solver', () => {
  it('finds the shortest route', () => {
    const l = L(['....', '#...', '....'], 0, 11, []);
    // 0 → right (3) → down (11)
    expect(solve(l, initialState(l))).toEqual([1, 2]);
  });
});

describe('generator', () => {
  it(`builds ${LEVEL_COUNT} deterministic, solvable levels with par >= 3`, () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const l = generateLevel(n);
      const sol = solve(l, initialState(l))!;
      expect(sol, `level ${n}`).not.toBeNull();
      expect(sol.length).toBe(l.par);
      expect(l.par).toBeGreaterThanOrEqual(3);
      // replaying the solution wins
      let s = initialState(l);
      let won = false;
      for (const d of sol) {
        const r = slide(l, s, d)!;
        s = r.state;
        won = r.won;
      }
      expect(won).toBe(true);
    }
    expect(generateLevel(42).tiles.join('')).toBe(generateLevel(42).tiles.join(''));
  }, 120_000);
  it('introduces mechanics over time', () => {
    const has = (n: number, ch: string) => generateLevel(n).tiles.some((t) => ch.includes(t));
    expect(has(3, 'x~^>v<12')).toBe(false);
    expect(has(130, '1')).toBe(true);
  });
});

it('stars by swipes vs par', () => {
  expect(starsFor(5, 5)).toBe(3);
  expect(starsFor(7, 5)).toBe(2);
  expect(starsFor(12, 5)).toBe(1);
});
