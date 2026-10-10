/**
 * Lamp-light / night-sky themes sold in the meta shop. Each one recolours the lamp light
 * (`light`, `hi` = hot core) and the night sky (`top` → `bottom` gradient); board, houses and
 * tiles are derived from the sky so every theme stays consistent. None of the light colours is
 * red, so the red "too bright" warning always reads clearly.
 */
export interface Skin {
  id: string;
  price: number;
  light: string;
  hi: string;
  top: string;
  bottom: string;
}

const RAW: Skin[] = [
  { id: 'amber', price: 0, light: '#ffc861', hi: '#fff1c9', top: '#1d2457', bottom: '#0b0f2a' },
  { id: 'moon', price: 300, light: '#bcd8ff', hi: '#ffffff', top: '#1b2c4d', bottom: '#070d1c' },
  { id: 'firefly', price: 500, light: '#c6f26b', hi: '#f4ffd6', top: '#173a40', bottom: '#06151a' },
  { id: 'lavender', price: 500, light: '#c7a6ff', hi: '#f3eaff', top: '#2a1f5c', bottom: '#0d0a26' },
  { id: 'harbor', price: 800, light: '#6fe6dc', hi: '#ddfffb', top: '#10324f', bottom: '#04111e' },
  { id: 'ember', price: 1200, light: '#ff9d4f', hi: '#ffe2c6', top: '#33193d', bottom: '#0f0817' },
];

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
/** Linear mix of two hex colours, `k` = share of `b`. */
export function mix(a: string, b: string, k: number) {
  const A = hex(a);
  const B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
export const rgb = (h: string) => hex(h).join(',');

export const SKINS = RAW.map((s) => ({
  ...s,
  swatch: `radial-gradient(circle at 50% 42%, ${s.hi} 0 12%, ${s.light} 13% 24%, ${mix(s.light, s.top, 0.6)} 25% 34%, transparent 35%), linear-gradient(180deg, ${s.top}, ${s.bottom})`,
}));
