/** Wordlink — pure game logic over prebuilt levels (see scripts/build-levels.mjs). */
export interface PlacedWord {
  w: string;
  r: number;
  c: number;
  d: 'h' | 'v';
}

export interface Level {
  letters: string;
  rows: number;
  cols: number;
  words: PlacedWord[];
  bonus: string[];
}

export type Verdict = 'answer' | 'dup' | 'bonus' | 'bonusDup' | 'invalid';
export type Rng = () => number;

export const cellKey = (r: number, c: number) => `${r},${c}`;

export function cellsOf(p: PlacedWord): string[] {
  return [...p.w].map((_, i) => cellKey(p.d === 'v' ? p.r + i : p.r, p.d === 'h' ? p.c + i : p.c));
}

/** key -> letter for every used cell. Throws if two words disagree on a shared cell. */
export function gridOf(level: Level): Map<string, string> {
  const grid = new Map<string, string>();
  for (const p of level.words) {
    cellsOf(p).forEach((k, i) => {
      const prev = grid.get(k);
      if (prev && prev !== p.w[i]) throw new Error(`conflict at ${k}`);
      grid.set(k, p.w[i]);
    });
  }
  return grid;
}

export function judge(level: Level, found: Set<string>, bonusFound: Set<string>, guess: string): Verdict {
  if (level.words.some((p) => p.w === guess)) return found.has(guess) ? 'dup' : 'answer';
  if (level.bonus.includes(guess)) return bonusFound.has(guess) ? 'bonusDup' : 'bonus';
  return 'invalid';
}

/** Cells that are visible: letters of found words plus hinted cells. */
export function visibleCells(level: Level, found: Set<string>, revealed: Set<string>): Set<string> {
  const vis = new Set(revealed);
  for (const p of level.words) if (found.has(p.w)) cellsOf(p).forEach((k) => vis.add(k));
  return vis;
}

/**
 * Picks the cell a hint reveals: the first hidden letter of the shortest unfound word,
 * which is the most useful single letter for most players.
 */
export function hintCell(level: Level, found: Set<string>, revealed: Set<string>): string | null {
  const vis = visibleCells(level, found, revealed);
  const open = level.words.filter((p) => !found.has(p.w)).sort((a, b) => a.w.length - b.w.length);
  for (const p of open) {
    const k = cellsOf(p).find((key) => !vis.has(key));
    if (k) return k;
  }
  return null;
}

/** Words whose every cell is visible but that are not marked found yet (completed by hints). */
export function completedByReveal(level: Level, found: Set<string>, revealed: Set<string>): string[] {
  const vis = visibleCells(level, found, revealed);
  return level.words.filter((p) => !found.has(p.w) && cellsOf(p).every((k) => vis.has(k))).map((p) => p.w);
}

export function isComplete(level: Level, found: Set<string>): boolean {
  return level.words.every((p) => found.has(p.w));
}

/** Fisher–Yates over the wheel letters; never returns the same order when avoidable. */
export function shuffleLetters(letters: string[], rng: Rng): string[] {
  if (new Set(letters).size < 2) return letters.slice();
  for (;;) {
    const a = letters.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.join('') !== letters.join('')) return a;
  }
}
