/**
 * Ship & container themes sold in the meta shop. `ports` are the container colours in visit
 * order (port 1–4); every port also keeps its own icon, so themes never rely on colour alone.
 * The listed-hull red and the wrong-stack outline stay the same in every theme.
 */
export interface Skin {
  id: string;
  price: number;
  /** Hull colour and the light stripe along the deck. */
  hull: string;
  trim: string;
  ports: [string, string, string, string];
  swatch: string;
}

const RAW: Omit<Skin, 'swatch'>[] = [
  { id: 'classic', price: 0, hull: '#24476b', trim: '#f4fbfc', ports: ['#f28c28', '#e9b200', '#22a06b', '#8e5cf7'] },
  { id: 'coral', price: 300, hull: '#0b4f5c', trim: '#e9fbf8', ports: ['#ff9b54', '#f4c400', '#5f9e45', '#5b4bc4'] },
  { id: 'harbor', price: 300, hull: '#2f6b4f', trim: '#f1f7ea', ports: ['#ef6c3a', '#f2c230', '#2f8fd8', '#a05cd6'] },
  { id: 'arctic', price: 500, hull: '#dfe7ee', trim: '#2b4a66', ports: ['#ff8a65', '#f6b93b', '#26a69a', '#7e6bd9'] },
  { id: 'midnight', price: 500, hull: '#1d2433', trim: '#ffd166', ports: ['#ff7b54', '#ffc93c', '#06c196', '#3fa7e0'] },
  { id: 'freighter', price: 800, hull: '#6b3f2a', trim: '#efe0c4', ports: ['#d9822b', '#c9a227', '#5b8c3a', '#4f6d9a'] },
  { id: 'neon', price: 1200, hull: '#2a1846', trim: '#ff2e88', ports: ['#ff2e88', '#ffd400', '#2bd66b', '#00c2e0'] },
];

export const SKINS: Skin[] = RAW.map((s) => ({
  ...s,
  // Container stripes over the hull colour, like the side of a loaded ship.
  swatch: `linear-gradient(180deg, ${s.ports[0]} 0 21%, ${s.ports[1]} 21% 42%, ${s.ports[2]} 42% 63%, ${s.trim} 63% 68%, ${s.hull} 68%)`,
}));

export const skinById = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0];

/** Icon/text colour that stays readable on a container of colour `hex`. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 190 ? 'rgba(22,50,74,0.85)' : '#fff';
}
