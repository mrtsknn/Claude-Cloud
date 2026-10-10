/**
 * New-mechanic rhythm (docs/RETENTION.md §2): every ~20 levels a new twist joins the mix. Its
 * first level always has it (with a one-time tip); after that it shows up on some levels,
 * picked deterministically from the level number. Pure: the board/UI read the result.
 *
 *   20  timed     hard / very hard levels run against a clock (see difficulty.ts)
 *   41  coins     two tiles carry coins, collected when a found word uncovers them
 *   61  mystery   a "?" tile that hints never reveal: it has to be found by a word
 *   81  locked    a padlocked word that opens only after other words are found
 * (board twists start right after a very hard level, which only ever has the clock)
 */
import { cellsOf, type Level } from './game';
import { tierOf, timeLimit } from './difficulty';

export type TwistId = 'timed' | 'coins' | 'mystery' | 'locked';
export const TWIST_SCHEDULE: { id: TwistId; from: number }[] = [
  { id: 'timed', from: 20 },
  { id: 'coins', from: 41 },
  { id: 'mystery', from: 61 },
  { id: 'locked', from: 81 },
];
export const COIN_TILE = 5;
/** Share of later normal levels that get one of the board twists. */
const TWIST_RATE = 0.4;

export interface Twists {
  /** Seconds on the clock (0 = untimed). */
  timed: number;
  coinCells: string[];
  mystery: string | null;
  locked: { word: string; after: number } | null;
}

function rand(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The twist a level introduces (its first appearance), if any. */
export const introAt = (n: number): TwistId | null => TWIST_SCHEDULE.find((t) => t.from === n)?.id ?? null;

export function twistsFor(n: number, level: Level): Twists {
  const out: Twists = { timed: timeLimit(n, level), coinCells: [], mystery: null, locked: null };
  if (out.timed || tierOf(n) !== 'normal') return out; // hard levels get the clock only
  const r = rand(n);
  const open = TWIST_SCHEDULE.filter((t) => t.id !== 'timed' && n >= t.from);
  if (!open.length) return out;
  const intro = introAt(n);
  let pick: TwistId | null = intro && intro !== 'timed' ? intro : null;
  if (!pick && r() < TWIST_RATE) pick = open[Math.floor(r() * open.length)].id;
  const count = new Map<string, number>();
  for (const p of level.words) cellsOf(p).forEach((k) => count.set(k, (count.get(k) ?? 0) + 1));
  if (pick === 'coins') {
    const cells = [...count.keys()].sort();
    while (out.coinCells.length < 2 && cells.length) out.coinCells.push(cells.splice(Math.floor(r() * cells.length), 1)[0]);
  } else if (pick === 'mystery') {
    // middle letter of the longest word, preferring a tile no other word crosses
    const longest = [...level.words].sort((a, b) => b.w.length - a.w.length || a.w.localeCompare(b.w))[0];
    const cells = cellsOf(longest);
    const mid = Math.floor(cells.length / 2);
    out.mystery = [...cells].sort((a, b) => (count.get(a)! - count.get(b)!) || Math.abs(cells.indexOf(a) - mid) - Math.abs(cells.indexOf(b) - mid))[0];
  } else if (pick === 'locked' && level.words.length >= 4) {
    const byLen = [...level.words].sort((a, b) => a.w.length - b.w.length || a.w.localeCompare(b.w));
    out.locked = { word: byLen[Math.floor(byLen.length / 2)].w, after: level.words.length >= 6 ? 3 : 2 };
  }
  return out;
}

/** Locked word still closed? */
export const isLocked = (tw: Twists, found: Set<string>) => !!tw.locked && !found.has(tw.locked.word) && found.size < tw.locked.after;

/** Cells a hint may not reveal: the mystery tile, and a closed locked word. */
export function hintBlocked(tw: Twists, level: Level, found: Set<string>): Set<string> {
  const out = new Set<string>();
  if (tw.mystery) out.add(tw.mystery);
  if (isLocked(tw, found)) {
    const p = level.words.find((w) => w.w === tw.locked!.word);
    if (p) cellsOf(p).forEach((k) => out.add(k));
  }
  return out;
}

