/**
 * Lives: `max` hearts (default 5); a failed level costs one, one comes back every `regenMs`
 * (default 30 min). Regeneration is computed from timestamps, so it keeps running while the app
 * is closed. Refills: +1 via rewarded ad (`add(1)`), full via coins (`refill()`), and timed
 * unlimited-lives grants (`grantUnlimited(ms)`, e.g. starter pack / IAP).
 */
import { track } from '../analytics';
import { int, persisted, type StoreOptions } from './persist';

export interface LivesOptions extends StoreOptions {
  max?: number;
  regenMs?: number;
}

interface LivesState {
  lives: number;
  /** Regeneration clock: the next life arrives at `since + regenMs` (only while below max). */
  since: number;
  unlimitedUntil: number;
}

export const LIFE_REGEN_MS = 30 * 60_000;

export function createLives(o: LivesOptions) {
  const max = o.max ?? 5;
  const regen = o.regenMs ?? LIFE_REGEN_MS;
  const db = persisted<LivesState>(o, 'lives');
  const now = db.now;
  const raw = db.load();
  const s: LivesState = {
    lives: int(raw?.lives, max, 0, max),
    since: int(raw?.since, now()),
    unlimitedUntil: int(raw?.unlimitedUntil, 0),
  };

  /** Applies the lives regenerated since the last look. */
  function settle() {
    const t = now();
    if (t < s.since) s.since = t; // device clock moved back: restart the timer, never stall it
    if (s.lives >= max) {
      s.since = t;
      return;
    }
    const gained = Math.floor((t - s.since) / regen);
    if (gained > 0) {
      s.lives = Math.min(max, s.lives + gained);
      s.since = s.lives >= max ? t : s.since + gained * regen;
    }
  }
  const save = () => db.save(s);

  return {
    max,
    onChange: db.onChange,
    get count(): number {
      settle();
      return s.lives;
    },
    unlimited(): boolean {
      return now() < s.unlimitedUntil;
    },
    unlimitedLeftMs(): number {
      return Math.max(0, s.unlimitedUntil - now());
    },
    /** True when a level may start (a life left or an unlimited grant running). */
    canPlay(): boolean {
      return this.unlimited() || this.count > 0;
    },
    full(): boolean {
      return this.count >= max;
    },
    /** Ms until the next life (0 when full). */
    nextInMs(): number {
      settle();
      return s.lives >= max ? 0 : Math.max(0, s.since + regen - now());
    },
    /** Ms until every life is back. */
    fullInMs(): number {
      settle();
      return s.lives >= max ? 0 : Math.max(0, s.since + regen - now()) + (max - s.lives - 1) * regen;
    },
    /** A failed level. Returns false when no life was taken (unlimited grant running). */
    lose(): boolean {
      if (this.unlimited()) return false;
      settle();
      if (s.lives <= 0) return false;
      if (s.lives >= max) s.since = now();
      s.lives--;
      if (s.lives === 0) track('lives_empty');
      save();
      return true;
    },
    /** +n lives (rewarded ad), capped at max. */
    add(n = 1) {
      settle();
      s.lives = Math.min(max, s.lives + Math.max(0, Math.floor(n)));
      if (s.lives >= max) s.since = now();
      save();
    },
    /** All lives back (coins). */
    refill() {
      s.lives = max;
      s.since = now();
      save();
    },
    /** Unlimited lives for `ms` (stacks on a running grant). */
    grantUnlimited(ms: number) {
      s.unlimitedUntil = Math.max(now(), s.unlimitedUntil) + Math.max(0, ms);
      save();
    },
  };
}

export type Lives = ReturnType<typeof createLives>;

/** "29:05" / "1:02:03" for countdowns. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}
