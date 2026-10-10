import { describe, expect, it } from 'vitest';
import {
  addTime, botTarget, createState, DOG_R, generateLevel, H, insidePen, LEVEL_COUNT, levelParams, pennedCount, reachable,
  SHEEP_R, starsFor, step, W, type State,
} from './game';

function run(s: State, maxSec = 600, bot = true) {
  for (let i = 0; i < maxSec * 60 && !s.result; i++) {
    if (bot && i % 6 === 0) s.target = botTarget(s);
    step(s);
  }
  return s;
}

describe('generator', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(generateLevel(37))).toBe(JSON.stringify(generateLevel(37)));
  });

  it('every level: right counts, sheep outside pen and obstacles, pen reachable', () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const L = generateLevel(n);
      const P = levelParams(n);
      expect(L.sheep.length).toBe(P.sheep);
      expect(L.black).toBe(P.black);
      for (const p of L.sheep) {
        expect(insidePen(L.pen, p, -SHEEP_R)).toBe(false);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(W);
        expect(p.y).toBeLessThan(H);
        for (const c of L.circles) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThan(c.r + SHEEP_R);
      }
      expect(reachable(L.pen, L.fences, L.circles, [...L.sheep, L.dog])).toBe(true);
      expect(L.timeLimit).toBeGreaterThan(30);
    }
  });

  it('difficulty rises', () => {
    expect(levelParams(1).sheep).toBeLessThan(levelParams(120).sheep);
    expect(levelParams(1).wolves).toBe(0);
    expect(levelParams(100).wolves).toBeGreaterThan(0);
    expect(levelParams(100).black).toBeGreaterThan(0);
  });
});

describe('simulation', () => {
  it('is deterministic for the same inputs', () => {
    const a = run(createState(generateLevel(9)), 20);
    const b = run(createState(generateLevel(9)), 20);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sheep flee from the dog', () => {
    const s = createState(generateLevel(1));
    const sh = s.sheep[0];
    s.dog.x = sh.x;
    s.dog.y = sh.y + 40;
    s.target = { x: s.dog.x, y: s.dog.y };
    const y0 = sh.y;
    for (let i = 0; i < 30; i++) step(s);
    expect(sh.y).toBeLessThan(y0 - 5);
  });

  it('black sheep is slower', () => {
    const s = createState(generateLevel(20));
    const black = s.sheep.find((x) => x.black)!;
    const white = s.sheep.find((x) => !x.black)!;
    for (const sh of [black, white]) {
      sh.x = W / 2; sh.y = H / 2;
      s.dog.x = W / 2; s.dog.y = H / 2 + 30;
      s.target = { ...s.dog };
      for (let i = 0; i < 40; i++) step(s);
    }
    expect(Math.hypot(black.vx, black.vy)).toBeLessThan(Math.hypot(white.vx, white.vy));
  });

  it('sheep never pass through pen walls or ponds; dog stays out of the pen', () => {
    const s = run(createState(generateLevel(40)), 40);
    for (const sh of s.sheep) for (const c of s.circles) expect(Math.hypot(sh.x - c.x, sh.y - c.y)).toBeGreaterThanOrEqual(c.r + SHEEP_R - 0.5);
    expect(insidePen(s.pen, s.dog, DOG_R)).toBe(false);
  });

  it('time runs out → lose; continue adds time', () => {
    const s = createState(generateLevel(3));
    run(s, 999, false);
    expect(s.result).toBe('lose');
    addTime(s);
    expect(s.result).toBe(null);
    for (let i = 0; i < 60; i++) step(s);
    expect(s.result).toBe(null);
  });

  it('stars by time left', () => {
    const s = createState(generateLevel(1));
    s.time = 0;
    expect(starsFor(s)).toBe(3);
    s.time = s.timeLimit * 0.7;
    expect(starsFor(s)).toBe(2);
    s.time = s.timeLimit * 0.95;
    expect(starsFor(s)).toBe(1);
  });

  it('bot herds levels 1–5 within the time limit', () => {
    for (let n = 1; n <= 5; n++) {
      const s = run(createState(generateLevel(n)));
      expect([n, s.result, pennedCount(s)]).toEqual([n, 'win', s.sheep.length]);
    }
  });
});
