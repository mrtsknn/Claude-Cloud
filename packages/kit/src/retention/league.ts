/**
 * Weekly league: the player competes with a group of 30 for a week (Monday 00:00 → Monday 00:00,
 * local time). Score = levels won this week (the game calls addScore). At week end the top 5 move
 * up a tier, the bottom 5 move down, and rewards are paid by rank.
 *
 * Opponents come from a `LeagueOpponents` provider. The default is deterministic bots: seeded
 * by week + tier + player id, with realistic names and daily play curves that depend on the real
 * time, so the table moves through the week and is the same every time it is opened. A server
 * can replace them later by implementing the same interface (e.g. caching a fetched table).
 */
import { track } from '../analytics';
import { hash, int, persisted, seeded, text, type StoreOptions } from './persist';

export const LEAGUE_TIERS = ['bronze', 'silver', 'gold', 'sapphire', 'ruby', 'diamond'] as const;
export type LeagueTier = (typeof LEAGUE_TIERS)[number];
export const LEAGUE_GROUP = 30;
export const LEAGUE_PROMOTE = 5;
export const LEAGUE_DEMOTE = 5;

export interface LeagueEntry {
  id: string;
  name: string;
  score: number;
  you?: boolean;
}

export interface LeagueContext {
  /** Week id: the local date of its Monday, YYYY-MM-DD. */
  week: string;
  tier: number;
  playerId: string;
  /** 0..1: how far through the week `now` is. */
  progress: number;
}

/** Everyone in the group except the player (29 entries). */
export interface LeagueOpponents {
  opponents(ctx: LeagueContext): LeagueEntry[];
}

export interface LeagueReward {
  coins: number;
  packs: number;
}

export interface LeagueResult {
  week: string;
  rank: number;
  score: number;
  tier: number;
  newTier: number;
  reward: LeagueReward;
}

// ───────────────────────── calendar ─────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
/** Local Monday 00:00 of the week containing `t`. */
export function weekStart(t: number): number {
  const d = new Date(t);
  const back = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
}
export function weekEnd(t: number): number {
  const s = new Date(weekStart(t));
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7).getTime();
}
export function weekId(t: number): string {
  const d = new Date(weekStart(t));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function weekOf(id: string): number {
  const [y, m, d] = id.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

// ───────────────────────── bots ─────────────────────────
const NAMES = [
  'Alex M.', 'Sam K.', 'Deniz A.', 'Robin', 'Jordan P.', 'Elif S.', 'Kai', 'Noa B.', 'Mika T.', 'Ari L.',
  'Charlie', 'Emre Y.', 'Yuki H.', 'Lena R.', 'Omar F.', 'Sofia G.', 'Luca D.', 'Ada N.', 'Max W.', 'Zeynep',
  'Taylor C.', 'Can E.', 'Ines V.', 'Leo J.', 'Mira K.', 'Jun', 'Nora E.', 'Eli Z.', 'Selin T.', 'Hugo B.',
  'Priya S.', 'Tomás R.', 'Ece', 'Finn O.', 'Lia M.', 'Kerem A.', 'Hana I.', 'Milo', 'Asel', 'Rae Q.',
  'Bora K.', 'Ivy L.', 'Nils H.', 'Duru', 'Theo P.', 'Amara O.', 'Rumi', 'Ola N.', 'Sena B.', 'Felix',
  'wordsmith', 'letterbox', 'quietfox', 'night_owl', 'puzzlebee', 'inkwell', 'tealeaf', 'riverstone', 'paperboat', 'moonlit',
];
/** Typical weekly score (levels won) of an active bot per tier. */
const TIER_MEDIAN = [9, 16, 26, 38, 52, 70];

function normal(r: () => number) {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

/** Deterministic bots: same week + tier + player → same names, totals and daily curves. */
export const botOpponents: LeagueOpponents = {
  opponents(ctx) {
    const r = seeded(hash(`${ctx.week}|${ctx.tier}|${ctx.playerId}`));
    const names = NAMES.slice();
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    const median = TIER_MEDIAN[Math.min(ctx.tier, TIER_MEDIAN.length - 1)];
    const p = Math.max(0, Math.min(1, ctx.progress)) * 7;
    const day = Math.min(6, Math.floor(p));
    const hour = (p - day) * 24;
    return Array.from({ length: LEAGUE_GROUP - 1 }, (_, i) => {
      const idle = r() < 0.1; // a few sign up and barely play
      const total = idle ? Math.floor(r() * 3) : Math.max(1, Math.round(median * Math.exp(normal(r) * 0.55)));
      const w: number[] = Array.from({ length: 7 }, () => (r() < 0.22 ? 0 : 0.3 + r()));
      if (!w.some((x) => x > 0)) w[Math.floor(r() * 7)] = 1;
      const from = 7 + r() * 12; // hour they usually start playing
      const span = 1.5 + r() * 5;
      const sum = w.reduce((a, b) => a + b, 0);
      const done = w.slice(0, day).reduce((a, b) => a + b, 0) + w[day] * Math.max(0, Math.min(1, (hour - from) / span));
      return { id: `bot${i}`, name: names[i % names.length], score: Math.floor((total * done) / sum + 1e-9) };
    });
  },
};

// ───────────────────────── store ─────────────────────────
export interface LeagueOptions extends StoreOptions {
  opponents?: LeagueOpponents;
  /** Reward for a final rank (1-based) in a tier. Default: 1st 200 + 2 packs … scaled by tier. */
  rewards?: (rank: number, tier: number) => LeagueReward;
  rng?: () => number;
}

export function defaultLeagueReward(rank: number, tier: number): LeagueReward {
  const base = rank === 1 ? 200 : rank === 2 ? 150 : rank === 3 ? 120 : rank <= 5 ? 80 : rank <= 10 ? 50 : rank <= 25 ? 25 : 10;
  const packs = rank === 1 ? 2 : rank <= 5 ? 1 : 0;
  return { coins: Math.round((base * (4 + tier)) / 4), packs };
}

interface LeagueState {
  playerId: string;
  week: string;
  tier: number;
  score: number;
  result: LeagueResult | null;
}

export function createLeague(o: LeagueOptions) {
  const db = persisted<LeagueState>(o, 'league');
  const now = db.now;
  const provider = o.opponents ?? botOpponents;
  const rewardFor = o.rewards ?? defaultLeagueReward;
  const raw = db.load();
  const top = LEAGUE_TIERS.length - 1;
  const rr = raw?.result as Partial<LeagueResult> | null | undefined;
  const s: LeagueState = {
    playerId: text(raw?.playerId, '') || Math.floor((o.rng ?? Math.random)() * 2 ** 32).toString(36),
    week: text(raw?.week, weekId(now())),
    tier: int(raw?.tier, 0, 0, top),
    score: int(raw?.score, 0),
    result:
      rr && typeof rr === 'object' && typeof rr.week === 'string'
        ? {
            week: rr.week,
            rank: int(rr.rank, LEAGUE_GROUP, 1, LEAGUE_GROUP),
            score: int(rr.score, 0),
            tier: int(rr.tier, 0, 0, top),
            newTier: int(rr.newTier, 0, 0, top),
            reward: { coins: int(rr.reward?.coins, 0), packs: int(rr.reward?.packs, 0) },
          }
        : null,
  };
  const save = () => db.save(s);

  const ctx = (progress: number): LeagueContext => ({ week: s.week, tier: s.tier, playerId: s.playerId, progress });
  function table(progress: number): LeagueEntry[] {
    const rows = [...provider.opponents(ctx(progress)), { id: 'you', name: '', score: s.score, you: true }];
    // the player ranks above bots with the same score
    return rows.sort((a, b) => b.score - a.score || (a.you ? -1 : b.you ? 1 : a.id.localeCompare(b.id)));
  }
  const progressAt = (t: number) => {
    const start = weekOf(s.week);
    const end = weekEnd(start);
    return Math.max(0, Math.min(1, (t - start) / (end - start)));
  };

  /** Closes a finished week: final rank, promotion/relegation, reward waits in `result`. */
  function settle() {
    const current = weekId(now());
    if (s.week === current) return;
    if (s.score > 0) {
      const rank = table(1).findIndex((e) => e.you) + 1;
      const newTier = rank <= LEAGUE_PROMOTE ? Math.min(top, s.tier + 1) : rank > LEAGUE_GROUP - LEAGUE_DEMOTE ? Math.max(0, s.tier - 1) : s.tier;
      s.result = { week: s.week, rank, score: s.score, tier: s.tier, newTier, reward: rewardFor(rank, s.tier) };
      s.tier = newTier;
      track('league_end', { rank, tier: LEAGUE_TIERS[s.result.tier], score: s.score });
    }
    s.week = current;
    s.score = 0;
    save();
  }
  settle();

  return {
    onChange: db.onChange,
    get tier() {
      settle();
      return s.tier;
    },
    get tierName(): LeagueTier {
      return LEAGUE_TIERS[this.tier];
    },
    get score() {
      settle();
      return s.score;
    },
    get playerId() {
      return s.playerId;
    },
    /** A level was won (or any scoring event): +n points this week. */
    addScore(n = 1) {
      settle();
      s.score += Math.max(0, Math.floor(n));
      save();
    },
    /** Current table (30 rows, best first), the player's rank and zone. */
    standings(): { rows: LeagueEntry[]; rank: number; zone: 'up' | 'stay' | 'down' } {
      settle();
      const rows = table(progressAt(now()));
      const rank = rows.findIndex((e) => e.you) + 1;
      const zone = rank <= LEAGUE_PROMOTE && s.tier < top ? 'up' : rank > LEAGUE_GROUP - LEAGUE_DEMOTE && s.tier > 0 && s.score > 0 ? 'down' : 'stay';
      return { rows, rank, zone };
    },
    /** Ms until this week's results. */
    timeLeftMs(): number {
      settle();
      return Math.max(0, weekEnd(weekOf(s.week)) - now());
    },
    /** Last week's result until it is claimed. */
    pendingResult(): LeagueResult | null {
      settle();
      return s.result;
    },
    claimResult(): LeagueReward | null {
      settle();
      const r = s.result;
      if (!r) return null;
      s.result = null;
      save();
      return r.reward;
    },
  };
}

export type League = ReturnType<typeof createLeague>;
