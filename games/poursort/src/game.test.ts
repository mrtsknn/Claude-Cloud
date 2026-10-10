import { describe, expect, it } from 'vitest';
import {
  CAPACITY,
  canPour,
  colorsForLevel,
  generateLevel,
  hasMoves,
  isSolved,
  pour,
  solve,
  starsFor,
  topRun,
  usefulMoves,
  type Tubes,
} from './game';

describe('pouring', () => {
  it('pours the whole top run when there is room', () => {
    const res = pour([[1, 2, 2], [2], []], 0, 1)!;
    expect(res.amount).toBe(2);
    expect(res.tubes).toEqual([[1], [2, 2, 2], []]);
  });

  it('pours only what fits', () => {
    const res = pour([[3, 3, 3], [1, 3, 3], []], 0, 1)!;
    expect(res.amount).toBe(1);
    expect(res.tubes[0]).toEqual([3, 3]);
    expect(res.tubes[1]).toEqual([1, 3, 3, 3]);
  });

  it('rejects mismatched colors, full targets, empty sources and finished tubes', () => {
    expect(canPour([[1], [2]], 0, 1)).toBe(false);
    expect(canPour([[1], [1, 1, 1, 1]], 0, 1)).toBe(false);
    expect(canPour([[], [1]], 0, 1)).toBe(false);
    expect(canPour([[1, 1, 1, 1], []], 0, 1)).toBe(false);
    expect(canPour([[1], [1]], 0, 0)).toBe(false);
  });

  it('does not count shuffling a uniform tube into an empty one as useful', () => {
    expect(usefulMoves([[1, 1], [], [2]])).toEqual([]);
    expect(hasMoves([[1, 1], [], [2]])).toBe(false);
  });

  it('detects solved boards', () => {
    expect(isSolved([[1, 1, 1, 1], [], [2, 2, 2, 2]])).toBe(true);
    expect(isSolved([[1, 1, 1], [1], [2, 2, 2, 2]])).toBe(false);
  });
});

describe('solver', () => {
  it('solves a small puzzle and the solution really works', () => {
    const start: Tubes = [[1, 2, 1, 2], [2, 1, 2, 1], [], []];
    const moves = solve(start)!;
    expect(moves).not.toBeNull();
    let t = start;
    for (const [a, b] of moves) t = pour(t, a, b)!.tubes;
    expect(isSolved(t)).toBe(true);
  });

  it('reports unsolvable states', () => {
    expect(solve([[1, 2], [2, 1]])).toBeNull();
  });
});

describe('level generation', () => {
  it('is deterministic per level', () => {
    expect(generateLevel(7)).toEqual(generateLevel(7));
    expect(generateLevel(7)).not.toEqual(generateLevel(8));
  });

  it('ramps difficulty up to 12 colors', () => {
    expect(colorsForLevel(1)).toBe(2);
    expect(colorsForLevel(100)).toBe(12);
    for (let l = 2; l < 120; l++) expect(colorsForLevel(l)).toBeGreaterThanOrEqual(colorsForLevel(l - 1));
  });

  it.each([1, 2, 5, 12, 30, 61, 95, 150])('level %i is valid and solvable', (level) => {
    const tubes = generateLevel(level);
    const colors = colorsForLevel(level);
    expect(tubes).toHaveLength(colors + 2);
    const counts = new Map<number, number>();
    for (const t of tubes) for (const c of t) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect(counts.size).toBe(colors);
    for (const n of counts.values()) expect(n).toBe(CAPACITY);
    expect(tubes.every((t) => t.length === 0 || topRun(t) < 3)).toBe(true);
    expect(solve(tubes)).not.toBeNull();
  });
});

describe('stars', () => {
  it('rates by helps used', () => {
    expect(starsFor({ undosUsed: 0, hintsUsed: 0, extra: 0 })).toBe(3);
    expect(starsFor({ undosUsed: 1, hintsUsed: 0, extra: 0 })).toBe(2);
    expect(starsFor({ undosUsed: 0, hintsUsed: 1, extra: 1 })).toBe(2);
    expect(starsFor({ undosUsed: 2, hintsUsed: 1, extra: 0 })).toBe(1);
    expect(starsFor({ undosUsed: 0, hintsUsed: 0, extra: 2 })).toBe(2);
  });
});
