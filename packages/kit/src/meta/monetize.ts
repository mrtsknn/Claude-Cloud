/**
 * Real monetization: AdMob (interstitial + rewarded) and in-app purchases. Adapted from the
 * production setup in mrtsknn/sigdir. Everything degrades gracefully on the web and when a
 * game hasn't installed the native plugins yet (calls reject → caught → no ads / no store).
 */
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { AdMob, AdmobConsentStatus, InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { setAdProvider } from '../ads';

const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform();

export interface AdUnits {
  android: { interstitial: string; rewarded: string };
  ios: { interstitial: string; rewarded: string };
}

/** Google's public TEST units. Each game passes its real ones before release (see docs/RELEASE.md). */
export const TEST_AD_UNITS: AdUnits = {
  android: { interstitial: 'ca-app-pub-3940256099942544/1033173712', rewarded: 'ca-app-pub-3940256099942544/5224354917' },
  ios: { interstitial: 'ca-app-pub-3940256099942544/4411468910', rewarded: 'ca-app-pub-3940256099942544/1712485313' },
};

let units = TEST_AD_UNITS;
let testing = true;
let ready = false;
let interstitialLoaded = false;
let rewardedLoaded = false;
let noAds = false;

const ids = () => (platform === 'ios' ? units.ios : units.android);

function loadInterstitial() {
  if (!ready) return;
  AdMob.prepareInterstitial({ adId: ids().interstitial, isTesting: testing })
    .then(() => (interstitialLoaded = true))
    .catch(() => setTimeout(loadInterstitial, 30_000));
}
function loadRewarded() {
  if (!ready) return;
  AdMob.prepareRewardVideoAd({ adId: ids().rewarded, isTesting: testing })
    .then(() => (rewardedLoaded = true))
    .catch(() => setTimeout(loadRewarded, 30_000));
}

/** show*() promises settle on open (or never, for a skipped rewarded ad), so wait for close events. */
async function untilClosed(events: { Dismissed: string; FailedToShow: string }, show: () => Promise<unknown>) {
  let done!: () => void;
  const closed = new Promise<void>((r) => (done = r));
  const handles: PluginListenerHandle[] = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [events.Dismissed, events.FailedToShow].map((ev) => AdMob.addListener(ev as any, () => done())),
  );
  show().catch(() => done());
  await closed;
  handles.forEach((h) => h.remove());
}

export const rewardedAvailable = () => !isNative || rewardedLoaded;
export const setNoAds = (on: boolean) => (noAds = on);

/** Initializes AdMob (consent + ATT) and plugs it into the kit's `showRewarded`/`interstitialMoment`. */
export async function initAds(opts: { units?: AdUnits; testing?: boolean } = {}) {
  units = opts.units ?? TEST_AD_UNITS;
  testing = opts.testing ?? true;
  setAdProvider({
    async showRewarded() {
      if (!isNative) return true; // web/dev: grant so features stay testable
      if (!rewardedLoaded) return false;
      rewardedLoaded = false;
      let earned = false;
      const h = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (earned = true));
      await untilClosed(RewardAdPluginEvents, () => AdMob.showRewardVideoAd());
      h.remove();
      loadRewarded();
      return earned;
    },
    async showInterstitial() {
      if (noAds || !interstitialLoaded) return;
      interstitialLoaded = false;
      await untilClosed(InterstitialAdPluginEvents, () => AdMob.showInterstitial());
      loadInterstitial();
    },
  });
  if (!isNative) return;
  try {
    if (platform === 'ios') {
      const { status } = await AdMob.trackingAuthorizationStatus();
      if (status === 'notDetermined') await AdMob.requestTrackingAuthorization();
    }
    await AdMob.initialize({ initializeForTesting: testing });
    const consent = await AdMob.requestConsentInfo();
    if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
    ready = true;
    loadInterstitial();
    loadRewarded();
  } catch (e) {
    console.warn('ads init failed', e);
  }
}

// ───────────────────────── in-app purchases ─────────────────────────
/** Same product ids in every game; create them in Play Console / App Store Connect. */
export const PRODUCTS = {
  remove_ads: { consumable: false, fallback: '$2.99' },
  starter_pack: { consumable: false, fallback: '$1.99' },
  coins_small: { consumable: true, fallback: '$0.99' },
  coins_large: { consumable: true, fallback: '$4.99' },
} as const;
export type ProductId = keyof typeof PRODUCTS;

const IAP_DEBUG = typeof location !== 'undefined' && location.search.includes('debug');
let storeReady = false;
const prices: Partial<Record<ProductId, string>> = {};

export async function initStore() {
  if (!isNative) return;
  try {
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    if (!isBillingSupported) return;
    const { products } = await NativePurchases.getProducts({ productIdentifiers: Object.keys(PRODUCTS), productType: PURCHASE_TYPE.INAPP });
    for (const p of products) if (p.identifier in PRODUCTS) prices[p.identifier as ProductId] = p.priceString;
    storeReady = products.length > 0;
  } catch (e) {
    console.warn('store init failed', e);
  }
}

export const priceOf = (id: ProductId) => prices[id] || PRODUCTS[id].fallback;
export const storeAvailable = () => storeReady || IAP_DEBUG;

/** Resolves true only when the payment went through (or is simulated with ?debug on the web). */
export async function purchase(id: ProductId): Promise<boolean> {
  if (!storeReady) return IAP_DEBUG;
  try {
    const tx = await NativePurchases.purchaseProduct({
      productIdentifier: id,
      productType: PURCHASE_TYPE.INAPP,
      quantity: 1,
      isConsumable: PRODUCTS[id].consumable,
    });
    return !tx.purchaseState || tx.purchaseState === '1'; // "2" = pending (cash etc.)
  } catch {
    return false;
  }
}

export async function restorePurchases(): Promise<ProductId[]> {
  if (!storeReady) return [];
  try {
    await NativePurchases.restorePurchases().catch(() => {});
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    return [
      ...new Set(
        purchases
          .filter((p) => !p.purchaseState || p.purchaseState === '1')
          .map((p) => p.productIdentifier as ProductId)
          .filter((id) => id in PRODUCTS && !PRODUCTS[id].consumable),
      ),
    ];
  } catch {
    return [];
  }
}
