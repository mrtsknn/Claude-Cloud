import { describe, expect, it } from 'vitest';
import {
  LEVEL_COUNT,
  MATCH_DE,
  PIGMENTS,
  closeness,
  deltaE,
  generateLevel,
  cheaperGap,
  hexToOklab,
  hexToRgb,
  hintDrop,
  isMatch,
  mix,
  oklabToHex,
  oklabToRgb,
  rgbToOklab,
  solution,
  stars,
  tubesForLevel,
} from './game';

const labsOf = (tubes: number[]) => tubes.map((p) => hexToOklab(PIGMENTS[p].hex));

describe('OKLab', () => {
  it('maps white and black to the L axis', () => {
    const w = hexToOklab('#ffffff');
    const k = hexToOklab('#000000');
    expect(w[0]).toBeCloseTo(1, 3);
    expect(Math.hypot(w[1], w[2])).toBeLessThan(1e-3);
    expect(k[0]).toBeCloseTo(0, 6);
  });

  it('round-trips sRGB colours', () => {
    for (const hex of [...PIGMENTS.map((p) => p.hex), '#123456', '#abcdef', '#808080', '#ff0000']) {
      expect(oklabToHex(hexToOklab(hex))).toBe(hex);
      const back = oklabToRgb(rgbToOklab(hexToRgb(hex)));
      hexToRgb(hex).forEach((c, i) => expect(Math.abs(back[i] - c)).toBeLessThan(0.01));
    }
  });
});

describe('mixing', () => {
  it('averages drops in OKLab, weighted by count', () => {
    const labs = labsOf([0, 1]);
    const m = mix([1, 1], labs)!;
    expect(m[0]).toBeCloseTo((labs[0][0] + labs[1][0]) / 2, 9);
    const m3 = mix([3, 1], labs)!;
    expect(m3[0]).toBeCloseTo((3 * labs[0][0] + labs[1][0]) / 4, 9);
    expect(mix([0, 0], labs)).toBeNull();
  });

  it('proportional recipes give the same colour', () => {
    const labs = labsOf([2, 3, 4]);
    expect(deltaE(mix([1, 2, 1], labs)!, mix([2, 4, 2], labs)!)).toBeLessThan(1e-12);
  });

  it('matches within the threshold only', () => {
    const t = hexToOklab('#3a7bd5');
    expect(isMatch([t[0] + MATCH_DE * 0.9, t[1], t[2]], t)).toBe(true);
    expect(isMatch([t[0] + MATCH_DE * 1.1, t[1], t[2]], t)).toBe(false);
    expect(isMatch(null, t)).toBe(false);
    expect(closeness(t, t)).toBe(1);
    expect(closeness([t[0] + 0.05, t[1], t[2]], t)).toBeLessThan(1);
    expect(closeness(null, t)).toBe(0);
  });

  it('scores stars against par', () => {
    expect(stars(4, 4)).toBe(3);
    expect(stars(6, 4)).toBe(2);
    expect(stars(7, 4)).toBe(1);
  });
});

describe('levels', () => {
  const levels = Array.from({ length: LEVEL_COUNT }, (_, i) => generateLevel(i + 1));

  it('every recipe reproduces its target and is the cheapest way there', () => {
    for (const l of levels) {
      const labs = labsOf(l.tubes);
      expect(l.recipe.reduce((a, b) => a + b, 0)).toBe(l.par);
      expect(isMatch(mix(l.recipe, labs), l.target, l.tol)).toBe(true);
      // no mix with fewer drops can land inside the tolerance
      expect(cheaperGap(labs, l.target, l.par)).toBeGreaterThan(l.tol * 1.9);
      expect(l.tol).toBeLessThanOrEqual(MATCH_DE);
      // following hints from an empty bowl reaches the target in exactly par drops
      const seq = solution(l.recipe);
      expect(seq.length).toBe(l.par);
      const counts = l.tubes.map(() => 0);
      seq.forEach((i) => counts[i]++);
      expect(isMatch(mix(counts, labs), l.target, l.tol)).toBe(true);
    }
  });

  it('ramps from 2 tubes / 2–3 drops to 6 tubes / 8–10 drops', () => {
    expect(levels[0].tubes.length).toBe(2);
    expect(levels[0].par).toBeLessThanOrEqual(3);
    for (const l of levels) expect(l.tubes.length).toBe(tubesForLevel(l.n));
    for (const l of levels.slice(0, 10)) expect(l.par).toBeLessThanOrEqual(3);
    const late = levels.slice(-10).map((l) => l.par);
    expect(Math.max(...late)).toBeGreaterThanOrEqual(9);
    expect(Math.min(...late)).toBeGreaterThanOrEqual(7);
    expect(levels[LEVEL_COUNT - 1].tubes.length).toBe(6);
  });

  it('is deterministic', () => {
    expect(generateLevel(77)).toEqual(generateLevel(77));
    expect(generateLevel(150)).toEqual(levels[149]);
  });

  it('hint recovers after overshooting and flags decoys', () => {
    expect(hintDrop([2, 0], [1, 2])).toBe(1); // 2:0 → aim for 2:4
    expect(hintDrop([0, 0, 1], [1, 1, 0])).toBe(-1);
  });
});
