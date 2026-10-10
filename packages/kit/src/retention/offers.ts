/**
 * Monetization moments of the retention layer, as pure policies:
 * - continueOffer: what "continue after a fail" costs. The first continue of a level can be a
 *   rewarded ad (or the first coin price); later ones only escalating coins.
 * - createInterstitialPolicy: interstitials only after level `minLevel`, at most every `every`
 *   wins, and never right after a loss (the next win after a loss is skipped as well).
 */
export const CONTINUE_PRICES = [100, 200, 400];

export interface ContinueOffer {
  /** A rewarded ad may pay for this continue. */
  ad: boolean;
  /** Coin price, or null when no more continues are offered. */
  coins: number | null;
}

export function continueOffer(used: number, prices: number[] = CONTINUE_PRICES): ContinueOffer {
  const coins = prices[Math.max(0, used)] ?? null;
  return { ad: used === 0, coins };
}

export interface InterstitialPolicy {
  /** Call after a level win; true when an interstitial may be shown now. */
  afterWin(level: number): boolean;
  /** Call on a loss: no interstitial now, nor on the next win. */
  afterLoss(): void;
}

export function createInterstitialPolicy(o: { minLevel?: number; every?: number } = {}): InterstitialPolicy {
  const minLevel = o.minLevel ?? 3;
  const every = Math.max(1, o.every ?? 2);
  let since = every - 1; // the first eligible win may show one
  let lostRecently = false;
  return {
    afterWin(level) {
      if (lostRecently) {
        lostRecently = false;
        since++;
        return false;
      }
      if (level < minLevel) return false;
      since++;
      if (since < every) return false;
      since = 0;
      return true;
    },
    afterLoss() {
      lostRecently = true;
    },
  };
}
