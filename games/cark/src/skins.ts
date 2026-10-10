/**
 * Workshop styles sold in the meta shop: gear metal + board. Each metal is [highlight, body, shadow].
 *   gear  — the gears the player places (and the tray)
 *   motor — the motor gear
 *   fixed — clocks and belt pulleys
 */
export type Metal = readonly [string, string, string];
export interface Skin {
  id: string;
  price: number;
  gear: Metal;
  motor: Metal;
  fixed: Metal;
  bgTop: string;
  bgBottom: string;
  belt: string;
  accent: string;
  accentDark: string;
  sheet: string;
}

const RAW: Skin[] = [
  {
    id: 'brass',
    price: 0,
    gear: ['#f6d47e', '#d9a441', '#9c6b1f'],
    motor: ['#f2a67a', '#c8693c', '#7d3a1c'],
    fixed: ['#dfe9ec', '#9fb3bd', '#5d7480'],
    bgTop: '#24505a',
    bgBottom: '#0f2228',
    belt: '#1d2a2e',
    accent: '#e2ac43',
    accentDark: '#a5741f',
    sheet: '#1c3a42',
  },
  {
    id: 'steel',
    price: 300,
    gear: ['#f1f5f8', '#aebdc6', '#5f717c'],
    motor: ['#ffb27a', '#e0703a', '#8a3a17'],
    fixed: ['#f6d47e', '#d9a441', '#9c6b1f'],
    bgTop: '#34404d',
    bgBottom: '#12171d',
    belt: '#0b0f13',
    accent: '#7fc8f8',
    accentDark: '#3f86b5',
    sheet: '#26303a',
  },
  {
    id: 'copper',
    price: 500,
    gear: ['#f7b48a', '#cf7444', '#7d3a1c'],
    motor: ['#f6d47e', '#d9a441', '#9c6b1f'],
    fixed: ['#c9ece0', '#7fbfab', '#3f7566'],
    bgTop: '#2f5a52',
    bgBottom: '#10241f',
    belt: '#0f1d19',
    accent: '#f08a4b',
    accentDark: '#a8532a',
    sheet: '#1e3d37',
  },
  {
    id: 'wood',
    price: 500,
    gear: ['#ecca94', '#b98547', '#6e4620'],
    motor: ['#e38b6a', '#ad4b2f', '#5c2414'],
    fixed: ['#e2dac4', '#aa9d7e', '#635a43'],
    bgTop: '#46653f',
    bgBottom: '#1a2917',
    belt: '#2b1d10',
    accent: '#d6a25c',
    accentDark: '#8f6330',
    sheet: '#2c4227',
  },
  {
    id: 'candy',
    price: 800,
    gear: ['#ffd6ea', '#ff8cc6', '#c2407f'],
    motor: ['#c8f6ff', '#5fd0ef', '#1d7e9c'],
    fixed: ['#fff3b0', '#ffd84d', '#c79a00'],
    bgTop: '#6d4ca3',
    bgBottom: '#2a1a4a',
    belt: '#3b2560',
    accent: '#ff8cc6',
    accentDark: '#b84b85',
    sheet: '#43306b',
  },
  {
    id: 'neon',
    price: 1200,
    gear: ['#c4fff2', '#2ff5c8', '#0a8f74'],
    motor: ['#ffd6f8', '#ff4fd8', '#9b1385'],
    fixed: ['#fff6b8', '#ffe14d', '#a68b00'],
    bgTop: '#221d52',
    bgBottom: '#07061a',
    belt: '#000000',
    accent: '#2ff5c8',
    accentDark: '#0f9c7d',
    sheet: '#1b1840',
  },
];

/** Shop swatch: a gear and the motor on the board colours. */
const swatch = (s: Skin) =>
  `radial-gradient(circle at 36% 42%, ${s.gear[0]} 0 8%, ${s.gear[1]} 9% 27%, ${s.gear[2]} 28% 33%, transparent 34%),` +
  `radial-gradient(circle at 70% 66%, ${s.motor[1]} 0 18%, ${s.motor[2]} 19% 23%, transparent 24%),` +
  `linear-gradient(160deg, ${s.bgTop}, ${s.bgBottom})`;

export const SKINS = RAW.map((s) => ({ ...s, swatch: swatch(s) }));
export const skinById = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0];
