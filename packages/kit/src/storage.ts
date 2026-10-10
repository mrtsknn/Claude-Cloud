/** Namespaced, crash-safe localStorage wrapper. Capacitor WebViews persist localStorage. */
export function createStore(namespace: string) {
  const key = (k: string) => `${namespace}.${k}`;
  return {
    get<T>(k: string, fallback: T): T {
      try {
        const raw = localStorage.getItem(key(k));
        return raw == null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    set<T>(k: string, value: T): void {
      try {
        localStorage.setItem(key(k), JSON.stringify(value));
      } catch {
        /* quota / private mode: game keeps working without persistence */
      }
    },
    remove(k: string): void {
      try {
        localStorage.removeItem(key(k));
      } catch {
        /* ignore */
      }
    },
  };
}

export type Store = ReturnType<typeof createStore>;
