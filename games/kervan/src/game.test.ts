import { describe, expect, it } from 'vitest';
import { fmt, fmtDuration, suffix } from './format';
import {
  BASE_RATE,
  CITY_COUNT,
  MAX_CAMELS,
  OFFLINE_CAP_SEC,
  PROD_COST,
  STASH_SECONDS,
  STAR_UNIT,
  UNLOCK_COST,
  BOOST_CAP_SEC,
  addBoost,
  applyOffline,
  baseRate,
  buy,
  canPrestige,
  cityRate,
  instantIncome,
  migrate,
  milestoneMult,
  newCity,
  newState,
  offlineEarnings,
  prestige,
  simulate,
  starsFor,
  tap,
  tick,
  totalRate,
  unlockNext,
  upgradeCost,
  type State,
} from './game';

function allCities(): State {
  const s = newState();
  s.cities = Array.from({ length: CITY_COUNT }, newCity);
  return s;
}

describe('format', () => {
  it('formats small and big numbers with 3 significant digits', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(999.9)).toBe('999');
    expect(fmt(1000)).toBe('1.00K');
    expect(fmt(1234)).toBe('1.23K');
    expect(fmt(45_600)).toBe('45.6K');
    expect(fmt(3.4e6)).toBe('3.40M');
    expect(fmt(7.89e11)).toBe('789B');
    expect(fmt(2e12)).toBe('2.00T');
    expect(fmt(1e15)).toBe('1.00aa');
    expect(fmt(5.5e18)).toBe('5.50ab');
    expect(fmt(-1500)).toBe('-1.50K');
    expect(fmt(Infinity)).toBe('∞');
  });
  it('rounds up across a tier boundary', () => {
    expect(fmt(999_999)).toBe('1.00M');
    expect(fmt(999_499)).toBe('999K');
  });
  it('letter suffixes continue aa..az, ba', () => {
    expect(suffix(5)).toBe('aa');
    expect(suffix(30)).toBe('az');
    expect(suffix(31)).toBe('ba');
  });
  it('formats durations', () => {
    expect(fmtDuration(38)).toBe('38s');
    expect(fmtDuration(252)).toBe('4m 12s');
    expect(fmtDuration(3900)).toBe('1h 05m');
  });
});

describe('costs and income', () => {
  it('upgrade costs grow geometrically (x1.15 per level)', () => {
    const s = newState();
    expect(upgradeCost(s, 0, 'prod')).toBe(PROD_COST[0]);
    s.cities[0].level = 11;
    expect(upgradeCost(s, 0, 'prod')).toBe(Math.ceil(PROD_COST[0] * Math.pow(1.15, 10)));
    s.cities[0].camels = MAX_CAMELS;
    expect(upgradeCost(s, 0, 'camel')).toBe(Infinity);
    s.cities[0].merchant = true;
    expect(upgradeCost(s, 0, 'merchant')).toBe(Infinity);
  });
  it('income is linear in level with x2 milestones at 25/50/100', () => {
    expect(milestoneMult(24)).toBe(1);
    expect(milestoneMult(25)).toBe(2);
    expect(milestoneMult(50)).toBe(4);
    expect(milestoneMult(100)).toBe(8);
    const s = newState();
    const r1 = cityRate(s, 0);
    s.cities[0].level = 10;
    expect(cityRate(s, 0)).toBeCloseTo(r1 * 10);
    s.cities[0].level = 25;
    expect(cityRate(s, 0)).toBeCloseTo(r1 * 50);
  });
  it('camels, speed and reputation multiply income', () => {
    const s = newState();
    const base = cityRate(s, 0);
    s.cities[0].camels = 3;
    expect(cityRate(s, 0)).toBeCloseTo(base * 2);
    s.cities[0].speed = 4;
    expect(cityRate(s, 0)).toBeCloseTo(base * 4);
    s.stars = 10;
    expect(cityRate(s, 0)).toBeCloseTo(base * 8);
  });
  it('buy spends coins and refuses when broke', () => {
    const s = newState();
    expect(buy(s, 0, 'prod')).toBe(false);
    s.coins = 100;
    expect(buy(s, 0, 'prod')).toBe(true);
    expect(s.coins).toBe(100 - PROD_COST[0]);
    expect(s.cities[0].level).toBe(2);
  });
  it('unlocks cities in order at their cost', () => {
    const s = newState();
    s.coins = UNLOCK_COST[1] - 1;
    expect(unlockNext(s)).toBe(false);
    s.coins = UNLOCK_COST[1];
    expect(unlockNext(s)).toBe(true);
    expect(s.cities.length).toBe(2);
    expect(s.coins).toBe(0);
  });
});

describe('tick, tap and offline', () => {
  it('without a merchant income fills the stash up to a cap; tapping collects it', () => {
    const s = newState();
    tick(s, 10);
    expect(s.coins).toBe(0);
    expect(s.cities[0].stash).toBeCloseTo(10 * BASE_RATE[0]);
    tick(s, 1000);
    expect(s.cities[0].stash).toBeCloseTo(STASH_SECONDS * BASE_RATE[0]);
    const gain = tap(s, 0);
    expect(gain).toBeCloseTo(STASH_SECONDS * BASE_RATE[0] + 1);
    expect(s.coins).toBeCloseTo(gain);
    expect(s.cities[0].stash).toBe(0);
  });
  it('merchants credit coins directly', () => {
    const s = newState();
    s.cities[0].merchant = true;
    tick(s, 10);
    expect(s.coins).toBeCloseTo(10 * cityRate(s, 0));
    expect(s.runEarned).toBeCloseTo(s.coins);
  });
  it('offline earnings come from merchants only and cap at 8 hours', () => {
    const s = newState();
    expect(offlineEarnings(s, 3600).coins).toBe(0);
    s.cities[0].merchant = true;
    const r = cityRate(s, 0);
    expect(offlineEarnings(s, 3600).coins).toBeCloseTo(3600 * r);
    expect(offlineEarnings(s, 100 * 3600)).toEqual({ coins: OFFLINE_CAP_SEC * r, seconds: OFFLINE_CAP_SEC });
    expect(offlineEarnings(s, -5).coins).toBe(0);
    expect(offlineEarnings(s, NaN).coins).toBe(0);
    expect(applyOffline(s, 3600, 2)).toBeCloseTo(7200 * r);
    expect(s.coins).toBeCloseTo(7200 * r);
  });
});

describe('bazaar boosts', () => {
  it('x2 boost doubles income, counts down and stacks up to a cap', () => {
    const s = newState();
    s.cities[0].merchant = true;
    const r = cityRate(s, 0);
    addBoost(s, 1800);
    expect(cityRate(s, 0)).toBeCloseTo(2 * r);
    expect(baseRate(s)).toBeCloseTo(r);
    tick(s, 10);
    expect(s.coins).toBeCloseTo(20 * r);
    expect(s.boost).toBeCloseTo(1790);
    addBoost(s, 99 * 3600);
    expect(s.boost).toBe(BOOST_CAP_SEC);
    s.boost = 0.5;
    tick(s, 1);
    expect(s.boost).toBe(0);
    expect(cityRate(s, 0)).toBeCloseTo(r);
  });
  it('offline: only the boosted part of the absence is doubled', () => {
    const s = newState();
    s.cities[0].merchant = true;
    const r = cityRate(s, 0);
    addBoost(s, 1800);
    expect(offlineEarnings(s, 3600).coins).toBeCloseTo(r * 5400);
    applyOffline(s, 3600);
    expect(s.boost).toBe(0);
    expect(s.coins).toBeCloseTo(r * 5400);
  });
  it('instant income pays an hour of every city, unboosted', () => {
    const s = newState();
    s.cities.push(newCity());
    addBoost(s, 600);
    const got = instantIncome(s, 3600);
    expect(got).toBeCloseTo((totalRate(s) / 2) * 3600);
    expect(s.coins).toBeCloseTo(got);
    expect(s.runEarned).toBeCloseTo(got);
  });
  it('boost survives a New Era and corrupt values are clamped', () => {
    const s = allCities();
    s.runEarned = STAR_UNIT * 4;
    addBoost(s, 900);
    prestige(s);
    expect(s.boost).toBe(900);
    expect(migrate({ boost: -5 }).boost).toBe(0);
    expect(migrate({ boost: 1e9 }).boost).toBe(BOOST_CAP_SEC);
  });
});

describe('prestige', () => {
  it('requires all cities and at least one star', () => {
    const s = newState();
    s.runEarned = STAR_UNIT * 100;
    expect(canPrestige(s)).toBe(false);
    const full = allCities();
    full.runEarned = STAR_UNIT * 0.5;
    expect(canPrestige(full)).toBe(false);
  });
  it('stars = floor(sqrt(earned / unit)); reset keeps stars and lifetime', () => {
    expect(starsFor(STAR_UNIT * 16)).toBe(4);
    expect(starsFor(STAR_UNIT * 15.9)).toBe(3);
    const s = allCities();
    s.stars = 2;
    s.coins = 1e12;
    s.runEarned = STAR_UNIT * 25;
    s.totalEarned = STAR_UNIT * 30;
    const before = totalRate(s) / s.cities.length;
    expect(prestige(s)).toBe(5);
    expect(s.stars).toBe(7);
    expect(s.prestiges).toBe(1);
    expect(s.coins).toBe(0);
    expect(s.cities.length).toBe(1);
    expect(s.runEarned).toBe(0);
    expect(s.totalEarned).toBe(STAR_UNIT * 30);
    expect(cityRate(s, 0)).toBeCloseTo(1.7);
    expect(before).toBeGreaterThan(0);
  });
});

describe('save migration', () => {
  it('never crashes on corrupt or old saves', () => {
    for (const raw of [null, undefined, 42, 'x', [], {}, { coins: 'lots' }, { cities: [null, 3, {}] }, { coins: NaN, stars: -4, cities: [{ level: -3, camels: 99 }] }]) {
      const s = migrate(raw);
      expect(s.cities.length).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(s.coins)).toBe(true);
      expect(s.stars).toBeGreaterThanOrEqual(0);
      for (const c of s.cities) {
        expect(c.level).toBeGreaterThanOrEqual(1);
        expect(c.camels).toBeLessThanOrEqual(MAX_CAMELS);
      }
      expect(() => tick(s, 1)).not.toThrow();
    }
  });
  it('round-trips a real save', () => {
    const s = newState();
    s.coins = 1234;
    s.cities.push({ level: 7, camels: 2, speed: 1, merchant: true, stash: 5 });
    expect(migrate(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('drops extra cities from a tampered save', () => {
    expect(migrate({ cities: Array.from({ length: 12 }, newCity) }).cities.length).toBe(CITY_COUNT);
  });
});

describe('balance simulation', () => {
  it('ROI player: city 2 in ~1-2 min, city 6 within 3 h, 10-star New Era within 5 h', () => {
    const r = simulate(5 * 3600);
    expect(r.unlockAt.length).toBe(CITY_COUNT);
    expect(r.unlockAt[1]).toBeGreaterThan(45);
    expect(r.unlockAt[1]).toBeLessThan(150);
    expect(r.unlockAt[2]).toBeLessThan(10 * 60);
    expect(r.unlockAt[5]).toBeLessThan(3 * 3600);
    expect(r.unlockAt[5]).toBeGreaterThan(1.5 * 3600);
    expect(r.prestigeAt).not.toBeNull();
    expect(r.prestigeAt!).toBeGreaterThan(3 * 3600 * 0.9);
  });
});
