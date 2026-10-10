/**
 * Code-drawn art: 30 bees, gift boxes, festival flowers and the four world backdrops.
 * Everything is plain canvas paths so the game ships without image assets.
 */
import type { Flower } from './game';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
export const beeHue = (l: number) => (42 + (l - 1) * 47) % 360;

export function hexPath(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    c.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  c.closePath();
}

function star(c: Ctx, x: number, y: number, r: number, points = 5, inner = 0.45) {
  c.beginPath();
  for (let k = 0; k < points * 2; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / points;
    const rr = k % 2 ? r * inner : r;
    c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  c.closePath();
}

export const FLOWER_COLORS: Record<Flower, { petal: string; center: string; hue: number }> = {
  tulip: { petal: '#ff4d6d', center: '#ffd23f', hue: 350 },
  lavender: { petal: '#9b7bff', center: '#d8c8ff', hue: 262 },
  sunflower: { petal: '#ffc61a', center: '#6b3a12', hue: 46 },
  daisy: { petal: '#ffffff', center: '#ffcc33', hue: 52 },
  blossom: { petal: '#ffb3cf', center: '#fff0f6', hue: 330 },
  poppy: { petal: '#ff5a2a', center: '#1d1420', hue: 14 },
};

export function drawFlower(c: Ctx, x: number, y: number, r: number, f: Flower) {
  const col = FLOWER_COLORS[f];
  c.save();
  c.translate(x, y);
  if (f === 'tulip') {
    c.fillStyle = col.petal;
    c.beginPath();
    c.moveTo(-r * 0.75, -r * 0.55);
    c.lineTo(-r * 0.35, -r * 0.1);
    c.lineTo(0, -r * 0.7);
    c.lineTo(r * 0.35, -r * 0.1);
    c.lineTo(r * 0.75, -r * 0.55);
    c.quadraticCurveTo(r * 0.85, r * 0.75, 0, r * 0.75);
    c.quadraticCurveTo(-r * 0.85, r * 0.75, -r * 0.75, -r * 0.55);
    c.fill();
  } else if (f === 'lavender') {
    c.fillStyle = col.petal;
    for (let k = 0; k < 7; k++) {
      const yy = r * 0.8 - k * r * 0.27;
      const w = r * (0.42 - k * 0.04);
      c.beginPath();
      c.ellipse(-w * 0.55, yy, w * 0.55, r * 0.17, -0.5, 0, TAU);
      c.ellipse(w * 0.55, yy, w * 0.55, r * 0.17, 0.5, 0, TAU);
      c.fill();
    }
  } else {
    const n = f === 'sunflower' ? 12 : f === 'daisy' ? 10 : f === 'blossom' ? 5 : 4;
    const pr = f === 'poppy' ? 0.62 : f === 'blossom' ? 0.5 : 0.4;
    c.fillStyle = col.petal;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      c.beginPath();
      c.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * pr, r * pr * (f === 'poppy' || f === 'blossom' ? 0.95 : 0.42), a, 0, TAU);
      c.fill();
    }
    c.fillStyle = col.center;
    c.beginPath();
    c.arc(0, 0, r * (f === 'sunflower' ? 0.42 : 0.3), 0, TAU);
    c.fill();
  }
  c.restore();
}

export interface BeeOpts {
  /** Level number badge (default on). */
  badge?: boolean;
  /** Festival bee: flower tint + flower on the head. */
  flower?: Flower;
}

/** One bee of `level` (1–30) centred on (x, y), sized for a hex cell of radius R. */
export function drawBee(c: Ctx, x: number, y: number, R: number, level: number, time: number, o: BeeOpts = {}) {
  const s = R * (0.6 + Math.min(level, 30) * 0.006);
  const hue = o.flower ? FLOWER_COLORS[o.flower].hue : beeHue(level);
  const flap = Math.sin(time * 18 + level) * 0.25;
  const celestial = level >= 21 && !o.flower;
  const ink = `hsl(${hue},60%,16%)`;
  c.save();
  c.translate(x, y);

  // ── auras behind the bee (top tiers) ──
  if (level >= 15 && level < 21 && !o.flower) {
    c.strokeStyle = `hsla(${hue},100%,78%,.85)`;
    c.lineWidth = s * 0.08;
    c.beginPath();
    c.arc(0, 0, s * 0.88, 0, TAU);
    c.stroke();
  }
  if (celestial) drawAura(c, s, level, hue, time);

  // ── wings ──
  const wingPairs = celestial ? 2 : 1;
  for (let p = wingPairs - 1; p >= 0; p--) {
    const sc = p ? 0.72 : 1;
    c.fillStyle = celestial ? `hsla(${(hue + 40 * p) % 360},90%,${p ? 85 : 92}%,.85)` : 'rgba(255,255,255,.8)';
    c.strokeStyle = celestial ? `hsla(${hue},70%,40%,.6)` : 'rgba(40,40,60,.35)';
    c.lineWidth = Math.max(1, s * 0.04);
    for (const side of [-1, 1]) {
      c.save();
      c.translate(side * s * (0.2 + p * 0.14), -s * (0.42 - p * 0.18));
      c.rotate(side * (0.5 + p * 0.55 + flap));
      c.beginPath();
      if (level === 21 && !o.flower) {
        // crystal: faceted diamond wing
        c.moveTo(0, s * 0.05);
        c.lineTo(-s * 0.24 * sc, -s * 0.24 * sc);
        c.lineTo(0, -s * 0.62 * sc);
        c.lineTo(s * 0.24 * sc, -s * 0.24 * sc);
        c.closePath();
      } else c.ellipse(0, -s * 0.22 * sc, s * 0.22 * sc, s * 0.36 * sc, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.restore();
    }
  }

  // comet tail
  if (level === 26 && !o.flower) {
    const g = c.createLinearGradient(-s * 1.4, 0, -s * 0.4, 0);
    g.addColorStop(0, `hsla(${hue},100%,70%,0)`);
    g.addColorStop(1, `hsla(${hue},100%,75%,.9)`);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-s * 0.45, -s * 0.35);
    c.quadraticCurveTo(-s * 1.2, -s * 0.2 + Math.sin(time * 4) * s * 0.08, -s * 1.45, 0);
    c.quadraticCurveTo(-s * 1.2, s * 0.2, -s * 0.45, s * 0.35);
    c.fill();
  }

  // ── antennae ──
  if (level >= 11 || o.flower) {
    c.strokeStyle = ink;
    c.lineWidth = Math.max(1, s * 0.05);
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * s * 0.12, -s * 0.42);
      c.quadraticCurveTo(side * s * 0.2, -s * 0.7, side * s * 0.34, -s * 0.74);
      c.stroke();
      c.fillStyle = celestial ? `hsl(${(hue + 180) % 360},100%,75%)` : ink;
      c.beginPath();
      c.arc(side * s * 0.34, -s * 0.74, s * (celestial ? 0.07 : 0.05), 0, TAU);
      c.fill();
    }
  }

  // ── body ──
  c.beginPath();
  c.ellipse(0, 0, s * 0.62, s * 0.5, 0, 0, TAU);
  if (celestial) {
    const g = c.createRadialGradient(-s * 0.2, -s * 0.2, s * 0.05, 0, 0, s * 0.7);
    g.addColorStop(0, `hsl(${hue},100%,86%)`);
    g.addColorStop(1, `hsl(${hue},80%,52%)`);
    c.fillStyle = g;
  } else c.fillStyle = `hsl(${hue},85%,${level === 20 ? 62 : 58}%)`;
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = ink;
  const stripes = 1 + (level % 3);
  for (let k = 0; k < stripes; k++) c.fillRect(-s * 0.05 + (k - (stripes - 1) / 2) * s * 0.3, -s, s * 0.13, s * 2);
  if (level > 10) {
    c.fillStyle = 'rgba(255,255,255,.6)';
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      c.arc(-s * 0.35 + k * s * 0.24, s * 0.28 * (k % 2 ? 1 : -1), s * 0.06, 0, TAU);
      c.fill();
    }
  }
  // highlight
  c.fillStyle = 'rgba(255,255,255,.28)';
  c.beginPath();
  c.ellipse(-s * 0.18, -s * 0.26, s * 0.3, s * 0.12, -0.3, 0, TAU);
  c.fill();
  c.restore();
  c.lineWidth = Math.max(1.5, s * 0.07);
  c.strokeStyle = ink;
  c.beginPath();
  c.ellipse(0, 0, s * 0.62, s * 0.5, 0, 0, TAU);
  c.stroke();

  // ── emblem on the body (top tiers) ──
  if (!o.flower) drawEmblem(c, s, level, hue);

  // eyes with a highlight
  for (const ex of [-0.2, 0.2]) {
    c.fillStyle = '#1b1426';
    c.beginPath();
    c.arc(s * ex, -s * 0.08, s * 0.08, 0, TAU);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(s * ex + s * 0.025, -s * 0.105, s * 0.025, 0, TAU);
    c.fill();
  }

  // ── headwear ──
  if (o.flower) drawFlower(c, 0, -s * 0.62, s * 0.3, o.flower);
  else drawHeadwear(c, s, level, hue, time);

  // level badge
  if (o.badge !== false) {
    const br = Math.max(7, R * 0.22);
    const bx = R * 0.5;
    const by = R * 0.42;
    c.fillStyle = 'rgba(20,12,4,.78)';
    c.beginPath();
    c.arc(bx, by, br, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.9)';
    c.lineWidth = Math.max(1, br * 0.14);
    c.stroke();
    c.fillStyle = '#fff';
    c.font = `800 ${Math.max(9, br * 1.15)}px ui-rounded, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(level), bx, by + br * 0.06);
  }
  c.restore();
}

function drawAura(c: Ctx, s: number, level: number, hue: number, time: number) {
  if (level === 25) {
    // aurora: rainbow ring
    const g = 'createConicGradient' in c ? c.createConicGradient(time, 0, 0) : null;
    if (g) {
      for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, `hsla(${k * 60},100%,70%,.75)`);
      c.strokeStyle = g;
    } else c.strokeStyle = `hsla(${hue},100%,70%,.75)`;
    c.lineWidth = s * 0.12;
    c.beginPath();
    c.arc(0, 0, s * 0.9, 0, TAU);
    c.stroke();
    return;
  }
  if (level === 27) {
    // nebula cloud
    for (let k = 0; k < 5; k++) {
      const a = time * 0.6 + (k * TAU) / 5;
      c.fillStyle = `hsla(${(hue + k * 30) % 360},80%,65%,.28)`;
      c.beginPath();
      c.arc(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.45, s * 0.42, 0, TAU);
      c.fill();
    }
    return;
  }
  if (level === 24 || level === 30) {
    // orbiting stars
    const n = level === 30 ? 6 : 4;
    c.fillStyle = level === 30 ? '#ffe680' : `hsl(${(hue + 180) % 360},100%,80%)`;
    for (let k = 0; k < n; k++) {
      const a = time * 1.4 + (k * TAU) / n;
      star(c, Math.cos(a) * s * 0.95, Math.sin(a) * s * 0.8, s * 0.12);
      c.fill();
    }
  }
  if (level >= 28) {
    c.strokeStyle = level === 30 ? 'rgba(255,214,90,.9)' : `hsla(${hue},100%,80%,.8)`;
    c.lineWidth = s * 0.07;
    c.setLineDash([s * 0.18, s * 0.1]);
    c.beginPath();
    c.arc(0, 0, s * 0.92, time * 0.5, time * 0.5 + TAU);
    c.stroke();
    c.setLineDash([]);
  } else {
    c.strokeStyle = `hsla(${hue},100%,80%,.7)`;
    c.lineWidth = s * 0.06;
    c.beginPath();
    c.arc(0, 0, s * 0.88, 0, TAU);
    c.stroke();
  }
}

function drawEmblem(c: Ctx, s: number, level: number, hue: number) {
  if (level === 22) {
    // storm bolt
    c.fillStyle = '#fff36b';
    c.strokeStyle = 'rgba(0,0,0,.4)';
    c.lineWidth = s * 0.03;
    c.beginPath();
    c.moveTo(s * 0.12, -s * 0.38);
    c.lineTo(-s * 0.12, s * 0.04);
    c.lineTo(s * 0.04, s * 0.04);
    c.lineTo(-s * 0.1, s * 0.4);
    c.lineTo(s * 0.18, -s * 0.06);
    c.lineTo(s * 0.02, -s * 0.06);
    c.closePath();
    c.fill();
    c.stroke();
  } else if (level === 28) {
    // shield
    c.fillStyle = `hsl(${(hue + 180) % 360},70%,60%)`;
    c.strokeStyle = '#fff';
    c.lineWidth = s * 0.04;
    c.beginPath();
    c.moveTo(0, s * 0.05);
    c.lineTo(s * 0.2, s * 0.12);
    c.quadraticCurveTo(s * 0.2, s * 0.38, 0, s * 0.45);
    c.quadraticCurveTo(-s * 0.2, s * 0.38, -s * 0.2, s * 0.12);
    c.closePath();
    c.fill();
    c.stroke();
  }
}

function crown(c: Ctx, s: number, w: number, h: number, fill: string, gems: string[]) {
  c.fillStyle = fill;
  c.strokeStyle = 'rgba(90,50,0,.6)';
  c.lineWidth = s * 0.03;
  c.beginPath();
  c.moveTo(-s * w, -s * 0.45);
  c.lineTo(-s * w, -s * (0.45 + h));
  c.lineTo(-s * w * 0.5, -s * (0.45 + h * 0.55));
  c.lineTo(0, -s * (0.45 + h * 1.1));
  c.lineTo(s * w * 0.5, -s * (0.45 + h * 0.55));
  c.lineTo(s * w, -s * (0.45 + h));
  c.lineTo(s * w, -s * 0.45);
  c.closePath();
  c.fill();
  c.stroke();
  gems.forEach((g, k) => {
    c.fillStyle = g;
    c.beginPath();
    c.arc((k - (gems.length - 1) / 2) * s * w * 0.6, -s * (0.45 + h * 0.3), s * 0.05, 0, TAU);
    c.fill();
  });
}

function drawHeadwear(c: Ctx, s: number, level: number, hue: number, time: number) {
  if (level === 20) crown(c, s, 0.3, 0.3, '#ffd23f', []);
  else if (level === 23) {
    // crescent moon
    c.fillStyle = '#fff6c8';
    c.beginPath();
    c.arc(0, -s * 0.66, s * 0.2, 0, TAU);
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(s * 0.09, -s * 0.71, s * 0.17, 0, TAU);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  } else if (level === 25 || level === 27) {
    crown(c, s, 0.24, 0.22, `hsl(${hue},90%,80%)`, ['#ffffff']);
  } else if (level === 29) {
    // flower crown (eternal bloom)
    const cols = ['#ff7aa8', '#ffd23f', '#9b7bff', '#7fe0b5', '#ff9d5c'];
    cols.forEach((col, k) => {
      const a = Math.PI + 0.35 + (k * (Math.PI - 0.7)) / 4;
      c.fillStyle = col;
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * TAU + time;
        c.beginPath();
        c.arc(Math.cos(a) * s * 0.5 + Math.cos(pa) * s * 0.06, Math.sin(a) * s * 0.42 - s * 0.05 + Math.sin(pa) * s * 0.06, s * 0.055, 0, TAU);
        c.fill();
      }
    });
  } else if (level === 30) {
    crown(c, s, 0.36, 0.42, '#ffd23f', ['#ff4d6d', '#5fd0ff', '#7fe0b5']);
  }
}

export function drawGift(c: Ctx, x: number, y: number, R: number, time: number) {
  const s = R * 0.62;
  c.save();
  c.translate(x, y);
  c.rotate(Math.sin(time * 6) * 0.08);
  c.fillStyle = '#ff6b8b';
  c.beginPath();
  c.roundRect(-s * 0.6, -s * 0.35, s * 1.2, s * 0.95, s * 0.12);
  c.fill();
  c.fillStyle = '#ff8fa6';
  c.beginPath();
  c.roundRect(-s * 0.7, -s * 0.55, s * 1.4, s * 0.3, s * 0.1);
  c.fill();
  c.fillStyle = '#fff2b0';
  c.fillRect(-s * 0.1, -s * 0.55, s * 0.2, s * 1.15);
  c.beginPath();
  c.ellipse(-s * 0.2, -s * 0.66, s * 0.2, s * 0.12, -0.4, 0, TAU);
  c.ellipse(s * 0.2, -s * 0.66, s * 0.2, s * 0.12, 0.4, 0, TAU);
  c.fill();
  c.restore();
}

// ───────── world backdrops ─────────
export const WORLD_SKY: Record<string, [string, string]> = {
  meadow: ['rgba(140,220,255,.20)', 'rgba(120,200,90,.10)'],
  orchard: ['rgba(255,200,150,.22)', 'rgba(150,200,90,.10)'],
  forest: ['rgba(90,170,120,.22)', 'rgba(30,80,50,.18)'],
  mountain: ['rgba(170,190,255,.25)', 'rgba(90,100,140,.16)'],
};

/** Paints a world's scenery into a W×H area (rounded window, translucent so themes show). */
export function drawWorld(c: Ctx, id: string, W: number, H: number) {
  c.save();
  c.beginPath();
  c.roundRect(0, 0, W, H, 22);
  c.clip();
  const [top, bottom] = WORLD_SKY[id] ?? WORLD_SKY.meadow;
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  let seed = id.length * 97 + 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const hill = (y: number, amp: number, col: string, waves = 2) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) c.lineTo(x, y + Math.sin((x / W) * Math.PI * waves + y) * amp);
    c.lineTo(W, H);
    c.fill();
  };
  if (id === 'meadow') {
    const sr = Math.min(W, H) * 0.22;
    const sun = c.createRadialGradient(W * 0.84, H * 0.08, 0, W * 0.84, H * 0.08, sr);
    sun.addColorStop(0, 'rgba(255,236,150,.45)');
    sun.addColorStop(0.25, 'rgba(255,220,120,.22)');
    sun.addColorStop(1, 'rgba(255,220,120,0)');
    c.fillStyle = sun;
    c.fillRect(0, 0, W, H);
    hill(H * 0.8, H * 0.03, 'rgba(120,200,90,.30)');
    hill(H * 0.88, H * 0.02, 'rgba(90,170,70,.40)', 3);
    const cols = ['#ff7aa8', '#ffd23f', '#ffffff', '#b9a4ff'];
    for (let k = 0; k < 26; k++) {
      c.fillStyle = cols[k % cols.length];
      c.globalAlpha = 0.6;
      c.beginPath();
      c.arc(rnd() * W, H * 0.86 + rnd() * H * 0.13, 2 + rnd() * 2.5, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
  } else if (id === 'orchard') {
    hill(H * 0.86, H * 0.02, 'rgba(140,190,80,.35)');
    for (let k = 0; k < 6; k++) {
      const x = (k + 0.5) * (W / 6) + (rnd() - 0.5) * 16;
      const y = H * (0.8 + rnd() * 0.06);
      const r = Math.min(W, H) * (0.07 + rnd() * 0.03);
      c.fillStyle = 'rgba(110,70,40,.45)';
      c.fillRect(x - r * 0.12, y, r * 0.24, r * 1.4);
      c.fillStyle = 'rgba(90,170,80,.45)';
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(255,90,90,.75)';
      for (let f = 0; f < 4; f++) {
        c.beginPath();
        c.arc(x + (rnd() - 0.5) * r * 1.3, y + (rnd() - 0.5) * r * 1.2, r * 0.14, 0, TAU);
        c.fill();
      }
    }
  } else if (id === 'forest') {
    for (const [base, col, n] of [
      [0.84, 'rgba(40,110,70,.35)', 9],
      [0.92, 'rgba(25,80,50,.5)', 7],
    ] as [number, string, number][]) {
      c.fillStyle = col;
      for (let k = 0; k < n; k++) {
        const x = (k + rnd()) * (W / n);
        const h = H * (0.12 + rnd() * 0.08);
        const w = h * 0.45;
        c.beginPath();
        c.moveTo(x, H * base - h);
        c.lineTo(x + w, H * base + 4);
        c.lineTo(x - w, H * base + 4);
        c.fill();
      }
      c.fillRect(0, H * base, W, H);
    }
    c.fillStyle = 'rgba(255,255,200,.18)';
    for (let k = 0; k < 14; k++) {
      c.beginPath();
      c.arc(rnd() * W, rnd() * H * 0.7, 1.5 + rnd() * 1.5, 0, TAU);
      c.fill();
    }
  } else {
    for (const [base, col, snow] of [
      [0.62, 'rgba(120,130,170,.35)', true],
      [0.78, 'rgba(80,90,130,.45)', false],
    ] as [number, string, boolean][]) {
      let x = -W * 0.1;
      while (x < W * 1.1) {
        const w = W * (0.22 + rnd() * 0.16);
        const h = H * (0.14 + rnd() * 0.12);
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(x - w * 0.25, H);
        c.lineTo(x + w / 2, H * base - h);
        c.lineTo(x + w * 1.25, H);
        c.fill();
        if (snow) {
          c.fillStyle = 'rgba(255,255,255,.45)';
          c.beginPath();
          const top = H * base - h;
          const d = h * 0.4;
          const hw = (0.75 * w * d) / (H - top);
          c.moveTo(x + w / 2, top);
          c.lineTo(x + w / 2 + hw, top + d);
          c.lineTo(x + w / 2 + hw * 0.3, top + d * 0.8);
          c.lineTo(x + w / 2 - hw * 0.2, top + d);
          c.lineTo(x + w / 2 - hw, top + d * 0.85);
          c.fill();
        }
        x += w * 0.7;
      }
    }
  }
  c.restore();
}
