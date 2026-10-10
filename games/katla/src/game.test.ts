import { describe, expect, it } from 'vitest';
import { deadEnd, dims, fold, generateLevel, layer, LEVEL_COUNT, normalize, packLevel, solve, starsFor, topColor, unpackLevel, visibleKey, visibleSheet, type PackedLevel, type Sheet } from './game';
import LEVELS from './levels.json';

const rect = (w: number, h: number, f = 0, b = 2): Sheet =>
  normalize(Array.from({ length: w * h }, (_, i) => ({ x: i % w, y: Math.floor(i / w), s: [layer(f, b)] }))).sheet;

describe('folding', () => {
  it('mirrors the left side over a vertical line and shows the back', () => {
    const { sheet, dx } = fold(rect(3, 1), { axis: 'v', at: 1, dir: 1 });
    expect(dx).toBe(1);
    expect(dims(sheet)).toEqual({ w: 2, h: 1 });
    expect(sheet[0].s.length).toBe(2);
    expect(topColor(sheet[0])).toBe(2);
    expect(topColor(sheet[1])).toBe(0);
  });

  it('reverses and flips stacks when folding twice', () => {
    const a = fold(rect(2, 1), { axis: 'v', at: 1, dir: -1 }).sheet; // right over left → back up
    expect(topColor(a[0])).toBe(2);
    const b = fold(rect(2, 2), { axis: 'h', at: 1, dir: 1 }).sheet;
    const c = fold(b, { axis: 'v', at: 1, dir: 1 }).sheet;
    expect(c.length).toBe(1);
    expect(c[0].s.length).toBe(4);
    expect(topColor(c[0])).toBe(2); // old bottom of the flap ends on top, flipped once
  });

  it('can extend beyond the sheet when the larger side folds', () => {
    const { sheet } = fold(rect(3, 1), { axis: 'v', at: 1, dir: -1 });
    expect(dims(sheet).w).toBe(2);
    expect(sheet.map((c) => c.s.length)).toEqual([1, 2]);
  });
});

describe('solver', () => {
  it('finds the par of a two-fold target', () => {
    const s = rect(4, 2);
    const t = visibleSheet(fold(fold(s, { axis: 'v', at: 2, dir: 1 }).sheet, { axis: 'h', at: 1, dir: -1 }).sheet);
    const r = solve(s, t)!;
    expect(r.par).toBe(2);
    let cur = s;
    for (const m of r.path) cur = fold(cur, m).sheet;
    expect(visibleKey(cur)).toBe(visibleKey(t));
  });

  it('detects dead ends', () => {
    const t = visibleSheet(rect(2, 2));
    expect(deadEnd(rect(1, 2), t)).toBe(true);
    expect(deadEnd(rect(3, 3), t)).toBe(false);
  });

  it('rates stars by folds versus par', () => {
    expect(starsFor(3, 3)).toBe(3);
    expect(starsFor(5, 3)).toBe(2);
    expect(starsFor(6, 3)).toBe(1);
  });
});

describe('levels', () => {
  const levels = (LEVELS as PackedLevel[]).map((p, i) => unpackLevel(i + 1, p));
  it('ships all levels, each solvable in exactly par folds', () => {
    expect(levels.length).toBe(LEVEL_COUNT);
    for (const l of levels) {
      expect(l.par).toBeGreaterThanOrEqual(2);
      expect(l.solution.length).toBe(l.par);
      let cur = l.sheet;
      for (const m of l.solution) cur = fold(cur, m).sheet;
      expect(visibleKey(cur)).toBe(visibleKey(l.target));
    }
    for (const n of [1, 2, 10, 40, 80]) expect(solve(levels[n - 1].sheet, levels[n - 1].target, levels[n - 1].par - 1)).toBeNull();
  });

  it('never gets easier (par ramps from 2 up)', () => {
    for (let i = 1; i < levels.length; i++) expect(levels[i].par).toBeGreaterThanOrEqual(levels[i - 1].par);
    expect(levels[0].par).toBe(2);
    expect(levels[LEVEL_COUNT - 1].par).toBeGreaterThanOrEqual(5);
  });

  it('matches the seeded generator', () => {
    for (const n of [1, 2, 3, 7]) expect(packLevel(generateLevel(n))).toEqual(LEVELS[n - 1]);
  });
});
