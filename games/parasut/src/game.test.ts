import { describe, expect, it } from 'vitest';
import {
  DT,
  START_Y,
  generateJump,
  landing,
  levelGoal,
  levelJump,
  levelStars,
  newDiver,
  padX,
  scoreLanding,
  simulate,
  step,
  tap,
  type Jump,
} from './game';

const calm = (over: Partial<Jump> = {}): Jump => ({
  n: 0,
  startX: 50,
  wind: 0,
  gust: 0,
  gustFreq: 1,
  pads: [{ x0: 50, w: 20, speed: 0, dir: 1, points: 10 }],
  obstacles: [],
  solution: [],
  ...over,
});

describe('physics', () => {
  it('free fall accelerates to terminal speed; chute slows it', () => {
    const j = calm();
    const d = newDiver(j);
    for (let i = 0; i < 90; i++) step(d, j);
    expect(d.vy).toBeCloseTo(45, 0);
    expect(d.y).toBeLessThan(START_Y);
    tap(d);
    for (let i = 0; i < 120; i++) step(d, j);
    expect(d.vy).toBeLessThan(10);
  });

  it('one open, one cut, then taps are ignored', () => {
    const d = newDiver(calm());
    expect(tap(d)).toBe('open');
    expect(tap(d)).toBe('cut');
    expect(tap(d)).toBeNull();
    expect(d.phase).toBe('cut');
  });

  it('wind drifts the diver more under the canopy than in free fall', () => {
    const j = calm({ wind: 6 });
    const a = newDiver(j);
    const b = newDiver(j);
    tap(b);
    for (let i = 0; i < 60; i++) step(a, j), step(b, j);
    expect(b.x - 50).toBeGreaterThan(a.x - 50);
    expect(a.x).toBeGreaterThan(50);
  });

  it('cutting away falls faster than the canopy', () => {
    const j = calm();
    const a = newDiver(j);
    const b = newDiver(j);
    tap(a), tap(b), tap(b);
    for (let i = 0; i < 60; i++) step(a, j), step(b, j);
    expect(b.y).toBeLessThan(a.y);
  });

  it('touching an obstacle pushes once', () => {
    const j = calm({ obstacles: [{ kind: 'bird', x0: 50, y: 95, r: 3, vx: 0, push: 7 }] });
    const d = newDiver(j);
    let hits = 0;
    for (let i = 0; i < 30; i++) if (step(d, j) >= 0) hits++;
    expect(hits).toBe(1);
    expect(d.vx).toBeGreaterThan(2);
    expect(d.x).toBeGreaterThan(50);
  });
});

describe('landing', () => {
  it('lands on a still pad below, bullseye at the centre', () => {
    const o = simulate(calm(), [0.5]);
    expect(o.kind).toBe('land');
    if (o.kind === 'land') expect(o.bull).toBe(true);
  });
  it('never opening = splash', () => {
    expect(simulate(calm(), [])).toMatchObject({ kind: 'splash', reason: 'freefall' });
  });
  it('missing the pad = splash in the water', () => {
    const d = { ...newDiver(calm()), x: 5, y: 0, phase: 'chute' as const };
    expect(landing(d, calm())).toMatchObject({ kind: 'splash', reason: 'water' });
  });
  it('boats bounce between the edges', () => {
    const p = { x0: 50, w: 20, speed: 10, dir: 1 as const, points: 10 };
    for (let t = 0; t < 30; t += 0.37) {
      const x = padX(p, t);
      expect(x).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(x).toBeLessThanOrEqual(90 + 1e-9);
    }
    expect(padX(p, 1)).toBeCloseTo(60);
    expect(padX(p, 5)).toBeCloseTo(80); // 50 → 90, back 10
  });
  it('is deterministic', () => {
    const j = generateJump(12, 7);
    expect(simulate(j, [0.8, 4])).toEqual(simulate(j, [0.8, 4]));
    expect(DT).toBeCloseTo(1 / 60);
  });
});

describe('scoring', () => {
  const pad = { x0: 0, w: 10, speed: 0, dir: 1 as const, points: 30 };
  it('bullseye doubles and combos stack', () => {
    expect(scoreLanding(pad, false, 3)).toEqual({ points: 30, combo: 0 });
    expect(scoreLanding(pad, true, 0)).toEqual({ points: 60, combo: 1 });
    expect(scoreLanding(pad, true, 2)).toEqual({ points: 80, combo: 3 });
  });
});

describe('generator', () => {
  it('every jump is landable with its stored solution (endless, several seeds)', () => {
    for (const seed of [1, 42, 999])
      for (let n = 0; n < 40; n += 3) {
        const j = generateJump(n, seed);
        expect(simulate(j, j.solution).kind, `seed ${seed} jump ${n}`).toBe('land');
      }
  });
  it('gets harder: stronger wind, smaller pads, obstacles later', () => {
    const avg = (n: number, f: (j: Jump) => number) => {
      let s = 0;
      for (let k = 0; k < 8; k++) s += f(generateJump(n, k + 1));
      return s / 8;
    };
    expect(avg(25, (j) => Math.abs(j.wind))).toBeGreaterThan(avg(0, (j) => Math.abs(j.wind)));
    expect(avg(25, (j) => Math.min(...j.pads.map((p) => p.w)))).toBeLessThan(avg(0, (j) => Math.min(...j.pads.map((p) => p.w))));
    expect(generateJump(0, 1).obstacles).toHaveLength(0);
    expect(generateJump(22, 1).obstacles.length).toBeGreaterThan(0);
  });
  it('is seeded', () => {
    expect(generateJump(8, 5)).toEqual(generateJump(8, 5));
  });
  it('challenge levels: fixed, landable, stars by bullseyes', () => {
    for (const lv of [1, 50, 100]) {
      for (let i = 0; i < levelGoal(lv); i++) {
        const j = levelJump(lv, i);
        expect(simulate(j, j.solution).kind).toBe('land');
      }
    }
    expect(levelGoal(1)).toBe(3);
    expect(levelGoal(100)).toBe(6);
    expect(levelStars(3, 0)).toBe(1);
    expect(levelStars(3, 1)).toBe(2);
    expect(levelStars(3, 2)).toBe(3);
  });
});
