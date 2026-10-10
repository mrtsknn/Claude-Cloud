import { describe, expect, it, vi, afterEach } from 'vitest';
import { createProfile, DAILY_REWARDS, AD_COINS_PER_DAY } from './profile';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const make = (storage = memory()) =>
  createProfile({
    game: 't',
    levelCount: 10,
    defaultSkin: 'a',
    skinIds: ['a', 'b'],
    missions: [
      { id: 'levels', targets: [3], reward: () => 50 },
      { id: 'stars', targets: [5], reward: () => 40 },
      { id: 'games', targets: [2], reward: () => 30 },
    ],
    storage,
    rng: () => 0,
  });

afterEach(() => vi.useRealTimers());

describe('profile', () => {
  it('records stars, unlocks the next level and keeps the best result', () => {
    const p = make();
    expect(p.recordLevel(1, 2)).toEqual({ newStars: 2, firstClear: true });
    expect(p.data.unlocked).toBe(2);
    expect(p.recordLevel(1, 1).newStars).toBe(0);
    expect(p.data.stars[0]).toBe(2);
    expect(p.totalStars()).toBe(2);
  });

  it('survives corrupt and partial saves', () => {
    const s = memory();
    s.setItem('t.profile', '{bad json');
    expect(make(s).data.coins).toBe(100);
    s.setItem('t.profile', JSON.stringify({ coins: -5, stars: ['x', 9], owned: ['zzz'], skin: 'zzz', unlocked: 999 }));
    const p = make(s);
    expect(p.data.coins).toBe(0);
    expect(p.data.stars.slice(0, 2)).toEqual([0, 3]);
    expect(p.data.owned).toEqual(['a']);
    expect(p.data.skin).toBe('a');
    expect(p.data.unlocked).toBe(10);
  });

  it('pays the 7-day calendar, once a day, and restarts after a missed day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12));
    const p = make();
    expect(p.claimDaily()).toBe(DAILY_REWARDS[0]);
    expect(p.claimDaily()).toBeNull();
    vi.setSystemTime(new Date(2026, 0, 2, 12));
    expect(p.dailyIndex()).toBe(1);
    expect(p.claimDaily()).toBe(DAILY_REWARDS[1]);
    vi.setSystemTime(new Date(2026, 0, 5, 12));
    expect(p.dailyIndex()).toBe(0);
    expect(p.claimDaily()).toBe(DAILY_REWARDS[0]);
  });

  it('advances and pays missions exactly once', () => {
    const p = make();
    const i = p.missions().findIndex((m) => m.id === 'levels');
    expect(p.progress('levels', 2)).toBe(false);
    expect(p.claimMission(i)).toBe(0);
    expect(p.progress('levels')).toBe(true);
    const before = p.data.coins;
    expect(p.claimMission(i)).toBe(50);
    expect(p.claimMission(i)).toBe(0);
    expect(p.data.coins).toBe(before + 50);
  });

  it('caps free video coins per day and handles skins', () => {
    const p = make();
    for (let i = 0; i < AD_COINS_PER_DAY; i++) p.grantAdCoins();
    expect(p.adCoinsLeft()).toBe(0);
    expect(p.spend(1e9)).toBe(false);
    p.unlockSkin('b');
    expect(p.data.skin).toBe('b');
    p.equip('zzz');
    expect(p.data.skin).toBe('b');
  });
});
