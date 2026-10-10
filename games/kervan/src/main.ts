import './style.css';
import {
  createMeta,
  createProfile,
  createStore,
  haptic,
  initAds,
  initStore,
  maybeRequestReview,
  pentatonic,
  setHapticsEnabled,
  setSoundEnabled,
  setupNative,
  showRewarded,
  tone,
  track,
  trackSession,
  unlockAudio,
} from '@studio/kit';
import * as G from './game';
import { fmt, fmtDuration } from './format';
import { lang, t, type Key } from './i18n';
import { SKINS, swatchOf, type MapTheme } from './skins';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/kervan/PRIVACY.md';
declare const __APP_VERSION__: string;

type Good = 'dates' | 'tea' | 'spice' | 'ceramics' | 'carpets' | 'silk';
const CITY_INFO: { name: Key; good: Good; color: string; tint: string }[] = [
  { name: 'c0', good: 'dates', color: '#9a5b2e', tint: '#f3e0c8' },
  { name: 'c1', good: 'tea', color: '#4f8a3c', tint: '#e2efd6' },
  { name: 'c2', good: 'spice', color: '#d9822b', tint: '#f9e3c6' },
  { name: 'c3', good: 'ceramics', color: '#2f7fb5', tint: '#dcebf5' },
  { name: 'c4', good: 'carpets', color: '#b0413e', tint: '#f5dcd8' },
  { name: 'c5', good: 'silk', color: '#8e5bb5', tint: '#ece0f5' },
];
const CITY_X = [0.27, 0.73, 0.3, 0.72, 0.28, 0.7];
const CONFETTI = ['#c4583c', '#1f8a86', '#e9a92b', '#fff3d6', '#8e5bb5'];

// ───────────────────────── persistence ─────────────────────────
const store = createStore('kervan');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

let S: G.State = G.migrate(store.get<unknown>('save', null));
let tut = store.get<number>('tut', 0);
if (S.cities.length > 1 || S.prestiges > 0) tut = 3;
const save = () => {
  store.set('save', S);
  store.set('lastSeen', Date.now());
};

trackSession('kervan');

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
document.documentElement.lang = lang;
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n as Key)));

const mapCanvas = $<HTMLCanvasElement>('map');
const mctx = mapCanvas.getContext('2d')!;
const fxCanvas = $<HTMLCanvasElement>('fx');
const fctx = fxCanvas.getContext('2d')!;
const pane = $('pane-cities');

// ───────────────────────── sounds ─────────────────────────
let lastClink = 0;
function clink(volume = 0.22) {
  const now = performance.now();
  if (now - lastClink < 45) return;
  lastClink = now;
  const f = 1750 + Math.random() * 800;
  tone({ freq: f, to: f * 1.03, duration: 0.07, type: 'triangle', volume });
  tone({ freq: f * 1.5, duration: 0.11, type: 'sine', volume: volume * 0.6, delay: 0.035 });
}
function buySound(step: number) {
  tone({ freq: pentatonic(step % 10, 392), duration: 0.1, type: 'triangle', volume: 0.35 });
  tone({ freq: pentatonic((step % 10) + 2, 392), duration: 0.14, type: 'sine', volume: 0.25, delay: 0.06 });
}
function fanfare() {
  [0, 2, 4, 5, 7, 9, 10].forEach((st, i) => tone({ freq: pentatonic(st, 392), duration: 0.22, type: 'triangle', volume: 0.4, delay: i * 0.075 }));
}

// ───────────────────────── map layout ─────────────────────────
let W = 0, H = 0, dpr = 1, gap = 100, top = 60, worldH = 0, R = 30;
let camY = 0, camTarget = 0, follow = true;
let bg: HTMLCanvasElement | null = null;
let TH: MapTheme = SKINS[0];

function cityPos(i: number) {
  return { x: W * CITY_X[i], y: top + i * gap };
}

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = mapCanvas.clientWidth;
  H = mapCanvas.clientHeight;
  mapCanvas.width = Math.round(W * dpr);
  mapCanvas.height = Math.round(H * dpr);
  fxCanvas.width = Math.round(window.innerWidth * dpr);
  fxCanvas.height = Math.round(window.innerHeight * dpr);
  gap = Math.max(96, Math.min(130, H * 0.36));
  R = Math.min(32, gap * 0.29, W * 0.085);
  top = R * 1.7;
  worldH = top * 2 + 5 * gap + R;
  bg = renderBackground();
  focusCity(Math.min(S.cities.length, G.CITY_COUNT - 1), true);
}

function clampCam(y: number) {
  return worldH <= H ? -(H - worldH) / 2 : Math.max(0, Math.min(worldH - H, y));
}
function focusCity(i: number, instant = false) {
  follow = true;
  camTarget = clampCam(cityPos(i).y - H * 0.55);
  if (instant) camY = camTarget;
}

// seeded random so the desert looks the same every launch
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function drawTree(c: CanvasRenderingContext2D, x: number, y: number, s: number, lean: number) {
  if (TH.tree === 'pine') return drawPine(c, x, y, s);
  drawPalm(c, x, y, s, lean);
}
function drawPine(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.fillStyle = TH.trunk;
  c.fillRect(x - s * 0.06, y - s * 0.25, s * 0.12, s * 0.25);
  for (let k = 0; k < 3; k++) {
    const by = y - s * 0.2 - k * s * 0.26;
    const w = s * (0.42 - k * 0.09);
    c.fillStyle = TH.leaf;
    c.beginPath();
    c.moveTo(x - w, by);
    c.lineTo(x, by - s * 0.42);
    c.lineTo(x + w, by);
    c.closePath();
    c.fill();
    if (TH.snowCap) {
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.beginPath();
      c.moveTo(x - w * 0.42, by - s * 0.24);
      c.lineTo(x, by - s * 0.42);
      c.lineTo(x + w * 0.42, by - s * 0.24);
      c.quadraticCurveTo(x, by - s * 0.2, x - w * 0.42, by - s * 0.24);
      c.fill();
    }
  }
}
function drawPalm(c: CanvasRenderingContext2D, x: number, y: number, s: number, lean: number) {
  c.strokeStyle = TH.trunk;
  c.lineWidth = s * 0.13;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x + lean * s * 0.3, y - s * 0.5, x + lean * s * 0.2, y - s);
  c.stroke();
  const tx = x + lean * s * 0.2, ty = y - s;
  c.fillStyle = TH.leaf;
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k - 2.5) * 0.62;
    c.beginPath();
    c.moveTo(tx, ty);
    c.quadraticCurveTo(tx + Math.cos(a - 0.3) * s * 0.55, ty + Math.sin(a - 0.3) * s * 0.55 - s * 0.12, tx + Math.cos(a) * s * 0.7, ty + Math.sin(a) * s * 0.7 + s * 0.18);
    c.quadraticCurveTo(tx + Math.cos(a + 0.2) * s * 0.35, ty + Math.sin(a + 0.2) * s * 0.35, tx, ty);
    c.fill();
  }
}

function renderBackground() {
  const cv = document.createElement('canvas');
  const h = Math.max(worldH, H);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, TH.sky[0]);
  g.addColorStop(1, TH.sky[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, W, h);
  const rand = rng(7);
  // dune ridges: soft light crest with a warm shadow underneath
  for (let y = -20; y < h + 40; y += 46) {
    const off = rand() * W;
    const amp = 10 + rand() * 12;
    c.beginPath();
    c.moveTo(0, y + 40);
    for (let x = 0; x <= W + 10; x += 10) c.lineTo(x, y + Math.sin((x + off) / (70 + rand() * 4)) * amp);
    c.lineTo(W, y + 40);
    c.closePath();
    c.fillStyle = TH.ridge;
    c.fill();
    c.beginPath();
    for (let x = 0; x <= W + 10; x += 10) c.lineTo(x, y + Math.sin((x + off) / 72) * amp - 2);
    c.strokeStyle = TH.crest;
    c.lineWidth = 2;
    c.stroke();
  }
  // pebbles
  for (let k = 0; k < (W * h) / 2600; k++) {
    c.fillStyle = `rgba(${TH.pebble}, ${0.1 + rand() * 0.12})`;
    c.beginPath();
    c.ellipse(rand() * W, rand() * h, 1 + rand() * 2.2, 0.8 + rand() * 1.4, 0, 0, Math.PI * 2);
    c.fill();
  }
  // oases beside alternate cities, palms scattered along the edges
  for (let i = 0; i < G.CITY_COUNT; i++) {
    const p = cityPos(i);
    const side = CITY_X[i] < 0.5 ? 1 : -1;
    if (i % 2 === 0) {
      const ox = p.x + side * W * 0.3, oy = p.y + R * 0.5;
      c.fillStyle = TH.rim;
      c.beginPath();
      c.ellipse(ox, oy, R * 1.25, R * 0.55, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = TH.water;
      c.beginPath();
      c.ellipse(ox, oy, R * 1.05, R * 0.42, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.beginPath();
      c.ellipse(ox - R * 0.3, oy - R * 0.12, R * 0.4, R * 0.08, 0, 0, Math.PI * 2);
      c.fill();
      drawTree(c, ox - R * 0.9, oy - R * 0.1, R * 1.2, -0.6);
      drawTree(c, ox + R * 0.8, oy - R * 0.2, R * 1.0, 0.7);
    } else {
      drawTree(c, p.x + side * W * 0.33, p.y + R * 0.4, R * 0.95, side * 0.4);
    }
  }
  return cv;
}

// ───────────────────────── route geometry ─────────────────────────
type Pt = { x: number; y: number };
function routeOf(i: number): [Pt, Pt, Pt, Pt] {
  const a = cityPos(i);
  const b = cityPos(i < G.CITY_COUNT - 1 ? i + 1 : i - 1);
  const d = (b.y - a.y) * 0.55;
  return [a, { x: a.x, y: a.y + d }, { x: b.x, y: b.y - d }, b];
}
function bez([a, b, c, d]: [Pt, Pt, Pt, Pt], tt: number): Pt {
  const u = 1 - tt;
  return {
    x: u * u * u * a.x + 3 * u * u * tt * b.x + 3 * u * tt * tt * c.x + tt * tt * tt * d.x,
    y: u * u * u * a.y + 3 * u * u * tt * b.y + 3 * u * tt * tt * c.y + tt * tt * tt * d.y,
  };
}

// ───────────────────────── drawing primitives ─────────────────────────
function drawGood(c: CanvasRenderingContext2D, good: Good, x: number, y: number, s: number) {
  const col = CITY_INFO.find((ci) => ci.good === good)!.color;
  c.save();
  c.translate(x, y);
  c.fillStyle = col;
  c.strokeStyle = col;
  c.lineCap = 'round';
  c.beginPath();
  switch (good) {
    case 'dates':
      for (const [dx, dy] of [[-0.22, 0.12], [0.22, 0.12], [0, -0.2]]) {
        c.moveTo(dx * s + s * 0.2, dy * s);
        c.ellipse(dx * s, dy * s, s * 0.2, s * 0.28, 0.3, 0, Math.PI * 2);
      }
      c.fill();
      break;
    case 'tea':
      c.moveTo(-s * 0.4, s * 0.35);
      c.quadraticCurveTo(-s * 0.45, -s * 0.4, s * 0.4, -s * 0.4);
      c.quadraticCurveTo(s * 0.4, s * 0.35, -s * 0.4, s * 0.35);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = s * 0.07;
      c.beginPath();
      c.moveTo(-s * 0.3, s * 0.25);
      c.lineTo(s * 0.25, -s * 0.25);
      c.stroke();
      break;
    case 'spice':
      c.moveTo(-s * 0.48, s * 0.35);
      c.quadraticCurveTo(0, -s * 0.75, s * 0.48, s * 0.35);
      c.closePath();
      c.fill();
      c.fillStyle = '#b5561c';
      c.beginPath();
      c.ellipse(0, s * 0.35, s * 0.5, s * 0.1, 0, 0, Math.PI * 2);
      c.fill();
      break;
    case 'ceramics':
      c.moveTo(-s * 0.15, -s * 0.45);
      c.lineTo(s * 0.15, -s * 0.45);
      c.quadraticCurveTo(s * 0.12, -s * 0.2, s * 0.35, 0);
      c.quadraticCurveTo(s * 0.4, s * 0.4, 0, s * 0.45);
      c.quadraticCurveTo(-s * 0.4, s * 0.4, -s * 0.35, 0);
      c.quadraticCurveTo(-s * 0.12, -s * 0.2, -s * 0.15, -s * 0.45);
      c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = s * 0.06;
      c.beginPath();
      c.moveTo(-s * 0.32, s * 0.08);
      c.lineTo(s * 0.32, s * 0.08);
      c.stroke();
      break;
    case 'carpets':
      c.roundRect(-s * 0.45, -s * 0.32, s * 0.9, s * 0.64, s * 0.06);
      c.fill();
      c.strokeStyle = '#f5d28a';
      c.lineWidth = s * 0.06;
      c.strokeRect(-s * 0.33, -s * 0.2, s * 0.66, s * 0.4);
      c.fillStyle = '#f5d28a';
      c.beginPath();
      c.moveTo(0, -s * 0.12);
      c.lineTo(s * 0.12, 0);
      c.lineTo(0, s * 0.12);
      c.lineTo(-s * 0.12, 0);
      c.fill();
      break;
    case 'silk':
      c.ellipse(-s * 0.15, 0, s * 0.25, s * 0.38, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(-s * 0.15, s * 0.38);
      c.bezierCurveTo(s * 0.2, s * 0.4, s * 0.1, -s * 0.1, s * 0.48, -s * 0.05);
      c.lineTo(s * 0.48, s * 0.25);
      c.bezierCurveTo(s * 0.15, s * 0.25, s * 0.25, s * 0.5, -s * 0.15, s * 0.38);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.ellipse(-s * 0.22, -s * 0.05, s * 0.07, s * 0.25, 0, 0, Math.PI * 2);
      c.fill();
      break;
  }
  c.restore();
}

function drawCity(i: number, x: number, y: number, now: number) {
  const c = mctx;
  const unlocked = i < S.cities.length;
  const info = CITY_INFO[i];
  const tapT = (now - (tapAt[i] ?? -1e9)) / 380;
  const squash = tapT < 1 ? Math.sin(tapT * Math.PI * 2) * (1 - tapT) * 0.12 : 0;
  const r = R;
  c.save();
  c.translate(x, y);
  if (TH.glow && unlocked) {
    const g = c.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.1);
    g.addColorStop(0, 'rgba(255, 196, 110, 0.42)');
    g.addColorStop(1, 'rgba(255, 196, 110, 0)');
    c.fillStyle = g;
    c.fillRect(-r * 2.1, -r * 2.1, r * 4.2, r * 4.2);
  }
  // ground
  c.fillStyle = 'rgba(120,72,24,0.16)';
  c.beginPath();
  c.ellipse(0, r * 0.5, r * 1.45, r * 0.5, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = TH.plate;
  if (!unlocked) c.globalAlpha *= 0.5;
  c.beginPath();
  c.ellipse(0, r * 0.4, r * 1.32, r * 0.46, 0, 0, Math.PI * 2);
  c.fill();
  if (!unlocked) c.globalAlpha *= 2;
  c.scale(1 + squash, 1 - squash);
  const ghost = !unlocked;
  const wall = ghost ? 'rgba(170,135,90,0.35)' : '#f2d7a6';
  const wall2 = ghost ? 'rgba(170,135,90,0.28)' : '#e8c48b';
  const edge = ghost ? 'rgba(120,85,50,0.25)' : 'rgba(110,62,28,0.45)';
  const accent = ghost ? 'rgba(170,135,90,0.4)' : info.color;
  c.lineWidth = 1.5;
  c.strokeStyle = edge;
  // left house
  c.fillStyle = wall2;
  c.beginPath();
  c.rect(-r * 1.0, -r * 0.2, r * 0.62, r * 0.6);
  c.fill();
  c.stroke();
  c.fillStyle = ghost ? wall2 : '#c4583c';
  c.fillRect(-r * 1.04, -r * 0.27, r * 0.7, r * 0.1);
  // central gate tower
  c.fillStyle = wall;
  c.beginPath();
  c.rect(-r * 0.42, -r * 0.75, r * 0.84, r * 1.15);
  c.fill();
  c.stroke();
  for (let k = 0; k < 4; k++) {
    c.fillStyle = wall;
    c.fillRect(-r * 0.42 + k * r * 0.24, -r * 0.88, r * 0.14, r * 0.14);
    c.strokeRect(-r * 0.42 + k * r * 0.24, -r * 0.88, r * 0.14, r * 0.14);
  }
  c.fillStyle = accent;
  c.fillRect(-r * 0.42, -r * 0.55, r * 0.84, r * 0.11);
  c.fillStyle = ghost ? 'rgba(90,60,30,0.2)' : '#6b3d1f';
  c.beginPath();
  c.moveTo(-r * 0.18, r * 0.4);
  c.lineTo(-r * 0.18, r * 0.02);
  c.arc(0, r * 0.02, r * 0.18, Math.PI, 0);
  c.lineTo(r * 0.18, r * 0.4);
  c.fill();
  // market stall with striped awning in the city's colour
  c.fillStyle = wall2;
  c.fillRect(r * 0.48, -r * 0.05, r * 0.55, r * 0.45);
  c.strokeRect(r * 0.48, -r * 0.05, r * 0.55, r * 0.45);
  for (let k = 0; k < 4; k++) {
    c.fillStyle = k % 2 ? (ghost ? wall : '#fff6e4') : accent;
    c.beginPath();
    c.moveTo(r * 0.44 + k * r * 0.16, -r * 0.22);
    c.lineTo(r * 0.6 + k * r * 0.16, -r * 0.22);
    c.lineTo(r * 0.6 + k * r * 0.16, -r * 0.02);
    c.quadraticCurveTo(r * 0.52 + k * r * 0.16, r * 0.06, r * 0.44 + k * r * 0.16, -r * 0.02);
    c.fill();
  }
  if (!ghost) drawGood(c, info.good, r * 0.76, r * 0.24, r * 0.32);
  // merchant flag
  if (unlocked && S.cities[i].merchant) {
    c.strokeStyle = '#6b3d1f';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -r * 0.88);
    c.lineTo(0, -r * 1.45);
    c.stroke();
    const wave = Math.sin(now / 260 + i) * r * 0.05;
    c.fillStyle = '#1f8a86';
    c.beginPath();
    c.moveTo(0, -r * 1.45);
    c.quadraticCurveTo(r * 0.25, -r * 1.42 + wave, r * 0.5, -r * 1.33);
    c.lineTo(0, -r * 1.18);
    c.fill();
  }
  c.restore();
}

/**
 * Name pill + stash sack, drawn after the caravans so camels never cover the text. A pill that would
 * fall below the map's bottom edge sticks to the edge instead of being cut off.
 */
function drawCityLabel(i: number, x: number, y: number, now: number) {
  const c = mctx;
  const unlocked = i < S.cities.length;
  const info = CITY_INFO[i];
  const r = R;
  // label pill
  c.font = `800 ${Math.round(Math.max(11, r * 0.4))}px ui-rounded, system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  let label: string;
  let pillColor = 'rgba(255,250,240,0.95)';
  let textColor = '#3d2817';
  if (unlocked) label = `${t(info.name)} · ${t('level', { n: S.cities[i].level })}`;
  else if (i === S.cities.length) {
    const cost = G.nextUnlockCost(S);
    const ready = S.coins >= cost;
    pillColor = ready ? '#c4583c' : 'rgba(255,250,240,0.8)';
    textColor = ready ? '#fff' : '#8a6b4c';
    label = `${t(info.name)} · ${fmt(cost)}`;
  } else return;
  const lw = Math.min(c.measureText(label).width + 18, W - 8);
  const ly = Math.min(y + r * 1.15, camY + H - 15);
  const lx = Math.max(lw / 2 + 4, Math.min(W - lw / 2 - 4, x));
  c.fillStyle = pillColor;
  c.beginPath();
  c.roundRect(lx - lw / 2, ly - 11, lw, 22, 11);
  c.fill();
  if (!unlocked && i === S.cities.length) {
    c.strokeStyle = 'rgba(196,88,60,0.5)';
    c.lineWidth = 1.5;
    c.stroke();
  }
  c.fillStyle = textColor;
  c.fillText(label, lx, ly + 0.5, lw - 14);

  // stash sack above cities without a merchant
  if (unlocked && !S.cities[i].merchant) {
    const cap = G.stashCap(S, i);
    const k = cap > 0 ? Math.min(1, S.cities[i].stash / cap) : 0;
    const bob = k >= 1 ? Math.abs(Math.sin(now / 220)) * 4 : 0;
    const bx = x + r * 0.95, by = y - r * 1.15 - bob;
    c.fillStyle = 'rgba(255,250,240,0.95)';
    c.beginPath();
    c.arc(bx, by, r * 0.36, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#e9a92b';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(bx, by, r * 0.36, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
    c.stroke();
    drawCoin(c, bx, by, r * 0.19);
  }
}

function drawCoin(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.fillStyle = '#b97a12';
  c.beginPath();
  c.arc(x, y + r * 0.12, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#f2b632';
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(160,100,10,0.6)';
  c.lineWidth = Math.max(1, r * 0.18);
  c.beginPath();
  c.arc(x, y, r * 0.62, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.beginPath();
  c.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, Math.PI * 2);
  c.fill();
}

function drawCamel(c: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number, phase: number, cargo: string) {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(120,72,24,0.18)';
  c.beginPath();
  c.ellipse(0, 0, s * 0.55, s * 0.12, 0, 0, Math.PI * 2);
  c.fill();
  c.scale(dir, 1);
  const bob = Math.sin(phase * 2) * s * 0.05;
  c.strokeStyle = TH.camelLeg;
  c.lineWidth = s * 0.11;
  c.lineCap = 'round';
  const legs = [-0.32, -0.18, 0.2, 0.34];
  legs.forEach((lx, k) => {
    const sw = Math.sin(phase + (k % 2 ? Math.PI : 0)) * s * 0.12;
    c.beginPath();
    c.moveTo(lx * s, -s * 0.45 + bob);
    c.lineTo(lx * s + sw, -s * 0.02);
    c.stroke();
  });
  c.translate(0, bob);
  c.fillStyle = TH.camel;
  c.beginPath();
  c.ellipse(0, -s * 0.55, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(-s * 0.06, -s * 0.74, s * 0.26, s * 0.2, 0, 0, Math.PI * 2);
  c.fill();
  // neck + head
  c.strokeStyle = TH.camel;
  c.lineWidth = s * 0.16;
  c.beginPath();
  c.moveTo(s * 0.38, -s * 0.6);
  c.quadraticCurveTo(s * 0.62, -s * 0.66, s * 0.62, -s * 0.95);
  c.stroke();
  c.beginPath();
  c.ellipse(s * 0.72, -s * 0.98, s * 0.16, s * 0.09, 0.15, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#3d2817';
  c.beginPath();
  c.arc(s * 0.72, -s * 1.01, s * 0.025, 0, Math.PI * 2);
  c.fill();
  // cargo saddle bag
  c.fillStyle = cargo;
  c.beginPath();
  c.roundRect(-s * 0.3, -s * 0.86, s * 0.48, s * 0.34, s * 0.08);
  c.fill();
  c.fillStyle = 'rgba(255,240,210,0.75)';
  c.fillRect(-s * 0.3, -s * 0.72, s * 0.48, s * 0.06);
  c.restore();
}

// ───────────────────────── effects ─────────────────────────
interface Dust { x: number; y: number; t0: number }
interface Pop { x: number; y: number; t0: number; text: string; small?: boolean }
interface FlyCoin { x0: number; y0: number; t0: number; dur: number; arc: number }
interface Confetti { x: number; y: number; vx: number; vy: number; color: string; t0: number; life: number; size: number; spin: number }
let dust: Dust[] = [];
let pops: Pop[] = []; // page coordinates
let flying: FlyCoin[] = [];
let confetti: Confetti[] = [];
const tapAt: number[] = [];
const camelPhase = new Map<string, number>();
let lastDust = 0;

function walletTarget() {
  const r = document.querySelector('.wallet .big-coin')!.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function mapToPage(p: Pt) {
  const r = mapCanvas.getBoundingClientRect();
  return { x: r.left + p.x, y: r.top + p.y - camY };
}

function coinBurst(px: number, py: number, n: number) {
  const now = performance.now();
  for (let k = 0; k < n; k++) flying.push({ x0: px + (Math.random() - 0.5) * 30, y0: py + (Math.random() - 0.5) * 20, t0: now + k * 45, dur: 520 + Math.random() * 220, arc: 60 + Math.random() * 80 });
}
function confettiBurst(x: number, y: number, count: number, spread = 560, up = 520) {
  const now = performance.now();
  for (let k = 0; k < count; k++) {
    confetti.push({ x, y, vx: (Math.random() - 0.5) * spread, vy: -Math.random() * up - 80, color: CONFETTI[k % CONFETTI.length], t0: now + Math.random() * 120, life: 1000 + Math.random() * 800, size: 6 + Math.random() * 6, spin: (Math.random() - 0.5) * 14 });
  }
}
function pop(x: number, y: number, text: string, small = false) {
  pops.push({ x, y, t0: performance.now(), text, small });
  if (pops.length > 24) pops.shift();
}

let bannerTimer = 0;
function banner(eyebrow: string, title: string) {
  $('banner-eyebrow').textContent = eyebrow;
  $('banner-title').textContent = title;
  const el = $('banner');
  el.hidden = true;
  void el.offsetWidth;
  el.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => (el.hidden = true), 2400);
}

// ───────────────────────── frame ─────────────────────────
let shownCoins = S.coins;
let lastFrame = performance.now();
let lastInput = performance.now();
let frameNo = 0;
let lastUi = 0;

function frame(now: number) {
  requestAnimationFrame(frame);
  frameNo++;
  // Throttle to ~30 fps after 20 s without input: the map keeps moving but costs half the battery.
  if (now - lastInput > 20_000 && frameNo % 2) return;
  const dt = Math.min(1, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  G.tick(S, dt);
  if (heroVisible()) {
    drawHero(now);
    return;
  }

  // camera
  if (follow) camY += (camTarget - camY) * Math.min(1, dt * 6);
  camY = clampCam(camY);

  drawMap(now);
  drawFx(now, dt);
  if (now - lastUi > 150) {
    lastUi = now;
    refreshUi();
  }
}

function drawMap(now: number) {
  const c = mctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (bg) c.drawImage(bg, 0, camY * dpr, bg.width, H * dpr, 0, 0, W, H);
  c.translate(0, -camY);
  const n = S.cities.length;
  // roads
  for (let j = 0; j < G.CITY_COUNT - 1; j++) {
    const pts = routeOf(j);
    const active = j < n;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    c.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
    c.strokeStyle = `rgba(${TH.road}, ${active ? 0.22 : 0.1})`;
    c.lineWidth = R * 0.5;
    c.lineCap = 'round';
    c.stroke();
    c.setLineDash([7, 9]);
    c.strokeStyle = `rgba(${TH.dash}, ${active ? 0.55 : 0.2})`;
    c.lineWidth = 2.5;
    c.stroke();
    c.setLineDash([]);
  }
  // dust
  dust = dust.filter((d) => now - d.t0 < 700);
  for (const d of dust) {
    const k = (now - d.t0) / 700;
    c.fillStyle = `rgba(${TH.dust}, ${0.45 * (1 - k)})`;
    c.beginPath();
    c.arc(d.x, d.y - k * 6, 2 + k * 6, 0, Math.PI * 2);
    c.fill();
  }
  // cities (back to front)
  for (let i = 0; i < G.CITY_COUNT; i++) {
    const p = cityPos(i);
    if (p.y - camY < -R * 3 || p.y - camY > H + R * 3) continue;
    if (i > n) {
      // far locked cities: faint outline only
      c.globalAlpha = 0.6;
      drawCity(i, p.x, p.y, now);
      c.globalAlpha = 1;
    } else drawCity(i, p.x, p.y, now);
  }
  // caravans
  const camels: { x: number; y: number; dir: number; ph: number; col: string }[] = [];
  S.cities.forEach((city, i) => {
    const pts = routeOf(i);
    const trip = 9 / (1 + 0.25 * city.speed);
    const count = Math.min(city.camels, 6);
    for (let k = 0; k < count; k++) {
      const u = ((now / 1000 / (trip * 2) + k / count + i * 0.13) % 1 + 1) % 1;
      const key = `${i}-${k}`;
      const prev = camelPhase.get(key);
      camelPhase.set(key, u);
      const fwd = u < 0.5;
      const lin = fwd ? u * 2 : 2 - u * 2;
      const p = 0.2 + 0.6 * (0.5 - 0.5 * Math.cos(lin * Math.PI));
      const a = bez(pts, p);
      const b = bez(pts, Math.min(1, p + 0.01));
      const dx = (b.x - a.x) * (fwd ? 1 : -1);
      camels.push({ x: a.x, y: a.y, dir: dx >= 0 ? 1 : -1, ph: now / 120 + k * 1.7, col: CITY_INFO[i].color });
      if (now - lastDust > 90 && Math.random() < 0.25) dust.push({ x: a.x - (dx >= 0 ? 1 : -1) * R * 0.3, y: a.y, t0: now });
      // arrival at either end: coins pop over the destination
      if (prev !== undefined && ((prev < 0.5 && u >= 0.5) || prev > u)) {
        const dest = fwd ? pts[0] : pts[3];
        const destP = prev < 0.5 && u >= 0.5 ? pts[3] : dest;
        mission('deliveries');
        const sy = destP.y - camY;
        if (sy > 0 && sy < H) {
          const per = (G.cityRate(S, i) * trip * 2) / city.camels / 2;
          const pg = mapToPage({ x: destP.x, y: destP.y - R * 1.2 });
          pop(pg.x, pg.y, '+' + fmt(per), true);
          clink(0.06);
        }
      }
    }
  });
  if (now - lastDust > 90) lastDust = now;
  camels.sort((a, b) => a.y - b.y).forEach((m) => drawCamel(mctx, m.x, m.y + R * 0.15, R * 0.62, m.dir, m.ph, m.col));
  for (let i = 0; i <= Math.min(n, G.CITY_COUNT - 1); i++) {
    const p = cityPos(i);
    if (p.y - R - camY > H || p.y + R * 1.6 - camY < 0) continue;
    drawCityLabel(i, p.x, p.y, now);
  }
  if (dust.length > 120) dust = dust.slice(-120);
  c.setTransform(1, 0, 0, 1, 0, 0);
}

function drawHand(c: CanvasRenderingContext2D, x: number, y: number, now: number) {
  const k = (now % 1100) / 1100;
  const press = k < 0.3 ? k / 0.3 : k < 0.5 ? 1 - (k - 0.3) / 0.2 : 0;
  c.strokeStyle = `rgba(31, 138, 134, ${0.6 * (1 - k)})`;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(x, y, 10 + k * 26, 0, Math.PI * 2);
  c.stroke();
  c.save();
  c.translate(x + 8, y + 10 + (1 - press) * 10);
  c.rotate(-0.35);
  c.fillStyle = '#fffaf0';
  c.strokeStyle = '#3d2817';
  c.lineWidth = 2.5;
  c.beginPath();
  c.roundRect(-6, 0, 12, 30, 6);
  c.roundRect(-10, 20, 26, 28, 9);
  c.fill();
  c.stroke();
  c.fillStyle = '#fffaf0';
  c.fillRect(-4, 18, 8, 8);
  c.restore();
}

function drawFx(now: number, dt: number) {
  const c = fctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  // count the wallet up smoothly
  if (S.coins < shownCoins) shownCoins = S.coins;
  else shownCoins += (S.coins - shownCoins) * Math.min(1, dt * 7);
  if (Math.abs(S.coins - shownCoins) < 0.5) shownCoins = S.coins;
  $('coins').textContent = fmt(shownCoins);

  const target = flying.length ? walletTarget() : { x: 0, y: 0 };
  flying = flying.filter((f) => {
    const k = (now - f.t0) / f.dur;
    if (k < 0) return true;
    if (k >= 1) {
      clink(0.12);
      const w = document.querySelector('.wallet')!;
      w.classList.remove('bump');
      void (w as HTMLElement).offsetWidth;
      w.classList.add('bump');
      return false;
    }
    const e = k * k * (3 - 2 * k);
    const x = f.x0 + (target.x - f.x0) * e;
    const y = f.y0 + (target.y - f.y0) * e - Math.sin(k * Math.PI) * f.arc;
    drawCoin(c, x, y, 9 - k * 2);
    return true;
  });

  pops = pops.filter((p) => now - p.t0 < 950);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const p of pops) {
    const k = (now - p.t0) / 950;
    c.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    c.font = `900 ${p.small ? 13 : 17}px ui-rounded, system-ui, sans-serif`;
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(61,40,23,0.8)';
    const y = p.y - k * 42;
    c.strokeText(p.text, p.x, y);
    c.fillStyle = '#ffd66b';
    c.fillText(p.text, p.x, y);
  }
  c.globalAlpha = 1;

  confetti = confetti.filter((p) => now - p.t0 < p.life);
  for (const p of confetti) {
    const tt = Math.max(0, (now - p.t0) / 1000);
    const k = 1 - (now - p.t0) / p.life;
    c.save();
    c.translate(p.x + p.vx * tt, p.y + p.vy * tt + 620 * tt * tt);
    c.rotate(p.spin * tt);
    c.globalAlpha = Math.min(1, k * 1.5);
    c.fillStyle = p.color;
    c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    c.restore();
  }
  c.globalAlpha = 1;

  // tutorial hand
  if (tut < 3 && $('welcome').hidden && $('bazaar').hidden && !meta.covering) {
    let pt: Pt | null = null;
    if (tut === 0) {
      const p = cityPos(0);
      pt = mapToPage({ x: p.x, y: p.y });
    } else {
      const el = pane.querySelector<HTMLElement>(`[data-up="0-${tut === 1 ? 'prod' : 'camel'}"]`);
      const pr = pane.getBoundingClientRect();
      const r = el?.getBoundingClientRect();
      if (r && r.top > pr.top && r.bottom < pr.bottom && !$('pane-cities').hidden) pt = { x: r.left + r.width * 0.7, y: r.top + r.height * 0.55 };
    }
    if (pt) drawHand(c, pt.x, pt.y, now);
  }
}

// ───────────────────────── UI (cards, reputation) ─────────────────────────
const UP_LABEL: Record<G.UpgradeKind, (c: G.City) => string> = {
  prod: () => t('upProd'),
  camel: (c) => t('upCamel', { n: c.camels, max: G.MAX_CAMELS }),
  speed: (c) => t('upSpeed', { n: c.speed, max: G.MAX_SPEED }),
  merchant: () => t('upMerchant'),
};
let builtFor = -1;
const setText = (el: Element | null, s: string) => {
  if (el && el.textContent !== s) el.textContent = s;
};

function goodIcon(i: number, ghost = false) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 60;
  const c = cv.getContext('2d')!;
  if (ghost) c.globalAlpha = 0.45;
  drawGood(c, CITY_INFO[i].good, 30, 30, 44);
  return cv;
}

function buildCards() {
  builtFor = S.cities.length;
  pane.innerHTML = '';
  if (S.cities.length < G.CITY_COUNT) {
    const i = S.cities.length;
    const info = CITY_INFO[i];
    const card = document.createElement('div');
    card.className = 'card unlock-card';
    card.innerHTML = `<div class="card-head"><div class="good" style="background:${info.tint}"></div>
      <div class="card-title"><b>${t('unlockTitle', { name: t(info.name) })}</b><span>${t('unlockSub', { good: t(info.good) })}</span></div></div>
      <button class="btn" id="unlock-btn"><span>${t('unlockBtn')}</span><i class="coin"></i><span id="unlock-cost"></span></button>`;
    card.querySelector('.good')!.appendChild(goodIcon(i, true));
    pane.appendChild(card);
  }
  for (let i = S.cities.length - 1; i >= 0; i--) {
    const info = CITY_INFO[i];
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.city = String(i);
    card.innerHTML = `<div class="card-head"><div class="good" style="background:${info.tint}"></div>
      <div class="card-title"><b>${t(info.name)}</b><span class="lvl"></span></div>
      <div class="card-rate"><span class="r"></span><small class="tag"></small></div></div>
      <div class="bar"><i></i></div>
      <div class="ups">${G.UPGRADES.map((k) => `<button class="up${k === 'merchant' ? ' m' : ''}" data-up="${i}-${k}"><span></span><b><i class="coin"></i><em></em></b></button>`).join('')}</div>`;
    card.querySelector('.good')!.appendChild(goodIcon(i));
    pane.appendChild(card);
  }
  refreshUi();
}

function refreshUi() {
  if (builtFor !== S.cities.length) return buildCards();
  setText($('rate'), t('perSec', { n: fmt(G.totalRate(S)) }));
  const boostChip = $('boost-chip');
  boostChip.hidden = S.boost <= 0;
  if (S.boost > 0) setText(boostChip, `x2 · ${clock(S.boost)}`);
  setText($('tokens'), String(profile.data.coins));
  if (!$('bazaar').hidden) refreshBazaar();
  pane.querySelectorAll<HTMLElement>('.card[data-city]').forEach((card) => {
    const i = Number(card.dataset.city);
    const city = S.cities[i];
    const next = G.nextMilestone(city.level);
    const prev = [...G.MILESTONES].reverse().find((m) => m <= city.level) ?? 0;
    setText(card.querySelector('.lvl'), `${t(CITY_INFO[i].good)} · ${t('level', { n: city.level })}${next ? ' · ' + t('nextMilestone', { n: next }) : ''}`);
    setText(card.querySelector('.r'), t('perSec', { n: fmt(G.cityRate(S, i)) }));
    setText(card.querySelector('.tag'), city.merchant ? t('idleTag') : t('tapTag'));
    (card.querySelector('.bar i') as HTMLElement).style.width = `${next ? ((city.level - prev) / (next - prev)) * 100 : 100}%`;
    for (const k of G.UPGRADES) {
      const btn = card.querySelector<HTMLButtonElement>(`[data-up="${i}-${k}"]`)!;
      const cost = G.upgradeCost(S, i, k);
      const done = cost === Infinity;
      setText(btn.querySelector('span'), UP_LABEL[k](city));
      setText(btn.querySelector('em'), done ? (k === 'merchant' ? t('hired') : t('maxed')) : fmt(cost));
      (btn.querySelector('.coin') as HTMLElement).hidden = done;
      const ready = !done && S.coins >= cost;
      btn.classList.toggle('ready', ready);
      btn.classList.toggle('alt', k === 'merchant');
      btn.classList.toggle('done', done);
      btn.disabled = !ready;
    }
  });
  const ub = document.getElementById('unlock-btn') as HTMLButtonElement | null;
  if (ub) {
    const cost = G.nextUnlockCost(S);
    setText($('unlock-cost'), fmt(cost));
    ub.disabled = S.coins < cost;
  }
  // reputation
  const gain = G.starsFor(S.runEarned);
  setText($('rep-stars'), String(S.stars));
  setText($('rep-now'), 'x' + G.reputationMult(S.stars).toFixed(1));
  setText($('rep-after'), 'x' + G.reputationMult(S.stars + gain).toFixed(1));
  setText($('rep-gain'), `+${gain} ★`);
  setText($('rep-need'), S.cities.length < G.CITY_COUNT ? t('repNeed') : gain < 1 ? t('repNeedStar') : '');
  $<HTMLButtonElement>('prestige-btn').disabled = !G.canPrestige(S);
  $('rep-dot').hidden = !G.canPrestige(S);
  $('stars-chip').hidden = S.stars < 1;
  setText($('stars'), String(S.stars));
  // tutorial pill
  const tutEl = $('tut');
  tutEl.hidden = tut >= 3;
  if (tut < 3) setText(tutEl, t((['tut1', 'tut2', 'tut3'] as Key[])[tut]));
}

function advanceTutorial(step: number) {
  if (tut !== step) return;
  tut++;
  store.set('tut', tut);
  track('tutorial_step', { step: tut });
  refreshUi();
}

// ───────────────────────── actions ─────────────────────────
let tutTaps = 0;
function tapCity(i: number) {
  const gain = G.tap(S, i);
  tapAt[i] = performance.now();
  const p = cityPos(i);
  const pg = mapToPage({ x: p.x, y: p.y - R * 0.6 });
  pop(pg.x, pg.y - R * 0.6, '+' + fmt(gain));
  coinBurst(pg.x, pg.y, Math.min(8, 2 + Math.floor(Math.log10(gain + 1) * 1.5)));
  clink(0.24);
  haptic.light();
  mission('taps');
  if (tut === 0 && ++tutTaps >= 3) advanceTutorial(0);
}

function unlock() {
  if (!G.unlockNext(S)) return;
  const i = S.cities.length - 1;
  track('city_unlock', { city: i + 1, run_time_s: Math.round(S.runTime), prestiges: S.prestiges });
  mission('cityUnlock');
  profile.recordBest(S.cities.length);
  save();
  buildCards();
  pane.scrollTop = 0;
  focusCity(i);
  banner(t('newCity'), t(CITY_INFO[i].name));
  confettiBurst(window.innerWidth * 0.25, window.innerHeight * 0.25, 50);
  confettiBurst(window.innerWidth * 0.75, window.innerHeight * 0.25, 50);
  fanfare();
  haptic.success();
  if (S.cities.length === 3 && S.prestiges === 0) maybeRequestReview(S.cities.length + 1, true);
}

function buyUpgrade(i: number, kind: G.UpgradeKind, btn: HTMLElement) {
  const before = S.cities[i].level;
  if (!G.buy(S, i, kind)) {
    haptic.error();
    return;
  }
  const city = S.cities[i];
  track('upgrade_buy', { city: i + 1, kind, level: kind === 'prod' ? city.level : kind === 'camel' ? city.camels : kind === 'speed' ? city.speed : 1 });
  const r = btn.getBoundingClientRect();
  buySound(kind === 'prod' ? city.level : city.camels + city.speed + 3);
  haptic.light();
  mission('upgrades');
  if (kind === 'prod' && G.milestoneMult(city.level) > G.milestoneMult(before)) {
    pop(r.left + r.width / 2, r.top, 'x2!');
    confettiBurst(r.left + r.width / 2, r.top, 30, 360, 380);
    haptic.success();
  } else if (kind === 'merchant') {
    confettiBurst(r.left + r.width / 2, r.top, 24, 300, 340);
    haptic.medium();
  }
  if (kind === 'prod') advanceTutorial(1);
  if (kind === 'camel') advanceTutorial(2);
  refreshUi();
}

pane.addEventListener('click', (e) => {
  unlockAudio();
  lastInput = performance.now();
  const target = e.target as HTMLElement;
  if (target.closest('#unlock-btn')) return unlock();
  const up = target.closest<HTMLElement>('[data-up]');
  if (!up) return;
  const [i, kind] = up.dataset.up!.split('-');
  buyUpgrade(Number(i), kind as G.UpgradeKind, up);
});

// map: tap a city, drag to scroll when the route is taller than the view
let drag: { y: number; cam: number; moved: boolean } | null = null;
function hitCity(clientX: number, clientY: number) {
  const r = mapCanvas.getBoundingClientRect();
  const x = clientX - r.left, y = clientY - r.top + camY;
  for (let i = 0; i < G.CITY_COUNT; i++) {
    const p = cityPos(i);
    if (Math.hypot((x - p.x) * 0.8, y - p.y) < R * 1.5) return i;
  }
  return -1;
}
function onMapTap(clientX: number, clientY: number) {
  const i = hitCity(clientX, clientY);
  if (i < 0) return;
  if (i < S.cities.length) tapCity(i);
  else if (i === S.cities.length && S.coins >= G.nextUnlockCost(S)) unlock();
}
mapCanvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  lastInput = performance.now();
  if (worldH <= H) return onMapTap(e.clientX, e.clientY);
  drag = { y: e.clientY, cam: camY, moved: false };
  mapCanvas.setPointerCapture(e.pointerId);
});
mapCanvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dy = e.clientY - drag.y;
  if (Math.abs(dy) > 8) drag.moved = true;
  if (drag.moved) {
    follow = false;
    camY = clampCam(drag.cam - dy);
  }
});
mapCanvas.addEventListener('pointerup', (e) => {
  if (drag && !drag.moved) onMapTap(e.clientX, e.clientY);
  drag = null;
});
mapCanvas.addEventListener('pointercancel', () => (drag = null));

// tabs
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    unlockAudio();
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === tab));
    $('pane-cities').hidden = tab.dataset.tab !== 'cities';
    $('pane-rep').hidden = tab.dataset.tab !== 'rep';
    tone({ freq: 660, duration: 0.05, type: 'triangle', volume: 0.15 });
  }),
);

// prestige
$('prestige-btn').addEventListener('click', () => {
  if (!G.canPrestige(S)) return;
  setText($('confirm-text'), t('repConfirm', { n: G.starsFor(S.runEarned) }));
  $('confirm').hidden = false;
});
$('confirm-no').addEventListener('click', () => ($('confirm').hidden = true));
$('confirm-yes').addEventListener('click', () => {
  $('confirm').hidden = true;
  const runTime = S.runTime;
  const gained = G.prestige(S);
  if (!gained) return;
  track('prestige', { stars_gained: gained, stars_total: S.stars, run_time_s: Math.round(runTime), prestiges: S.prestiges });
  shownCoins = 0;
  save();
  buildCards();
  (document.querySelector('.tab[data-tab="cities"]') as HTMLButtonElement).click();
  focusCity(0);
  banner(t('newEra'), `+${gained} ★`);
  for (let k = 0; k < 4; k++) confettiBurst(window.innerWidth * (0.15 + k * 0.23), window.innerHeight * 0.3, 40);
  fanfare();
  haptic.success();
});


// offline earnings — detected on launch/resume, shown once the player is on the map
let pendingAway = 0;
let inGame = false;
function checkAway() {
  const last = store.get<number>('lastSeen', 0);
  store.set('lastSeen', Date.now());
  lastFrame = performance.now();
  if (!last) return;
  const sec = (Date.now() - last) / 1000;
  if (sec < 60) return;
  const { coins } = G.offlineEarnings(S, sec);
  if (coins < 1) {
    G.applyOffline(S, sec);
    return;
  }
  pendingAway += sec;
  showAway();
}
function showAway() {
  if (!pendingAway || !inGame) return;
  const { coins, seconds } = G.offlineEarnings(S, pendingAway);
  setText($('away-for'), t('awayFor', { t: fmtDuration(seconds, t('units')) }));
  setText($('away-coins'), fmt(coins));
  $('welcome').hidden = false;
}
async function claim(double: boolean) {
  if (!pendingAway) return;
  const sec = pendingAway;
  if (double && !(await showRewarded('offline_x2'))) return;
  pendingAway = 0;
  $('welcome').hidden = true;
  const got = G.applyOffline(S, sec, double ? 2 : 1);
  track('offline_claim', { seconds: Math.round(Math.min(sec, G.OFFLINE_CAP_SEC)), doubled: double, coins_log10: Math.round(Math.log10(got + 1) * 10) / 10 });
  const w = walletTarget();
  coinBurst(window.innerWidth / 2, window.innerHeight * 0.7, 10);
  pop(w.x + 60, w.y + 30, '+' + fmt(got));
  haptic.success();
  save();
}
$('claim-btn').addEventListener('click', () => {
  unlockAudio();
  void claim(false);
});
$('claim2-btn').addEventListener('click', () => {
  unlockAudio();
  void claim(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkAway();
  else {
    flushMissions();
    save();
  }
});
$('confirm').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) $('confirm').hidden = true;
});

// ───────────────────────── meta (home, missions, daily, shop, bazaar) ─────────────────────────
function applySkin(id: string) {
  TH = SKINS.find((s) => s.id === id) ?? SKINS[0];
  if (W > 0) bg = renderBackground();
  drawHero(performance.now());
}

const profile = createProfile({
  game: 'kervan',
  levelCount: 0,
  defaultSkin: SKINS[0].id,
  skinIds: SKINS.map((s) => s.id),
  missions: [
    { id: 'upgrades', targets: [10, 20, 40], reward: (n) => 20 + n },
    { id: 'taps', targets: [30, 60, 120], reward: (n) => 15 + Math.round(n / 3) },
    { id: 'cityUnlock', targets: [1, 2], reward: (n) => 30 + n * 20 },
    { id: 'deliveries', targets: [25, 50, 100], reward: (n) => 20 + Math.round(n / 2) },
  ],
});
TH = SKINS.find((s) => s.id === profile.data.skin) ?? SKINS[0];
// Home "best" = the furthest city ever opened (eras included).
profile.recordBest(S.cities.length);

// Mission events arrive in bursts (every tap, every camel arrival): batch them into one save.
const pendingMissions = new Map<string, number>();
function mission(id: string, n = 1) {
  pendingMissions.set(id, (pendingMissions.get(id) ?? 0) + n);
}
function flushMissions() {
  if (!pendingMissions.size) return;
  let done = false;
  for (const [id, n] of pendingMissions) if (profile.progress(id, n)) done = true;
  pendingMissions.clear();
  if (done) {
    meta.toast(t('missionDone'));
    haptic.success();
    fanfare();
  }
}

/** Boost countdown: 29:59, 1:05:00. */
function clock(sec: number) {
  sec = Math.ceil(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// home artwork: a camel walking along a dune crest, painted in the current map theme
const hero = document.createElement('canvas');
hero.className = 'hero';
const HERO_W = 280, HERO_H = 176;
function heroVisible() {
  return hero.isConnected && hero.getClientRects().length > 0;
}
function duneY(x: number, off: number, base: number, amp: number, len: number) {
  return base + Math.sin((x + off) / len) * amp + Math.sin((x + off) / (len * 0.47)) * amp * 0.35;
}
function drawHero(now: number) {
  const hd = Math.min(window.devicePixelRatio || 1, 3);
  if (hero.width !== Math.round(HERO_W * hd)) {
    hero.width = Math.round(HERO_W * hd);
    hero.height = Math.round(HERO_H * hd);
  }
  const c = hero.getContext('2d')!;
  c.setTransform(hd, 0, 0, hd, 0, 0);
  const sky = c.createLinearGradient(0, 0, 0, HERO_H);
  sky.addColorStop(0, TH.heroSky[0]);
  sky.addColorStop(1, TH.heroSky[1]);
  c.fillStyle = sky;
  c.fillRect(0, 0, HERO_W, HERO_H);
  // sun / moon
  c.fillStyle = TH.sun;
  c.globalAlpha = 0.9;
  c.beginPath();
  c.arc(HERO_W * 0.76, HERO_H * 0.3, 22, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;
  const off = now * 0.03;
  // far dunes, slow parallax
  c.fillStyle = TH.sky[1];
  c.globalAlpha = 0.65;
  c.beginPath();
  c.moveTo(0, HERO_H);
  for (let x = 0; x <= HERO_W; x += 6) c.lineTo(x, duneY(x, off * 0.35, HERO_H * 0.58, 9, 46));
  c.lineTo(HERO_W, HERO_H);
  c.fill();
  c.globalAlpha = 1;
  // trees drifting by on the far dune
  for (let k = 0; k < 2; k++) {
    const span = HERO_W + 120;
    const tx = (((k * 190 - off * 0.35) % span) + span) % span - 60;
    drawTree(c, tx, duneY(tx, off * 0.35, HERO_H * 0.58, 9, 46) + 4, 30, 0.3);
  }
  // near dune with the camel on its crest
  const g = c.createLinearGradient(0, HERO_H * 0.6, 0, HERO_H);
  g.addColorStop(0, TH.sky[0]);
  g.addColorStop(1, TH.sky[1]);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, HERO_H);
  for (let x = 0; x <= HERO_W; x += 4) c.lineTo(x, duneY(x, off, HERO_H * 0.78, 7, 60));
  c.lineTo(HERO_W, HERO_H);
  c.fill();
  c.strokeStyle = TH.crest;
  c.lineWidth = 2;
  c.beginPath();
  for (let x = 0; x <= HERO_W; x += 4) c.lineTo(x, duneY(x, off, HERO_H * 0.78, 7, 60) + 1);
  c.stroke();
  // a smaller camel trails the leader: it is a caravan
  const fx = HERO_W * 0.2;
  drawCamel(c, fx, duneY(fx, off, HERO_H * 0.78, 7, 60) + 2, 46, 1, now / 140 + 1.4, CITY_INFO[1].color);
  const cx = HERO_W * 0.52;
  const cy = duneY(cx, off, HERO_H * 0.78, 7, 60) + 2;
  // dust kicked up behind
  for (let k = 0; k < 3; k++) {
    const ph = (now / 600 + k / 3) % 1;
    c.fillStyle = `rgba(${TH.dust}, ${0.5 * (1 - ph)})`;
    c.beginPath();
    c.arc(cx - 28 - ph * 20, cy - 3 - ph * 6, 3 + ph * 5, 0, Math.PI * 2);
    c.fill();
  }
  drawCamel(c, cx, cy, 64, 1, now / 140, CITY_INFO[2].color);
}

const meta = createMeta({
  title: 'Kervan',
  hero,
  tagline: t('tagline'),
  version: __APP_VERSION__,
  privacyUrl: PRIVACY_URL,
  profile,
  endless: { title: t('mode'), play: enterGame },
  missionText: (id, n) => (id === 'cityUnlock' && n === 1 ? t('mission_cityUnlock1') : t(`mission_${id}` as Key, { n })),
  skins: SKINS.map((s) => ({ id: s.id, name: t(`skin_${s.id}` as Key), price: s.price, swatch: swatchOf(s) })),
  onSkin: applySkin,
  settings,
  onSettings: (s) => {
    setSoundEnabled(s.sound);
    setHapticsEnabled(s.haptics);
    store.set('settings', s);
  },
});
profile.onChange(() => setText($('tokens'), String(profile.data.coins)));

function enterGame() {
  inGame = true;
  unlockAudio();
  lastInput = performance.now();
  if (profile.data.firstRun) profile.finishFirstRun();
  layout();
  showAway();
}

// HUD pause → kit pause sheet. An idle map has nothing to restart, so that row is hidden (style.css).
function openPause() {
  unlockAudio();
  if (meta.covering) return;
  meta.showPause({
    onResume: () => (lastInput = performance.now()),
    onRestart: () => {},
    onMenu: () => {
      inGame = false;
      flushMissions();
      save();
    },
  });
}
$('settings-btn').addEventListener('click', openPause);

// Bazaar: meta coins (missions, daily, shop) → trade boosts. Gold is never converted back.
const INSTANT_COST = 50, INSTANT_SEC = 3600;
const BOOST_COST = 80, BOOST_SEC = 1800;
function refreshBazaar() {
  setText($('bazaar-tokens'), String(profile.data.coins));
  setText($('instant-sub'), t('instantSub', { n: fmt(Math.max(1, G.baseRate(S) * INSTANT_SEC)) }));
  setText($('boost-sub'), S.boost > 0 ? t('boostActive', { t: clock(S.boost) }) : t('boostSub'));
  $('buy-instant').classList.toggle('poor', profile.data.coins < INSTANT_COST);
  $('buy-boost').classList.toggle('poor', profile.data.coins < BOOST_COST || S.boost >= G.BOOST_CAP_SEC);
}
function openBazaar() {
  unlockAudio();
  if (meta.covering) return;
  refreshBazaar();
  $('bazaar').hidden = false;
  track('bazaar_open');
}
function bazaarBuy(kind: 'instant' | 'boost', btn: HTMLElement) {
  unlockAudio();
  const cost = kind === 'instant' ? INSTANT_COST : BOOST_COST;
  if (kind === 'boost' && S.boost >= G.BOOST_CAP_SEC) return haptic.error();
  if (!profile.spend(cost)) {
    meta.toast(t('notEnough'));
    haptic.error();
    return;
  }
  const r = btn.getBoundingClientRect();
  if (kind === 'instant') {
    const got = G.instantIncome(S, INSTANT_SEC);
    pop(r.left + r.width / 2, r.top - 6, '+' + fmt(got));
    coinBurst(r.left + r.width / 2, r.top, 10);
  } else {
    G.addBoost(S, BOOST_SEC);
    banner(t('bazaar'), t('boostOn'));
  }
  confettiBurst(r.left + r.width / 2, r.top, 30, 360, 380);
  fanfare();
  haptic.success();
  track('bazaar_boost', { kind, cost });
  save();
  refreshBazaar();
  refreshUi();
}
$('bazaar-btn').addEventListener('click', openBazaar);
$('bazaar-close').addEventListener('click', () => ($('bazaar').hidden = true));
$('bazaar').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) $('bazaar').hidden = true;
});
$('buy-instant').addEventListener('click', (e) => bazaarBuy('instant', e.currentTarget as HTMLElement));
$('buy-boost').addEventListener('click', (e) => bazaarBuy('boost', e.currentTarget as HTMLElement));
$('bazaar-more').addEventListener('click', () => {
  $('bazaar').hidden = true;
  meta.openShop('coins');
});

// ───────────────────────── boot ─────────────────────────
window.addEventListener('resize', layout);
layout();
buildCards();
checkAway();
setInterval(() => {
  flushMissions();
  save();
}, 5000);
setInterval(flushMissions, 1500);
void initAds();
void initStore();
void setupNative({
  darkBackground: false,
  onPause: () => {
    flushMissions();
    save();
  },
  onBack: () => {
    if (meta.back()) return true;
    for (const id of ['bazaar', 'confirm']) {
      if (!$(id).hidden) {
        $(id).hidden = true;
        return true;
      }
    }
    if (meta.covering) return false;
    if (!$('pane-rep').hidden) {
      (document.querySelector('.tab[data-tab="cities"]') as HTMLButtonElement).click();
      return true;
    }
    openPause();
    return true;
  },
});
meta.showHome();
requestAnimationFrame(frame);

// Exposed for e2e/screenshot scripts.
(window as unknown as { __kervan: unknown }).__kervan = {
  get state() {
    return S;
  },
  get profile() {
    return profile.data;
  },
  grant(n: number) {
    S.coins += n;
    S.runEarned += n;
    S.totalEarned += n;
    refreshUi();
  },
  load(raw: unknown, tutorial = 3) {
    S = G.migrate(raw);
    shownCoins = S.coins;
    tut = tutorial;
    store.set('tut', tut);
    profile.recordBest(S.cities.length);
    save();
    buildCards();
    focusCity(Math.min(S.cities.length, G.CITY_COUNT - 1), true);
  },
  away(sec: number) {
    store.set('lastSeen', Date.now() - sec * 1000);
    checkAway();
  },
  focus: (i: number) => focusCity(i, true),
  cityScreen: (i: number) => ({ x: cityPos(i).x, y: cityPos(i).y - camY }),
  idleRate: () => G.idleRate(S),
  awayCoins: (sec: number) => G.offlineEarnings(S, sec).coins,
  baseRate: () => G.baseRate(S),
  get theme() {
    return TH.id;
  },
  flush: flushMissions,
  save,
};
