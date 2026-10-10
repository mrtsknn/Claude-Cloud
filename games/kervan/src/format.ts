const NAMED = ['', 'K', 'M', 'B', 'T'];

/** Suffix for 1000^tier: K, M, B, T, then aa, ab … az, ba … zz. */
export function suffix(tier: number): string {
  if (tier < NAMED.length) return NAMED[tier];
  const n = tier - NAMED.length;
  const a = 'abcdefghijklmnopqrstuvwxyz';
  return a[Math.floor(n / 26) % 26] + a[n % 26];
}

/** Compact idle-game number: 999, 1.23K, 45.6M, 789B, 1.00aa. Always 3 significant digits above 1K. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return String(Math.floor(n));
  let tier = Math.floor(Math.log10(n) / 3);
  let v = n / Math.pow(1000, tier);
  // rounding 999.96K up must become 1.00M, not 1000K
  if (Number(v.toPrecision(3)) >= 1000) {
    tier++;
    v /= 1000;
  }
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  return v.toFixed(digits) + suffix(tier);
}

/** "1h 05m", "4m 12s", "38s". `units` is a space-separated localized "h m s". */
export function fmtDuration(sec: number, units = 'h m s'): string {
  const [uh, um, us] = units.split(' ');
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}${uh} ${String(m).padStart(2, '0')}${um}`;
  if (m) return `${m}${um} ${String(s).padStart(2, '0')}${us}`;
  return `${s}${us}`;
}
