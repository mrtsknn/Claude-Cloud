import { describe, expect, it } from 'vitest';
import {
  LEVEL_COUNT,
  PATTERN_ORDER,
  STREET,
  WALL,
  WINDOW,
  applyHint,
  canPlace,
  coverage,
  evaluate,
  generateLevel,
  hintMove,
  introLevel,
  levelParams,
  patternCells,
  starsFor,
  type Cell,
  type Level,
  type Placement,
} from './game';

// 5x5 hand-made level: one plus lamp at the centre lights the four windows around it.
//   . . . . .
//   . . W . .
//   . W . W .
//   . . W . #
//   . . . . .
const S = STREET, Wn = WINDOW, T = WALL;
const tiny: Level = {
  level: 0,
  size: 5,
  cells: [
    S, S, S, S, S,
    S, S, Wn, S, S,
    S, Wn, S, Wn, S,
    S, S, Wn, S, T,
    S, S, S, S, S,
  ] as Cell[],
  tray: ['plus'],
  solution: [{ r: 2, c: 2 }],
};

describe('patterns and coverage', () => {
  it('clips patterns at the board edge', () => {
    expect(patternCells(5, 'plus', 0, 0).sort((a, b) => a - b)).toEqual([1, 5]);
    expect(patternCells(5, 'hbar', 2, 2)).toHaveLength(4);
    expect(patternCells(5, 'vbar', 0, 4)).toEqual([9, 14]);
    expect(patternCells(5, 'diag', 4, 4)).toEqual([18]);
  });

  it('counts only windows, ignoring streets, trees and off-board cells', () => {
    const counts = coverage(5, tiny.cells, [{ type: 'diag', r: 2, c: 3 }, { type: 'plus', r: 3, c: 3 }]);
    // diag at (2,3) touches (1,2) window, (1,4) street, (3,2) window, (3,4) tree
    expect(counts[7]).toBe(1);
    expect(counts[17]).toBe(2); // also lit by the plus at (3,3)
    expect(counts[19]).toBe(0); // tree
    expect(counts[13]).toBe(1); // window (2,3) from plus above it
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
  });
});

describe('evaluation', () => {
  it('solves when every window is lit exactly once and all lamps are used', () => {
    expect(evaluate(tiny, [null]).solved).toBe(false);
    expect(evaluate(tiny, [null]).dark).toBe(4);
    const ev = evaluate(tiny, [{ r: 2, c: 2 }]);
    expect(ev).toMatchObject({ lit: 4, dark: 0, double: [], solved: true, allPlaced: true });
  });

  it('flags windows lit twice as too bright', () => {
    const two: Level = { ...tiny, tray: ['plus', 'diag'], solution: [{ r: 2, c: 2 }, { r: 0, c: 0 }] };
    const ev = evaluate(two, [{ r: 2, c: 2 }, { r: 2, c: 3 }]);
    expect(ev.double.sort((a, b) => a - b)).toEqual([7, 17]);
    expect(ev.solved).toBe(false);
  });

  it('is not solved while a lamp is still in the tray, even if all windows glow', () => {
    const extra: Level = { ...tiny, tray: ['plus', 'plus'], solution: [{ r: 2, c: 2 }, { r: 4, c: 0 }] };
    expect(evaluate(extra, [{ r: 2, c: 2 }, null]).solved).toBe(false);
  });
});

describe('placement rules', () => {
  it('only allows free street cells on the board', () => {
    const p: Placement = [null];
    expect(canPlace(tiny, p, 0, 2, 2)).toBe(true);
    expect(canPlace(tiny, p, 0, 1, 2)).toBe(false); // window
    expect(canPlace(tiny, p, 0, 3, 4)).toBe(false); // tree
    expect(canPlace(tiny, p, 0, -1, 0)).toBe(false);
    expect(canPlace(tiny, p, 0, 5, 0)).toBe(false);
    const two: Level = { ...tiny, tray: ['plus', 'plus'], solution: [{ r: 2, c: 2 }, { r: 0, c: 0 }] };
    expect(canPlace(two, [{ r: 0, c: 0 }, null], 1, 0, 0)).toBe(false); // occupied by lamp 0
    expect(canPlace(two, [{ r: 0, c: 0 }, null], 0, 0, 0)).toBe(true); // its own cell
  });
});

describe('hints', () => {
  it('places lamps from the solution and finishes the level', () => {
    const lvl = generateLevel(40);
    let p: Placement = lvl.tray.map(() => null);
    const locked = lvl.tray.map(() => false);
    for (let n = 0; n < lvl.tray.length; n++) {
      const m = hintMove(lvl, p, locked)!;
      p = applyHint(p, m);
      locked[m.idx] = true;
    }
    expect(evaluate(lvl, p).solved).toBe(true);
    expect(hintMove(lvl, p, locked)).toBeNull();
  });

  it('evicts a wrong lamp standing on the hinted cell and reuses misplaced lamps', () => {
    const lvl = generateLevel(25);
    // put every lamp on a wrong street cell, one of them on solution[0]'s cell
    const free: { r: number; c: number }[] = [];
    lvl.cells.forEach((cell, i) => {
      const r = Math.floor(i / lvl.size), c = i % lvl.size;
      if (cell === STREET && !lvl.solution.some((s) => s.r === r && s.c === c)) free.push({ r, c });
    });
    const p: Placement = lvl.tray.map((_, i) => free[i]);
    const other = lvl.tray.findIndex((t) => t !== lvl.tray[0]);
    p[other] = { ...lvl.solution[0] };
    const m = hintMove(lvl, p, lvl.tray.map(() => false))!;
    expect(lvl.tray[m.idx]).toBe(lvl.tray[0]);
    expect(m.pos).toEqual(lvl.solution[0]);
    expect(m.evict).toEqual([other]);
  });
});

describe('level generation', () => {
  it('is deterministic per level', () => {
    expect(generateLevel(17)).toEqual(generateLevel(17));
    expect(JSON.stringify(generateLevel(17))).not.toEqual(JSON.stringify(generateLevel(18)));
  });

  it('ramps grid size and lamp count gently', () => {
    expect(levelParams(1)).toMatchObject({ size: 6, lamps: 2, patterns: ['plus'] });
    expect(levelParams(LEVEL_COUNT)).toMatchObject({ size: 9, lamps: 9 });
    for (let l = 2; l <= LEVEL_COUNT; l++) {
      const a = levelParams(l - 1), b = levelParams(l);
      expect(b.size).toBeGreaterThanOrEqual(a.size);
      expect(b.lamps).toBeGreaterThanOrEqual(a.lamps);
      expect(b.patterns.length).toBeGreaterThanOrEqual(a.patterns.length);
    }
  });

  it('introduces each pattern on its own level', () => {
    for (const p of PATTERN_ORDER) expect(generateLevel(introLevel(p)).tray).toContain(p);
  });

  it(`all ${LEVEL_COUNT} levels are exact covers with a matching tray`, () => {
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      const lvl = generateLevel(l);
      const params = levelParams(l);
      expect(lvl.size).toBe(params.size);
      expect(lvl.cells).toHaveLength(params.size * params.size);
      expect(lvl.tray).toHaveLength(params.lamps);
      expect(lvl.solution).toHaveLength(params.lamps);
      for (const t of lvl.tray) expect(params.patterns).toContain(t);
      // solution spots are distinct street cells
      const spots = new Set(lvl.solution.map((s) => s.r * lvl.size + s.c));
      expect(spots.size).toBe(params.lamps);
      for (const i of spots) expect(lvl.cells[i]).toBe(STREET);
      // placing the tray at the solution lights every window exactly once
      const p: Placement = lvl.solution.map((s) => ({ ...s }));
      p.forEach((pos, i) => expect(canPlace(lvl, p, i, pos!.r, pos!.c)).toBe(true));
      const ev = evaluate(lvl, p);
      expect(ev.solved, `level ${l}`).toBe(true);
      expect(ev.windows).toBeGreaterThanOrEqual(params.lamps * 3);
      // every lamp lights at least 3 windows; nothing is solved at the start
      lvl.tray.forEach((t, i) => {
        const lit = patternCells(lvl.size, t, lvl.solution[i].r, lvl.solution[i].c).filter((k) => lvl.cells[k] === WINDOW);
        expect(lit.length).toBeGreaterThanOrEqual(3);
      });
      expect(evaluate(lvl, lvl.tray.map(() => null)).solved).toBe(false);
      if (!params.walls) expect(lvl.cells).not.toContain(WALL);
    }
  }, 60_000); // generates all 200 levels: give it room when the whole repo tests in parallel
});

describe('stars', () => {
  it('rewards clean solves', () => {
    expect(starsFor(0, 0)).toBe(3);
    expect(starsFor(0, 3)).toBe(3);
    expect(starsFor(0, 4)).toBe(2);
    expect(starsFor(1, 0)).toBe(2);
    expect(starsFor(2, 0)).toBe(1);
  });
});
