/**
 * Win streak: consecutive level wins raise a tier (1/2/3 by default); a failed level resets it.
 * The game decides what a tier is worth (free hints, a booster, extra time…) at level start.
 */
import { int, persisted, type StoreOptions } from './persist';

export interface StreakOptions extends StoreOptions {
  maxTier?: number;
}

export function createWinStreak(o: StreakOptions) {
  const maxTier = o.maxTier ?? 3;
  const db = persisted<{ count: number; best: number }>(o, 'streak');
  const raw = db.load();
  const s = { count: int(raw?.count, 0), best: int(raw?.best, 0) };
  return {
    maxTier,
    onChange: db.onChange,
    get count() {
      return s.count;
    },
    get best() {
      return s.best;
    },
    /** 0..maxTier: the bonus the next level starts with. */
    get tier() {
      return Math.min(maxTier, s.count);
    },
    /** A level was won; returns the new tier. */
    win(): number {
      s.count++;
      s.best = Math.max(s.best, s.count);
      db.save(s);
      return this.tier;
    },
    /** A level was lost; returns how many wins the streak had (0 = nothing lost). */
    fail(): number {
      const lost = s.count;
      s.count = 0;
      db.save(s);
      return lost;
    },
  };
}

export type WinStreak = ReturnType<typeof createWinStreak>;
