import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import counts from './levels/counts.json';
import dailyEn from './levels/daily-en.json';
import dailyTr from './levels/daily-tr.json';
import en from './levels/en.json';
import tr from './levels/tr.json';
import {
  cellsOf,
  completedByReveal,
  gridOf,
  hintCell,
  isComplete,
  judge,
  shuffleLetters,
  type Level,
} from './game';

const sample: Level = {
  letters: 'tca',
  rows: 3,
  cols: 3,
  words: [
    { w: 'cat', r: 0, c: 0, d: 'h' },
    { w: 'act', r: 0, c: 1, d: 'v' },
  ],
  bonus: ['tac'],
};

describe('rules', () => {
  it('judges answers, duplicates, bonus words and junk', () => {
    expect(judge(sample, new Set(), new Set(), 'cat')).toBe('answer');
    expect(judge(sample, new Set(['cat']), new Set(), 'cat')).toBe('dup');
    expect(judge(sample, new Set(), new Set(), 'tac')).toBe('bonus');
    expect(judge(sample, new Set(), new Set(['tac']), 'tac')).toBe('bonusDup');
    expect(judge(sample, new Set(), new Set(), 'cta')).toBe('invalid');
  });

  it('hints the shortest unfound word and completes words revealed letter by letter', () => {
    const found = new Set(['cat']);
    const revealed = new Set<string>();
    const k1 = hintCell(sample, found, revealed)!;
    expect(k1).toBe('1,1'); // (0,1) is already visible through "cat"
    revealed.add(k1);
    revealed.add(hintCell(sample, found, revealed)!);
    expect(completedByReveal(sample, found, revealed)).toEqual(['act']);
    expect(hintCell(sample, new Set(['cat', 'act']), revealed)).toBeNull();
    expect(isComplete(sample, new Set(['cat', 'act']))).toBe(true);
  });

  it('shuffles into a different order', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out = shuffleLetters([...'word'], rng);
    expect(out.sort()).toEqual([...'word'].sort());
    expect(shuffleLetters([...'aa'], rng)).toEqual(['a', 'a']);
  });
});

const count = (s: string) => [...s].reduce((m, ch) => m.set(ch, (m.get(ch) ?? 0) + 1), new Map<string, number>());
const formable = (w: string, letters: string) => {
  const pool = count(letters);
  return [...count(w)].every(([ch, n]) => (pool.get(ch) ?? 0) >= n);
};

// sha256 of the v1.0 packs (400 levels each). Saved progress points into these levels, so the
// extension may only append after them.
const V1_HASH = {
  en: '788ee98bd23026d3ee1759b1600824b0d95253aa321240ff6a7acaab4c157114',
  tr: 'bf4c9cf1f9dfee3480d6597f6fb192da3d2d75ff188ab4c4aa74cd374aaeb987',
};

describe.each([
  ['en', en as Level[], 'main'],
  ['tr', tr as Level[], 'main'],
  ['en', dailyEn as Level[], 'daily'],
  ['tr', dailyTr as Level[], 'daily'],
])('%s %s pack', (lang, levels, kind) => {
  const reviewed = new Set(readFileSync(join(__dirname, '..', 'scripts', `reviewed-${lang}.txt`), 'utf8').split('\n'));
  const key = lang as 'en' | 'tr';

  if (kind === 'main') {
    it('keeps the 400 v1.0 levels byte for byte and adds whole chapters after them', () => {
      expect(createHash('sha256').update(JSON.stringify(levels.slice(0, 400))).digest('hex')).toBe(V1_HASH[key]);
      expect(levels.length).toBe(counts[key].levels);
      expect(levels.length).toBeGreaterThan(400);
      expect(levels.length % 10).toBe(0);
    });

    it('never repeats a letter wheel and keeps 5+ letters after the tutorial range', () => {
      const keys = levels.map((l) => [...l.letters].sort().join(''));
      expect(new Set(keys).size).toBe(levels.length);
      for (const l of levels.slice(400)) {
        expect(l.letters.length).toBeGreaterThanOrEqual(5);
        expect(l.words.length).toBeGreaterThanOrEqual(4);
      }
    });

    it('climbs inside every extension chapter (wheel size never shrinks within a chapter)', () => {
      for (let c = 400; c < levels.length; c += 10) {
        const sizes = levels.slice(c, c + 10).map((l) => l.letters.length);
        expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
      }
    });
  } else {
    it('has a year of daily puzzles with 6–7 letter wheels', () => {
      expect(levels.length).toBe(counts[key].daily);
      expect(levels.length).toBeGreaterThanOrEqual(366);
      for (const l of levels) {
        expect(l.letters.length).toBeGreaterThanOrEqual(6);
        expect(l.words.length).toBeGreaterThanOrEqual(5);
      }
    });
  }

  it('every answer is hand-reviewed, formable and laid out without conflicts', () => {
    for (const level of levels) {
      const grid = gridOf(level);
      for (const p of level.words) {
        expect(reviewed.has(p.w), `${p.w} not reviewed`).toBe(true);
        expect(formable(p.w, level.letters)).toBe(true);
        for (const k of cellsOf(p)) {
          const [r, c] = k.split(',').map(Number);
          expect(r).toBeLessThan(level.rows);
          expect(c).toBeLessThan(level.cols);
        }
      }
      expect(grid.size).toBeGreaterThan(0);
      expect(level.rows).toBeLessThanOrEqual(10);
      expect(level.cols).toBeLessThanOrEqual(10);
    }
  });

  it('every grid is one connected crossword', () => {
    for (const level of levels) {
      const words = level.words.map((p) => new Set(cellsOf(p)));
      const seen = new Set([0]);
      const queue = [0];
      while (queue.length) {
        const i = queue.pop()!;
        words.forEach((cells, j) => {
          if (!seen.has(j) && [...cells].some((k) => words[i].has(k))) {
            seen.add(j);
            queue.push(j);
          }
        });
      }
      expect(seen.size).toBe(words.length);
    }
  });

  it('bonus words never repeat answers and use only wheel letters', () => {
    for (const level of levels) {
      const answers = new Set(level.words.map((p) => p.w));
      for (const b of level.bonus) {
        expect(answers.has(b)).toBe(false);
        expect(formable(b, level.letters)).toBe(true);
      }
    }
  });
});
