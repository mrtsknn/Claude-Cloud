import { describe, expect, it } from 'vitest';
import * as g from './game';
import { fmt, fmtTime } from './format';

const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const cellsOf = (s: g.State) => g.hive(s).cells;

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
  it('starts with two level-1 bees on a 4x5 meadow hive', () => {
    const s = g.newState(0);
    expect(s.hives.length).toBe(1);
    expect(cellsOf(s).length).toBe(20);
    expect(cellsOf(s).filter((c) => c === 1).length).toBe(2);
  });

  it('production is exponential and ticks into honey', () => {
    expect(g.prodOf(2) / g.prodOf(1)).toBeCloseTo(2.2);
    const s = g.newState(0);
    const h = s.honey;
    g.tick(s, 10);
    expect(s.honey).toBeCloseTo(h + 10 * 2 * g.prodOf(1));
    expect(s.earned).toBeCloseTo(10 * 2 * g.prodOf(1));
  });

  it('spawn costs honey, rises slowly and needs a free cell', () => {
    const s = g.newState(0);
    s.honey = 1e6;
    const c0 = g.spawnCost(s);
    expect(g.spawn(s, seeded(1))).toBeGreaterThanOrEqual(0);
    expect(s.honey).toBe(1e6 - c0);
    expect(g.spawnCost(s)).toBeGreaterThanOrEqual(c0);
    expect(g.spawnCost({ ...s, spawns: 20 })).toBeLessThan(c0 * 5);
    cellsOf(s).fill(3);
    expect(g.spawn(s)).toBe(-1);
    s.honey = 0;
    cellsOf(s)[0] = 0;
    expect(g.spawn(s)).toBe(-1);
  });

  it('merges identical bees, records best and drops a gift box', () => {
    const s = g.newState(0);
    const c = cellsOf(s);
    c.fill(0);
    c[0] = 1;
    c[1] = 1;
    c[2] = 2;
    expect(g.merge(s, 0, 2)).toBeNull();
    const r = g.merge(s, 0, 1, seeded(3))!;
    expect(r).toMatchObject({ level: 2, newBest: true });
    expect(c[0]).toBeLessThanOrEqual(0); // emptied (the gift box may land there)
    expect(c[1]).toBe(2);
    expect(c[r.gift]).toBe(-1);
    expect(g.openGift(s, r.gift)).toBe(1);
    expect(s.gifts).toBe(1);
    const r2 = g.merge(s, 1, 2)!;
    expect(r2.level).toBe(3);
    expect(s.best).toBe(3);
    expect(s.merges).toBe(2);
  });

  it('has 30 named bee levels; cannot merge past the max; move swaps and fills empties', () => {
    expect(g.MAX_LEVEL).toBe(30);
    expect(g.BEE_NAMES.en.length).toBe(30);
    expect(g.BEE_NAMES.tr.length).toBe(30);
    expect(new Set(g.BEE_NAMES.en).size).toBe(30);
    const s = g.newState(0);
    const c = cellsOf(s);
    c[0] = g.MAX_LEVEL;
    c[1] = g.MAX_LEVEL;
    expect(g.canMerge(g.hive(s), 0, 1)).toBe(false);
    c[2] = 0;
    expect(g.move(s, 0, 2)).toBe(true);
    expect(c[2]).toBe(g.MAX_LEVEL);
    c[3] = 4;
    expect(g.move(s, 2, 3)).toBe(true);
    expect(c[2]).toBe(4);
  });

  it('expansion keeps bee positions and grows to 6x7', () => {
    const s = g.newState(0);
    cellsOf(s)[0] = 5;
    cellsOf(s)[19] = 6; // row 4, col 3
    s.honey = 1e12;
    while (g.expand(s));
    expect(g.hive(s).expansion).toBe(4);
    expect(cellsOf(s).length).toBe(42);
    expect(cellsOf(s)[0]).toBe(5);
    expect(cellsOf(s)[4 * 6 + 3]).toBe(6);
    expect(g.hiveBonus(g.hive(s))).toBe(2);
    expect(g.expandCost(s)).toBe(Infinity);
  });

  it('spawn level upgrade is gated by best bee; early costs match v1', () => {
    const s = g.newState(0);
    s.honey = 1e12;
    expect(g.upgradeSpawn(s)).toBe(false);
    s.best = 4;
    expect(g.spawnUpCost(s)).toBe(3_000);
    expect(g.upgradeSpawn(s)).toBe(true);
    expect(s.spawnLevel).toBe(2);
    s.best = 30;
    expect(g.spawnUpCost(s)).toBe(90_000);
    s.spawnLevel = 5;
    expect(g.spawnUpCost(s)).toBe(2_700_000 * 36);
    s.spawnLevel = g.MAX_LEVEL - 4;
    expect(g.spawnUpCost(s)).toBe(Infinity);
    s.spawnLevel = 2;
    cellsOf(s).fill(0);
    g.spawn(s);
    expect(cellsOf(s).filter((c) => c === 2).length).toBe(1);
    expect(g.goldenEgg(s)).toBeGreaterThanOrEqual(0);
    expect(cellsOf(s).includes(2 + g.GOLDEN_BONUS)).toBe(true);
  });

  it('offline earnings are capped at 4h and pay half rate; storage-full time', () => {
    const s = g.newState(0);
    const r = g.rate(s);
    expect(g.offlineEarnings(s, 60_000)).toEqual({ seconds: 60, honey: r * 60 * g.OFFLINE_RATE });
    expect(g.offlineEarnings(s, 10 * 3600_000).seconds).toBe(g.OFFLINE_CAP_SEC);
    expect(g.offlineEarnings(s, -5).seconds).toBe(0);
    expect(g.offlineFullAt({ lastSeen: 1000 })).toBe(1000 + 4 * 3600_000);
  });

  it('sanitize survives garbage, clamps values and migrates v1 saves', () => {
    expect(g.sanitize(null, 5).hives[0].cells.length).toBe(20);
    const s = g.sanitize({ honey: 'x', cells: [99, -99, 'a'], expansion: 9, best: 50, lastSeen: 1e15 }, 1000);
    expect(s.hives.length).toBe(1);
    expect(s.hives[0].expansion).toBe(4);
    expect(s.hives[0].cells.length).toBe(42);
    expect(s.hives[0].cells.slice(0, 3)).toEqual([30, -30, 0]);
    expect(s.best).toBe(30);
    expect(s.lastSeen).toBe(1000);
    expect(s.honey).toBe(20);
    expect(s.quest).toBe(0);
    expect(s.flowers).toEqual([]);
    const v2 = g.sanitize({ hives: [{ cells: [1], expansion: 0 }, { cells: [2, 2], expansion: 1 }, null, 7, {}], world: 9, flowers: ['tulip', 'tulip', 'cactus'] }, 0);
    expect(v2.hives.length).toBe(3); // junk entries dropped
    expect(v2.hives[1].cells.length).toBe(25);
    expect(v2.world).toBe(2);
    expect(v2.flowers).toEqual(['tulip']);
  });
});

describe('worlds', () => {
  it('unlock needs the bee level and honey, then switches to the new hive', () => {
    const s = g.newState(0);
    s.honey = 1e15;
    expect(g.nextWorld(s)).toBe(1);
    expect(g.unlockWorld(s)).toBe(false); // best bee too low
    s.best = g.WORLDS[1].unlock;
    s.spawnLevel = 3;
    const h0 = s.honey;
    expect(g.unlockWorld(s)).toBe(true);
    expect(s.honey).toBe(h0 - g.WORLDS[1].cost);
    expect(s.hives.length).toBe(2);
    expect(s.world).toBe(1);
    expect(g.hive(s).cells.filter((c) => c === 3).length).toBe(2); // starter bees at spawn level
    expect(g.unlockWorld(s)).toBe(false); // forest needs a higher bee
    expect(g.switchWorld(s, 0)).toBe(true);
    expect(g.switchWorld(s, 3)).toBe(false);
    s.best = 30;
    while (g.unlockWorld(s));
    expect(s.hives.length).toBe(4);
    expect(g.nextWorld(s)).toBe(-1);
  });

  it('every world produces at once with its own multiplier; actions hit the active hive only', () => {
    const s = g.newState(0);
    s.best = 30;
    s.honey = 1e15;
    g.unlockWorld(s);
    const meadow = g.hiveRate(s, 0);
    const orchard = g.hiveRate(s, 1);
    expect(orchard).toBeCloseTo(meadow * g.WORLDS[1].mult);
    expect(g.rate(s)).toBeCloseTo(meadow + orchard);
    g.spawn(s);
    expect(s.hives[1].cells.filter((c) => c > 0).length).toBe(3);
    expect(s.hives[0].cells.filter((c) => c > 0).length).toBe(2);
    // world-specific expansion prices
    expect(g.expandCost(s, 1)).toBe(g.EXPAND_COSTS[0] * g.WORLDS[1].costMul);
    expect(g.expand(s, 0)).toBe(true);
    expect(s.hives[0].cells.length).toBe(25);
    expect(s.hives[1].cells.length).toBe(20);
    expect(g.totalExpansions(s)).toBe(1);
    for (let i = 1; i < g.WORLDS.length; i++) {
      expect(g.WORLDS[i].unlock).toBeGreaterThan(g.WORLDS[i - 1].unlock);
      expect(g.WORLDS[i].mult).toBeGreaterThan(g.WORLDS[i - 1].mult);
    }
  });
});

describe('quest chain', () => {
  it('has ~40 hand-made steps that move forward and then continues endlessly', () => {
    expect(g.QUESTS.length).toBeGreaterThanOrEqual(38);
    const last: Record<string, number> = {};
    for (const q of g.QUESTS) {
      if (last[q.kind] !== undefined) expect(q.n).toBeGreaterThan(last[q.kind]);
      last[q.kind] = q.n;
      expect(Object.keys(q.reward).length).toBe(1);
    }
    expect(g.QUESTS.some((q) => q.kind === 'worlds' && q.n === 2)).toBe(true);
    expect(g.QUESTS.some((q) => q.kind === 'earned' && q.n === 1e6)).toBe(true);
    const a = g.questAt(g.QUESTS.length);
    const b = g.questAt(g.QUESTS.length + 1);
    expect(b.n).toBeGreaterThan(a.n);
  });

  it('claims only when done and pays coins, honey or gift boxes', () => {
    const s = g.newState(0);
    expect(g.questDone(s)).toBe(false);
    expect(g.claimQuest(s)).toBeNull();
    s.merges = 3;
    expect(g.claimQuest(s)).toEqual({ coins: 20, honey: 0, giftCells: [] });
    expect(s.quest).toBe(1);
    s.best = 4; // quest 2: gift box
    const p = g.claimQuest(s, seeded(2))!;
    expect(p.giftCells.length).toBe(1);
    expect(cellsOf(s)[p.giftCells[0]]).toBeLessThan(0);
    s.spawns = 10;
    g.claimQuest(s);
    s.best = 5; // honey for 20s of production (min 50)
    const h0 = s.honey;
    expect(g.claimQuest(s)!.honey).toBe(50);
    expect(s.honey).toBe(h0 + 50);
  });

  it('a full hive turns gift rewards into honey', () => {
    const s = g.newState(0);
    s.quest = 1;
    s.best = 4;
    cellsOf(s).fill(2);
    const p = g.claimQuest(s)!;
    expect(p.giftCells).toEqual([]);
    expect(p.honey).toBeGreaterThan(0);
  });
});

describe('festival', () => {
  it('computes ISO weeks', () => {
    expect(g.isoWeek(new Date(2026, 0, 1).getTime())).toEqual({ year: 2026, week: 1 });
    expect(g.isoWeek(new Date(2024, 11, 30).getTime())).toEqual({ year: 2025, week: 1 });
    expect(g.isoWeek(new Date(2021, 0, 3).getTime())).toEqual({ year: 2020, week: 53 });
    expect(g.isoWeek(new Date(2026, 9, 10).getTime())).toEqual({ year: 2026, week: 41 });
    expect(g.weekKey(new Date(2026, 9, 10).getTime())).toBe(202641);
  });

  it('rotates the flower every week and ends on Monday', () => {
    const week = 7 * 864e5;
    const t0 = new Date(2026, 9, 5, 12).getTime(); // a Monday
    const seen = new Set<string>();
    for (let k = 0; k < g.FLOWERS.length; k++) seen.add(g.flowerOf(g.weekKey(t0 + k * week)));
    expect(seen.size).toBe(g.FLOWERS.length);
    expect(g.flowerOf(g.weekKey(t0))).not.toBe(g.flowerOf(g.weekKey(t0 + week)));
    expect(g.festivalLeft(new Date(2026, 9, 11, 23).getTime())).toBe(3600); // Sunday 23:00
    expect(g.festivalLeft(new Date(2026, 9, 5, 0).getTime())).toBe(7 * 86400);
  });

  it('boosts one bee level 2x, resets weekly and pays a limited bee once', () => {
    const s = g.newState(0);
    s.best = 9;
    const t = new Date(2026, 9, 7).getTime();
    expect(g.syncFestival(s, t)).toBe(true);
    expect(g.syncFestival(s, t + 3600_000)).toBe(false);
    const lvl = s.festival.level;
    expect(lvl).toBeGreaterThanOrEqual(6);
    expect(lvl).toBeLessThanOrEqual(8);
    expect(g.beeMult(s, 0, lvl)).toBe(2);
    expect(g.beeMult(s, 0, lvl + 1)).toBe(1);
    expect(g.claimFestival(s)).toBeNull();
    s.best = 12; // the featured bee keeps up with a fast-growing hive
    g.syncFestival(s, t + 7200_000);
    expect(s.festival.level).toBeGreaterThanOrEqual(9);
    s.best = 9;
    s.festival.level = lvl;
    cellsOf(s).fill(0);
    for (let k = 0; k < g.FESTIVAL_GOAL; k++) {
      cellsOf(s)[0] = 1;
      cellsOf(s)[1] = 1;
      g.merge(s, 0, 1);
      cellsOf(s).fill(0);
    }
    expect(g.festivalReady(s)).toBe(true);
    const r = g.claimFestival(s)!;
    expect(r).toEqual({ flower: g.flowerOf(s.festival.key), isNew: true, coins: g.FESTIVAL_COINS });
    expect(g.flowerBonus(s)).toBeCloseTo(1.1);
    expect(g.claimFestival(s)).toBeNull(); // once per week
    // next week: fresh progress; same flower 6 weeks later only pays coins
    expect(g.syncFestival(s, t + 7 * 864e5)).toBe(true);
    expect(s.festival.merges).toBe(0);
    g.syncFestival(s, t + 6 * 7 * 864e5);
    s.festival.merges = g.FESTIVAL_GOAL;
    expect(g.claimFestival(s)).toMatchObject({ isNew: false, coins: g.FESTIVAL_REPEAT_COINS });
    expect(s.flowers.length).toBe(1);
  });
});

describe('balance sim', () => {
  const play = (s: g.State, rng: () => number, secs: number, t: { v: number }) => {
    for (let k = 0; k < secs; k++) {
      g.tick(s, 1);
      g.autoPlay(s, rng);
      if (t.v % 2) g.autoPlay(s, rng); // ~1.5 taps per second
      t.v++;
    }
  };

  it('first session is unchanged: an active player reaches a level-10 bee in ~20–40 minutes', () => {
    for (const seed of [1, 7, 42]) {
      const rng = seeded(seed);
      const s = g.newState(0);
      const t = { v: 0 };
      while (s.best < 10 && t.v < 3 * 3600) play(s, rng, 1, t);
      const min = t.v / 60;
      expect(min).toBeGreaterThan(18);
      expect(min).toBeLessThan(40);
      expect(s.hives.length).toBe(1); // no new world in the first session
    }
  });

  it('a 4-sessions-a-day player needs weeks for the full game', () => {
    for (const seed of [7, 42]) {
      const rng = seeded(seed);
      const s = g.newState(0);
      const t = { v: 0 };
      const at: Record<string, number> = {};
      const mark = () => {
        for (const lv of [15, 20, 25, 30]) if (s.best >= lv && at[`b${lv}`] === undefined) at[`b${lv}`] = t.v / 86400;
        for (let w = 1; w < 4; w++) if (s.hives.length > w && at[`w${w}`] === undefined) at[`w${w}`] = t.v / 86400;
      };
      play(s, rng, 1800, t); // first 30-minute session
      mark();
      while (t.v < 60 * 86400 && s.best < 30) {
        const gap = 6 * 3600 - 480; // four 8-minute sessions a day, offline in between
        const off = g.offlineEarnings({ ...s, lastSeen: 0 }, gap * 1000).honey;
        s.honey += off;
        s.earned += off;
        t.v += gap;
        for (let k = 0; k < 480; k += 30) {
          play(s, rng, 30, t);
          mark();
        }
      }
      expect(at.w1).toBeGreaterThan(0.1); // Orchard on day 1
      expect(at.w1).toBeLessThan(1.5);
      expect(at.b15).toBeLessThan(2.5);
      expect(at.w2).toBeGreaterThan(1); // Forest in the first days
      expect(at.w2).toBeLessThan(4);
      expect(at.b20).toBeGreaterThan(2);
      expect(at.b20).toBeLessThan(7);
      expect(at.w3).toBeGreaterThan(4); // Mountain in week 1–2
      expect(at.w3).toBeLessThan(12);
      expect(at.b25).toBeGreaterThan(7);
      expect(at.b30).toBeGreaterThan(18); // the Hive Empress takes weeks
      expect(at.b30).toBeLessThan(40);
      expect(s.quest).toBeGreaterThanOrEqual(g.QUESTS.length - 2); // the chain is playable to the end
    }
  });
});
