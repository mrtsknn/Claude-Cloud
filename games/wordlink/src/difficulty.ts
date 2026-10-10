/**
 * Saw-tooth difficulty without new content: inside every chapter of 10, the hardest reviewed
 * level of that chapter is played 10th ("very hard", badge, double reward) and the second
 * hardest 5th ("hard", 1.5x reward); the other eight keep their order. Only the order of the
 * existing, hand-reviewed levels changes — no word is added. From TIMED_FROM on, hard and very
 * hard levels run against a clock (the game's fail state: lives, continue offer, streak loss).
 */
import type { Level } from './game';
import { CHAPTER_SIZE } from './chapters';

export type Tier = 'normal' | 'hard' | 'veryhard';
export const TIMED_FROM = 20;
/** Seconds a continue adds to the clock. */
export const CONTINUE_SECONDS = 30;

export const tierOf = (n: number): Tier => (n % 10 === 0 ? 'veryhard' : n % 5 === 0 ? 'hard' : 'normal');

/** How demanding a level is: wheel size dominates, then the letters to find. */
export const hardness = (l: Level) => l.letters.length * 100 + l.words.reduce((s, w) => s + w.w.length, 0);

/**
 * Play order over a pack: `order[n - 1]` is the pack index played as level n. A permutation
 * inside each full chapter; a trailing partial chapter keeps its order.
 */
export function levelOrder(pack: Level[]): number[] {
  const order = pack.map((_, i) => i);
  for (let start = 0; start + CHAPTER_SIZE <= pack.length; start += CHAPTER_SIZE) {
    const idx = order.slice(start, start + CHAPTER_SIZE);
    // stable: on equal hardness the later level counts as harder (packs grow within a chapter)
    const ranked = [...idx].sort((a, b) => hardness(pack[a]) - hardness(pack[b]) || a - b);
    const hardest = ranked[CHAPTER_SIZE - 1];
    const second = ranked[CHAPTER_SIZE - 2];
    const rest = idx.filter((i) => i !== hardest && i !== second);
    const chapter = [...rest.slice(0, 4), second, ...rest.slice(4), hardest];
    order.splice(start, CHAPTER_SIZE, ...chapter);
  }
  return order;
}

/** Seconds on the clock for a timed level (0 = untimed). */
export function timeLimit(n: number, level: Level): number {
  if (n < TIMED_FROM) return 0;
  const t = tierOf(n);
  const words = level.words.length;
  return t === 'veryhard' ? 45 + 10 * words : t === 'hard' ? 60 + 12 * words : 0;
}

/** Win rewards by tier: coin multiplier, build stars (first clear) and card packs. */
export function rewardOf(n: number): { mult: number; buildStars: number; packs: number } {
  const t = tierOf(n);
  return t === 'veryhard' ? { mult: 2, buildStars: 2, packs: 1 } : t === 'hard' ? { mult: 1.5, buildStars: 1, packs: 0 } : { mult: 1, buildStars: 1, packs: 0 };
}
