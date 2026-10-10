import { describe, expect, it } from 'vitest';
import {
  CASTLE,
  COLS,
  CONTINUE_BUCKETS,
  N,
  PERFECT_BONUS,
  ROCK,
  ROWS,
  SAND,
  SEA,
  START_BUCKETS,
  WALL_HP,
  castleCells,
  castlesLeft,
  continueGame,
  flood,
  greedyDefend,
  incomeFor,
  isOver,
  newGame,
  reachFor,
  runWave,
  threatened,
  toggleWall,
  type GameState,
} from './game';

/** Builds a state from an ASCII beach: ~ sea, . sand, # rock, C castle, W wall. */
function beach(rows: string[], extra: Partial<GameState> = {}): GameState {
  const lines = [...rows];
  while (lines.length < ROWS) lines.push('.'.repeat(COLS));
  const terrain: number[] = [];
  const walls: number[] = [];
  for (const line of lines) {
    for (const ch of line.padEnd(COLS, '.')) {
      terrain.push(ch === '~' ? SEA : ch === '#' ? ROCK : ch === 'C' ? CASTLE : SAND);
      walls.push(ch === 'W' ? WALL_HP : 0);
    }
  }
  return {
    seed: 0,
    terrain,
    walls,
    fresh: [],
    buckets: 5,
    round: 1,
    reach: 3,
    score: 0,
    lastLost: [],
    continued: false,
    ...extra,
  };
}
const at = (r: number, c: number) => r * COLS + c;

describe('flood', () => {
  it('spreads from the sea exactly up to the reach', () => {
    const s = beach(['~~~~~~~~~']);
    const d = flood(s.terrain, s.walls, 3);
    expect(d[at(0, 4)]).toBe(0);
    expect(d[at(1, 4)]).toBe(1);
    expect(d[at(3, 4)]).toBe(3);
    expect(d[at(4, 4)]).toBe(-1);
  });

  it('is blocked by walls and rocks and has to go around them', () => {
    const s = beach(['~~~~~~~~~', '###WWW###', '.........']);
    const d = flood(s.terrain, s.walls, 20);
    expect(d[at(1, 4)]).toBe(-1); // wall
    expect(d[at(1, 0)]).toBe(-1); // rock
    expect(d[at(2, 4)]).toBe(-1); // sealed off completely
    const gap = beach(['~~~~~~~~~', 'WWWWWWWW.', '.........']);
    const g = flood(gap.terrain, gap.walls, 20);
    expect(g[at(1, 8)]).toBe(1);
    expect(g[at(2, 0)]).toBe(10); // long detour through the gap
  });

  it('a detour longer than the reach saves a castle (the preview rule)', () => {
    const s = beach(['~~~~~~~~~', '.........', '....C....'], { reach: 3 });
    expect(threatened(s)).toEqual([at(2, 4)]);
    let t = s;
    for (const c of [3, 4, 5]) t = toggleWall(t, at(1, c))!;
    expect(threatened(t)).toEqual([]); // shortest path now 4 steps
  });
});

describe('build phase', () => {
  it('costs a bucket per wall and refunds fresh walls', () => {
    const s = beach(['~~~~~~~~~'], { buckets: 2 });
    const a = toggleWall(s, at(3, 3))!;
    expect(a.buckets).toBe(1);
    expect(a.walls[at(3, 3)]).toBe(WALL_HP);
    const b = toggleWall(a, at(3, 4))!;
    expect(b.buckets).toBe(0);
    expect(toggleWall(b, at(3, 5))).toBeNull(); // out of buckets
    const c = toggleWall(b, at(3, 3))!;
    expect(c.buckets).toBe(1);
    expect(c.walls[at(3, 3)]).toBe(0);
  });

  it('cannot build on sea, rock, castle, or an old wall', () => {
    const s = beach(['~~~~~~~~~', '#C.W.....']);
    expect(toggleWall(s, at(0, 0))).toBeNull();
    expect(toggleWall(s, at(1, 0))).toBeNull();
    expect(toggleWall(s, at(1, 1))).toBeNull();
    expect(toggleWall(s, at(1, 3))).toBeNull(); // not placed this phase: no refund
  });
});

describe('wave', () => {
  it('washes reached castles, erodes walls touching water and scores survivors', () => {
    const s = beach(['~~~~~~~~~', '.C.......', '.........', 'WWWWWWWWW', '....C....'], { reach: 3, score: 4 });
    const res = runWave(s);
    expect(res.washed).toEqual([at(1, 1)]);
    expect(res.state.terrain[at(1, 1)]).toBe(SAND);
    expect(res.state.walls[at(3, 0)]).toBe(WALL_HP - 1); // touched by water at row 2
    expect(res.broken).toEqual([]);
    expect(res.gained).toBe(1);
    expect(res.perfect).toBe(false);
    expect(res.state.score).toBe(5);
    expect(res.state.lastLost).toEqual([at(1, 1)]);
  });

  it('walls collapse after WALL_HP touching waves; untouched walls stay intact', () => {
    let s = beach(['~~~~~~~~~', 'WWWWWWWWW', '.........', '.........', '........W', '....C....'], { reach: 2 });
    s = runWave(s).state;
    expect(s.walls[at(1, 0)]).toBe(1);
    expect(s.walls[at(4, 8)]).toBe(WALL_HP);
    const res = runWave({ ...s, reach: 2 });
    expect(res.broken.length).toBe(COLS);
    expect(res.state.walls[at(1, 4)]).toBe(0);
  });

  it('a perfect round earns the bonus; reach and buckets grow per round', () => {
    const s = beach(['~~~~~~~~~', '.........', '.........', '.........', '.........', '....C....', '.C.....C.'], { reach: 3, buckets: 1 });
    const res = runWave(s);
    expect(res.perfect).toBe(true);
    expect(res.gained).toBe(3 + PERFECT_BONUS);
    expect(res.state.round).toBe(2);
    expect(res.state.reach).toBe(reachFor(2));
    expect(reachFor(2)).toBe(reachFor(1) + 1);
    expect(res.state.buckets).toBe(1 + incomeFor(1));
    expect(res.state.fresh).toEqual([]);
  });

  it('income shrinks slowly but never stops', () => {
    for (let r = 1; r < 30; r++) {
      expect(incomeFor(r + 1)).toBeLessThanOrEqual(incomeFor(r));
      expect(incomeFor(r)).toBeGreaterThanOrEqual(1);
    }
  });

  it('game over when the last castle is washed; continue restores it with extra buckets', () => {
    const s = beach(['~~~~~~~~~', '....C....'], { buckets: 0 });
    const res = runWave(s);
    expect(isOver(res.state)).toBe(true);
    const c = continueGame(res.state);
    expect(castlesLeft(c)).toBe(1);
    expect(c.terrain[at(1, 4)]).toBe(CASTLE);
    expect(c.buckets).toBe(res.state.buckets + CONTINUE_BUCKETS);
    expect(c.continued).toBe(true);
  });
});

describe('generated beaches', () => {
  it('are deterministic per seed and differ between seeds', () => {
    expect(newGame(42)).toEqual(newGame(42));
    expect(newGame(42).terrain).not.toEqual(newGame(43).terrain);
  });

  it('have sea on top, castles on sand, and a threatened but defensible first round (50 seeds)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = newGame(seed * 7919);
      expect(s.terrain.length).toBe(N);
      expect(s.buckets).toBe(START_BUCKETS);
      for (let c = 0; c < COLS; c++) expect(s.terrain[c]).toBe(SEA);
      expect(castleCells(s.terrain).length).toBe(3);
      expect(threatened(s).length).toBeGreaterThan(0);
      // Defensible: a concrete wall plan within the budget keeps every castle dry.
      let t = s;
      for (const w of greedyDefend(s)) t = toggleWall(t, w)!;
      expect(t.buckets).toBeGreaterThanOrEqual(0);
      expect(threatened(t)).toEqual([]);
      const res = runWave(t);
      expect(res.washed).toEqual([]);
      expect(res.perfect).toBe(true);
    }
  });

  it('doing nothing loses quickly, defending survives longer (20 seeds)', () => {
    let idle = 0;
    let greedy = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let s = newGame(seed);
      while (!isOver(s)) {
        s = runWave(s).state;
        idle++;
      }
      let g = newGame(seed);
      for (let r = 0; r < 30 && !isOver(g); r++) {
        for (const w of greedyDefend(g)) g = toggleWall(g, w)!;
        g = runWave(g).state;
        greedy++;
      }
    }
    expect(idle / 20).toBeLessThan(5);
    expect(greedy / 20).toBeGreaterThan(6);
  });
});
