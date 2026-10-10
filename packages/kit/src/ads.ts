import { track } from './analytics';

/**
 * Ad abstraction. Games only ask "show a rewarded ad" / "an interstitial moment happened";
 * the actual network (AdMob via @capacitor-community/admob, AppLovin…) is plugged in with
 * `setAdProvider()` once real ad unit IDs exist. Without a provider rewarded ads grant the
 * reward for free, so features behind them stay testable and the game never dead-ends.
 */
export interface AdProvider {
  showRewarded(placement: string): Promise<boolean>;
  showInterstitial(placement: string): Promise<void>;
}

let provider: AdProvider | null = null;
let lastInterstitial = Date.now();
let removed = false;

export function setAdProvider(p: AdProvider) {
  provider = p;
}

/** For a future "Remove ads" IAP. */
export function setAdsRemoved(on: boolean) {
  removed = on;
}

export async function showRewarded(placement: string): Promise<boolean> {
  track('ad_rewarded_request', { placement });
  const granted = provider ? await provider.showRewarded(placement).catch(() => false) : true;
  track('ad_rewarded_result', { placement, granted });
  return granted;
}

/** Frequency-capped: never more than once per `minGapSec`, never during the first sessions. */
export async function interstitialMoment(placement: string, minGapSec = 120) {
  if (removed || !provider) return;
  let sessions = 0;
  try {
    sessions = Number(localStorage.getItem('studio.sessions') ?? 0);
  } catch {
    /* storage blocked: treat as a new player, no interstitials */
  }
  if (sessions < 2) return;
  if (Date.now() - lastInterstitial < minGapSec * 1000) return;
  lastInterstitial = Date.now();
  track('ad_interstitial', { placement });
  await provider.showInterstitial(placement).catch(() => {});
}
