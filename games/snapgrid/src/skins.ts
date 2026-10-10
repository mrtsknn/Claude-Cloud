/** Block palettes sold in the meta shop. Seven colors each, matching the game's color ids. */
export const SKINS = [
  { id: 'classic', price: 0, colors: ['#ff6b6b', '#ffb547', '#9be15d', '#3dd9a4', '#4cb8ff', '#7b8cff', '#c17bff'] },
  { id: 'pastel', price: 300, colors: ['#f4a3a8', '#f7cf8f', '#c6e5a0', '#9fe0cf', '#a7d3f5', '#b9bff5', '#dcb6f2'] },
  { id: 'ocean', price: 500, colors: ['#0ea5e9', '#22d3ee', '#2dd4bf', '#38bdf8', '#60a5fa', '#818cf8', '#a5b4fc'] },
  { id: 'sunset', price: 500, colors: ['#ff7a59', '#ff9f43', '#ffc94a', '#ff6b8b', '#e8578d', '#c4528f', '#9a4f96'] },
  { id: 'forest', price: 800, colors: ['#4d7c0f', '#65a30d', '#84cc16', '#15803d', '#22c55e', '#a3a948', '#ca8a04'] },
  { id: 'neon', price: 1200, colors: ['#ff2e88', '#ffe600', '#39ff14', '#00f0ff', '#2d7bff', '#b026ff', '#ff7b00'] },
].map((s) => ({ ...s, swatch: `linear-gradient(135deg, ${s.colors[0]} 0 33%, ${s.colors[2]} 33% 66%, ${s.colors[4]} 66%)` }));
