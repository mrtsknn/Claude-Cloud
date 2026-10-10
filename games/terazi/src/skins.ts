/**
 * Materials sold in the meta shop: the plank (beam + pedestal) and the player's weights.
 * Fixed weights always stay dark slate so they read as "not yours" in every material.
 */
export interface Skin {
  id: string;
  price: number;
  /** Beam gradient (top → bottom) and its outline. */
  plank: [string, string];
  edge: string;
  /** Pedestal column. */
  column: [string, string];
  /** Weight body gradient (light → dark), number ink, hanging ring. */
  weight: [string, string];
  ink: string;
  ring: string;
  /** Pegs, end caps, pivot pin, fulcrum. */
  metal: string;
  /** Distance numbers printed on the beam. */
  label: string;
}

const SKIN_LIST: Skin[] = [
  {
    id: 'brass',
    price: 0,
    plank: ['#f4f0e7', '#d8cfbe'],
    edge: 'rgba(90, 80, 60, 0.28)',
    column: ['#e6dfd1', '#cfc5b2'],
    weight: ['#ecd08d', '#b88b37'],
    ink: '#4a3713',
    ring: '#b88b37',
    metal: '#b88b37',
    label: 'rgba(90, 80, 60, 0.6)',
  },
  {
    id: 'wood',
    price: 300,
    plank: ['#d9a86c', '#a8733d'],
    edge: 'rgba(80, 45, 15, 0.4)',
    column: ['#c99560', '#9b6735'],
    weight: ['#f1d7ac', '#c99a5c'],
    ink: '#5a3410',
    ring: '#7a5230',
    metal: '#6e4a2a',
    label: 'rgba(70, 38, 10, 0.7)',
  },
  {
    id: 'marble',
    price: 500,
    plank: ['#ffffff', '#dfe3e8'],
    edge: 'rgba(60, 70, 90, 0.25)',
    column: ['#f4f6f8', '#d3d9df'],
    weight: ['#fbfbfd', '#b6bbcc'],
    ink: '#2e3550',
    ring: '#9aa1b8',
    metal: '#c3a35a',
    label: 'rgba(50, 60, 80, 0.55)',
  },
  {
    id: 'candy',
    price: 500,
    plank: ['#ffd6e7', '#f5a3c4'],
    edge: 'rgba(150, 50, 100, 0.3)',
    column: ['#ffe3ef', '#f3b3cf'],
    weight: ['#b8f0e0', '#5fcfb0'],
    ink: '#14513f',
    ring: '#e46c9d',
    metal: '#e46c9d',
    label: 'rgba(130, 40, 85, 0.65)',
  },
  {
    id: 'stone',
    price: 800,
    plank: ['#c9c4bb', '#9c958a'],
    edge: 'rgba(40, 36, 30, 0.35)',
    column: ['#bdb7ad', '#8f897e'],
    weight: ['#f0dcc0', '#c8a57a'],
    ink: '#4e3518',
    ring: '#7d766b',
    metal: '#6f685d',
    label: 'rgba(40, 36, 30, 0.7)',
  },
  {
    id: 'jade',
    price: 1200,
    plank: ['#cfeee0', '#8fcfb3'],
    edge: 'rgba(20, 80, 60, 0.3)',
    column: ['#bfe6d4', '#86c4a8'],
    weight: ['#f6e3a6', '#d4a93e'],
    ink: '#4a3510',
    ring: '#2f8a68',
    metal: '#2f8a68',
    label: 'rgba(20, 80, 60, 0.7)',
  },
];

export const SKINS = SKIN_LIST.map((s) => ({
  ...s,
  // Shop tile: the beam on top, a weight below.
  swatch: `linear-gradient(180deg, ${s.plank[0]} 0 22%, ${s.plank[1]} 22% 38%, transparent 38%), radial-gradient(circle at 50% 70%, ${s.weight[0]} 0 22%, ${s.weight[1]} 23% 34%, transparent 35%), linear-gradient(180deg, #eef2f5, #cfd9e1)`,
}));
