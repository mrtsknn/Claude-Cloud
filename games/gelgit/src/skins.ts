/** Beach themes sold in the meta shop. Each one is a full drawing palette for the canvas. */
export interface Palette {
  sandTop: string;
  sandBottom: string;
  speck: string;
  cell: string;
  /** r,g,b of the wet-sand tint. */
  wet: string;
  seaDeep: string;
  seaLight: string;
  water: string;
  foam: string;
  /** r,g,b of the live preview fill. */
  preview: string;
  reachLine: string;
  rock: string;
  rockLight: string;
  rockDark: string;
  wallSide: string;
  wallTop: string;
  wallEdge: string;
  castle: string;
  castleSide: string;
  castleEdge: string;
  door: string;
  flag: string;
  /** Home / meta background. */
  bg: string;
}

const classic: Palette = {
  sandTop: '#f6e7c6',
  sandBottom: '#eed6a6',
  speck: 'rgba(170,125,60,0.16)',
  cell: 'rgba(175,130,70,0.07)',
  wet: '120,85,40',
  seaDeep: '#118aa0',
  seaLight: '#3ccbcc',
  water: '#3cc6c9',
  foam: '#ffffff',
  preview: '47,185,189',
  reachLine: 'rgba(17,120,135,0.85)',
  rock: '#9c958b',
  rockLight: '#bdb6aa',
  rockDark: '#7c766d',
  wallSide: '#cf9f5c',
  wallTop: '#efcb8b',
  wallEdge: '#a97a3e',
  castle: '#f1d39b',
  castleSide: '#d7ad68',
  castleEdge: '#a97a3e',
  door: '#b98a4a',
  flag: '#ff7a59',
  bg: 'linear-gradient(175deg, #138c9f 0%, #3cc9cf 52%, #f3dcab 52.2%, #eed6a6 100%)',
};

export const SKINS: ({ id: string; price: number } & Palette)[] = [
  { id: 'classic', price: 0, ...classic },
  {
    id: 'tropical',
    price: 300,
    ...classic,
    sandTop: '#fdf6e3',
    sandBottom: '#f6e6bf',
    speck: 'rgba(190,150,80,0.13)',
    seaDeep: '#0a9bb5',
    seaLight: '#4fe3d4',
    water: '#52e0d2',
    preview: '40,205,195',
    reachLine: 'rgba(8,130,140,0.85)',
    wallSide: '#e3b874',
    wallTop: '#f8dca5',
    castle: '#fae3b4',
    castleSide: '#e8c584',
    flag: '#ff4f8b',
    bg: 'linear-gradient(175deg, #0a9bb5 0%, #4fe3d4 52%, #fdf3d8 52.2%, #f6e6bf 100%)',
  },
  {
    id: 'sunset',
    price: 500,
    ...classic,
    sandTop: '#f9d7b0',
    sandBottom: '#eab88f',
    speck: 'rgba(160,90,50,0.16)',
    cell: 'rgba(160,90,50,0.07)',
    wet: '120,60,40',
    seaDeep: '#5b3f8c',
    seaLight: '#e0748a',
    water: '#d77895',
    foam: '#ffe7d6',
    preview: '216,110,140',
    reachLine: 'rgba(110,50,110,0.85)',
    wallSide: '#d0905a',
    wallTop: '#f2bf8a',
    wallEdge: '#9c6236',
    castle: '#f6cb9a',
    castleSide: '#d99c66',
    castleEdge: '#9c6236',
    door: '#a86a3c',
    flag: '#ffd166',
    bg: 'linear-gradient(175deg, #3e2d74 0%, #b4558a 30%, #ff9a6b 52%, #f9d7b0 52.2%, #eab88f 100%)',
  },
  {
    id: 'coral',
    price: 600,
    ...classic,
    sandTop: '#fbe3dc',
    sandBottom: '#f3c9bd',
    speck: 'rgba(180,100,90,0.15)',
    cell: 'rgba(180,100,90,0.07)',
    wet: '140,70,60',
    seaDeep: '#1b6fa8',
    seaLight: '#48b8e0',
    water: '#55bde3',
    preview: '70,170,220',
    reachLine: 'rgba(20,90,150,0.85)',
    wallSide: '#e2a196',
    wallTop: '#f7cbc1',
    wallEdge: '#b06e63',
    castle: '#fcd9cf',
    castleSide: '#e8ab9e',
    castleEdge: '#b06e63',
    door: '#c07a6c',
    flag: '#2ec4b6',
    bg: 'linear-gradient(175deg, #1b6fa8 0%, #48b8e0 52%, #fbe3dc 52.2%, #f3c9bd 100%)',
  },
  {
    id: 'arctic',
    price: 800,
    ...classic,
    sandTop: '#f4f8fb',
    sandBottom: '#dde8f0',
    speck: 'rgba(110,140,170,0.16)',
    cell: 'rgba(110,140,170,0.08)',
    wet: '70,110,150',
    seaDeep: '#1d4e7a',
    seaLight: '#5fa8d3',
    water: '#79b8de',
    preview: '95,160,210',
    reachLine: 'rgba(25,70,115,0.85)',
    rock: '#8f9aa6',
    rockLight: '#b8c2cc',
    rockDark: '#6c7782',
    wallSide: '#b9d3e6',
    wallTop: '#e9f4fb',
    wallEdge: '#7c9bb3',
    castle: '#f2f8fc',
    castleSide: '#c9dcea',
    castleEdge: '#7c9bb3',
    door: '#8eaecb',
    flag: '#ff6b6b',
    bg: 'linear-gradient(175deg, #1d4e7a 0%, #5fa8d3 52%, #f4f8fb 52.2%, #dde8f0 100%)',
  },
  {
    id: 'night',
    price: 1200,
    ...classic,
    sandTop: '#5d5f86',
    sandBottom: '#44466b',
    speck: 'rgba(255,255,255,0.08)',
    cell: 'rgba(255,255,255,0.05)',
    wet: '15,20,50',
    seaDeep: '#0b1433',
    seaLight: '#1f4f86',
    water: '#2c6aa8',
    foam: '#cfe8ff',
    preview: '90,160,240',
    reachLine: 'rgba(160,210,255,0.9)',
    rock: '#6d6a80',
    rockLight: '#8e8ba3',
    rockDark: '#4d4a60',
    wallSide: '#8f86a8',
    wallTop: '#b8b0d0',
    wallEdge: '#5d5578',
    castle: '#c9c1df',
    castleSide: '#9e95bb',
    castleEdge: '#5d5578',
    door: '#ffd36b',
    flag: '#ffd36b',
    bg: 'linear-gradient(175deg, #0b1433 0%, #1f4f86 52%, #5d5f86 52.2%, #44466b 100%)',
  },
];

export const swatchOf = (p: Palette) =>
  `linear-gradient(180deg, ${p.seaDeep} 0 34%, ${p.seaLight} 34% 52%, ${p.foam} 52% 58%, ${p.sandTop} 58% 80%, ${p.castle} 80%)`;
