/**
 * Bowl + studio themes sold in the meta shop. Each one restyles the mixing bowl drawn on the
 * canvas (body gradient, rim, a surface pattern) and the studio backdrop behind it.
 */
export type Pattern = 'none' | 'band' | 'grain' | 'veins' | 'glass' | 'metal';

export interface Skin {
  id: string;
  price: number;
  /** Studio backdrop gradient (top, bottom). */
  bg: [string, string];
  /** Bowl body gradient, lit side → shadow side. */
  body: [string, string, string];
  /** Inner wall / rim fill and its highlight line. */
  rim: string;
  rimLine: string;
  pattern: Pattern;
  /** Pattern ink (band colour, wood grain, marble veins). */
  ink: string;
  /** Shop card preview (CSS background). */
  swatch: string;
}

export const SKINS: Skin[] = [
  {
    id: 'ceramic',
    price: 0,
    bg: ['#eef0f3', '#d9dde3'],
    body: ['#ffffff', '#f3f5f8', '#d6dbe2'],
    rim: '#e6e9ee',
    rimLine: '#ffffff',
    pattern: 'none',
    ink: '#c9ced6',
    swatch: 'radial-gradient(circle at 35% 30%, #ffffff 0 30%, #e9ecf0 55%, #c9ced6)',
  },
  {
    id: 'terracotta',
    price: 300,
    bg: ['#f7eee7', '#e6d3c5'],
    body: ['#e9976b', '#c96a41', '#8f4227'],
    rim: '#d98157',
    rimLine: '#f3b08d',
    pattern: 'band',
    ink: '#f4e3cf',
    swatch: 'linear-gradient(180deg, #e9976b 0 45%, #f4e3cf 45% 55%, #c96a41 55%)',
  },
  {
    id: 'wood',
    price: 500,
    bg: ['#f4efe7', '#ddd1bf'],
    body: ['#d3a571', '#a87543', '#6c4625'],
    rim: '#c0915f',
    rimLine: '#e2bb8f',
    pattern: 'grain',
    ink: '#7a4f2a',
    swatch: 'repeating-linear-gradient(170deg, #c99a66 0 7px, #a87543 7px 9px, #d3a571 9px 15px)',
  },
  {
    id: 'marble',
    price: 500,
    bg: ['#f2f3f5', '#d3d7dd'],
    body: ['#ffffff', '#eef0f2', '#c8cdd4'],
    rim: '#f1f2f4',
    rimLine: '#ffffff',
    pattern: 'veins',
    ink: '#8e96a3',
    swatch:
      'linear-gradient(125deg, transparent 0 38%, #9aa2ae 39%, transparent 41% 62%, #b7bec8 63%, transparent 64%), linear-gradient(160deg, #ffffff, #e3e6ea)',
  },
  {
    id: 'glass',
    price: 800,
    bg: ['#eaf5f6', '#cbe1e5'],
    body: ['rgba(255,255,255,0.75)', 'rgba(214,238,242,0.6)', 'rgba(140,184,196,0.7)'],
    rim: 'rgba(222,242,246,0.85)',
    rimLine: '#ffffff',
    pattern: 'glass',
    ink: '#ffffff',
    swatch: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0 20%, #d6eef2 20% 60%, #9cc4ce)',
  },
  {
    id: 'porcelain',
    price: 1000,
    bg: ['#eef2f8', '#d2dae7'],
    body: ['#ffffff', '#f2f5fa', '#cdd6e4'],
    rim: '#e8edf5',
    rimLine: '#ffffff',
    pattern: 'band',
    ink: '#2346c8',
    swatch: 'linear-gradient(180deg, #ffffff 0 40%, #2346c8 40% 52%, #ffffff 52% 60%, #2346c8 60% 64%, #f2f5fa 64%)',
  },
  {
    id: 'copper',
    price: 1200,
    bg: ['#f6eee8', '#e0cec1'],
    body: ['#f6c49a', '#c8794a', '#73391b'],
    rim: '#dc8f5e',
    rimLine: '#ffd8b8',
    pattern: 'metal',
    ink: '#fff1e2',
    swatch: 'linear-gradient(100deg, #73391b, #c8794a 35%, #fff1e2 48%, #c8794a 60%, #73391b)',
  },
];

export const skinById = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0];
