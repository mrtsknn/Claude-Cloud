/**
 * Code-drawn pottery: the lathe profile is rendered as shaded scanlines (wet sheen or glossy
 * glaze), with throwing rings, painted ring bands and stamped patterns that rotate with the
 * wheel. Shared by the wheel stage, shelf thumbnails and the share image.
 */
import {
  PAINTS,
  ROWS,
  heightOf,
  radiusAt,
  ringAt,
  type Band,
  type Decor,
  type Profile,
} from './game';

export type Pattern = 'plain' | 'stripes' | 'dots' | 'speckle' | 'rim';
export interface Glaze { id: string; price: number; base: string; alt: string; pattern: Pattern }
export const GLAZES: Glaze[] = [
  { id: 'terracotta', price: 0, base: '#c0663d', alt: '#8e4528', pattern: 'plain' },
  { id: 'celadon', price: 150, base: '#8fbfa4', alt: '#5e8f76', pattern: 'plain' },
  { id: 'honey', price: 200, base: '#e0a43a', alt: '#a8701c', pattern: 'rim' },
  { id: 'cobalt', price: 300, base: '#f4efe6', alt: '#2c4fa3', pattern: 'stripes' },
  { id: 'speckle', price: 300, base: '#efe3cf', alt: '#6b5544', pattern: 'speckle' },
  { id: 'rose', price: 400, base: '#e6a0a4', alt: '#b5646c', pattern: 'rim' },
  { id: 'iznik', price: 500, base: '#f7f5f0', alt: '#1f6fb5', pattern: 'dots' },
  { id: 'obsidian', price: 800, base: '#2a2730', alt: '#d6aa45', pattern: 'rim' },
];
export const glazeById = (id: string) => GLAZES.find((g) => g.id === id) ?? GLAZES[0];

export const CLAY = { base: '#b9774f', dark: '#7a4529', light: '#e2a982' };

export function shade(c: string, k: number) {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export interface View { cx: number; base: number; potH: number; maxR: number }
export interface PotLook {
  glaze: Glaze | null;
  decor?: Decor | null;
  /** Wheel angle (rad): patterns and glints turn with it. */
  spin: number;
  /** 0..1 wet clay sheen. */
  wet?: number;
  /** Per-row throwing ring intensity. */
  rings?: number[];
  /** Horizontal sway of the top in px (wheel wobble). */
  wobble?: number;
}

// One unit gradient per colour (−1..1 in x), reused through a scale transform: cheap scanlines.
const gradCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();
function bodyGradient(ctx: CanvasRenderingContext2D, col: string, glossy: boolean, wet: number) {
  let m = gradCache.get(ctx);
  if (!m) gradCache.set(ctx, (m = new Map()));
  const key = `${col}|${glossy ? 1 : 0}|${wet.toFixed(1)}`;
  let g = m.get(key);
  if (g) return g;
  g = ctx.createLinearGradient(-1, 0, 1, 0);
  const spec = glossy ? 0.62 : 0.2 + 0.45 * wet;
  g.addColorStop(0, shade(col, -0.55));
  g.addColorStop(0.12, shade(col, -0.28));
  g.addColorStop(0.25, shade(col, glossy ? 0.18 : 0.1));
  g.addColorStop(0.31, shade(col, spec));
  g.addColorStop(0.355, shade(col, glossy ? 0.22 : 0.08 + 0.12 * wet));
  g.addColorStop(0.55, col);
  g.addColorStop(0.8, shade(col, -0.22));
  g.addColorStop(0.95, shade(col, -0.45));
  g.addColorStop(1, shade(col, -0.3));
  m.set(key, g);
  return g;
}

/** Draws a pot standing on `v.base`, centred on `v.cx`. */
export function drawPot(ctx: CanvasRenderingContext2D, v: View, p: Profile, o: PotLook) {
  const h = heightOf(p);
  const total = v.potH * h;
  const rowH = total / ROWS;
  const wet = o.wet ?? 0;
  const glaze = o.glaze;
  const decor = o.decor ?? null;
  const wob = o.wobble ?? 0;
  const xo = (y: number) => (wob * y) / Math.max(1, total);
  const step = total > 520 ? 2 : 1;
  for (let y = 0; y < total; y += step) {
    const rp = radiusAt(p, h, (y + step / 2) / v.potH) * v.maxR;
    if (rp <= 0) continue;
    const i = Math.min(ROWS - 1, Math.floor((y / total) * ROWS));
    let col = glaze ? glaze.base : CLAY.base;
    if (glaze?.pattern === 'stripes' && i % 10 >= 7) col = glaze.alt;
    if (glaze?.pattern === 'rim' && i >= ROWS - 5) col = glaze.alt;
    const ring = decor ? ringAt(decor, i) : -1;
    if (ring >= 0) col = PAINTS[ring];
    ctx.save();
    ctx.translate(v.cx + xo(y), 0);
    ctx.scale(rp, 1);
    ctx.fillStyle = bodyGradient(ctx, col, !!glaze, wet);
    ctx.fillRect(-1, v.base - y - step - 0.6, 2, step + 0.6);
    ctx.restore();
  }

  // throwing rings: fine ridges following the curvature (front arcs)
  if (o.rings) {
    const a = glaze ? 0.45 : 1;
    for (let i = 0; i < ROWS; i++) {
      const k = o.rings[i];
      if (k < 0.04) continue;
      const y = v.base - (i + 0.5) * rowH;
      const r = p[i] * v.maxR * 0.995;
      const ey = Math.max(1.2, r * 0.07);
      const x = v.cx + xo((i + 0.5) * rowH);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = `rgba(70,32,14,${0.3 * k * a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, ey, 0, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,236,218,${0.22 * k * a})`;
      ctx.beginPath();
      ctx.ellipse(x, y + 1.3, r, ey, 0, 0.15 * Math.PI, 0.6 * Math.PI);
      ctx.stroke();
    }
  }

  // glaze speckles / dots, or wet glints sliding round with the wheel (front half only)
  const marks = glaze ? (glaze.pattern === 'dots' ? 40 : glaze.pattern === 'speckle' ? 140 : 0) : wet > 0 ? 34 : 0;
  for (let k = 0; k < marks; k++) {
    const seed = Math.sin(k * 12.9898) * 43758.5453;
    const fr = seed - Math.floor(seed);
    const row = glaze?.pattern === 'dots' ? 8 + (k % 5) * 10 : Math.floor(fr * ROWS);
    if (row >= ROWS) continue;
    const ang = o.spin + k * 2.399;
    const c = Math.cos(ang);
    if (c <= 0.05) continue;
    const rp = p[row] * v.maxR;
    const y = v.base - (row + 0.5) * rowH;
    const x = v.cx + xo((row + 0.5) * rowH) + rp * Math.sin(ang);
    if (!glaze) {
      ctx.strokeStyle = `rgba(255,240,226,${(0.14 + 0.2 * wet) * c})`;
      ctx.lineWidth = k % 3 ? 1.2 : 2;
      ctx.beginPath();
      ctx.moveTo(x - rp * 0.2 * c, y);
      ctx.lineTo(x + rp * 0.2 * c, y);
      ctx.stroke();
    } else {
      ctx.fillStyle = glaze.alt;
      ctx.globalAlpha = 0.5 + 0.5 * c;
      ctx.beginPath();
      const s = glaze.pattern === 'dots' ? Math.min(7, v.maxR * 0.06) : 1.4;
      ctx.ellipse(x, y, s * c, s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  if (decor) for (const b of decor.b) if (b.k !== 'ring') stampBand(ctx, v, p, h, b, o.spin, xo);

  // top opening + rim highlight
  const top = p[ROWS - 1] * v.maxR;
  const ty = v.base - total;
  const tx = v.cx + wob;
  const ey = Math.max(2, top * 0.13);
  const rimCol = glaze ? glaze.alt : CLAY.dark;
  const ring = decor ? ringAt(decor, ROWS - 1) : -1;
  ctx.fillStyle = shade(ring >= 0 ? PAINTS[ring] : rimCol, -0.35);
  ctx.beginPath();
  ctx.ellipse(tx, ty + 1, top * 0.88, ey, 0, 0, Math.PI * 2);
  ctx.fill();
  // inner wall shadow
  ctx.fillStyle = 'rgba(30,12,4,0.28)';
  ctx.beginPath();
  ctx.ellipse(tx, ty + 1 + ey * 0.25, top * 0.7, ey * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = glaze ? 'rgba(255,255,255,0.45)' : `rgba(255,236,220,${0.3 + 0.3 * wet})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(tx, ty + 1, top * 0.93, ey * 1.08, 0, 0.05 * Math.PI, 0.95 * Math.PI);
  ctx.stroke();
}

const tri = (x: number) => 2 * Math.abs(2 * (x - Math.floor(x + 0.5))) - 1;

/** A stamped pattern band wrapped around the body, rotating with the wheel. */
function stampBand(ctx: CanvasRenderingContext2D, v: View, p: Profile, h: number, b: Band, spin: number, xo: (y: number) => number) {
  const rowH = (v.potH * h) / ROWS;
  const yMid = (b.r + b.h / 2) * rowH; // px above base
  const amp = Math.max(b.h * rowH * 0.3, v.maxR * 0.05);
  const col = PAINTS[b.c];
  const rAt = (yUp: number) => radiusAt(p, h, Math.max(0, yUp) / v.potH) * v.maxR * 0.995;
  const lw = Math.max(1.6, Math.min(5, Math.max(rowH * 0.9, v.maxR * 0.025)));
  ctx.lineCap = 'round';
  if (b.k === 'waves' || b.k === 'zigzag') {
    const n = 7;
    let px = 0;
    let py = 0;
    const steps = 64;
    for (let s = 0; s <= steps; s++) {
      const th = -Math.PI / 2 + (s / steps) * Math.PI;
      const phi = th - spin;
      const u = (phi * n) / (2 * Math.PI);
      const off = b.k === 'waves' ? Math.sin(u * 2 * Math.PI) : tri(u);
      const yUp = yMid + off * amp;
      const x = v.cx + xo(yUp) + rAt(yUp) * Math.sin(th);
      const y = v.base - yUp;
      if (s) {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.25 + 0.75 * Math.cos(th);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      px = x;
      py = y;
    }
    ctx.globalAlpha = 1;
    return;
  }
  const N = b.k === 'dots' ? 14 : 11;
  for (let j = 0; j < N * (b.k === 'dots' ? 2 : 1); j++) {
    const lane = b.k === 'dots' ? j % 2 : 0;
    const idx = b.k === 'dots' ? Math.floor(j / 2) : j;
    let th = (idx + lane * 0.5) * ((2 * Math.PI) / N) + spin;
    th = Math.atan2(Math.sin(th), Math.cos(th));
    const c = Math.cos(th);
    if (c <= 0.04) continue;
    const yUp = b.k === 'dots' ? yMid + (lane ? -amp * 0.55 : amp * 0.55) : yMid;
    const x = v.cx + xo(yUp) + rAt(yUp) * Math.sin(th);
    const y = v.base - yUp;
    ctx.globalAlpha = 0.35 + 0.65 * c;
    ctx.fillStyle = col;
    if (b.k === 'dots') {
      const s = Math.max(1.4, Math.min(amp * 0.5, Math.max(rowH * 1.4, v.maxR * 0.03)));
      ctx.beginPath();
      ctx.ellipse(x, y, s * c, s, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // leaves: alternating tilted leaf with a light midrib
      const s = Math.max(2.5, amp * 1.05);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(c, 1);
      ctx.rotate(j % 2 ? 0.75 : -0.75);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(s * 0.62, 0, 0, s);
      ctx.quadraticCurveTo(-s * 0.62, 0, 0, -s);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = Math.max(0.8, s * 0.12);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.8);
      ctx.lineTo(0, s * 0.8);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

/** Potter's wheel head with spokes and a wet sheen; `wobble` shifts it a hair. */
export function drawWheel(ctx: CanvasRenderingContext2D, v: View, spin: number, wobble = 0) {
  const wr = Math.min(v.maxR * 1.35, v.cx - 6);
  const cx = v.cx + wobble * 0.15;
  ctx.fillStyle = '#4e3f36';
  ctx.beginPath();
  ctx.ellipse(cx, v.base + 12, wr, 21, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(cx - wr, 0, cx + wr, 0);
  g.addColorStop(0, '#7a6556');
  g.addColorStop(0.35, '#a08877');
  g.addColorStop(0.5, '#8d7666');
  g.addColorStop(1, '#6b5749');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, v.base + 3, wr, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const a = spin * 0.5 + (k * Math.PI) / 4;
    if (Math.sin(a) < 0) continue;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * wr * 0.72, v.base + 3 + Math.sin(a) * 12.5);
    ctx.lineTo(cx + Math.cos(a) * wr * 0.95, v.base + 3 + Math.sin(a) * 16.5);
    ctx.stroke();
  }
  // slip sheen on the wheel head
  ctx.strokeStyle = 'rgba(255,240,228,0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, v.base + 3, wr * 0.88, 15, 0, 1.05 * Math.PI, 1.6 * Math.PI);
  ctx.stroke();
}

/** Wooden shelf plank (top at y). */
export function drawPlank(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, th = 12) {
  ctx.fillStyle = 'rgba(59,42,32,0.18)';
  ctx.fillRect(x + 4, y + th, w - 8, th * 0.9);
  const g = ctx.createLinearGradient(0, y, 0, y + th);
  g.addColorStop(0, '#c4935f');
  g.addColorStop(1, '#9a6c41');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, th);
  ctx.fillStyle = '#7d5532';
  ctx.fillRect(x, y + th, w, th * 0.55);
}

/** A view that fits a profile into a w×h box (bottom at `bottom`), as on screen (potH ≈ 2.6·maxR). */
export function fitView(p: Profile, cx: number, bottom: number, w: number, h: number): View {
  const K = 2.6;
  const widest = Math.max(...p, 0.3);
  const m = Math.min((w * 0.92) / (2 * widest), (h * 0.92) / (heightOf(p) * K));
  return { cx, base: bottom, potH: m * K, maxR: m };
}

/** Pot + soft contact shadow, fitted into a box. */
export function drawPotFit(ctx: CanvasRenderingContext2D, p: Profile, decor: Decor | null, x: number, y: number, w: number, h: number, spin = 0.6) {
  const v = fitView(p, x + w / 2, y + h, w, h);
  ctx.fillStyle = 'rgba(59,42,32,0.22)';
  ctx.beginPath();
  ctx.ellipse(v.cx, v.base + 1, p[0] * v.maxR * 1.15, Math.max(2, v.maxR * 0.06), 0, 0, Math.PI * 2);
  ctx.fill();
  drawPot(ctx, v, p, { glaze: decor ? glazeById(decor.g) : null, decor, spin });
  return v;
}

