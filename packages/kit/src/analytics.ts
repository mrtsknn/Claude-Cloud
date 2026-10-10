/**
 * Provider-agnostic analytics. Games call `track()`; a provider (Firebase, GameAnalytics,
 * PostHog…) is plugged in once via `setAnalyticsProvider()` without touching game code.
 * Until then events go to the console in dev and to a small local ring buffer, which is
 * handy for debugging funnels on a device.
 */
export type EventProps = Record<string, string | number | boolean>;

export interface AnalyticsProvider {
  track(event: string, props: EventProps): void;
}

const BUFFER_KEY = 'studio.analytics.buffer';
const BUFFER_MAX = 200;

let provider: AnalyticsProvider | null = null;
let common: EventProps = {};

export function setAnalyticsProvider(p: AnalyticsProvider) {
  provider = p;
}

export function setCommonProps(props: EventProps) {
  common = { ...common, ...props };
}

export function track(event: string, props: EventProps = {}) {
  const payload = { ...common, ...props };
  if (provider) provider.track(event, payload);
  if (import.meta.env?.DEV) console.debug('[analytics]', event, payload);
  try {
    const buf = JSON.parse(localStorage.getItem(BUFFER_KEY) ?? '[]') as unknown[];
    buf.push({ e: event, t: Date.now(), ...payload });
    localStorage.setItem(BUFFER_KEY, JSON.stringify(buf.slice(-BUFFER_MAX)));
  } catch {
    /* ignore */
  }
}

/** Counts sessions and days since install; call once at boot. */
export function trackSession(game: string) {
  let sessions = 1;
  let day = 0;
  try {
    let installAt = Number(localStorage.getItem(`${game}.installAt`));
    if (!installAt) {
      installAt = Date.now();
      localStorage.setItem(`${game}.installAt`, String(installAt));
      track('first_open');
    }
    sessions = Number(localStorage.getItem(`${game}.sessions`) ?? 0) + 1;
    localStorage.setItem(`${game}.sessions`, String(sessions));
    localStorage.setItem('studio.sessions', String(sessions));
    day = Math.floor((Date.now() - installAt) / 86_400_000);
  } catch {
    /* storage blocked (private mode): count this as a single fresh session */
  }
  setCommonProps({ game, session: sessions, day });
  track('session_start');
}
