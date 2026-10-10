import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_COUNT,
  LEVEL_COUNT,
  MAX_BANDS,
  MAX_R,
  MIN_R,
  PAINTS,
  REQUEST_VARIANTS,
  ROWS,
  SHELF_MAX,
  START_R,
  STAMP_H,
  addStamp,
  addToShelf,
  classify,
  decodeProfile,
  encodeProfile,
  groove,
  heightOf,
  kindFor,
  makePot,
  matchPercent,
  matchScore,
  orderFor,
  orderReward,
  paintRing,
  parsePot,
  parseShelf,
  pull,
  push,
  ringAt,
  startProfile,
  starsFor,
  targetFor,
  undoBand,
  volumeOf,
  type Decor,
  type Profile,
} from './game';

/** Sculpts like a careful player: sweep every row, pressing in or pulling out to the target. */
function sculpt(target: Profile, passes = 4): Profile {
  let p = startProfile();
  for (let k = 0; k < passes; k++)
    for (let i = 0; i < ROWS; i++) p = p[i] > target[i] ? push(p, i, target[i], 0.6) : pull(p, i, target[i], 0.6);
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
  it('pushing never moves clay outward or below the minimum radius', () => {
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
  it('pulling outward from inside the rim widens nearby rows with a soft falloff', () => {
    const p = pull(startProfile(), 55, 1.2, 1);
    expect(p[55]).toBeCloseTo(1.2, 5);
    expect(p[50]).toBeGreaterThan(START_R);
    expect(p[50]).toBeLessThan(p[55]);
    expect(p[20]).toBeCloseTo(START_R, 6);
  });
  it('pulling never narrows clay and is capped at MAX_R', () => {
    const p = pull(startProfile(), 30, 0.3, 1);
    expect(p).toEqual(startProfile());
    const q = pull(startProfile(), 30, 5, 1);
    expect(Math.max(...q)).toBeLessThanOrEqual(MAX_R + 1e-9);
  });
  it('widened clay spreads low: a pulled-out bowl is lower than the lump', () => {
    let p = startProfile();
    for (let i = 20; i < ROWS; i += 2) p = pull(p, i, 0.9 + (i / ROWS) * 0.35, 1);
    expect(heightOf(p)).toBeLessThan(heightOf(startProfile()) * 0.85);
    expect(classify(p)).toBe('bowl');
  });
  it('fingers leave alternating throwing rings near the contact row', () => {
    const r = groove(new Array(ROWS).fill(0), 30, 0.5);
    expect(r[30]).toBeGreaterThan(r[31]);
    expect(r[31]).toBeGreaterThan(0);
    expect(r[10]).toBe(0);
    expect(Math.max(...groove(r.map(() => 0.9), 30, 1))).toBeLessThanOrEqual(1);
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
      expect(Math.max(...a)).toBeLessThan(MAX_R);
      expect(Math.min(...a)).toBeGreaterThanOrEqual(0.12);
      expect(starsFor(matchPercent(sculpt(a), a))).toBe(3);
    }
  });
  it('bowls are wide and low (rim past the lump, lower than it)', () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const t = targetFor(n);
      if (t.kind !== 'bowl') continue;
      expect(t.profile[ROWS - 1]).toBeGreaterThan(START_R);
      expect(heightOf(t.profile)).toBeLessThan(0.5);
      expect(classify(t.profile)).toBe('bowl');
    }
  });
  it('introduce necked shapes later', () => {
    expect(['cup', 'bowl']).toContain(kindFor(1));
    const later = new Set(Array.from({ length: 60 }, (_, i) => kindFor(i + 40)));
    expect(later.has('pitcher')).toBe(true);
    expect(later.has('vase')).toBe(true);
  });
  it('the lump reads as a cup in free mode', () => {
    expect(classify(startProfile())).toBe('cup');
  });
});

describe('customer orders', () => {
  it('are deterministic and match the level target kind', () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const o = orderFor(n);
      expect(o).toEqual(orderFor(n));
      expect(o.kind).toBe(targetFor(n).kind);
      expect(o.customer).toBeGreaterThanOrEqual(0);
      expect(o.customer).toBeLessThan(CUSTOMER_COUNT);
      expect(o.variant).toBeLessThan(REQUEST_VARIANTS);
    }
    expect(new Set(Array.from({ length: 30 }, (_, i) => orderFor(i + 1).customer)).size).toBeGreaterThan(5);
  });
  it('reward scales with match %, tips for decoration, nothing below 70%', () => {
    expect(orderReward(69, true)).toBe(0);
    expect(orderReward(70, false)).toBe(10);
    let prev = 0;
    for (let p = 70; p <= 100; p++) {
      const r = orderReward(p, false);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    expect(orderReward(100, false)).toBeGreaterThan(orderReward(82, false) + 10);
    expect(orderReward(85, true)).toBe(orderReward(85, false) + 5);
  });
});

describe('decoration', () => {
  const blank: Decor = { g: 'terracotta', b: [] };
  it('brush strokes of one colour merge into a single growing ring band', () => {
    let d = blank;
    for (let r = 10; r <= 20; r++) d = paintRing(d, r, 2);
    expect(d.b).toHaveLength(1);
    expect(d.b[0]).toMatchObject({ k: 'ring', c: 2 });
    expect(d.b[0].r).toBeLessThanOrEqual(10);
    expect(d.b[0].r + d.b[0].h).toBeGreaterThanOrEqual(21);
    expect(ringAt(d, 15)).toBe(2);
    expect(ringAt(d, 40)).toBe(-1);
    // a new colour on top wins where it overlaps
    d = paintRing(d, 15, 0);
    expect(d.b).toHaveLength(2);
    expect(ringAt(d, 15)).toBe(0);
    expect(ringAt(d, 11)).toBe(2);
    // undo peels the last band
    expect(ringAt(undoBand(d), 15)).toBe(2);
    expect(blank.b).toHaveLength(0);
  });
  it('stamps are bands kept inside the pot and capped', () => {
    let d = addStamp(blank, 'waves', 0, 1);
    expect(d.b[0]).toEqual({ k: 'waves', r: 0, h: STAMP_H, c: 1 });
    d = addStamp(d, 'leaves', ROWS + 5, 99);
    expect(d.b[1].r + d.b[1].h).toBeLessThanOrEqual(ROWS);
    expect(d.b[1].c).toBe(PAINTS.length - 1);
    for (let i = 0; i < 100; i++) d = addStamp(d, 'dots', 30, 0);
    expect(d.b.length).toBe(MAX_BANDS);
  });
});

describe('collection', () => {
  it('profiles round-trip through the compact encoding', () => {
    const t = targetFor(42).profile;
    const s = encodeProfile(t);
    expect(s).toHaveLength(ROWS * 2);
    const back = decodeProfile(s)!;
    back.forEach((r, i) => expect(r).toBeCloseTo(t[i], 3));
    expect(matchPercent(back, t)).toBe(100);
    expect(decodeProfile('nope')).toBeNull();
  });
  it('saves and loads pots, dropping anything malformed', () => {
    let d: Decor = { g: 'iznik', b: [] };
    d = paintRing(d, 30, 3);
    d = addStamp(d, 'zigzag', 12, 0);
    const pot = makePot({ profile: targetFor(3).profile, decor: d, mode: 'o', kind: 'cup', pct: 94, level: 3, order: orderFor(3), now: 1_700_000_000_000 });
    const free = makePot({ profile: startProfile(), decor: { g: 'rose', b: [] }, mode: 'f', kind: 'cup', now: 1_700_000_000_001 });
    const shelf = addToShelf(addToShelf([], pot), free);
    expect(shelf.map((p) => p.m)).toEqual(['f', 'o']);
    const json = JSON.parse(JSON.stringify([...shelf, { id: 1 }, null, { ...pot, p: 'bad' }, 'x']));
    const loaded = parseShelf(json);
    expect(loaded).toEqual(shelf);
    expect(loaded[1]).toMatchObject({ pct: 94, lv: 3, cu: orderFor(3).customer, d: { g: 'iznik' } });
    expect(loaded[1].d.b).toHaveLength(2);
    expect(parseShelf('garbage')).toEqual([]);
    // a bad band is skipped, the pot kept
    const bent = parsePot({ ...pot, d: { g: 'x', b: [{ k: 'lasers', r: 1, h: 1, c: 0 }, d.b[0]] } })!;
    expect(bent.d.b).toEqual([d.b[0]]);
    // one pot stays small in storage
    expect(JSON.stringify(pot).length).toBeLessThan(400);
  });
  it('keeps newest first and caps the shelf', () => {
    let s = parseShelf([]);
    for (let i = 0; i < SHELF_MAX + 10; i++) s = addToShelf(s, makePot({ profile: startProfile(), decor: { g: 'rose', b: [] }, mode: 'f', kind: 'cup', now: 1e12 + i }));
    expect(s).toHaveLength(SHELF_MAX);
    expect(s[0].t).toBe(1e12 + SHELF_MAX + 9);
  });
});
