import { describe, expect, it } from 'vitest';
import * as g from './game';
import { fmt, fmtTime } from './format';

const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('format', () => {
  it('formats big numbers', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(5.55)).toBe('5.5');
    expect(fmt(999)).toBe('999');
    expect(fmt(1234)).toBe('1.23K');
    expect(fmt(45_600_000)).toBe('45.6M');
    expect(fmt(789e9)).toBe('789B');
    expect(fmt(999_999)).toBe('999K'); // floors, never rounds up
    expect(fmt(1e15)).toBe('1.00Qa');
    expect(fmt(1e36)).toBe('1.00aa');
    expect(fmtTime(3725)).toBe('1h 2m');
    expect(fmtTime(95)).toBe('1m 35s');
  });
});

describe('economy', () => {
  it('starts with two level-1 bees on a 4x5 hive', () => {
    const s = g.newState(0);
    expect(s.cells.length).toBe(20);
    expect(s.cells.filter((c) => c === 1).length).toBe(2);
  });

  it('production is exponential and ticks into honey', () => {
    expect(g.prodOf(2) / g.prodOf(1)).toBeCloseTo(2.2);
    const s = g.newState(0);
    const h = s.honey;
    g.tick(s, 10);
    expect(s.honey).toBeCloseTo(h + 10 * 2 * g.prodOf(1));
  });

  it('spawn costs honey, rises slowly and needs a free cell', () => {
    const s = g.newState(0);
    s.honey = 1e6;
    const c0 = g.spawnCost(s);
    expect(g.spawn(s, seeded(1))).toBeGreaterThanOrEqual(0);
    expect(s.honey).toBe(1e6 - c0);
    expect(g.spawnCost(s)).toBeGreaterThanOrEqual(c0);
    expect(g.spawnCost({ ...s, spawns: 20 })).toBeLessThan(c0 * 5);
    s.cells.fill(3);
    expect(g.spawn(s)).toBe(-1);
    s.honey = 0;
    s.cells[0] = 0;
    expect(g.spawn(s)).toBe(-1);
  });

  it('merges identical bees, records best and drops a gift box', () => {
    const s = g.newState(0);
    s.cells = s.cells.map(() => 0);
    s.cells[0] = 1;
    s.cells[1] = 1;
    s.cells[2] = 2;
    expect(g.merge(s, 0, 2)).toBeNull();
    const r = g.merge(s, 0, 1, seeded(3))!;
    expect(r).toMatchObject({ level: 2, newBest: true });
    expect(s.cells[0]).toBeLessThanOrEqual(0); // emptied (the gift box may land there)
    expect(s.cells[1]).toBe(2);
    expect(s.cells[r.gift]).toBe(-1);
    expect(g.openGift(s, r.gift)).toBe(1);
    const r2 = g.merge(s, 1, 2)!;
    expect(r2.level).toBe(3);
    expect(s.best).toBe(3);
    expect(s.merges).toBe(2);
  });

  it('cannot merge past the max level; move swaps and fills empties', () => {
    const s = g.newState(0);
    s.cells[0] = g.MAX_LEVEL;
    s.cells[1] = g.MAX_LEVEL;
    expect(g.canMerge(s, 0, 1)).toBe(false);
    s.cells[2] = 0;
    expect(g.move(s, 0, 2)).toBe(true);
    expect(s.cells[2]).toBe(g.MAX_LEVEL);
    s.cells[3] = 4;
    expect(g.move(s, 2, 3)).toBe(true);
    expect(s.cells[2]).toBe(4);
  });

  it('expansion keeps bee positions and grows to 6x7', () => {
    const s = g.newState(0);
    s.cells[0] = 5;
    s.cells[19] = 6; // row 4, col 3
    s.honey = 1e12;
    while (g.expand(s));
    expect(s.expansion).toBe(4);
    expect(s.cells.length).toBe(42);
    expect(s.cells[0]).toBe(5);
    expect(s.cells[4 * 6 + 3]).toBe(6);
    expect(g.hiveBonus(s)).toBe(2);
    expect(g.expandCost(s)).toBe(Infinity);
  });

  it('spawn level upgrade is gated by best bee', () => {
    const s = g.newState(0);
    s.honey = 1e12;
    expect(g.upgradeSpawn(s)).toBe(false);
    s.best = 4;
    expect(g.upgradeSpawn(s)).toBe(true);
    expect(s.spawnLevel).toBe(2);
    s.cells.fill(0);
    g.spawn(s);
    expect(s.cells.filter((c) => c === 2).length).toBe(1);
    expect(g.goldenEgg(s)).toBeGreaterThanOrEqual(0);
    expect(s.cells.includes(2 + g.GOLDEN_BONUS)).toBe(true);
  });

  it('offline earnings are capped at 4h and pay half rate', () => {
    const s = g.newState(0);
    const r = g.rate(s);
    expect(g.offlineEarnings(s, 60_000)).toEqual({ seconds: 60, honey: r * 60 * g.OFFLINE_RATE });
    expect(g.offlineEarnings(s, 10 * 3600_000).seconds).toBe(g.OFFLINE_CAP_SEC);
    expect(g.offlineEarnings(s, -5).seconds).toBe(0);
  });

  it('sanitize survives garbage and clamps values', () => {
    expect(g.sanitize(null, 5).cells.length).toBe(20);
    const s = g.sanitize({ honey: 'x', cells: [99, -99, 'a'], expansion: 9, best: 50, lastSeen: 1e15 }, 1000);
    expect(s.expansion).toBe(4);
    expect(s.cells.length).toBe(42);
    expect(s.cells.slice(0, 3)).toEqual([20, -20, 0]);
    expect(s.best).toBe(20);
    expect(s.lastSeen).toBe(1000);
    expect(s.honey).toBe(20);
  });

  it('sim: an active player reaches a level-10 bee in ~20–40 minutes', () => {
    for (const seed of [1, 7, 42]) {
      const rng = seeded(seed);
      const s = g.newState(0);
      let t = 0;
      while (s.best < 10 && t < 3 * 3600) {
        g.tick(s, 1);
        g.autoPlay(s, rng);
        if (t % 2) g.autoPlay(s, rng); // ~1.5 taps per second
        t++;
      }
      const min = t / 60;
      expect(min).toBeGreaterThan(18);
      expect(min).toBeLessThan(40);
    }
  });
});
