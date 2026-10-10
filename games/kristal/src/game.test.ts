import { describe, expect, it } from 'vitest';
import {
  LEVELS,
  cellCopies,
  cellCount,
  generateLevel,
  levelConfig,
  mirrorOf,
  neighboursOf,
  popcount,
  press,
  pressMask,
  solve,
  solveGF2,
  stars,
  wedgeCells,
} from './game';

const key = (p: { x: number; y: number }) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;

describe('symmetry mapping', () => {
  it('wedge sizes are triangular numbers', () => {
    expect([3, 4, 5, 6].map(cellCount)).toEqual([6, 10, 15, 21]);
    expect(wedgeCells(6)).toHaveLength(21);
  });

  it('6 copies of every wedge cell tile the whole flake without overlap', () => {
    for (const n of [3, 6]) {
      const seen = new Set<string>();
      for (let i = 0; i < cellCount(n); i++) for (const p of cellCopies(i, n)) seen.add(key(p));
      expect(seen.size).toBe(3 * n * (n + 1)); // rings 1..n hold 6r cells each
    }
  });

  it('mirror is an involution and maps the wedge onto its reflected copies', () => {
    const n = 6;
    for (let i = 0; i < cellCount(n); i++) {
      const m = mirrorOf(i, n);
      expect(mirrorOf(m, n)).toBe(i);
      // reflection across the axis between spokes 0 and 1 maps copies of i onto copies of m
      const refl = (p: { x: number; y: number }) => {
        const t = (-60 * Math.PI) / 180; // axis angle
        const c = Math.cos(2 * t);
        const s = Math.sin(2 * t);
        return { x: c * p.x + s * p.y, y: s * p.x - c * p.y };
      };
      const mine = new Set(cellCopies(m, n).map(key));
      for (const p of cellCopies(i, n)) expect(mine.has(key(refl(p)))).toBe(true);
    }
  });
});

describe('toggle rules', () => {
  it('pure toggle flips just the cell; double tap cancels', () => {
    const cfg = { n: 3, neighbours: false, mirror: false };
    expect(press(0, 4, cfg)).toBe(1 << 4);
    expect(press(press(0, 4, cfg), 4, cfg)).toBe(0);
  });

  it('neighbour rule flips the cell and its wedge neighbours', () => {
    const cfg = { n: 3, neighbours: true, mirror: false };
    // centre of the 3-ring wedge (r=2, j=0 → index 1) neighbours 0, 2, 3, 4
    expect(neighboursOf(1, 3).sort()).toEqual([0, 2, 3, 4]);
    expect(pressMask(1, cfg)).toBe(0b11111);
    expect(neighboursOf(0, 3).sort()).toEqual([1, 2]);
  });

  it('mirror presses keep the wedge state mirror-symmetric', () => {
    const cfg = { n: 6, neighbours: true, mirror: true };
    for (let i = 0; i < cellCount(6); i++) {
      const m = pressMask(i, cfg);
      for (let c = 0; c < 21; c++) expect((m >> c) & 1).toBe((m >> mirrorOf(c, 6)) & 1);
    }
  });
});

describe('GF(2) solver', () => {
  it('solves a small system minimally and reports unreachable targets', () => {
    expect(solveGF2([0b011, 0b110, 0b101], 0b101, 3)).toEqual([2]);
    expect(solveGF2([0b011, 0b110], 0b001, 3)).toBeNull();
    expect(solveGF2([0b1, 0b1], 0b1, 1)).toHaveLength(1);
  });

  it('matches brute force on random small systems', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let trial = 0; trial < 200; trial++) {
      const m = 1 + Math.floor(rnd() * 8);
      const bits = 1 + Math.floor(rnd() * 8);
      const cols = Array.from({ length: m }, () => Math.floor(rnd() * (1 << bits)));
      const target = Math.floor(rnd() * (1 << bits));
      let best = Infinity;
      for (let s = 0; s < 1 << m; s++) {
        let x = 0;
        for (let c = 0; c < m; c++) if ((s >> c) & 1) x ^= cols[c];
        if (x === target) best = Math.min(best, popcount(s));
      }
      const sol = solveGF2(cols, target, bits);
      if (best === Infinity) expect(sol).toBeNull();
      else {
        expect(sol!.length).toBe(best);
        expect(sol!.reduce((x, c) => x ^ cols[c], 0)).toBe(target);
      }
    }
  });
});

describe('levels', () => {
  it(`all ${LEVELS} levels are solvable in exactly par taps`, () => {
    for (let l = 1; l <= LEVELS; l++) {
      const lv = generateLevel(l);
      expect(lv.target).not.toBe(0);
      expect(lv.par).toBeGreaterThan(0);
      const sol = solve(0, lv.target, lv)!;
      expect(sol.length).toBe(lv.par);
      expect(sol.reduce((s, c) => press(s, c, lv), 0)).toBe(lv.target);
    }
  });

  it('tutorial levels are pure toggles, neighbour rule from 15, mirror from 40', () => {
    expect(levelConfig(1)).toMatchObject({ n: 3, neighbours: false, mirror: false });
    expect(levelConfig(14).neighbours).toBe(false);
    expect(levelConfig(15).neighbours).toBe(true);
    expect(levelConfig(39).mirror).toBe(false);
    expect(levelConfig(40).mirror).toBe(true);
    expect(levelConfig(150).n).toBe(6);
  });

  it('first neighbour levels are gentle: par 2-3 on a sparse target', () => {
    for (let l = 15; l <= 24; l++) {
      const lv = generateLevel(l);
      expect(lv.neighbours).toBe(true);
      expect(lv.par).toBeGreaterThanOrEqual(2);
      expect(lv.par).toBeLessThanOrEqual(3);
      expect(popcount(lv.target)).toBeLessThanOrEqual(cellCount(lv.n) / 2);
    }
    // the very first one needs exactly two taps, so the new rule is felt twice
    expect(generateLevel(15).par).toBe(2);
  });

  it('par never drops below 2 once the neighbour rule is introduced', () => {
    for (let l = 15; l <= LEVELS; l++) expect(generateLevel(l).par).toBeGreaterThanOrEqual(2);
  });

  it('generation is deterministic', () => {
    for (const l of [1, 15, 40, 77, 150]) expect(generateLevel(l)).toEqual(generateLevel(l));
  });

  it('stars by taps vs par', () => {
    expect(stars(4, 4)).toBe(3);
    expect(stars(6, 4)).toBe(2);
    expect(stars(7, 4)).toBe(1);
  });
});
