import { describe, expect, it } from 'vitest';
import en from './levels/en.json';
import tr from './levels/tr.json';
import { cellsOf, gridOf, hintCell, type Level } from './game';
import { hardness, levelOrder, rewardOf, tierOf, timeLimit, TIMED_FROM } from './difficulty';
import { hintBlocked, introAt, isLocked, twistsFor, TWIST_SCHEDULE } from './twists';
import { AREAS, AREA_COUNT, areaArt, areaName, taskName } from './garden';

const packs = { en: en as Level[], tr: tr as Level[] };

describe('saw-tooth difficulty', () => {
  it('tiers: every 5th hard, every 10th very hard', () => {
    expect([1, 4, 5, 9, 10, 15, 20, 21].map(tierOf)).toEqual(['normal', 'normal', 'hard', 'normal', 'veryhard', 'hard', 'veryhard', 'normal']);
    expect(rewardOf(10)).toEqual({ mult: 2, buildStars: 2, packs: 1 });
    expect(rewardOf(5).mult).toBe(1.5);
  });

  for (const [lang, pack] of Object.entries(packs)) {
    it(`${lang}: play order is a per-chapter permutation of the reviewed levels`, () => {
      const order = levelOrder(pack);
      expect([...order].sort((a, b) => a - b)).toEqual(pack.map((_, i) => i));
      for (let c = 0; c * 10 < pack.length; c++) {
        const slice = order.slice(c * 10, c * 10 + 10);
        expect(slice.every((i) => Math.floor(i / 10) === c)).toBe(true);
        const h = slice.map((i) => hardness(pack[i]));
        expect(h[9]).toBe(Math.max(...h)); // very hard = hardest of its chapter
        expect(h[4]).toBeGreaterThanOrEqual(Math.max(...h.filter((_, j) => j !== 4 && j !== 9))); // hard = second
      }
      expect(order.slice(0, 3)).toEqual([0, 1, 2]); // tutorial levels stay first
    });
  }

  it('the clock starts at level 20, only on hard levels, and grows with the words', () => {
    const l = packs.en[100];
    expect(timeLimit(15, l)).toBe(0);
    expect(timeLimit(19, l)).toBe(0);
    expect(timeLimit(21, l)).toBe(0);
    expect(timeLimit(TIMED_FROM, l)).toBe(45 + 10 * l.words.length);
    expect(timeLimit(25, l)).toBe(60 + 12 * l.words.length);
  });
});

describe('twists', () => {
  it('schedule: a new twist about every 20 levels, introduced on a normal level (or the clock)', () => {
    expect(TWIST_SCHEDULE.map((t) => t.from)).toEqual([20, 41, 61, 81]);
    expect(introAt(41)).toBe('coins');
    expect(introAt(42)).toBeNull();
  });

  for (const [lang, raw] of Object.entries(packs)) {
    it(`${lang}: twists are deterministic and valid on every level`, () => {
      const order = levelOrder(raw);
      let boardTwists = 0;
      for (let n = 1; n <= raw.length; n++) {
        const level = raw[order[n - 1]];
        const tw = twistsFor(n, level);
        expect(twistsFor(n, level)).toEqual(tw);
        const grid = gridOf(level);
        if (n < 41) expect(tw.coinCells.length + (tw.mystery ? 1 : 0) + (tw.locked ? 1 : 0)).toBe(0);
        if (tw.timed) expect(tw.coinCells.length + (tw.mystery ? 1 : 0) + (tw.locked ? 1 : 0)).toBe(0);
        tw.coinCells.forEach((k) => expect(grid.has(k)).toBe(true));
        expect(new Set(tw.coinCells).size).toBe(tw.coinCells.length);
        if (tw.mystery) expect(grid.has(tw.mystery)).toBe(true);
        if (tw.locked) expect(level.words.some((w) => w.w === tw.locked!.word)).toBe(true);
        if (tw.coinCells.length || tw.mystery || tw.locked) boardTwists++;
      }
      expect(twistsFor(41, raw[order[40]]).coinCells).toHaveLength(2);
      expect(twistsFor(61, raw[order[60]]).mystery).not.toBeNull();
      expect(twistsFor(81, raw[order[80]]).locked).not.toBeNull();
      const normals = Array.from({ length: raw.length - 40 }, (_, i) => i + 41).filter((n) => tierOf(n) === 'normal').length;
      expect(boardTwists / normals).toBeGreaterThan(0.25);
      expect(boardTwists / normals).toBeLessThan(0.55);
    });
  }

  it('hints skip the mystery tile and a locked word until it opens', () => {
    const order = levelOrder(packs.en);
    const level = packs.en[order[60]];
    const tw = twistsFor(61, level);
    const found = new Set<string>();
    const revealed = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const k = hintCell(level, found, revealed, hintBlocked(tw, level, found));
      if (!k) break;
      expect(k).not.toBe(tw.mystery);
      revealed.add(k);
    }
    const lv = packs.en[order[80]];
    const lt = twistsFor(81, lv);
    const blocked = hintBlocked(lt, lv, new Set());
    const lockedCells = cellsOf(lv.words.find((w) => w.w === lt.locked!.word)!);
    lockedCells.forEach((k) => expect(blocked.has(k)).toBe(true));
    expect(isLocked(lt, new Set())).toBe(true);
    const others = lv.words.filter((w) => w.w !== lt.locked!.word).slice(0, lt.locked!.after).map((w) => w.w);
    expect(isLocked(lt, new Set(others))).toBe(false);
  });
});

describe('build areas', () => {
  it('64 areas × 6 tasks, cheap first area, every task has art and a name in both languages', () => {
    expect(AREAS).toHaveLength(AREA_COUNT);
    expect(AREAS[0].tasks.map((t) => t.cost)).toEqual([1, 1, 2, 2, 2, 3]);
    for (let k = 0; k < 8; k++) {
      const a = AREAS[k];
      expect(a.tasks).toHaveLength(6);
      a.tasks.forEach((t) => expect([1, 2, 3]).toContain(t.cost));
      const art = areaArt(k);
      expect(Object.keys(art.layers).sort()).toEqual(a.tasks.map((t) => t.id).sort());
      a.tasks.forEach((t) => expect(art.spots[t.id]).toBeDefined());
      for (const lang of ['en', 'tr'] as const) a.tasks.forEach((t) => expect(taskName(t.id, lang)).not.toBe(t.id));
    }
    expect(new Set(AREAS.map((a) => a.id)).size).toBe(AREA_COUNT);
    expect(areaName(0, 'en')).toBe('Reading Garden · Spring');
    expect(areaName(5, 'tr')).toBe('Kütüphane Salonu · Yaz');
    expect(areaName(16, 'en')).toBe('Reading Garden · Spring II');
    // one area ≈ 15 levels at ~1.1 build stars per level
    const cost = AREAS[2].tasks.reduce((s, t) => s + t.cost, 0);
    expect(cost).toBeGreaterThanOrEqual(15);
    expect(cost).toBeLessThanOrEqual(20);
    // gradient ids are unique per area
    expect(areaArt(3).base).toContain('id="lsky3"');
  });
});
