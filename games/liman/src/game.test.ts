import { describe, expect, it } from 'vitest';
import { GREEDY_FROM, applyMove, balance, check, generateLevel, greedySolves, levelParams, orderViolations, solve, stars, type Box, type Level, type Ship } from './game';

const b = (id: number, port: number, w = 1): Box => ({ id, port, w });
const lv: Level = { level: 1, ports: 3, height: 3, tol: 1, ncols: 3, boxes: 0 };

describe('rules', () => {
  it('order: earlier ports must sit above later ports', () => {
    expect(orderViolations({ cols: [[b(0, 3), b(1, 2), b(2, 1)], [], []], dock: [] }).size).toBe(0);
    expect([...orderViolations({ cols: [[b(0, 1), b(1, 2)], [b(2, 2), b(3, 2)], []], dock: [] })]).toEqual([1]);
    expect([...orderViolations({ cols: [[b(0, 2), b(1, 1), b(2, 3)]], dock: [] })]).toEqual([2]);
  });

  it('balance: left vs right, centre column neutral', () => {
    const ship: Ship = { cols: [[b(0, 1, 3)], [b(1, 1, 3)], [b(2, 1, 2)]], dock: [] };
    expect(balance(ship)).toEqual({ left: 3, right: 2, diff: -1 });
    expect(check(ship, lv)).toMatchObject({ ok: true, balance: true });
    expect(check(ship, { ...lv, tol: 0 }).balance).toBe(false);
    expect(balance({ cols: [[b(0, 1, 2)], [], [], [b(1, 1, 1)]], dock: [] }).diff).toBe(-1);
  });

  it('needs an empty dock to sail', () => {
    expect(check({ cols: [[], [], []], dock: [b(0, 1)] }, lv).ok).toBe(false);
  });
});

describe('moves', () => {
  const start: Ship = { cols: [[b(0, 2)], [], []], dock: [b(1, 1), b(2, 1)] };
  it('loads dock boxes and respects the height limit', () => {
    let s = applyMove(start, lv, { id: 1, to: 0 })!;
    expect(s.cols[0].map((x) => x.id)).toEqual([0, 1]);
    expect(s.dock.map((x) => x.id)).toEqual([2]);
    s = applyMove(s, lv, { id: 2, to: 0 })!;
    expect(applyMove({ ...s, dock: [b(3, 1)] }, lv, { id: 3, to: 0 })).toBeNull();
  });
  it('only top boxes can be re-stowed, to a column or back to the dock', () => {
    const s = applyMove(start, lv, { id: 1, to: 0 })!;
    expect(applyMove(s, lv, { id: 0, to: 1 })).toBeNull();
    expect(applyMove(s, lv, { id: 1, to: 2 })!.cols[2][0].id).toBe(1);
    expect(applyMove(s, lv, { id: 1, to: -1 })!.dock.map((x) => x.id)).toEqual([2, 1]);
    expect(applyMove(s, lv, { id: 1, to: 0 })).toBeNull();
  });
  it('solver fixes a wrong stack by re-stowing', () => {
    const bad: Ship = { cols: [[b(0, 1)], [], []], dock: [b(1, 2)] };
    let s = bad;
    for (const m of solve(bad, lv)!) s = applyMove(s, lv, m)!;
    expect(check(s, lv).ok).toBe(true);
  });
  it('stars', () => {
    expect(stars(4, 4, 0, 0)).toBe(3);
    expect(stars(4, 4, 0, 1)).toBe(2);
    expect(stars(9, 4, 2, 1)).toBe(1);
  });
});

describe('levels', () => {
  it('is deterministic', () => {
    expect(generateLevel(7)).toEqual(generateLevel(7));
    expect(generateLevel(7).ship).not.toEqual(generateLevel(8).ship);
  });
  it('ramps from 2 ports/4 boxes to 4 ports/14 boxes', () => {
    expect(levelParams(1)).toMatchObject({ ports: 2, boxes: 4, height: 3 });
    expect(levelParams(150)).toMatchObject({ ports: 4, boxes: 14 });
  });
  it('stack height varies 3–5 and grows with difficulty', () => {
    const hs = Array.from({ length: 150 }, (_, i) => levelParams(i + 1).height);
    expect(Math.min(...hs)).toBe(3);
    expect(Math.max(...hs)).toBe(5);
    const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    expect(avg(hs.slice(0, 30))).toBeLessThan(avg(hs.slice(60, 100)));
    expect(avg(hs.slice(60, 100))).toBeLessThan(avg(hs.slice(100)));
    for (let l = 1; l <= 150; l++) {
      const p = levelParams(l);
      expect(p.ncols * p.height, `level ${l}`).toBeGreaterThan(p.boxes);
      expect(p.ncols).toBeGreaterThanOrEqual(3);
      expect(p.ncols).toBeLessThanOrEqual(6);
    }
  });
  it('greedy check: loading the dock left to right with balance-first placement', () => {
    const p: Level = { level: 9, ports: 2, height: 3, tol: 0, ncols: 2, boxes: 2 };
    // Port-2 box first, then port-1: greedy puts them on opposite sides → solved.
    expect(greedySolves({ cols: [[], []], dock: [b(0, 2), b(1, 1)] }, p)).toBe(true);
    // Port-1 boxes first leave no legal spot for the port-2 box.
    expect(greedySolves({ cols: [[], []], dock: [b(0, 1), b(1, 1), b(2, 2)] }, p)).toBe(false);
  });
  it(`from level ${GREEDY_FROM} no dock can be loaded greedily`, () => {
    for (let l = GREEDY_FROM; l <= 150; l++) {
      const { lv: p, ship } = generateLevel(l);
      expect(greedySolves(ship, p), `level ${l}`).toBe(false);
    }
  });
  it('every level 1–150 is valid and solvable in par moves', { timeout: 60000 }, () => {
    for (let l = 1; l <= 150; l++) {
      const { lv: p, ship, solution } = generateLevel(l);
      expect(ship.dock).toHaveLength(p.boxes);
      expect(new Set(ship.dock.map((x) => x.port)).size).toBe(p.ports);
      expect(check(solution, p).ok).toBe(true);
      expect(check(ship, p).ok).toBe(false);
      const moves = solve(ship, p);
      expect(moves, `level ${l}`).not.toBeNull();
      expect(moves!.length).toBe(p.boxes);
      let s = ship;
      for (const m of moves!) s = applyMove(s, p, m)!;
      expect(check(s, p).ok).toBe(true);
    }
  });
});
