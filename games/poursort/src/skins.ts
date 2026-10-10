/**
 * Liquid palettes + tube glass styles sold in the meta shop. Each palette has 12 liquids ordered
 * so the colours that meet in early levels are the most distinct (blue/yellow, then red, green…).
 */
export interface Skin {
  id: string;
  price: number;
  liquids: string[];
  /** Glass body fill, outline and highlight. */
  glass: string;
  rim: string;
  shine: string;
  cork: string;
  /** Game background gradient (top, bottom). */
  bg: [string, string];
  swatch: string;
}

const RAW: Omit<Skin, 'swatch'>[] = [
  {
    id: 'classic',
    price: 0,
    liquids: ['#2563eb', '#facc15', '#ef4444', '#16a34a', '#7c3aed', '#f97316', '#14b8a6', '#f472b6', '#84cc16', '#38bdf8', '#d946ef', '#8b5a2b'],
    glass: 'rgba(255,255,255,0.55)',
    rim: 'rgba(52,64,110,0.28)',
    shine: 'rgba(255,255,255,0.55)',
    cork: '#c08a57',
    bg: ['#fbfcff', '#e3e8f4'],
  },
  {
    id: 'pastel',
    price: 300,
    liquids: ['#6f9cf2', '#f7d264', '#f08484', '#6fcf97', '#ad95ee', '#f6a56f', '#5fcfc6', '#f5a3cb', '#bddc72', '#93d1f2', '#dc98ea', '#c8a585'],
    glass: 'rgba(255,255,255,0.7)',
    rim: 'rgba(150,110,140,0.3)',
    shine: 'rgba(255,255,255,0.7)',
    cork: '#e7b8a0',
    bg: ['#fff9fc', '#f2e4ee'],
  },
  {
    id: 'lagoon',
    price: 500,
    liquids: ['#1d4ed8', '#fde047', '#f43f5e', '#10b981', '#8b5cf6', '#fb923c', '#06b6d4', '#f9a8d4', '#a3e635', '#7dd3fc', '#c026d3', '#a16207'],
    glass: 'rgba(214,240,255,0.6)',
    rim: 'rgba(14,116,144,0.4)',
    shine: 'rgba(255,255,255,0.75)',
    cork: '#7dd3c0',
    bg: ['#f2fbff', '#cfe9f5'],
  },
  {
    id: 'jewel',
    price: 500,
    liquids: ['#1e40af', '#eab308', '#b91c1c', '#047857', '#6d28d9', '#c2410c', '#0f9b8e', '#db2777', '#65a30d', '#0284c7', '#a21caf', '#78350f'],
    glass: 'rgba(255,252,240,0.6)',
    rim: '#c79a3b',
    shine: 'rgba(255,255,255,0.6)',
    cork: '#d4a640',
    bg: ['#fdfaf2', '#ece2cc'],
  },
  {
    id: 'retro',
    price: 800,
    liquids: ['#3d6fb6', '#f2c14e', '#d9534f', '#5b8c5a', '#7b5ea7', '#f08a4b', '#3fa7a3', '#e889a8', '#a3b84c', '#7fb8d8', '#b55a9e', '#8a5a3c'],
    glass: 'rgba(255,248,232,0.65)',
    rim: 'rgba(110,80,50,0.35)',
    shine: 'rgba(255,255,255,0.5)',
    cork: '#9c6b3f',
    bg: ['#fff8ec', '#efe2c9'],
  },
  {
    id: 'neon',
    price: 1200,
    liquids: ['#2d7bff', '#ffe600', '#ff2e4d', '#39ff14', '#b026ff', '#ff7b00', '#00f0d0', '#ff4fd8', '#c6ff00', '#00c8ff', '#ff00a0', '#f2f2ff'],
    glass: 'rgba(22,26,52,0.82)',
    rim: '#6d5dfc',
    shine: 'rgba(255,255,255,0.28)',
    cork: '#6d5dfc',
    bg: ['#eceefe', '#d3d6f6'],
  },
];

/** Shop tile: a close-up tube (four liquid layers in the skin's glass) on the skin's background. */
export const SKINS: Skin[] = RAW.map((s) => ({
  ...s,
  swatch: [
    `linear-gradient(0deg, ${s.liquids[0]} 0 25%, ${s.liquids[2]} 25% 50%, ${s.liquids[1]} 50% 75%, ${s.liquids[3]} 75% 100%) 50% 88% / 34% 64% no-repeat`,
    `linear-gradient(${s.glass}, ${s.glass}) 50% 90% / 44% 76% no-repeat`,
    `linear-gradient(${s.rim}, ${s.rim}) 50% 92% / 52% 82% no-repeat`,
    `linear-gradient(180deg, ${s.bg[0]}, ${s.bg[1]})`,
  ].join(', '),
}));
