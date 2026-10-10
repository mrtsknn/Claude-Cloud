import { describe, expect, it } from 'vitest';
import {
  LEVEL_COUNT,
  MIN_R,
  ROWS,
  START_R,
  heightOf,
  kindFor,
  matchPercent,
  matchScore,
  push,
  startProfile,
  starsFor,
  targetFor,
  volumeOf,
  type Profile,
} from './game';

/** Sculpts like a careful player: sweep every row, pressing to the target radius. */
function sculpt(target: Profile, passes = 4): Profile {
  let p = startProfile();
  for (let k = 0; k < passes; k++) for (let i = 0; i < ROWS; i++) p = push(p, i, target[i], 0.6);
  return p;
}

describe('profile deformation', () => {
  it('pushing shrinks rows toward the finger with a soft falloff', () => {
    const p = push(startProfile(), 30, 0.4, 1);
    expect(p[30]).toBeLessThan(0.5);
    expect(p[25]).toBeLessThan(START_R);
    expect(p[25]).toBeGreaterThan(p[30]);
    expect(p[5]).toBeCloseTo(START_R, 2);
  });
  it('never pushes outward or below the minimum radius', () => {
    const p = push(startProfile(), 10, 0.99, 1);
    expect(Math.max(...p)).toBeLessThanOrEqual(START_R + 1e-9);
    const q = push(startProfile(), 10, 0, 1);
    expect(Math.min(...q)).toBeGreaterThanOrEqual(MIN_R - 1e-9);
  });
  it('squeezed clay rises, roughly conserving volume', () => {
    const s = startProfile();
    const p = push(push(s, 20, 0.4, 1), 40, 0.4, 1);
    expect(heightOf(p)).toBeGreaterThan(heightOf(s));
    expect(heightOf(p)).toBeLessThanOrEqual(1);
    expect(volumeOf(p)).toBeGreaterThan(0.5);
    expect(volumeOf(p)).toBeLessThanOrEqual(1);
  });
});

describe('scoring', () => {
  it('identical profiles score 100%', () => {
    const t = targetFor(5).profile;
    expect(matchScore(t, t)).toBeCloseTo(1, 6);
  });
  it('stars thresholds 70/82/92', () => {
    expect(starsFor(69)).toBe(0);
    expect(starsFor(70)).toBe(1);
    expect(starsFor(82)).toBe(2);
    expect(starsFor(91)).toBe(2);
    expect(starsFor(92)).toBe(3);
  });
  it('the untouched lump fails every level', () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) expect(matchPercent(startProfile(), targetFor(n).profile)).toBeLessThan(70);
  });
});

describe('targets', () => {
  it('are deterministic, in range and solvable to 3 stars', () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const a = targetFor(n).profile;
      expect(a).toEqual(targetFor(n).profile);
      expect(a).toHaveLength(ROWS);
      expect(Math.max(...a)).toBeLessThan(START_R);
      expect(Math.min(...a)).toBeGreaterThanOrEqual(0.12);
      expect(starsFor(matchPercent(sculpt(a), a))).toBe(3);
    }
  });
  it('introduce necked shapes later', () => {
    expect(['cup', 'bowl']).toContain(kindFor(1));
    const later = new Set(Array.from({ length: 60 }, (_, i) => kindFor(i + 40)));
    expect(later.has('pitcher')).toBe(true);
    expect(later.has('vase')).toBe(true);
  });
});
