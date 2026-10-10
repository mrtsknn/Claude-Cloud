/** Board/tile color themes sold in the meta shop. Each one sets the game's CSS tokens. */
export interface Skin {
  id: string;
  price: number;
  /** Background gradient top / bottom. */
  bgTop: string;
  bgBottom: string;
  /** Letter tile face and its text. */
  tile: string;
  tileInk: string;
  /** Swipe trail, selected letters, bonus highlights. */
  accent: string;
  accentDark: string;
  /** Found-word flash. */
  mint: string;
  sheet: string;
  muted: string;
}

export const SKINS: (Skin & { swatch: string })[] = [
  { id: 'lagoon', price: 0, bgTop: '#16525a', bgBottom: '#0b2a30', tile: '#fdfaf2', tileInk: '#17323a', accent: '#ffb547', accentDark: '#c9852a', mint: '#5ee0b8', sheet: '#134148', muted: '#9cc3bd' },
  { id: 'paper', price: 300, bgTop: '#5b4a3a', bgBottom: '#2b2119', tile: '#f6ead2', tileInk: '#3a2a1a', accent: '#e9a23b', accentDark: '#a96d1c', mint: '#a8d672', sheet: '#3f3226', muted: '#c9b79d' },
  { id: 'midnight', price: 500, bgTop: '#2a3270', bgBottom: '#10142a', tile: '#e9ecff', tileInk: '#1b2142', accent: '#ffcf5c', accentDark: '#c99a26', mint: '#7be0ff', sheet: '#1f2752', muted: '#9aa3c7' },
  { id: 'berry', price: 500, bgTop: '#6a2350', bgBottom: '#2a0d22', tile: '#fff0f6', tileInk: '#4a1236', accent: '#ff8fb8', accentDark: '#c25583', mint: '#ffd36b', sheet: '#4a1838', muted: '#d9a2c1' },
  { id: 'forest', price: 800, bgTop: '#2f5a2a', bgBottom: '#132611', tile: '#f1f7e6', tileInk: '#1f3a1a', accent: '#f2c14e', accentDark: '#b28a26', mint: '#9be15d', sheet: '#22441e', muted: '#a9c79f' },
  { id: 'ember', price: 1200, bgTop: '#7a3418', bgBottom: '#2a0f06', tile: '#fff4e6', tileInk: '#4a1d0b', accent: '#ffd166', accentDark: '#c7972c', mint: '#ff9f6b', sheet: '#55230f', muted: '#e0ae94' },
].map((s) => ({
  ...s,
  swatch: `radial-gradient(circle at 50% 50%, ${s.tile} 0 26%, transparent 27%), linear-gradient(135deg, ${s.bgTop}, ${s.bgBottom} 70%, ${s.accent} 70%)`,
}));
