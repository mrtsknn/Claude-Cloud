/**
 * Chapters: every 10 levels form a chapter with its own place and time of day. The scenery is
 * drawn in code (one SVG string: sky gradient, sun or moon, stars, landscape silhouettes), so
 * it costs no assets. Pure and deterministic — the same chapter always looks the same.
 */
export const CHAPTER_SIZE = 10;

/** 0-based chapter of a 1-based level. */
export const chapterOf = (level: number) => Math.floor((Math.max(1, level) - 1) / CHAPTER_SIZE);
/** First and last level of a chapter. */
export const chapterRange = (c: number): [number, number] => [c * CHAPTER_SIZE + 1, (c + 1) * CHAPTER_SIZE];
/** 1..10: position of a level inside its chapter. */
export const stepInChapter = (level: number) => ((Math.max(1, level) - 1) % CHAPTER_SIZE) + 1;
export const isChapterEnd = (level: number) => level % CHAPTER_SIZE === 0;
export const chapterCount = (levels: number) => Math.ceil(levels / CHAPTER_SIZE);

export type Place = 'coast' | 'peaks' | 'city' | 'dunes' | 'forest' | 'aurora' | 'hills' | 'islands' | 'glacier' | 'canyon' | 'lake' | 'valley';
export type Time = 'dawn' | 'dusk' | 'night' | 'mist';

export const PLACES: Place[] = ['coast', 'peaks', 'city', 'dunes', 'forest', 'aurora', 'hills', 'islands', 'glacier', 'canyon', 'lake', 'valley'];
export const TIMES: Time[] = ['dusk', 'night', 'dawn', 'mist'];

const PLACE_NAMES: Record<'en' | 'tr', Record<Place, string>> = {
  en: { coast: 'Coast', peaks: 'Peaks', city: 'City', dunes: 'Dunes', forest: 'Forest', aurora: 'Aurora', hills: 'Hills', islands: 'Islands', glacier: 'Glacier', canyon: 'Canyon', lake: 'Lake', valley: 'Valley' },
  tr: { coast: 'Kıyı', peaks: 'Zirveler', city: 'Şehir', dunes: 'Kumullar', forest: 'Orman', aurora: 'Kutup ışığı', hills: 'Tepeler', islands: 'Adalar', glacier: 'Buzul', canyon: 'Kanyon', lake: 'Göl', valley: 'Vadi' },
};
const TIME_NAMES: Record<'en' | 'tr', Record<Time, string>> = {
  en: { dawn: 'Dawn', dusk: 'Dusk', night: 'Night', mist: 'Mist' },
  tr: { dawn: 'Şafak', dusk: 'Akşam', night: 'Gece', mist: 'Sis' },
};

export interface Chapter {
  index: number;
  place: Place;
  time: Time;
}

/** Places walk the 12 landscapes; each lap uses the next time of day (48 distinct looks). */
export function chapter(index: number): Chapter {
  return { index, place: PLACES[index % PLACES.length], time: TIMES[Math.floor(index / PLACES.length) % TIMES.length] };
}

export function chapterName(index: number, lang: 'en' | 'tr'): string {
  const c = chapter(index);
  const lap = Math.floor(index / (PLACES.length * TIMES.length));
  return `${PLACE_NAMES[lang][c.place]} · ${TIME_NAMES[lang][c.time]}${lap ? ` ${'I'.repeat(Math.min(lap + 1, 3))}` : ''}`;
}

/** Coins for finishing a chapter the first time. */
export const chapterReward = (index: number) => Math.min(200, 100 + index * 5);

interface Palette {
  sky: [string, string, string]; // top, middle, horizon
  sun: string;
  layers: [string, string, string]; // far, middle, near
  glow: string;
  stars: boolean;
}

export const PALETTES: Record<Time, Palette> = {
  dusk: { sky: ['#1d2556', '#6a3a6e', '#d7744f'], sun: '#ffc46b', layers: ['#61315a', '#3b2043', '#1b1024'], glow: '#ffb35c', stars: false },
  night: { sky: ['#081029', '#16244f', '#2c4777'], sun: '#f3efcf', layers: ['#1d3257', '#12213f', '#081226'], glow: '#9fc6ff', stars: true },
  dawn: { sky: ['#2b2a5e', '#8a4f7f', '#f0a07a'], sun: '#ffe2a8', layers: ['#7b4b72', '#4a2d52', '#22152e'], glow: '#ffd0a0', stars: false },
  mist: { sky: ['#0f3340', '#2a6468', '#78ad9f'], sun: '#eaf6d2', layers: ['#2c5d5c', '#1b4043', '#0c2629'], glow: '#c8f0d8', stars: false },
};

/** CSS gradient of a chapter's sky (map headers, chapter cards). */
export function skyGradient(index: number, angle = '180deg'): string {
  const p = PALETTES[chapter(index).time];
  return `linear-gradient(${angle}, ${p.sky[0]}, ${p.sky[1]} 60%, ${p.sky[2]})`;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 400;
const H = 800;
const f = (n: number) => Math.round(n * 10) / 10;

/** Jagged ridge from x=0 to x=W around `base`, closed down to the bottom. */
function ridge(r: () => number, base: number, amp: number, step: number, sharp = true): string {
  const pts: string[] = [];
  for (let x = -20; x <= W + 20; x += step * (0.6 + r() * 0.8)) pts.push(`${f(x)},${f(base - r() * amp)}`);
  pts.push(`${W + 20},${f(base - r() * amp)}`);
  if (sharp) return `M-20,${H} L${pts.join(' L')} L${W + 20},${H} Z`;
  // smooth: quadratic curves through midpoints
  const xy = pts.map((p) => p.split(',').map(Number));
  let d = `M-20,${H} L${xy[0][0]},${xy[0][1]}`;
  for (let i = 1; i < xy.length - 1; i++) {
    const mx = (xy[i][0] + xy[i + 1][0]) / 2;
    const my = (xy[i][1] + xy[i + 1][1]) / 2;
    d += ` Q${xy[i][0]},${xy[i][1]} ${f(mx)},${f(my)}`;
  }
  return `${d} L${W + 20},${xy[xy.length - 1][1]} L${W + 20},${H} Z`;
}

const path = (d: string, fill: string, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;

function water(p: Palette, top: number, r: () => number, sunX: number): string {
  let s = `<rect x="0" y="${top}" width="${W}" height="${H - top}" fill="url(#wl-water)"/>`;
  for (let i = 0; i < 9; i++) {
    const y = top + 8 + i * i * 3.2;
    const w = 70 - i * 5 + r() * 20;
    s += `<rect x="${f(sunX - w / 2 + (r() - 0.5) * 20)}" y="${f(y)}" width="${f(w)}" height="2.4" rx="1.2" fill="${p.glow}" opacity="${f(0.5 - i * 0.04)}"/>`;
  }
  return s;
}

function pines(r: () => number, base: number, n: number, h: number, fill: string): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const x = (i / n) * (W + 40) - 20 + r() * 14;
    const th = h * (0.6 + r() * 0.6);
    const y = base - r() * 12;
    d += `M${f(x)},${f(y - th)} L${f(x + th * 0.28)},${f(y)} L${f(x - th * 0.28)},${f(y)} Z `;
  }
  return path(d, fill);
}

function skyline(r: () => number, base: number, maxH: number, fill: string, windows: string | null): string {
  let d = '';
  let lights = '';
  for (let x = -10; x < W + 10; ) {
    const w = 18 + r() * 30;
    const h = maxH * (0.35 + r() * 0.65);
    d += `M${f(x)},${base} V${f(base - h)} H${f(x + w)} V${base} Z `;
    if (windows)
      for (let wy = base - h + 8; wy < base - 10; wy += 11)
        for (let wx = x + 4; wx < x + w - 6; wx += 8) if (r() < 0.16) lights += `<rect x="${f(wx)}" y="${f(wy)}" width="3.5" height="5" fill="${windows}" opacity="0.75"/>`;
    x += w + r() * 4;
  }
  return path(d + `M-10,${base} H${W + 10} V${H} H-10 Z`, fill) + lights;
}

/**
 * Full-screen scenery for a chapter (viewBox 400×800, anchored to the bottom with
 * `preserveAspectRatio="xMidYMax slice"`): the landscape sits low, behind the letter wheel.
 */
export function sceneSvg(index: number, crop?: 'card'): string {
  const c = chapter(index);
  const p = PALETTES[c.time];
  const r = rng(1000 + index * 7919);
  const sunX = 70 + r() * 260;
  const sunY = 470 + r() * 60;
  const [far, mid, near] = p.layers;
  const parts: string[] = [];

  if (p.stars) {
    let stars = '';
    for (let i = 0; i < 70; i++) stars += `<circle cx="${f(r() * W)}" cy="${f(r() * 520)}" r="${f(0.6 + r() * 1.3)}" opacity="${f(0.35 + r() * 0.6)}"/>`;
    parts.push(`<g fill="#fff">${stars}</g>`);
  }
  if (c.place === 'aurora') {
    for (let i = 0; i < 3; i++) {
      const y = 170 + i * 70 + r() * 30;
      parts.push(
        `<path d="M-20,${f(y)} C90,${f(y - 80 - r() * 60)} 190,${f(y + 60)} 280,${f(y - 30)} S420,${f(y - 70)} 430,${f(y - 20)}" fill="none" stroke="url(#wl-aurora)" stroke-width="${f(26 + r() * 22)}" stroke-linecap="round" opacity="${f(0.45 - i * 0.1)}"/>`,
      );
    }
  }
  // sun or moon with a soft halo
  parts.push(`<circle cx="${f(sunX)}" cy="${f(sunY)}" r="90" fill="url(#wl-halo)"/>`);
  parts.push(`<circle cx="${f(sunX)}" cy="${f(sunY)}" r="${p.stars ? 20 : 30}" fill="${p.sun}" opacity="0.95"/>`);
  if (p.stars) parts.push(`<circle cx="${f(sunX + 8)}" cy="${f(sunY - 5)}" r="17" fill="${p.sky[1]}" opacity="0.9"/>`);

  switch (c.place) {
    case 'coast':
      parts.push(path(ridge(r, 585, 60, 34, false), far));
      parts.push(water(p, 590, r, sunX));
      parts.push(path(`M-20,${H} L-20,650 Q60,640 120,690 T260,740 L${W + 20},760 L${W + 20},${H} Z`, near));
      parts.push(`<rect x="62" y="590" width="12" height="56" fill="${near}"/><path d="M58,592 h20 l-4,-14 h-12 z" fill="${near}"/><circle cx="68" cy="584" r="4" fill="${p.glow}"/>`);
      break;
    case 'peaks':
      parts.push(path(ridge(r, 600, 170, 46), far));
      parts.push(path(ridge(r, 660, 120, 38), mid));
      parts.push(path(ridge(r, 720, 60, 30), near));
      break;
    case 'city':
      parts.push(skyline(r, 640, 170, far, null));
      parts.push(skyline(r, 700, 130, mid, p.glow));
      parts.push(path(ridge(r, 745, 10, 60, false), near));
      break;
    case 'dunes':
      parts.push(path(ridge(r, 610, 50, 90, false), far));
      parts.push(path(ridge(r, 670, 60, 110, false), mid));
      parts.push(path(ridge(r, 730, 50, 130, false), near));
      break;
    case 'forest':
      parts.push(path(ridge(r, 620, 40, 70, false), far));
      parts.push(pines(r, 640, 22, 70, far));
      parts.push(pines(r, 690, 16, 110, mid));
      parts.push(path(ridge(r, 720, 14, 60, false), near));
      parts.push(pines(r, 740, 9, 150, near));
      break;
    case 'aurora':
      parts.push(path(ridge(r, 620, 150, 52), far));
      parts.push(path(ridge(r, 690, 70, 40), mid));
      parts.push(path(ridge(r, 740, 20, 70, false), near));
      break;
    case 'hills':
      parts.push(path(ridge(r, 620, 60, 120, false), far));
      parts.push(path(ridge(r, 680, 70, 140, false), mid));
      for (let i = 0; i < 5; i++) {
        const x = 30 + r() * 340;
        const y = 668 - r() * 30;
        parts.push(`<rect x="${f(x - 2)}" y="${f(y)}" width="4" height="22" fill="${mid}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(10 + r() * 8)}" fill="${mid}"/>`);
      }
      parts.push(path(ridge(r, 740, 40, 160, false), near));
      break;
    case 'islands':
      parts.push(water(p, 600, r, sunX));
      for (let i = 0; i < 4; i++) {
        const x = -30 + i * 110 + r() * 50;
        const w = 90 + r() * 90;
        const h = 30 + r() * 45;
        const y = 612 + (i % 2) * 22;
        parts.push(path(`M${f(x)},${f(y)} Q${f(x + w / 2)},${f(y - h * 2)} ${f(x + w)},${f(y)} Z`, i < 2 ? far : mid));
      }
      parts.push(path(`M-20,${H} L-20,700 Q100,690 160,740 T${W + 20},750 L${W + 20},${H} Z`, near));
      break;
    case 'glacier':
      parts.push(path(ridge(r, 600, 180, 40), far));
      parts.push(path(ridge(r, 600, 180, 40), '#ffffff', ' opacity="0.08"'));
      parts.push(path(ridge(r, 680, 90, 34), mid));
      parts.push(path(ridge(r, 740, 26, 50, false), near));
      break;
    case 'canyon': {
      const mesa = (base: number, fill: string) => {
        let d = `M-20,${H} L-20,${base}`;
        for (let x = -20; x < W + 20; ) {
          const w = 50 + r() * 90;
          const h = r() < 0.55 ? 40 + r() * 90 : 0;
          d += ` L${f(x + 8)},${f(base - h)} L${f(x + w - 8)},${f(base - h)} L${f(x + w)},${base}`;
          x += w;
        }
        return path(`${d} L${W + 40},${H} Z`, fill);
      };
      parts.push(mesa(630, far));
      parts.push(mesa(700, mid));
      parts.push(path(ridge(r, 750, 16, 70, false), near));
      break;
    }
    case 'lake': {
      const hills = ridge(r, 600, 130, 44);
      parts.push(path(hills, far));
      parts.push(`<rect x="0" y="600" width="${W}" height="${H - 600}" fill="url(#wl-water)"/>`);
      parts.push(`<g transform="translate(0 1200) scale(1 -1)" opacity="0.35">${path(hills, far)}</g>`);
      parts.push(water(p, 600, r, sunX).replace(/<rect x="0"[^>]*>/, ''));
      parts.push(pines(r, 760, 12, 120, near));
      parts.push(path(`M-20,${H} L-20,750 Q200,735 ${W + 20},758 L${W + 20},${H} Z`, near));
      break;
    }
    case 'valley':
      parts.push(path(ridge(r, 610, 130, 48), far));
      parts.push(path(`M-20,${H} L-20,600 Q120,640 170,720 L230,720 Q290,640 ${W + 20},590 L${W + 20},${H} Z`, mid));
      parts.push(path(`M180,720 Q200,700 196,660 Q192,630 205,610 L210,610 Q200,640 206,670 Q212,705 222,720 Z`, p.glow, ' opacity="0.35"'));
      parts.push(path(ridge(r, 750, 24, 60, false), near));
      break;
  }

  // 'card': the horizon band only (sun + landscape), for small previews
  const view = crop === 'card' ? `0 380 ${W} 420" preserveAspectRatio="xMidYMid slice` : `0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">
<defs>
<linearGradient id="wl-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="0.55" stop-color="${p.sky[1]}"/><stop offset="0.8" stop-color="${p.sky[2]}"/></linearGradient>
<linearGradient id="wl-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${near}"/></linearGradient>
<linearGradient id="wl-aurora" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5effc0" stop-opacity="0"/><stop offset="0.35" stop-color="#5effc0"/><stop offset="0.7" stop-color="#7fd6ff"/><stop offset="1" stop-color="#b98cff" stop-opacity="0"/></linearGradient>
<radialGradient id="wl-halo"><stop offset="0" stop-color="${p.glow}" stop-opacity="0.55"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#wl-sky)"/>
${parts.join('\n')}
<rect y="${H - 90}" width="${W}" height="90" fill="${near}"/>
</svg>`.replace(/wl-(sky|water|aurora|halo)/g, `wl-$1-${index}`); // unique ids: several scenes can share the page
}
