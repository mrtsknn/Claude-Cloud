/**
 * Tile materials + table themes sold in the meta shop. Each skin repaints the canvas (tiles,
 * board, pins, arrows) and the page background / home screen through CSS variables.
 */
export interface Palette {
  /** Page background gradient (top → bottom) and the meta home background. */
  bgTop: string;
  bgBottom: string;
  home: [string, string];
  /** HUD text on the page background. */
  hudInk: string;
  hudMuted: string;
  board: string;
  cell: string;
  wood: string;
  woodLight: string;
  woodEdge: string;
  woodFallen: string;
  grain: string;
  start: string;
  startLight: string;
  startEdge: string;
  arrow: string;
  startArrow: string;
  pin: string;
  shadow: string;
}

export interface Skin {
  id: string;
  price: number;
  colors: Palette;
}

const SKIN_LIST: Skin[] = [
  {
    id: 'oak',
    price: 0,
    colors: {
      bgTop: '#f1f5ee', bgBottom: '#cddbc6', home: ['#6f9c78', '#2f4a36'], hudInk: '#2c3a2e', hudMuted: '#6c7b6b',
      board: 'rgba(255,255,255,0.38)', cell: 'rgba(60,84,64,0.10)',
      wood: '#ecc99c', woodLight: '#f6dcb6', woodEdge: '#b98552', woodFallen: '#d7ab78', grain: 'rgba(122,74,36,0.08)',
      start: '#e4784c', startLight: '#f19a71', startEdge: '#a8481f',
      arrow: '#7a4a24', startArrow: '#fffdf8', pin: '#3c5440', shadow: 'rgba(40,58,44,0.16)',
    },
  },
  {
    id: 'walnut',
    price: 300,
    colors: {
      bgTop: '#f6efe4', bgBottom: '#dccbb2', home: ['#9a7350', '#4a3020'], hudInk: '#3a2a1e', hudMuted: '#85705c',
      board: 'rgba(255,255,255,0.4)', cell: 'rgba(90,60,30,0.10)',
      wood: '#9b6b45', woodLight: '#b5835a', woodEdge: '#5e3a20', woodFallen: '#83583a', grain: 'rgba(40,20,5,0.14)',
      start: '#e9b949', startLight: '#f4d27a', startEdge: '#a77a17',
      arrow: '#fbe9d0', startArrow: '#5e3a20', pin: '#d9643a', shadow: 'rgba(60,38,20,0.2)',
    },
  },
  {
    id: 'marble',
    price: 500,
    colors: {
      bgTop: '#f3f4f8', bgBottom: '#cfd4e0', home: ['#8b93ab', '#3c4258'], hudInk: '#2b3042', hudMuted: '#6e7489',
      board: 'rgba(255,255,255,0.5)', cell: 'rgba(50,60,90,0.09)',
      wood: '#eef0f4', woodLight: '#ffffff', woodEdge: '#a6adbf', woodFallen: '#d9dde6', grain: 'rgba(80,90,120,0.12)',
      start: '#4a5578', startLight: '#68749a', startEdge: '#2a3150',
      arrow: '#4a5578', startArrow: '#ffffff', pin: '#c9a227', shadow: 'rgba(40,48,72,0.18)',
    },
  },
  {
    id: 'jade',
    price: 500,
    colors: {
      bgTop: '#eef7f2', bgBottom: '#bfdccd', home: ['#3f9c7a', '#16473a'], hudInk: '#173a30', hudMuted: '#57786c',
      board: 'rgba(255,255,255,0.4)', cell: 'rgba(20,80,60,0.10)',
      wood: '#7cc8a6', woodLight: '#a2dcc0', woodEdge: '#2f7d5e', woodFallen: '#66b08f', grain: 'rgba(10,60,40,0.1)',
      start: '#f2a65a', startLight: '#f7c088', startEdge: '#b46a22',
      arrow: '#164a38', startArrow: '#fffdf8', pin: '#7a3f2a', shadow: 'rgba(20,70,50,0.18)',
    },
  },
  {
    id: 'candy',
    price: 800,
    colors: {
      bgTop: '#fff3f6', bgBottom: '#f7cfdc', home: ['#e97fa2', '#7b2e55'], hudInk: '#4a2238', hudMuted: '#8f5f78',
      board: 'rgba(255,255,255,0.45)', cell: 'rgba(140,40,90,0.08)',
      wood: '#fbd3e0', woodLight: '#ffe7ef', woodEdge: '#d67d9e', woodFallen: '#f2b8cc', grain: 'rgba(160,60,100,0.08)',
      start: '#6cc6e8', startLight: '#97d9f2', startEdge: '#2f8db3',
      arrow: '#b2416e', startArrow: '#ffffff', pin: '#6b4bb8', shadow: 'rgba(130,40,80,0.16)',
    },
  },
  {
    id: 'midnight',
    price: 1200,
    colors: {
      bgTop: '#2b3350', bgBottom: '#121629', home: ['#3a4470', '#0b0e1d'], hudInk: '#f2f4ff', hudMuted: '#9aa3c8',
      board: 'rgba(255,255,255,0.07)', cell: 'rgba(255,255,255,0.06)',
      wood: '#3d4670', woodLight: '#525d8e', woodEdge: '#1d2240', woodFallen: '#323a60', grain: 'rgba(255,255,255,0.05)',
      start: '#ffcf5c', startLight: '#ffe08f', startEdge: '#b88a1c',
      arrow: '#9fe8ff', startArrow: '#2a1a00', pin: '#ff6b8b', shadow: 'rgba(0,0,0,0.35)',
    },
  },
];

export const SKINS = SKIN_LIST.map((s) => ({
  ...s,
  swatch: `linear-gradient(160deg, ${s.colors.bgTop} 0 30%, ${s.colors.woodLight} 30% 58%, ${s.colors.woodEdge} 58% 74%, ${s.colors.start} 74%)`,
}));
