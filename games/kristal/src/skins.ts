/**
 * Crystal themes sold in the meta shop. Each one recolours the lit crystals (three-stop
 * gradient), their glow, the facet lines, the centre ornament and the target preview.
 */
export interface Skin {
  id: string;
  price: number;
  /** Lit crystal gradient: highlight → body → shadow edge. */
  hi: string;
  mid: string;
  lo: string;
  /** Glow around lit crystals (rgb triplet, alpha is applied by the renderer). */
  glow: string;
  /** Facet lines on lit crystals. */
  facet: string;
  /** Centre ornament and win sparkle tint. */
  core: string;
  swatch: string;
}

const RAW: Omit<Skin, 'swatch'>[] = [
  { id: 'ice', price: 0, hi: '#ffffff', mid: '#d6e6ff', lo: '#b6b0f5', glow: '170,205,255', facet: 'rgba(120,130,210,0.28)', core: '#cbbcff' },
  { id: 'aurora', price: 300, hi: '#f2fff9', mid: '#8ff0cf', lo: '#7a8cff', glow: '110,240,200', facet: 'rgba(40,120,140,0.3)', core: '#9be8ff' },
  { id: 'rose', price: 500, hi: '#fff6f8', mid: '#ffc6d6', lo: '#e58fb8', glow: '255,170,205', facet: 'rgba(170,80,120,0.28)', core: '#ffb3cc' },
  { id: 'amber', price: 500, hi: '#fffbea', mid: '#ffd77a', lo: '#f29a4a', glow: '255,200,110', facet: 'rgba(160,90,20,0.3)', core: '#ffc46b' },
  { id: 'emerald', price: 800, hi: '#f0fff4', mid: '#7fe3a6', lo: '#2fae7a', glow: '110,230,160', facet: 'rgba(20,110,70,0.32)', core: '#8af0b8' },
  { id: 'midnight', price: 1200, hi: '#e9f3ff', mid: '#5aa9ff', lo: '#3b3fd6', glow: '90,160,255', facet: 'rgba(20,30,120,0.38)', core: '#7f8bff' },
];

export const SKINS: Skin[] = RAW.map((s) => ({
  ...s,
  swatch: `radial-gradient(circle at 35% 30%, ${s.hi} 0 18%, ${s.mid} 45%, ${s.lo} 85%)`,
}));
