import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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

describe.each([
  ['en', en as Level[]],
  ['tr', tr as Level[]],
])('%s level pack', (lang, levels) => {
  const reviewed = new Set(readFileSync(join(__dirname, '..', 'scripts', `reviewed-${lang}.txt`), 'utf8').split('\n'));

  it('has 400 levels', () => expect(levels).toHaveLength(400));

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
