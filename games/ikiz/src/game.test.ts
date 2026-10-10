import { describe, expect, it } from 'vitest';
import { LEVEL_COUNT, generateLevel, initialState, mirror, solve, starsFor, step, type Level } from './game';

const tiny = (left: string, right: string, w: number): Level => {
  const mk = (s: string) => {
    const cells = s.split('');
    const start = cells.indexOf('S');
    const goal = cells.indexOf('G');
    cells[start] = '.';
    cells[goal] = '.';
    return { cells, start, goal };
  };
  return { n: 0, w, h: left.length / w, boards: [mk(left), mk(right)], par: 0 };
};

describe('ikiz rules', () => {
  it('mirrors left/right only', () => {
    expect(mirror('L')).toBe('R');
    expect(mirror('R')).toBe('L');
    expect(mirror('U')).toBe('U');
  });

  it('moves twins mirrored; blocked twin stays put', () => {
    const lv = tiny('S.G' + '...', 'G.S' + '...', 3);
    let r = step(lv, initialState(lv), 'R');
    expect(r.state.pos).toEqual([1, 1]);
    r = step(lv, r.state, 'R');
    expect(r.won).toBe(true);
    const walled = tiny('S#G', 'G.S', 3);
    const r2 = step(walled, initialState(walled), 'R');
    expect(r2.moved).toEqual([false, true]);
  });

  it('spikes kill, keys open doors', () => {
    const spiky = tiny('S^G', 'G.S', 3);
    expect(step(spiky, initialState(spiky), 'R').dead).toBe(true);
    const door = tiny('kSdG', 'G..S', 4);
    let s = initialState(door);
    expect(step(door, s, 'R').moved[0]).toBe(false);
    s = step(door, s, 'L').state;
    expect(s.keys[0]).toBe(true);
    expect(solve(door, s)).not.toBeNull();
  });

  it('stars by moves vs par', () => {
    expect(starsFor(6, 6)).toBe(3);
    expect(starsFor(9, 6)).toBe(2);
    expect(starsFor(10, 6)).toBe(1);
  });
});

describe('generator', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(generateLevel(7))).toBe(JSON.stringify(generateLevel(7)));
  });

  it(`all ${LEVEL_COUNT} levels solvable with par >= 4 matching BFS`, () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const lv = generateLevel(n);
      const path = solve(lv)!;
      expect(path).not.toBeNull();
      expect(path.length).toBe(lv.par);
      expect(lv.par).toBeGreaterThanOrEqual(4);
      let s = initialState(lv);
      let won = false;
      for (const d of path) {
        const r = step(lv, s, d);
        expect(r.dead).toBe(false);
        s = r.state;
        won = r.won;
      }
      expect(won).toBe(true);
    }
  });

  it('introduces spikes and keys later', () => {
    expect(generateLevel(5).boards.some((b) => b.cells.includes('^'))).toBe(false);
    expect([30, 31].some((n) => generateLevel(n).boards.some((b) => b.cells.includes('^')))).toBe(true);
    expect([62, 64, 65].some((n) => generateLevel(n).boards.some((b) => b.cells.includes('d')))).toBe(true);
  });
});
