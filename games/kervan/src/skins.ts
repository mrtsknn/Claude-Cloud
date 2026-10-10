/**
 * Map themes sold in the meta shop. Each one repaints the desert map (sky/sand gradient, dunes,
 * pebbles, oases, trees, road, city plates, camels) and the home-screen hero artwork.
 * Colours given as "r, g, b" are used with varying alpha.
 */
export interface MapTheme {
  id: string;
  price: number;
  /** Ground gradient, top → bottom. */
  sky: [string, string];
  ridge: string;
  crest: string;
  pebble: string;
  water: string;
  rim: string;
  leaf: string;
  trunk: string;
  tree: 'palm' | 'pine';
  road: string;
  dash: string;
  dust: string;
  plate: string;
  camel: string;
  camelLeg: string;
  /** Warm lantern light around open cities (night). */
  glow?: boolean;
  /** Snow on tree tops. */
  snowCap?: boolean;
  /** Hero artwork sky and sun. */
  heroSky: [string, string];
  sun: string;
}

export const SKINS: MapTheme[] = [
  {
    id: 'sands', price: 0,
    sky: ['#f7e6c2', '#efd19a'], ridge: 'rgba(214, 160, 92, 0.13)', crest: 'rgba(255, 246, 225, 0.55)', pebble: '150, 100, 55',
    water: '#4fb3a9', rim: '#e2c189', leaf: '#3f8f5a', trunk: '#8a5a32', tree: 'palm',
    road: '176, 120, 62', dash: '130, 80, 36', dust: '214, 170, 110', plate: '#fbecc9', camel: '#c9965a', camelLeg: '#a8763f',
    heroSky: ['#ffe3a3', '#f6c76a'], sun: '#fff4d6',
  },
  {
    id: 'dusk', price: 150,
    sky: ['#ffd2a1', '#e48f73'], ridge: 'rgba(150, 60, 70, 0.16)', crest: 'rgba(255, 226, 200, 0.5)', pebble: '120, 50, 50',
    water: '#5a8fb0', rim: '#eaa680', leaf: '#4f7a4a', trunk: '#6e3f2c', tree: 'palm',
    road: '150, 70, 60', dash: '110, 40, 40', dust: '230, 150, 120', plate: '#ffe4cc', camel: '#b98256', camelLeg: '#8d5a3a',
    heroSky: ['#ffb46b', '#d9607a'], sun: '#ffe7a8',
  },
  {
    id: 'oasis', price: 250,
    sky: ['#eaf3cf', '#bcd893'], ridge: 'rgba(90, 140, 60, 0.15)', crest: 'rgba(250, 255, 232, 0.6)', pebble: '80, 110, 50',
    water: '#3fb6c4', rim: '#d3e6a8', leaf: '#2f7f45', trunk: '#7a5530', tree: 'palm',
    road: '130, 115, 60', dash: '90, 80, 36', dust: '180, 190, 120', plate: '#f6f8de', camel: '#c9965a', camelLeg: '#a8763f',
    heroSky: ['#d8f1c0', '#8cc979'], sun: '#fffbe0',
  },
  {
    id: 'snow', price: 400,
    sky: ['#f6f9fd', '#d5e2ee'], ridge: 'rgba(120, 150, 190, 0.16)', crest: 'rgba(255, 255, 255, 0.85)', pebble: '110, 130, 160',
    water: '#a6d6ec', rim: '#eaf2f9', leaf: '#2f6b5a', trunk: '#6b4a32', tree: 'pine', snowCap: true,
    road: '120, 132, 155', dash: '85, 95, 120', dust: '220, 230, 245', plate: '#ffffff', camel: '#b88a5a', camelLeg: '#8f6a45',
    heroSky: ['#dbe9f7', '#a9c3de'], sun: '#ffffff',
  },
  {
    id: 'night', price: 600,
    sky: ['#2e3264', '#4b3b6e'], ridge: 'rgba(20, 15, 50, 0.28)', crest: 'rgba(170, 160, 235, 0.35)', pebble: '255, 240, 200',
    water: '#3a6fa8', rim: '#5b4d86', leaf: '#2f6a5e', trunk: '#4a3646', tree: 'palm', glow: true,
    road: '235, 205, 150', dash: '255, 220, 160', dust: '150, 130, 190', plate: '#f3e2c0', camel: '#b38a62', camelLeg: '#8a6646',
    heroSky: ['#1d2150', '#5a3f78'], sun: '#fff1c2',
  },
  {
    id: 'canyon', price: 900,
    sky: ['#f6bf95', '#d27650'], ridge: 'rgba(150, 50, 30, 0.18)', crest: 'rgba(255, 222, 195, 0.45)', pebble: '110, 40, 20',
    water: '#3fa3a8', rim: '#e3a07a', leaf: '#4d7a3a', trunk: '#6b3a22', tree: 'palm',
    road: '130, 55, 32', dash: '100, 35, 20', dust: '220, 140, 100', plate: '#fbe0ca', camel: '#c9965a', camelLeg: '#9c6a40',
    heroSky: ['#ffc38a', '#c4583c'], sun: '#fff0d0',
  },
];

/** Shop tile: sky, sand and water bands of the theme. */
export const swatchOf = (s: MapTheme) =>
  `linear-gradient(170deg, ${s.heroSky[0]} 0 38%, ${s.sky[0]} 38% 62%, ${s.sky[1]} 62% 82%, ${s.water} 82%)`;
