/** Satellite looks sold in the meta shop: satellite core, its glow and the trail colour (r,g,b). */
export interface Skin {
  id: string;
  price: number;
  sat: string;
  glow: string; // r,g,b
  trail: string; // r,g,b, or 'rainbow'
}

/** Trail colour at position a (0 = tail, 1 = head) with the given alpha. */
export function trailColor(skin: Skin, a: number, alpha: number) {
  if (skin.trail === 'rainbow') return `hsla(${Math.round(a * 300)},90%,74%,${alpha})`;
  return `rgba(${skin.trail},${alpha})`;
}

/** Shop tile: the satellite and its trail streaking across a little patch of sky. */
function swatch(s: Skin) {
  // A tapered wedge from the satellite toward the bottom-left corner, faded out by a sky-coloured vignette.
  const tail =
    s.trail === 'rainbow'
      ? `conic-gradient(at 70% 30%, transparent 0 215deg, ${[0, 0.25, 0.5, 0.75, 1].map((a, i) => `${trailColor(s, a, 0.85)} ${215 + i * 5}deg`).join(', ')}, transparent 235deg)`
      : `conic-gradient(at 70% 30%, transparent 0 213deg, rgba(${s.trail},0.3) 213deg 219deg, rgba(${s.trail},0.85) 219deg 231deg, rgba(${s.trail},0.3) 231deg 237deg, transparent 237deg)`;
  return [
    `radial-gradient(circle at 70% 30%, ${s.sat} 0 9%, rgba(${s.glow},0.75) 10%, rgba(${s.glow},0) 26%)`,
    'radial-gradient(circle at 0% 100%, #1d2356 0 18%, rgba(29,35,86,0) 72%)',
    tail,
    '#1d2356',
  ].join(', ');
}

export const SKINS: (Skin & { swatch: string })[] = (
  [
    { id: 'moon', price: 0, sat: '#ffffff', glow: '210,225,255', trail: '200,215,255' },
    { id: 'comet', price: 300, sat: '#fff4d6', glow: '255,214,140', trail: '255,190,110' },
    { id: 'aurora', price: 500, sat: '#e9fff4', glow: '140,240,190', trail: '110,230,200' },
    { id: 'nebula', price: 500, sat: '#fbeaff', glow: '214,160,255', trail: '240,140,220' },
    { id: 'ember', price: 800, sat: '#ffe9e0', glow: '255,140,110', trail: '255,110,90' },
    { id: 'ice', price: 800, sat: '#eafaff', glow: '140,220,255', trail: '120,200,255' },
    { id: 'prism', price: 1200, sat: '#ffffff', glow: '255,255,255', trail: 'rainbow' },
  ] as Skin[]
).map((s) => ({ ...s, swatch: swatch(s) }));
