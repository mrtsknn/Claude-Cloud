import { describe, expect, it } from 'vitest';
import { createLives, formatCountdown, LIFE_REGEN_MS } from './lives';
import { createWinStreak } from './streak';
import { createBuild, type BuildArea } from './build';
import { botOpponents, createLeague, LEAGUE_GROUP, weekEnd, weekId, weekStart } from './league';
import { createAlbum, CARD_PRICE, DUP_DUST, SET_SIZE, cardId } from './album';
import { continueOffer, createInterstitialPolicy } from './offers';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const clock = (t = new Date(2026, 9, 7, 12, 0).getTime()) => {
  const c = { t, now: () => c.t, add: (ms: number) => (c.t += ms) };
  return c;
};
const MIN = 60_000;

describe('lives', () => {
  it('starts full, loses one per fail and regenerates every 30 minutes from timestamps', () => {
    const c = clock();
    const st = memory();
    const l = createLives({ game: 't', storage: st, now: c.now });
    expect(l.count).toBe(5);
    expect(l.full()).toBe(true);
    expect(l.lose()).toBe(true);
    expect(l.lose()).toBe(true);
    expect(l.count).toBe(3);
    expect(l.nextInMs()).toBe(LIFE_REGEN_MS);
    c.add(29 * MIN);
    expect(l.count).toBe(3);
    c.add(MIN);
    expect(l.count).toBe(4);
    expect(l.nextInMs()).toBe(LIFE_REGEN_MS); // the second life runs on its own 30 minutes
    // the app was closed for hours: a fresh store sees the regenerated lives
    c.add(5 * 60 * MIN);
    expect(createLives({ game: 't', storage: st, now: c.now }).count).toBe(5);
  });

  it('runs dry, refills by ad (+1) and coins (full), never above max', () => {
    const c = clock();
    const l = createLives({ game: 't', storage: memory(), now: c.now });
    for (let i = 0; i < 5; i++) l.lose();
    expect(l.count).toBe(0);
    expect(l.canPlay()).toBe(false);
    expect(l.lose()).toBe(false);
    expect(l.fullInMs()).toBe(5 * LIFE_REGEN_MS);
    l.add(1);
    expect(l.count).toBe(1);
    l.refill();
    expect(l.count).toBe(5);
    l.add(3);
    expect(l.count).toBe(5);
  });

  it('timed unlimited grants: no lives lost while running, stacking', () => {
    const c = clock();
    const l = createLives({ game: 't', storage: memory(), now: c.now });
    l.grantUnlimited(60 * MIN);
    l.grantUnlimited(30 * MIN);
    expect(l.unlimited()).toBe(true);
    expect(l.unlimitedLeftMs()).toBe(90 * MIN);
    expect(l.lose()).toBe(false);
    expect(l.count).toBe(5);
    c.add(91 * MIN);
    expect(l.unlimited()).toBe(false);
    expect(l.lose()).toBe(true);
  });

  it('survives a clock moved back and corrupt saves', () => {
    const c = clock();
    const st = memory();
    const l = createLives({ game: 't', storage: st, now: c.now });
    l.lose();
    c.add(-3 * 60 * MIN);
    expect(l.count).toBe(4);
    expect(l.nextInMs()).toBe(LIFE_REGEN_MS);
    st.setItem('t.lives', '{"lives":"x","since":-5');
    expect(createLives({ game: 't', storage: st, now: c.now }).count).toBe(5);
  });

  it('formats countdowns', () => {
    expect(formatCountdown(29 * MIN + 5000)).toBe('29:05');
    expect(formatCountdown(61 * MIN)).toBe('1:01:00');
    expect(formatCountdown(0)).toBe('0:00');
  });
});

describe('win streak', () => {
  it('raises tiers up to 3 and resets on a fail', () => {
    const st = memory();
    const s = createWinStreak({ game: 't', storage: st });
    expect(s.tier).toBe(0);
    s.win();
    s.win();
    expect(s.tier).toBe(2);
    s.win();
    s.win();
    expect(s.tier).toBe(3);
    expect(s.count).toBe(4);
    expect(createWinStreak({ game: 't', storage: st }).tier).toBe(3);
    expect(s.fail()).toBe(4);
    expect(s.tier).toBe(0);
    expect(s.best).toBe(4);
  });
});

describe('build', () => {
  const areas: BuildArea[] = [
    { id: 'garden', tasks: [{ id: 'bench', cost: 1 }, { id: 'tree', cost: 2 }], reward: { coins: 100, packs: 1 } },
    { id: 'hall', tasks: [{ id: 'shelf', cost: 3 }], reward: { coins: 200 } },
  ];
  it('spends stars on tasks, completes an area and opens the next one', () => {
    const st = memory();
    const b = createBuild({ game: 't', storage: st, areas });
    expect(b.nextTask()?.id).toBe('bench');
    expect(b.build('bench')).toBe(false);
    b.addStars(2);
    expect(b.canBuild()).toBe(true);
    expect(b.build('tree')).toBe(true); // any order
    expect(b.stars).toBe(0);
    expect(b.nextTask()?.id).toBe('bench');
    expect(b.build('tree')).toBe(false); // already done
    b.addStars(1);
    expect(b.build('bench')).toBe(true);
    expect(b.areaComplete()).toBe(true);
    expect(createBuild({ game: 't', storage: st, areas }).progress()).toEqual({ done: 2, total: 2 });
    expect(b.claimArea()).toEqual({ coins: 100, packs: 1 });
    expect(b.claimArea()).toBeNull();
    expect(b.area()?.id).toBe('hall');
    expect(b.progress()).toEqual({ done: 0, total: 1 });
    b.addStars(3);
    b.build('shelf');
    b.claimArea();
    expect(b.allDone()).toBe(true);
    expect(b.area()).toBeNull();
    expect(b.earned).toBe(6);
  });
  it('drops unknown task ids and clamps the area on load', () => {
    const st = memory();
    st.setItem('t.build', JSON.stringify({ stars: 4, area: 9, done: ['x'] }));
    const b = createBuild({ game: 't', storage: st, areas });
    expect(b.areaIndex).toBe(2);
    st.setItem('t.build', JSON.stringify({ stars: 4, area: 0, done: ['tree', 'nope', 'tree'] }));
    expect([...createBuild({ game: 't', storage: st, areas }).doneTasks()]).toEqual(['tree']);
  });
});

describe('league', () => {
  // Wednesday 2026-10-07 12:00 local
  const wed = new Date(2026, 9, 7, 12, 0).getTime();
  it('weeks run Monday to Monday in local time', () => {
    expect(weekId(wed)).toBe('2026-10-05');
    expect(new Date(weekStart(wed)).getDay()).toBe(1);
    expect(weekEnd(wed) - weekStart(wed)).toBeGreaterThanOrEqual(7 * 86_400_000 - 3_600_000);
    expect(weekId(new Date(2026, 9, 11, 23, 59).getTime())).toBe('2026-10-05'); // Sunday
    expect(weekId(new Date(2026, 9, 12, 0, 0).getTime())).toBe('2026-10-12');
  });

  it('bots are deterministic, realistic and grow through the week', () => {
    const ctx = { week: '2026-10-05', tier: 1, playerId: 'abc', progress: 0.3 };
    const a = botOpponents.opponents(ctx);
    expect(a).toEqual(botOpponents.opponents(ctx));
    expect(a).toHaveLength(LEAGUE_GROUP - 1);
    expect(new Set(a.map((e) => e.name)).size).toBe(LEAGUE_GROUP - 1);
    const end = botOpponents.opponents({ ...ctx, progress: 1 });
    a.forEach((e, i) => expect(end[i].score).toBeGreaterThanOrEqual(e.score));
    const total = end.reduce((s, e) => s + e.score, 0);
    expect(total).toBeGreaterThan(29 * 5);
    expect(botOpponents.opponents({ ...ctx, progress: 0 }).every((e) => e.score === 0)).toBe(true);
    // another player or week gets another group
    expect(botOpponents.opponents({ ...ctx, playerId: 'xyz' })).not.toEqual(a);
    // higher tiers play more
    const sum = (tier: number) => botOpponents.opponents({ ...ctx, tier, progress: 1 }).reduce((s, e) => s + e.score, 0);
    expect(sum(5)).toBeGreaterThan(sum(0));
  });

  it('scores, ranks and promotes the top 5 at week end with a reward', () => {
    const c = clock(wed);
    const st = memory();
    const lg = createLeague({ game: 't', storage: st, now: c.now, rng: () => 0.5 });
    expect(lg.tier).toBe(0);
    lg.addScore(500);
    const s = lg.standings();
    expect(s.rows).toHaveLength(LEAGUE_GROUP);
    expect(s.rank).toBe(1);
    expect(s.zone).toBe('up');
    expect(lg.pendingResult()).toBeNull();
    c.add(6 * 86_400_000); // next Tuesday
    const r = lg.pendingResult()!;
    expect(r).toMatchObject({ week: '2026-10-05', rank: 1, tier: 0, newTier: 1, score: 500 });
    expect(r.reward.coins).toBeGreaterThan(0);
    expect(r.reward.packs).toBe(2);
    expect(lg.tier).toBe(1);
    expect(lg.score).toBe(0);
    // persisted until claimed
    expect(createLeague({ game: 't', storage: st, now: c.now }).pendingResult()?.rank).toBe(1);
    expect(lg.claimResult()).toEqual(r.reward);
    expect(lg.pendingResult()).toBeNull();
  });

  it('relegates the bottom 5 and skips weeks without play', () => {
    const c = clock(wed);
    const st = memory();
    st.setItem('t.league', JSON.stringify({ playerId: 'p', week: '2026-10-05', tier: 3, score: 1, result: null }));
    const lg = createLeague({ game: 't', storage: st, now: c.now });
    c.add(7 * 86_400_000);
    const r = lg.pendingResult()!;
    expect(r.rank).toBeGreaterThan(LEAGUE_GROUP - 5);
    expect(r.newTier).toBe(2);
    lg.claimResult();
    c.add(7 * 86_400_000); // a week with no wins: no result, tier kept
    expect(lg.pendingResult()).toBeNull();
    expect(lg.tier).toBe(2);
  });

  it('accepts another opponents provider (server)', () => {
    const lg = createLeague({ game: 't', storage: memory(), now: () => wed, opponents: { opponents: () => Array.from({ length: 29 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, score: 10 })) } });
    lg.addScore(5);
    expect(lg.standings().rank).toBe(30);
  });
});

describe('album', () => {
  const sets = [
    { id: 'a', reward: 100 },
    { id: 'b', reward: 150 },
    { id: 'c', reward: 200 },
  ];
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  it('packs give new cards first, duplicates become dust, sets complete once', () => {
    const st = memory();
    const al = createAlbum({ game: 't', storage: st, sets, rng });
    expect(al.openPack()).toBeNull();
    al.addPacks(40);
    expect(al.activeSets()).toEqual(['a', 'b']);
    const first = al.openPack()!;
    expect(first).toHaveLength(3);
    expect(first[0].isNew).toBe(true);
    expect(first.every((c) => c.set === 'a' || c.set === 'b')).toBe(true);
    let dust = 0;
    let opened = 1;
    while (!al.setComplete('a') && al.packs > 0) {
      const p = al.openPack()!;
      opened++;
      expect(p[0].isNew).toBe(true);
      dust += p.reduce((s, c) => s + c.dust, 0);
      p.filter((c) => !c.isNew).forEach((c) => expect(c.dust).toBe(DUP_DUST[c.rarity]));
    }
    expect(al.setComplete('a')).toBe(true);
    expect(opened).toBeLessThanOrEqual(18); // two sets of 9 with a guaranteed new card per pack
    expect(al.dust).toBe(dust + first.reduce((s, c) => s + c.dust, 0));
    expect(al.claimable()).toContain('a');
    expect(al.claimSet('a')).toBe(100);
    expect(al.claimSet('a')).toBe(0);
    expect(al.activeSets()[0]).not.toBe('a');
    // persisted
    const again = createAlbum({ game: 't', storage: st, sets, rng });
    expect(again.setCount('a')).toBe(SET_SIZE);
    expect(again.isClaimed('a')).toBe(true);
  });

  it('dust buys a chosen missing card', () => {
    const st = memory();
    st.setItem('t.album', JSON.stringify({ have: [], dust: CARD_PRICE[2] + 5, packs: 0, claimed: [] }));
    const al = createAlbum({ game: 't', storage: st, sets, rng });
    expect(al.buyCard(cardId('c', 8))).toBe(true);
    expect(al.dust).toBe(5);
    expect(al.buyCard(cardId('c', 8))).toBe(false);
    expect(al.buyCard(cardId('c', 0))).toBe(false);
    expect(al.buyCard('zz:1')).toBe(false);
  });
});

describe('offers', () => {
  it('first continue: ad or coins; later only escalating coins', () => {
    expect(continueOffer(0)).toEqual({ ad: true, coins: 100 });
    expect(continueOffer(1)).toEqual({ ad: false, coins: 200 });
    expect(continueOffer(2)).toEqual({ ad: false, coins: 400 });
    expect(continueOffer(3)).toEqual({ ad: false, coins: null });
    expect(continueOffer(1, [50, 75])).toEqual({ ad: false, coins: 75 });
  });

  it('interstitials: not before level 3, at most every 2 wins, never after a loss', () => {
    const p = createInterstitialPolicy();
    expect([1, 2].map((l) => p.afterWin(l))).toEqual([false, false]);
    expect(p.afterWin(3)).toBe(true);
    expect(p.afterWin(4)).toBe(false);
    expect(p.afterWin(5)).toBe(true);
    p.afterLoss();
    expect(p.afterWin(6)).toBe(false); // first win right after a loss
    expect(p.afterWin(7)).toBe(true);
  });
});
