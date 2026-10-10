/**
 * Daily puzzle — pure date and streak logic. Days are local calendar dates as `YYYY-MM-DD`
 * (the kit's `dayKey`), so everyone on the same date gets the same puzzle.
 */

/** Day 0 of the daily cycle. */
const EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;

export function parseDay(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

const utc = (key: string) => {
  const { y, m, d } = parseDay(key);
  return Date.UTC(y, m - 1, d);
};

export const keyOf = (ms: number) => {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

/** Whole days since the cycle epoch (negative before it). Time zones never matter here. */
export const dayNumber = (key: string) => Math.round((utc(key) - EPOCH) / DAY_MS);

export const addDays = (key: string, delta: number) => keyOf(utc(key) + delta * DAY_MS);

/** Which puzzle of a pack of `count` belongs to this date; walks the whole pack before repeating. */
export function dailyIndex(key: string, count: number): number {
  return ((dayNumber(key) % count) + count) % count;
}

/** One solved day: time in seconds and hints used. */
export interface DayResult {
  t: number;
  h: number;
}
export type Solved = Record<string, DayResult>;

/**
 * Current streak: consecutive solved days ending today — or ending yesterday while today's
 * puzzle is still open (a streak only breaks once a whole day is missed).
 */
export function currentStreak(solved: Solved, today: string): number {
  let day = solved[today] ? today : addDays(today, -1);
  let n = 0;
  while (solved[day]) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function bestStreak(solved: Solved): number {
  const days = Object.keys(solved).sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Streak milestones and their bonus coins; every further 30 days pays like day 30. */
export const STREAK_MILESTONES: { days: number; coins: number }[] = [
  { days: 3, coins: 50 },
  { days: 7, coins: 150 },
  { days: 30, coins: 500 },
];

/** Bonus coins for reaching `streak` today (0 if it is not a milestone). */
export function milestoneBonus(streak: number): number {
  const exact = STREAK_MILESTONES.find((m) => m.days === streak);
  if (exact) return exact.coins;
  return streak > 30 && streak % 30 === 0 ? STREAK_MILESTONES[2].coins : 0;
}

/** Next milestone after `streak` (for "2 more days to the 7-day bonus"). */
export function nextMilestone(streak: number): { days: number; coins: number } {
  return STREAK_MILESTONES.find((m) => m.days > streak) ?? { days: (Math.floor(streak / 30) + 1) * 30, coins: STREAK_MILESTONES[2].coins };
}

/**
 * Month calendar, weeks starting Monday: day keys, `null` for padding cells before the 1st
 * and after the last day.
 */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** 102 → "1:42". */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Drops results older than `keep` days so the save never grows without bound. */
export function prune(solved: Solved, today: string, keep = 400): Solved {
  const min = dayNumber(today) - keep;
  return Object.fromEntries(Object.entries(solved).filter(([d]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && dayNumber(d) >= min));
}
