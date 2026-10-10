import { InAppReview } from '@capacitor-community/in-app-review';
import { isNative } from './native';
import { track } from './analytics';

const KEY = 'studio.review';

/**
 * Asks for a store rating at a happy moment, at most once every 30 days and only after the
 * player has shown they like the game (enough sessions/games). The OS also rate-limits this.
 */
export function maybeRequestReview(gamesPlayed: number, happyMoment: boolean) {
  if (!happyMoment || gamesPlayed < 4) return;
  const last = Number(localStorage.getItem(KEY) ?? 0);
  if (Date.now() - last < 30 * 86_400_000) return;
  localStorage.setItem(KEY, String(Date.now()));
  track('review_prompt');
  if (isNative()) void InAppReview.requestReview().catch(() => {});
}
