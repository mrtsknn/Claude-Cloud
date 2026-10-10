const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Idle-game big numbers: 999, 1.23K, 45.6M, 789B … then aa, ab … after the named units. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 10) return String(Math.floor(n * 10) / 10);
  if (n < 1000) return String(Math.floor(n));
  const tier = Math.floor(Math.log10(n) / 3);
  const v = n / Math.pow(1000, tier);
  const unit = tier < UNITS.length ? UNITS[tier] : letters(tier - UNITS.length);
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  return `${(Math.floor(v * 10 ** digits) / 10 ** digits).toFixed(digits)}${unit}`;
}

function letters(i: number): string {
  const a = 'abcdefghijklmnopqrstuvwxyz';
  return a[Math.floor(i / 26) % 26] + a[i % 26];
}

/** 3725 s → "1h 2m", 95 s → "1m 35s". */
export function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
