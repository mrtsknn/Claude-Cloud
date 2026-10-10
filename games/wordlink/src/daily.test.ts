import { describe, expect, it } from 'vitest';
import {
  CHAPTER_SIZE,
  chapter,
  chapterCount,
  chapterName,
  chapterOf,
  chapterRange,
  chapterReward,
  isChapterEnd,
  PLACES,
  sceneSvg,
  stepInChapter,
  TIMES,
} from './chapters';
import {
  addDays,
  bestStreak,
  clock,
  currentStreak,
  dailyIndex,
  dayNumber,
  milestoneBonus,
  monthGrid,
  nextMilestone,
  prune,
  type Solved,
} from './daily';

const solvedDays = (...days: string[]): Solved => Object.fromEntries(days.map((d) => [d, { t: 90, h: 0 }]));

describe('daily puzzle seed', () => {
  it('maps a calendar date to the same puzzle for everyone', () => {
    expect(dayNumber('2026-01-01')).toBe(0);
    expect(dayNumber('2026-10-10')).toBe(282);
    expect(dailyIndex('2026-10-10', 366)).toBe(dailyIndex('2026-10-10', 366));
    expect(dailyIndex('2026-10-10', 366)).toBe(282);
    // across DST changes and month ends the day number still steps by exactly one
    expect(dayNumber('2026-03-30') - dayNumber('2026-03-29')).toBe(1);
    expect(dayNumber('2026-10-26') - dayNumber('2026-10-25')).toBe(1);
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('walks every puzzle once before the cycle repeats, and works before the epoch', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 366; i++) seen.add(dailyIndex(addDays('2026-05-01', i), 366));
    expect(seen.size).toBe(366);
    expect(dailyIndex('2025-12-31', 366)).toBe(365);
    expect(dailyIndex('2026-05-01', 366)).toBe(dailyIndex(addDays('2026-05-01', 366), 366));
  });
});

describe('streaks', () => {
  const today = '2026-10-10';
  it('counts consecutive solved days ending today', () => {
    expect(currentStreak(solvedDays('2026-10-08', '2026-10-09', '2026-10-10'), today)).toBe(3);
  });
  it('keeps yesterday’s streak alive while today is still open', () => {
    expect(currentStreak(solvedDays('2026-10-08', '2026-10-09'), today)).toBe(2);
  });
  it('breaks after a whole missed day', () => {
    expect(currentStreak(solvedDays('2026-10-07', '2026-10-08'), today)).toBe(0);
    expect(currentStreak(solvedDays('2026-10-06', '2026-10-08', '2026-10-09', '2026-10-10'), today)).toBe(3);
    expect(currentStreak({}, today)).toBe(0);
  });
  it('streaks run across month and year ends', () => {
    expect(currentStreak(solvedDays('2026-12-30', '2026-12-31', '2027-01-01'), '2027-01-01')).toBe(3);
  });
  it('finds the best streak in the history', () => {
    expect(bestStreak(solvedDays('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-09', '2026-10-10'))).toBe(4);
    expect(bestStreak({})).toBe(0);
  });
  it('pays milestone bonuses at 3, 7 and 30 days (then every 30)', () => {
    expect([1, 2, 3, 4, 7, 8, 30, 31, 60, 61].map(milestoneBonus)).toEqual([0, 0, 50, 0, 150, 0, 500, 0, 500, 0]);
    expect(nextMilestone(0)).toEqual({ days: 3, coins: 50 });
    expect(nextMilestone(3).days).toBe(7);
    expect(nextMilestone(12).days).toBe(30);
    expect(nextMilestone(30).days).toBe(60);
  });
  it('drops old history and junk keys', () => {
    const s = { ...solvedDays('2024-01-01', '2026-10-01'), junk: { t: 1, h: 0 } };
    expect(Object.keys(prune(s, today))).toEqual(['2026-10-01']);
  });
});

describe('calendar + clock', () => {
  it('lays out a month starting on Monday', () => {
    const oct = monthGrid(2026, 10); // 1 Oct 2026 is a Thursday
    expect(oct.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(oct.filter(Boolean)).toHaveLength(31);
    expect(oct.length % 7).toBe(0);
    expect(monthGrid(2026, 2).filter(Boolean)).toHaveLength(28);
    expect(monthGrid(2026, 6)[0]).toBe('2026-06-01'); // a Monday
  });
  it('formats times', () => {
    expect(clock(102)).toBe('1:42');
    expect(clock(5)).toBe('0:05');
    expect(clock(3600)).toBe('60:00');
  });
});

describe('chapters', () => {
  it('groups levels in tens', () => {
    expect(CHAPTER_SIZE).toBe(10);
    expect([1, 10, 11, 20, 21, 400, 401].map(chapterOf)).toEqual([0, 0, 1, 1, 2, 39, 40]);
    expect(chapterRange(3)).toEqual([31, 40]);
    expect([1, 5, 10, 11].map(stepInChapter)).toEqual([1, 5, 10, 1]);
    expect([9, 10, 20, 21].map(isChapterEnd)).toEqual([false, true, true, false]);
    expect(chapterCount(930)).toBe(93);
  });
  it('gives every one of the first 48 chapters its own place and time', () => {
    const looks = new Set(Array.from({ length: PLACES.length * TIMES.length }, (_, i) => `${chapter(i).place}/${chapter(i).time}`));
    expect(looks.size).toBe(48);
    const names = new Set(Array.from({ length: 93 }, (_, i) => chapterName(i, 'tr')));
    expect(names.size).toBe(93);
    expect(chapterName(0, 'en')).toBe('Coast · Dusk');
    expect(chapterName(0, 'tr')).toBe('Kıyı · Akşam');
    expect(chapterName(48, 'en')).toBe('Coast · Dusk II');
  });
  it('draws a deterministic scene per chapter with unique gradient ids', () => {
    expect(sceneSvg(5)).toBe(sceneSvg(5));
    expect(sceneSvg(5)).not.toBe(sceneSvg(6));
    for (let i = 0; i < 48; i++) {
      const svg = sceneSvg(i);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain(`wl-sky-${i}`);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });
  it('rewards chapters with growing, capped coins', () => {
    expect(chapterReward(0)).toBe(100);
    expect(chapterReward(4)).toBe(120);
    expect(chapterReward(90)).toBe(200);
  });
});
