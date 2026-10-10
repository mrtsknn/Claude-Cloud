/**
 * Power-ups (pure inventory logic). Owned counts live in the game's own store; coins come
 * from the meta profile, so buying takes a `spend` callback.
 */
import { dealTray, fitsAnywhere, rescueTray, type Board, type Piece, type Rng } from './game.ts';

export type BoosterId = 'bomb' | 'shuffle' | 'single';
export const BOOSTERS: { id: BoosterId; price: number }[] = [
  { id: 'bomb', price: 150 },
  { id: 'shuffle', price: 100 },
  { id: 'single', price: 120 },
];
export const STARTER_BOOSTERS = 2;

export interface Inventory {
  bomb: number;
  shuffle: number;
  single: number;
  /** Day key of the last free claim per booster (one free each per day). */
  free: Record<BoosterId, string>;
}

const count = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(999, Math.floor(v))) : d);

/** Validates a stored inventory; a missing one is a new player → starter pack of 2 each. */
export function loadInventory(raw: unknown): Inventory {
  const r = (raw && typeof raw === 'object' ? raw : null) as Partial<Inventory> | null;
  const start = r ? 0 : STARTER_BOOSTERS;
  const free = (r?.free ?? {}) as Partial<Record<BoosterId, unknown>>;
  const day = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    bomb: count(r?.bomb, start),
    shuffle: count(r?.shuffle, start),
    single: count(r?.single, start),
    free: { bomb: day(free.bomb), shuffle: day(free.shuffle), single: day(free.single) },
  };
}

export function useBooster(inv: Inventory, id: BoosterId): boolean {
  if (inv[id] <= 0) return false;
  inv[id]--;
  return true;
}

export const priceOf = (id: BoosterId) => BOOSTERS.find((b) => b.id === id)!.price;

export function buyBooster(inv: Inventory, id: BoosterId, spend: (coins: number) => boolean): boolean {
  if (!spend(priceOf(id))) return false;
  inv[id]++;
  return true;
}

export const freeAvailable = (inv: Inventory, id: BoosterId, day: string) => inv.free[id] !== day;

export function claimFree(inv: Inventory, id: BoosterId, day: string): boolean {
  if (!freeAvailable(inv, id, day)) return false;
  inv.free[id] = day;
  inv[id]++;
  return true;
}

/**
 * Shuffle: a fresh tray. Endless gets three new pieces; adventure keeps the number of pieces
 * in hand (pieces left is a level resource). Prefers pieces that fit right now.
 */
export function shuffleTray(board: Board, tray: (Piece | null)[], rng: Rng, keepCount: boolean): (Piece | null)[] {
  const n = keepCount ? tray.filter(Boolean).length : 3;
  let fresh: Piece[] = dealTray(board, rng);
  if (!fresh.some((p) => p && fitsAnywhere(board, p))) fresh = rescueTray(board, rng);
  if (!keepCount) return fresh;
  let k = 0;
  return tray.map((p) => (p && k < n ? fresh[k++] : null));
}

