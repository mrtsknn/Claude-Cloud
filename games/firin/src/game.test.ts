import { describe, expect, it } from 'vitest';
import {
  BAKE,
  LEVELS,
  LEVEL_TIME,
  PRICE,
  TRAY_SIZE,
  addTime,
  bake,
  botPlay,
  levelConfig,
  matches,
  newGame,
  ovenPhase,
  serve,
  starsFor,
  step,
  tapOven,
  trashTray,
  type Customer,
} from './game';

const run = (s: ReturnType<typeof newGame>, sec: number) => {
  for (let t = 0; t < sec; t += 0.05) step(s, 0.05);
};
const seat = (s: ReturnType<typeof newGame>, order: Customer['order'], patience = 30) => {
  s.seats[0] = { id: 99, look: 0, order, got: order.map(() => false), patience, max: 30 };
};

describe('levels', () => {
  it('ramps difficulty', () => {
    const a = levelConfig(1);
    const z = levelConfig(LEVELS);
    expect(a.items.length).toBe(2);
    expect(z.items.length).toBe(5);
    expect(z.seats).toBeGreaterThan(a.seats);
    expect(z.burnAfter).toBeLessThan(a.burnAfter);
    expect(z.target).toBeGreaterThan(a.target);
    expect(a.stars[0]).toBeLessThan(a.stars[1]);
    expect(a.stars[1]).toBeLessThan(a.stars[2]);
  });
  it('star thresholds', () => {
    const c = levelConfig(1);
    expect(starsFor(c, c.target - 1)).toBe(0);
    expect(starsFor(c, c.target)).toBe(1);
    expect(starsFor(c, c.stars[2])).toBe(3);
  });
  it('is seeded: same level, same customers', () => {
    const a = newGame(10);
    const b = newGame(10);
    run(a, 20);
    run(b, 20);
    expect(a.seats.map((c) => c?.order)).toEqual(b.seats.map((c) => c?.order));
  });
});

describe('ovens', () => {
  it('bakes, turns golden, then burns', () => {
    const s = newGame(1);
    expect(bake(s, 'bread')).toBe(0);
    expect(ovenPhase(s, s.ovens[0])).toBe('baking');
    expect(tapOven(s, 0)).toBe(false);
    run(s, BAKE.bread + 0.1);
    expect(ovenPhase(s, s.ovens[0])).toBe('ready');
    run(s, s.cfg.burnAfter);
    expect(ovenPhase(s, s.ovens[0])).toBe('burnt');
    expect(tapOven(s, 0)).toBe(true); // bin
    expect(s.tray).toEqual([]);
    expect(s.ovens[0].item).toBe(null);
  });
  it('rejects items not on the menu and full ovens', () => {
    const s = newGame(1);
    expect(bake(s, 'cake')).toBe(-1);
    for (let i = 0; i < s.cfg.ovens; i++) expect(bake(s, 'bread')).toBe(i);
    expect(bake(s, 'bread')).toBe(-1);
  });
  it('golden item goes to the tray, tray is limited', () => {
    const s = newGame(10);
    for (let i = 0; i < 4; i++) bake(s, 'bread');
    run(s, BAKE.bread + 0.1);
    for (let i = 0; i < TRAY_SIZE; i++) expect(tapOven(s, i)).toBe(true);
    expect(tapOven(s, 3)).toBe(false);
    expect(s.tray.length).toBe(TRAY_SIZE);
    expect(trashTray(s, 0)).toBe(true);
    expect(s.tray.length).toBe(TRAY_SIZE - 1);
  });
});

describe('customers', () => {
  it('partial then full serve pays price + tip and builds combo', () => {
    const s = newGame(20);
    seat(s, ['bread', 'ring']);
    s.tray = ['ring', 'cookie'];
    expect(matches(s.seats[0]!, s.tray)).toBe(1);
    expect(serve(s, 0)).toBe(true);
    expect(s.tray).toEqual(['cookie']);
    expect(s.coins).toBe(0);
    s.tray.push('bread');
    expect(serve(s, 0)).toBe(true);
    expect(s.seats[0]).toBe(null);
    expect(s.served).toBe(1);
    expect(s.combo).toBe(1);
    expect(s.coins).toBe(PRICE.bread + PRICE.ring + Math.round((PRICE.bread + PRICE.ring) * 0.5));
  });
  it('wrong tray is rejected', () => {
    const s = newGame(20);
    seat(s, ['cake']);
    s.tray = ['bread'];
    expect(serve(s, 0)).toBe(false);
  });
  it('impatient customers leave and break the combo', () => {
    const s = newGame(20);
    s.combo = 3;
    seat(s, ['cake'], 1);
    step(s, 1.1);
    expect(s.seats[0]?.id).not.toBe(99);
    expect(s.lost).toBe(1);
    expect(s.combo).toBe(0);
  });
  it('customers arrive over time', () => {
    const s = newGame(1);
    run(s, 2);
    expect(s.seats.filter(Boolean).length).toBeGreaterThan(0);
  });
});

describe('timer', () => {
  it('ends after 90 s and continue adds time', () => {
    const s = newGame(1);
    run(s, LEVEL_TIME + 1);
    expect(s.time).toBe(0);
    expect(bake(s, 'bread')).toBe(-1);
    addTime(s);
    expect(s.time).toBe(20);
    expect(bake(s, 'bread')).toBe(0);
  });
});

describe('greedy bot', () => {
  it('reaches the 1-star target on every level', () => {
    const failed: number[] = [];
    for (let n = 1; n <= LEVELS; n++) if (botPlay(n).coins < levelConfig(n).target) failed.push(n);
    expect(failed).toEqual([]);
  });
  it('a slow player struggles on late levels', () => {
    expect(botPlay(LEVELS, 1.2).coins).toBeLessThan(levelConfig(LEVELS).target);
  });
});
