/**
 * Shared plumbing for the retention stores: injectable storage + clock (tests pass their own),
 * crash-safe JSON load/save and change listeners. Every store validates its blob field by field.
 */
export type KV = Pick<Storage, 'getItem' | 'setItem'>;

export interface StoreOptions {
  /** Game id; the store keeps its data under `<game>.<name>`. */
  game: string;
  storage?: KV;
  /** Clock in ms (tests freeze it). Defaults to Date.now. */
  now?: () => number;
}

export const defaultStorage = (): KV | undefined => (typeof localStorage !== 'undefined' ? localStorage : undefined);

export function persisted<T extends object>(o: StoreOptions, name: string) {
  const key = `${o.game}.${name}`;
  const storage = o.storage ?? defaultStorage();
  const listeners = new Set<() => void>();
  return {
    now: o.now ?? (() => Date.now()),
    load(): Record<string, unknown> | null {
      try {
        const raw = JSON.parse(storage?.getItem(key) ?? 'null');
        return raw && typeof raw === 'object' ? raw : null;
      } catch {
        return null;
      }
    },
    save(state: T) {
      try {
        storage?.setItem(key, JSON.stringify(state));
      } catch {
        /* storage blocked: keep playing in memory */
      }
      listeners.forEach((fn) => fn());
    },
    onChange(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const int = (v: unknown, d: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : d;
export const text = (v: unknown, d: string) => (typeof v === 'string' ? v : d);

/** Small deterministic PRNG (mulberry32). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash → 32-bit seed. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
