/**
 * Album: card packs come from rewards (hard levels, areas, league, daily…). Cards belong to
 * 9-card sets; cards 1–5 of a set are common, 6–8 rare, 9 epic. A pack draws from the first two
 * unfinished sets and always holds at least one new card while one is missing. Duplicates turn
 * into dust; dust buys a chosen missing card. A finished set pays its reward once (claimSet).
 */
import { track } from '../analytics';
import { int, persisted, type StoreOptions } from './persist';

export const SET_SIZE = 9;
export type Rarity = 0 | 1 | 2;
export const rarityOf = (index: number): Rarity => (index < 5 ? 0 : index < 8 ? 1 : 2);
/** Draw weight, dust for a duplicate and dust price of a chosen card, by rarity. */
export const RARITY_WEIGHT = [70, 24, 6];
export const DUP_DUST = [5, 15, 40];
export const CARD_PRICE = [40, 100, 250];

export interface AlbumSet {
  id: string;
  /** Coins for completing the set. */
  reward: number;
}

export interface Card {
  set: string;
  index: number; // 0..8
  id: string; // `${set}:${index}`
  rarity: Rarity;
}

export interface PackCard extends Card {
  isNew: boolean;
  /** Dust gained when it was a duplicate. */
  dust: number;
}

export interface AlbumOptions extends StoreOptions {
  sets: AlbumSet[];
  packSize?: number;
  rng?: () => number;
}

interface AlbumState {
  have: string[];
  dust: number;
  packs: number;
  claimed: string[];
}

export const cardId = (set: string, index: number) => `${set}:${index}`;

export function createAlbum(o: AlbumOptions) {
  const db = persisted<AlbumState>(o, 'album');
  const rng = o.rng ?? Math.random;
  const packSize = o.packSize ?? 3;
  const all: Card[] = o.sets.flatMap((st) => Array.from({ length: SET_SIZE }, (_, i) => ({ set: st.id, index: i, id: cardId(st.id, i), rarity: rarityOf(i) })));
  const valid = new Set(all.map((c) => c.id));
  const setIds = new Set(o.sets.map((st) => st.id));
  const raw = db.load();
  const strs = (v: unknown, ok: Set<string>) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ok.has(x)))] : []);
  const s: AlbumState = { have: strs(raw?.have, valid), dust: int(raw?.dust, 0), packs: int(raw?.packs, 0, 0, 999), claimed: strs(raw?.claimed, setIds) };
  const save = () => db.save(s);
  const has = (id: string) => s.have.includes(id);
  const setCount = (set: string) => s.have.filter((id) => id.startsWith(`${set}:`)).length;
  const complete = (set: string) => setCount(set) >= SET_SIZE;

  function pick(pool: Card[]): Card {
    const total = pool.reduce((a, c) => a + RARITY_WEIGHT[c.rarity], 0);
    let x = rng() * total;
    for (const c of pool) {
      x -= RARITY_WEIGHT[c.rarity];
      if (x < 0) return c;
    }
    return pool[pool.length - 1];
  }

  const api = {
    sets: o.sets,
    onChange: db.onChange,
    get dust() {
      return s.dust;
    },
    get packs() {
      return s.packs;
    },
    has,
    setCount,
    setComplete: complete,
    /** Finished sets whose reward is waiting. */
    claimable: () => o.sets.filter((st) => complete(st.id) && !s.claimed.includes(st.id)).map((st) => st.id),
    isClaimed: (set: string) => s.claimed.includes(set),
    total: () => ({ have: s.have.length, all: all.length }),
    /** The sets packs draw from: the first two unfinished ones. */
    activeSets(): string[] {
      return o.sets.filter((st) => !complete(st.id)).slice(0, 2).map((st) => st.id);
    },
    addPacks(n = 1) {
      s.packs = Math.min(999, s.packs + Math.max(0, Math.floor(n)));
      save();
    },
    /** Opens one pack (if any): new cards join the album, duplicates become dust. */
    openPack(): PackCard[] | null {
      if (s.packs <= 0) return null;
      s.packs--;
      const active = new Set(api.activeSets());
      const pool = active.size ? all.filter((c) => active.has(c.set)) : all;
      const out: PackCard[] = [];
      for (let k = 0; k < packSize; k++) {
        // guarantee: the first card is new while the active sets miss any
        const missing = pool.filter((c) => !has(c.id) && !out.some((x) => x.id === c.id));
        const fresh = pool.filter((x) => !out.some((y) => y.id === x.id)); // no card twice in one pack
        const c = k === 0 && missing.length ? pick(missing) : pick(fresh.length ? fresh : pool);
        const isNew = !has(c.id) && !out.some((x) => x.id === c.id);
        const dust = isNew ? 0 : DUP_DUST[c.rarity];
        out.push({ ...c, isNew, dust });
      }
      for (const c of out) {
        if (c.isNew) s.have.push(c.id);
        s.dust += c.dust;
      }
      save();
      return out;
    },
    /** Buys a chosen missing card with dust. */
    buyCard(id: string): boolean {
      const c = all.find((x) => x.id === id);
      if (!c || has(id) || s.dust < CARD_PRICE[c.rarity]) return false;
      s.dust -= CARD_PRICE[c.rarity];
      s.have.push(id);
      save();
      return true;
    },
    /** Pays a finished set's reward once; returns the coins (0 if not claimable). */
    claimSet(set: string): number {
      const st = o.sets.find((x) => x.id === set);
      if (!st || !complete(set) || s.claimed.includes(set)) return 0;
      s.claimed.push(set);
      track('album_set', { set });
      save();
      return st.reward;
    },
  };
  return api;
}

export type Album = ReturnType<typeof createAlbum>;
