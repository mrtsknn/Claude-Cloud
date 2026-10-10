/**
 * Wordlink's build meta: a reading world that grows as you play. Four places (reading garden,
 * library hall, rooftop terrace, lakeside cabin), each with 6 tasks drawn as SVG layers, cycled
 * through the four seasons (palette) and then again with a numeral: 64 areas ≈ 1000 levels.
 * All art is original, drawn in code (viewBox 320×200). Pure: no DOM.
 */
import type { BuildArea } from '@studio/kit';

type Lang = 'en' | 'tr';
export type Place = 'garden' | 'hall' | 'terrace' | 'lake';
export const PLACES: Place[] = ['garden', 'hall', 'terrace', 'lake'];
export const AREA_COUNT = 64;

/** Task ids in suggested build order. */
const TASKS: Record<Place, string[]> = {
  garden: ['path', 'bench', 'tree', 'flowers', 'lamp', 'box'],
  hall: ['shelves', 'rug', 'window', 'desk', 'chair', 'chandelier'],
  terrace: ['deck', 'plants', 'lights', 'beanbag', 'telescope', 'tent'],
  lake: ['pier', 'reeds', 'cabin', 'boat', 'fire', 'swing'],
};

const NAMES: Record<Lang, Record<Place, string> & Record<string, string>> = {
  en: {
    garden: 'Reading Garden', hall: 'Library Hall', terrace: 'Rooftop Terrace', lake: 'Lakeside Cabin',
    path: 'Stone path', bench: 'Bench', tree: 'Shade tree', flowers: 'Flower beds', lamp: 'Lamp post', box: 'Book box',
    shelves: 'Bookshelves', rug: 'Rug', window: 'Arched window', desk: 'Reading desk', chair: 'Armchair', chandelier: 'Chandelier',
    deck: 'Wooden deck', plants: 'Potted plants', lights: 'String lights', beanbag: 'Cushions & books', telescope: 'Telescope', tent: 'Reading tent',
    pier: 'Pier', reeds: 'Reeds & lilies', cabin: 'Cabin', boat: 'Rowboat', fire: 'Campfire', swing: 'Tree swing',
    spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter',
  },
  tr: {
    garden: 'Okuma Bahçesi', hall: 'Kütüphane Salonu', terrace: 'Çatı Terası', lake: 'Göl Kulübesi',
    path: 'Taş yol', bench: 'Bank', tree: 'Gölge ağacı', flowers: 'Çiçek tarhı', lamp: 'Sokak lambası', box: 'Kitap kutusu',
    shelves: 'Kitaplık', rug: 'Halı', window: 'Kemerli pencere', desk: 'Okuma masası', chair: 'Koltuk', chandelier: 'Avize',
    deck: 'Ahşap zemin', plants: 'Saksı bitkileri', lights: 'Işık zinciri', beanbag: 'Minder ve kitaplar', telescope: 'Teleskop', tent: 'Okuma çadırı',
    pier: 'İskele', reeds: 'Saz ve nilüfer', cabin: 'Kulübe', boat: 'Kayık', fire: 'Kamp ateşi', swing: 'Ağaç salıncağı',
    spring: 'İlkbahar', summer: 'Yaz', autumn: 'Sonbahar', winter: 'Kış',
  },
};

interface Season {
  id: 'spring' | 'summer' | 'autumn' | 'winter';
  sky: [string, string];
  grass: string;
  grass2: string;
  leaf: string;
  leaf2: string;
  ground: string;
  water: string;
  accent: string;
  wall: string;
  snow: boolean;
}
const SEASONS: Season[] = [
  { id: 'spring', sky: ['#9fd8ff', '#e6f6ff'], grass: '#8fd16a', grass2: '#69b04c', leaf: '#74c45a', leaf2: '#ffb3cf', ground: '#e5cf9f', water: '#62c0e6', accent: '#ff8fb8', wall: '#f6ead7', snow: false },
  { id: 'summer', sky: ['#7cc8ff', '#d8f0ff'], grass: '#6cc04a', grass2: '#4f9e36', leaf: '#4aa83a', leaf2: '#ffd34d', ground: '#e6c88d', water: '#35aee0', accent: '#ffb547', wall: '#f3e6cf', snow: false },
  { id: 'autumn', sky: ['#ffc98f', '#fff0d9'], grass: '#c8b25a', grass2: '#a38c3c', leaf: '#ef8a3a', leaf2: '#d6502c', ground: '#dbb27c', water: '#5fa2c6', accent: '#e0661c', wall: '#f5e3cc', snow: false },
  { id: 'winter', sky: ['#bcd3ec', '#eef5fc'], grass: '#eef4fa', grass2: '#cfdcea', leaf: '#8fb0c4', leaf2: '#ffffff', ground: '#e3ebf3', water: '#8cc2e4', accent: '#4f9ae0', wall: '#eef0f4', snow: true },
];

export const placeOf = (k: number): Place => PLACES[k % PLACES.length];
const seasonOf = (k: number) => SEASONS[Math.floor(k / PLACES.length) % SEASONS.length];
const lapOf = (k: number) => Math.floor(k / (PLACES.length * SEASONS.length));

/** Star costs: the first area is cheap so the first task lands after level 1. */
const costs = (k: number) => (k === 0 ? [1, 1, 2, 2, 2, 3] : k === 1 ? [2, 2, 2, 3, 3, 3] : [2, 3, 3, 3, 3, 3]);

export const AREAS: BuildArea[] = Array.from({ length: AREA_COUNT }, (_, k) => {
  const place = placeOf(k);
  const c = costs(k);
  return {
    id: `${place}-${k}`,
    tasks: TASKS[place].map((id, i) => ({ id, cost: c[i] })),
    reward: { coins: 150 + 25 * Math.min(k, 10), packs: k % 4 === 3 ? 2 : 1 },
  };
});

export function areaName(k: number, lang: Lang): string {
  const n = NAMES[lang];
  const lap = lapOf(k);
  return `${n[placeOf(k)]} · ${n[seasonOf(k).id]}${lap ? ` ${'I'.repeat(Math.min(lap + 1, 3))}` : ''}`;
}
export const taskName = (taskId: string, lang: Lang) => NAMES[lang][taskId] ?? taskId;

// ───────────────────────── art ─────────────────────────
const WOOD = '#a8693a';
const WOOD2 = '#7d4a26';
const DARK = '#2f3547';
const BOOKS = ['#e25d5d', '#4f8fe0', '#f2b632', '#5cbf8a', '#9b6ad8', '#f08a3c', '#3fb6c4'];

const books = (x: number, y: number, w: number, h: number, seed: number) => {
  let s = '';
  let cx = x;
  let i = seed;
  while (cx < x + w - 3) {
    const bw = 4 + ((i * 7) % 4);
    const bh = h - ((i * 5) % 5);
    s += `<rect x="${cx}" y="${y + h - bh}" width="${bw}" height="${bh}" rx="1" fill="${BOOKS[i % BOOKS.length]}"/>`;
    cx += bw + 1;
    i++;
  }
  return s;
};
const snowCap = (x: number, y: number, w: number) => `<path d="M${x} ${y}q${w / 4} -4 ${w / 2} 0t${w / 2} 0v3h-${w}z" fill="#fff"/>`;

function garden(S: Season) {
  const base = `
    <defs><linearGradient id="gsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.sky[0]}"/><stop offset="1" stop-color="${S.sky[1]}"/></linearGradient></defs>
    <rect width="320" height="200" fill="url(#gsky)"/>
    <circle cx="262" cy="42" r="18" fill="#fff6c8" opacity="0.9"/>
    <path d="M0 118 Q60 88 120 108 T240 100 T320 106 V200 H0Z" fill="${S.grass2}"/>
    <path d="M0 130 Q80 116 160 126 T320 124 V200 H0Z" fill="${S.grass}"/>
    ${S.snow ? '<g fill="#fff" opacity="0.9"><circle cx="30" cy="60" r="1.6"/><circle cx="90" cy="30" r="1.4"/><circle cx="150" cy="54" r="1.8"/><circle cx="200" cy="22" r="1.3"/><circle cx="300" cy="70" r="1.5"/></g>' : '<g fill="#fff" opacity="0.85"><ellipse cx="70" cy="40" rx="20" ry="6"/><ellipse cx="86" cy="36" rx="12" ry="6"/><ellipse cx="190" cy="56" rx="16" ry="5"/></g>'}`;
  const layers: Record<string, string> = {
    path: `<path d="M138 200 C150 170 172 160 160 140 S150 128 168 124 L180 124 C170 130 176 140 182 150 S172 182 190 200Z" fill="${S.ground}"/>
      <g fill="#fff" opacity="0.55"><ellipse cx="160" cy="186" rx="9" ry="4"/><ellipse cx="172" cy="168" rx="7" ry="3"/><ellipse cx="166" cy="150" rx="6" ry="2.6"/><ellipse cx="172" cy="134" rx="5" ry="2"/></g>`,
    flowers: `<ellipse cx="62" cy="176" rx="46" ry="12" fill="${S.grass2}"/><ellipse cx="266" cy="178" rx="44" ry="11" fill="${S.grass2}"/>
      <g>${[24, 40, 56, 72, 88, 236, 252, 268, 284, 300].map((x, i) => `<line x1="${x}" y1="176" x2="${x}" y2="${166 - (i % 3) * 3}" stroke="${S.grass2}" stroke-width="2"/><circle cx="${x}" cy="${165 - (i % 3) * 3}" r="4.2" fill="${[S.accent, '#fff', '#ffd34d', S.leaf2][i % 4]}"/><circle cx="${x}" cy="${165 - (i % 3) * 3}" r="1.4" fill="#f2b632"/>`).join('')}</g>`,
    tree: `<rect x="52" y="78" width="14" height="62" rx="4" fill="${WOOD2}"/><path d="M59 110 l-16 -14 M60 100 l14 -12" stroke="${WOOD2}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="58" cy="66" r="34" fill="${S.leaf}"/><circle cx="34" cy="80" r="20" fill="${S.leaf}"/><circle cx="84" cy="80" r="20" fill="${S.leaf}"/><circle cx="62" cy="52" r="20" fill="${S.leaf}" opacity="0.8"/>
      <g fill="${S.leaf2}">${[[40, 62], [70, 50], [80, 76], [52, 84], [30, 84], [64, 70]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6"/>`).join('')}</g>
      ${S.snow ? '<path d="M28 52 Q58 22 90 50 Q60 40 28 52Z" fill="#fff"/>' : ''}`,
    bench: `<g><rect x="114" y="120" width="54" height="6" rx="2" fill="${WOOD}"/><rect x="114" y="110" width="54" height="5" rx="2" fill="${WOOD}"/><rect x="114" y="102" width="54" height="5" rx="2" fill="${WOOD}"/>
      <rect x="118" y="126" width="4" height="14" fill="${DARK}"/><rect x="160" y="126" width="4" height="14" fill="${DARK}"/><rect x="117" y="100" width="3" height="26" fill="${DARK}"/><rect x="162" y="100" width="3" height="26" fill="${DARK}"/>
      <rect x="128" y="114" width="16" height="6" rx="1" fill="#4f8fe0"/><rect x="130" y="110" width="12" height="4" rx="1" fill="#f2b632"/>${S.snow ? snowCap(114, 99, 54) : ''}</g>`,
    lamp: `<rect x="228" y="62" width="5" height="78" fill="${DARK}"/><rect x="223" y="136" width="15" height="6" rx="2" fill="${DARK}"/>
      <circle cx="230.5" cy="56" r="20" fill="#ffe7a0" opacity="0.35"/><path d="M222 60 h17 l-3 -14 h-11z" fill="${DARK}"/><rect x="225" y="48" width="11" height="10" rx="2" fill="#ffd970"/>`,
    box: `<rect x="272" y="104" width="4" height="40" fill="${WOOD2}"/><rect x="258" y="80" width="32" height="28" rx="3" fill="${S.accent}"/>
      <path d="M254 82 L274 66 L294 82Z" fill="${WOOD2}"/><rect x="262" y="85" width="24" height="19" rx="2" fill="#dff3ff"/>${books(263, 87, 22, 15, 3)}<rect x="262" y="85" width="24" height="19" rx="2" fill="#fff" opacity="0.18"/>${S.snow ? '<path d="M254 82 L274 66 L294 82 L290 82 L274 70 L258 82Z" fill="#fff"/>' : ''}`,
  };
  return { viewBox: '0 0 320 200', base, layers, spots: { path: [164, 178], flowers: [62, 170], tree: [58, 64], bench: [141, 112], lamp: [230, 90], box: [274, 92] } as Record<string, [number, number]> };
}

function hall(S: Season) {
  const base = `
    <defs><linearGradient id="hsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.sky[0]}"/><stop offset="1" stop-color="${S.sky[1]}"/></linearGradient></defs>
    <rect width="320" height="200" fill="${S.wall}"/>
    <rect y="0" width="320" height="14" fill="#000" opacity="0.05"/>
    <rect y="150" width="320" height="50" fill="#c99a6b"/><g stroke="#b3845a" stroke-width="1.2">${[170, 190].map((y) => `<line x1="0" y1="${y}" x2="320" y2="${y}"/>`).join('')}${[40, 110, 180, 250].map((x) => `<line x1="${x}" y1="150" x2="${x - 14}" y2="200"/>`).join('')}</g>
    <rect y="146" width="320" height="6" fill="#e9dcc6"/>
    <path d="M128 140 V62 a32 32 0 0 1 64 0 V140Z" fill="url(#hsky)"/>
    <path d="M128 140 Q160 112 192 128 V140Z" fill="${S.grass2}"/>${S.snow ? '<g fill="#fff"><circle cx="146" cy="76" r="1.6"/><circle cx="172" cy="96" r="1.4"/><circle cx="158" cy="60" r="1.2"/></g>' : ''}`;
  const layers: Record<string, string> = {
    shelves: `<rect x="10" y="30" width="86" height="120" rx="3" fill="${WOOD2}"/><rect x="16" y="36" width="74" height="108" fill="#5c361b"/>
      ${[0, 1, 2, 3].map((r) => `${books(18, 38 + r * 27, 70, 22, r * 3)}<rect x="16" y="${60 + r * 27}" width="74" height="4" fill="${WOOD}"/>`).join('')}
      <rect x="224" y="30" width="86" height="120" rx="3" fill="${WOOD2}"/><rect x="230" y="36" width="74" height="108" fill="#5c361b"/>
      ${[0, 1, 2, 3].map((r) => `${books(232, 38 + r * 27, 70, 22, r * 3 + 1)}<rect x="230" y="${60 + r * 27}" width="74" height="4" fill="${WOOD}"/>`).join('')}`,
    rug: `<ellipse cx="160" cy="176" rx="96" ry="16" fill="${S.accent}"/><ellipse cx="160" cy="176" rx="82" ry="11" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="6 5" opacity="0.7"/><ellipse cx="160" cy="176" rx="40" ry="5" fill="#fff" opacity="0.25"/>`,
    window: `<path d="M124 142 V62 a36 36 0 0 1 72 0 V142" fill="none" stroke="${WOOD}" stroke-width="7"/><line x1="160" y1="28" x2="160" y2="140" stroke="${WOOD}" stroke-width="4"/><line x1="128" y1="90" x2="192" y2="90" stroke="${WOOD}" stroke-width="4"/>
      <rect x="120" y="140" width="80" height="6" rx="2" fill="${WOOD}"/><path d="M112 30 Q122 90 114 146 L104 146 Q110 90 100 30Z" fill="${S.accent}"/><path d="M208 30 Q198 90 206 146 L216 146 Q210 90 220 30Z" fill="${S.accent}"/>
      <path d="M150 140 h20 l-3 -10 h-14z" fill="${S.leaf}"/><circle cx="160" cy="124" r="8" fill="${S.leaf}"/>`,
    desk: `<rect x="188" y="124" width="70" height="7" rx="2" fill="${WOOD}"/><rect x="192" y="131" width="6" height="30" fill="${WOOD2}"/><rect x="248" y="131" width="6" height="30" fill="${WOOD2}"/>
      <path d="M205 124 l14 -3 l14 3 l-14 2z" fill="#fff"/><path d="M219 121 v5" stroke="#ccc"/><rect x="238" y="104" width="3" height="20" fill="#3f6e4f"/><path d="M230 104 h19 l-4 -10 h-11z" fill="#3f9e6a"/><circle cx="239.5" cy="110" r="10" fill="#ffe7a0" opacity="0.35"/>`,
    chair: `<rect x="60" y="118" width="48" height="34" rx="10" fill="#4f8fe0"/><rect x="54" y="108" width="14" height="40" rx="7" fill="#3f78c4"/><rect x="100" y="108" width="14" height="40" rx="7" fill="#3f78c4"/>
      <rect x="64" y="96" width="40" height="30" rx="10" fill="#4f8fe0"/><rect x="66" y="128" width="36" height="10" rx="5" fill="#6aa2ea"/><rect x="60" y="150" width="4" height="8" fill="${WOOD2}"/><rect x="104" y="150" width="4" height="8" fill="${WOOD2}"/>`,
    chandelier: `<line x1="160" y1="0" x2="160" y2="16" stroke="${DARK}" stroke-width="2"/><path d="M134 22 Q160 34 186 22" fill="none" stroke="#d9a63c" stroke-width="4"/><circle cx="160" cy="18" r="5" fill="#d9a63c"/>
      ${[134, 147, 160, 173, 186].map((x, i) => `<rect x="${x - 2}" y="${(i === 0 || i === 4 ? 14 : i === 2 ? 22 : 19)}" width="4" height="8" fill="#fff"/><circle cx="${x}" cy="${(i === 0 || i === 4 ? 12 : i === 2 ? 20 : 17)}" r="2.6" fill="#ffd970"/>`).join('')}
      <ellipse cx="160" cy="22" rx="40" ry="14" fill="#ffe7a0" opacity="0.25"/>`,
  };
  return { viewBox: '0 0 320 200', base, layers, spots: { shelves: [52, 26], rug: [160, 176], window: [160, 56], desk: [222, 120], chair: [84, 112], chandelier: [160, 24] } as Record<string, [number, number]> };
}

function terrace(S: Season) {
  const top = S.id === 'winter' ? '#1e2b4d' : S.id === 'autumn' ? '#3a2550' : S.id === 'spring' ? '#28305e' : '#1b2c5a';
  const base = `
    <defs><linearGradient id="tsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="0.7" stop-color="#6a4a7e"/><stop offset="1" stop-color="#f0a07a"/></linearGradient></defs>
    <rect width="320" height="200" fill="url(#tsky)"/>
    <g fill="#fff">${[[20, 20], [60, 44], [110, 16], [150, 36], [205, 12], [250, 30], [290, 18], [80, 70], [230, 60]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${1 + (i % 3) * 0.5}" opacity="0.8"/>`).join('')}</g>
    <circle cx="276" cy="52" r="12" fill="#fff4cf"/><circle cx="281" cy="48" r="10" fill="${top}" opacity="0.9"/>
    <path d="M0 140 V112 h18 v-14 h16 v20 h14 v-32 h20 v28 h16 v-10 h22 v24 h12 v-40 h18 v40 h16 v-18 h20 v10 h18 v-26 h16 v22 h20 v-8 h18 v20 h14 v-30 h24 v44Z" fill="#2a2140"/>
    <g fill="#ffd970" opacity="0.7">${[[24, 106], [74, 92], [150, 84], [154, 96], [226, 100], [300, 104]].map(([x, y]) => `<rect x="${x}" y="${y}" width="3" height="4"/>`).join('')}</g>
    <rect y="140" width="320" height="60" fill="#8f7563"/><rect y="132" width="320" height="10" fill="#b0927c"/>${S.snow ? '<rect y="130" width="320" height="4" rx="2" fill="#fff"/>' : ''}`;
  const layers: Record<string, string> = {
    deck: `<rect y="150" width="320" height="50" fill="${WOOD}"/>${[0, 1, 2, 3, 4].map((i) => `<rect y="${152 + i * 10}" width="320" height="2" fill="${WOOD2}" opacity="0.6"/>`).join('')}${[60, 150, 240].map((x) => `<rect x="${x}" y="150" width="2" height="50" fill="${WOOD2}" opacity="0.4"/>`).join('')}`,
    plants: `<path d="M14 160 h26 l-4 24 h-18z" fill="#d0704a"/><circle cx="27" cy="146" r="16" fill="${S.leaf}"/><circle cx="18" cy="140" r="8" fill="${S.leaf2}" opacity="0.8"/>
      <path d="M282 160 h28 l-4 24 h-20z" fill="#d0704a"/><path d="M296 160 q-14 -30 -4 -46 M296 160 q6 -34 14 -40 M296 160 q-2 -26 -18 -30" stroke="${S.leaf}" stroke-width="7" fill="none" stroke-linecap="round"/>${S.snow ? '<ellipse cx="27" cy="132" rx="12" ry="4" fill="#fff"/>' : ''}`,
    lights: `<path d="M0 30 Q80 70 160 34 T320 36" fill="none" stroke="#1a1426" stroke-width="1.6"/>
      ${[20, 50, 80, 110, 140, 180, 210, 240, 270, 300].map((x, i) => { const y = x < 160 ? 30 + Math.sin((x / 160) * Math.PI) * 22 : 34 + Math.sin(((x - 160) / 160) * Math.PI) * -6 + 2; return `<circle cx="${x}" cy="${y + 4}" r="8" fill="${['#ffd970', '#ff8fb8', '#7fd6ff', '#9be08a'][i % 4]}" opacity="0.25"/><circle cx="${x}" cy="${y + 4}" r="3.4" fill="${['#ffd970', '#ff8fb8', '#7fd6ff', '#9be08a'][i % 4]}"/>`; }).join('')}`,
    beanbag: `<ellipse cx="96" cy="172" rx="34" ry="14" fill="${S.accent}"/><ellipse cx="88" cy="160" rx="22" ry="14" fill="${S.accent}"/><ellipse cx="86" cy="156" rx="12" ry="5" fill="#fff" opacity="0.25"/>
      <rect x="132" y="166" width="22" height="5" rx="1" fill="#4f8fe0"/><rect x="134" y="161" width="18" height="5" rx="1" fill="#f2b632"/><rect x="131" y="156" width="20" height="5" rx="1" fill="#5cbf8a"/><path d="M139 156 l6 -6 l6 6" fill="#fff"/>`,
    telescope: `<path d="M226 186 L238 146 L250 186 M238 146 V186" stroke="${DARK}" stroke-width="3" fill="none"/><rect x="214" y="118" width="54" height="13" rx="6" fill="#d9a63c" transform="rotate(-28 238 140)"/><rect x="262" y="104" width="10" height="17" rx="3" fill="${DARK}" transform="rotate(-28 238 140)"/><circle cx="238" cy="142" r="4" fill="${DARK}"/>`,
    tent: `<path d="M150 186 L184 108 L218 186Z" fill="#f6ead7"/><path d="M184 108 L218 186 L200 186Z" fill="#e2d0b4"/><path d="M174 186 L184 140 L194 186Z" fill="#6a4a7e"/><circle cx="184" cy="170" r="10" fill="#ffd970" opacity="0.5"/>
      <path d="M150 186 L184 108 L218 186" fill="none" stroke="${WOOD2}" stroke-width="3"/><path d="M184 108 l-4 -10 M184 108 l4 -10" stroke="${WOOD2}" stroke-width="3"/><path d="M188 100 l14 4 l-14 4z" fill="${S.accent}"/>`,
  };
  return { viewBox: '0 0 320 200', base, layers, spots: { deck: [40, 176], plants: [296, 146], lights: [110, 46], beanbag: [96, 160], telescope: [240, 130], tent: [184, 150] } as Record<string, [number, number]> };
}

function lake(S: Season) {
  const base = `
    <defs><linearGradient id="lsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.sky[0]}"/><stop offset="1" stop-color="${S.sky[1]}"/></linearGradient>
    <linearGradient id="lwat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.water}"/><stop offset="1" stop-color="${S.water}" stop-opacity="0.7"/></linearGradient></defs>
    <rect width="320" height="200" fill="url(#lsky)"/>
    <path d="M0 104 L50 58 L84 86 L130 40 L178 92 L220 62 L270 98 L320 70 V112 H0Z" fill="${S.grass2}" opacity="0.75"/>
    <path d="M114 52 L130 40 L146 56 L138 54 L130 60 L122 54Z" fill="#fff" opacity="0.9"/><path d="M40 67 L50 58 L60 67Z" fill="#fff" opacity="0.8"/>
    <rect y="104" width="320" height="56" fill="url(#lwat)"/><g fill="#fff" opacity="0.4"><rect x="40" y="120" width="40" height="2" rx="1"/><rect x="190" y="132" width="56" height="2" rx="1"/><rect x="120" y="146" width="30" height="2" rx="1"/></g>
    <path d="M0 160 Q90 148 170 158 T320 154 V200 H0Z" fill="${S.grass}"/>`;
  const layers: Record<string, string> = {
    pier: `<path d="M150 170 L170 112 L196 112 L188 170Z" fill="${WOOD}"/>${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="${152 + i * 2}" y1="${166 - i * 10}" x2="${187 - i * 0.5}" y2="${166 - i * 10}" stroke="${WOOD2}" stroke-width="1.4"/>`).join('')}
      <rect x="168" y="110" width="4" height="22" fill="${WOOD2}"/><rect x="192" y="110" width="4" height="22" fill="${WOOD2}"/>`,
    reeds: `<g stroke="${S.grass2}" stroke-width="2.4" stroke-linecap="round" fill="none">${[12, 20, 28, 296, 304, 312].map((x, i) => `<path d="M${x} 164 q${i % 2 ? 3 : -3} -18 ${i % 2 ? -2 : 2} -${30 + (i % 3) * 6}"/>`).join('')}</g>
      <g fill="#7d4a26">${[[14, 132], [28, 128], [302, 130]].map(([x, y]) => `<rect x="${x - 2}" y="${y}" width="4" height="10" rx="2"/>`).join('')}</g>
      <g>${[[70, 140], [96, 150], [240, 146]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="9" ry="3.5" fill="${S.grass2}"/><circle cx="${x + 2}" cy="${y - 2}" r="2.6" fill="${S.accent}"/>`).join('')}</g>`,
    cabin: `<rect x="26" y="128" width="64" height="40" fill="${WOOD}"/>${[0, 1, 2, 3].map((i) => `<rect x="26" y="${132 + i * 9}" width="64" height="2" fill="${WOOD2}" opacity="0.6"/>`).join('')}
      <path d="M18 132 L58 100 L98 132Z" fill="${S.id === 'autumn' ? '#b5482a' : '#c25b3a'}"/><rect x="72" y="104" width="8" height="16" fill="${DARK}"/><rect x="34" y="138" width="16" height="14" rx="2" fill="#ffd970"/><rect x="58" y="142" width="14" height="26" rx="2" fill="${WOOD2}"/>
      ${S.snow ? '<path d="M18 132 L58 100 L98 132 L92 132 L58 106 L24 132Z" fill="#fff"/>' : ''}`,
    boat: `<path d="M226 126 h52 l-8 12 h-36z" fill="#d9603b"/><path d="M226 126 h52" stroke="#fff" stroke-width="2"/><path d="M240 124 l26 -10" stroke="${WOOD2}" stroke-width="2.4"/><rect x="246" y="118" width="12" height="7" rx="1" fill="#4f8fe0"/>`,
    fire: `<ellipse cx="124" cy="182" rx="22" ry="5" fill="#000" opacity="0.15"/><path d="M110 184 l28 -8 M110 176 l28 8" stroke="${WOOD2}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="124" cy="170" r="20" fill="#ffb347" opacity="0.25"/><path d="M124 152 c8 8 10 14 6 22 c-3 6 -9 6 -12 0 c-3 -6 0 -12 6 -22z" fill="#ff8a3d"/><path d="M124 162 c4 4 5 8 3 12 c-2 3 -5 3 -6 0 c-1 -4 0 -7 3 -12z" fill="#ffd970"/>`,
    swing: `<rect x="262" y="96" width="12" height="70" rx="4" fill="${WOOD2}"/><path d="M268 110 Q240 96 220 100" stroke="${WOOD2}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <circle cx="270" cy="80" r="28" fill="${S.leaf}"/><circle cx="246" cy="92" r="18" fill="${S.leaf}"/><circle cx="292" cy="94" r="16" fill="${S.leaf}"/><g fill="${S.leaf2}">${[[256, 76], [282, 70], [290, 92], [246, 96]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3"/>`).join('')}</g>
      <line x1="226" y1="101" x2="226" y2="146" stroke="#ccc" stroke-width="1.4"/><line x1="240" y1="98" x2="240" y2="146" stroke="#ccc" stroke-width="1.4"/><rect x="222" y="144" width="22" height="5" rx="2" fill="${WOOD}"/>${S.snow ? '<path d="M244 62 Q270 46 296 64 Q270 58 244 62Z" fill="#fff"/>' : ''}`,
  };
  return { viewBox: '0 0 320 200', base, layers, spots: { pier: [180, 140], reeds: [22, 140], cabin: [58, 134], boat: [252, 124], fire: [124, 166], swing: [233, 128] } as Record<string, [number, number]> };
}

const ART = { garden, hall, terrace, lake };

/** Layered art of area `k` (unique gradient ids so several scenes can share a page). */
export function areaArt(k: number) {
  const a = ART[placeOf(k)](seasonOf(k));
  const id = (s: string) => s.replace(/\b(gsky|hsky|tsky|lsky|lwat)\b/g, `$1${k}`);
  return { ...a, base: id(a.base), layers: Object.fromEntries(Object.entries(a.layers).map(([t, s]) => [t, id(s)])) };
}
