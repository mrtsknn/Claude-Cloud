import './style.css';
import {
  createStore,
  haptic,
  interstitialMoment,
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
import { MAX_LEVEL, applyMove, balance, check, generateLevel, orderViolations, solve, stars, type Box, type Level, type Move, type Ship } from './game';
import { t } from './i18n';

// TODO(mağaza): gizlilik politikasını yayınladığın adresle değiştir.
const PRIVACY_URL = 'https://github.com/mrtsknn/Claude-Cloud/blob/main/games/liman/PRIVACY.md';
declare const __APP_VERSION__: string;

// Port colours in visit order; each also has its own icon (circle, triangle, square, star).
const PORTS = ['#f28c28', '#e9b200', '#22a06b', '#8e5cf7'];
const BAD = '#e11d48';
const INK = '#16324a';

// ───────────────────────── persistence ─────────────────────────
interface Save { level: number; ship: Ship; history: Ship[]; moves: number; undos: number; hints: number }

const store = createStore('liman');
const settings = store.get('settings', { sound: true, haptics: true });
setSoundEnabled(settings.sound);
setHapticsEnabled(settings.haptics);

/** Levels past 150 replay the 150 designed ones. */
const levelData = (level: number) => generateLevel(((level - 1) % MAX_LEVEL) + 1);
const freshLevel = (level: number): Save => ({ level, ship: levelData(level).ship, history: [], moves: 0, undos: 0, hints: 0 });

let S: Save = store.get<Save | null>('save', null) ?? freshLevel(1);
let lv: Level = levelData(S.level).lv;
let levelStartedAt = Date.now();
const save = () => store.set('save', S);

trackSession('liman');
track('level_start', { level: S.level, boxes: lv.boxes, resumed: S.moves > 0 });

// ───────────────────────── DOM ─────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const ctx = canvas.getContext('2d')!;

document.documentElement.lang = navigator.language.slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n as Parameters<typeof t>[0]);
});
$('version').textContent = `v${__APP_VERSION__}`;

let toastTimer = 0;
function toast(text: string, ms = 2200) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

function refreshHud() {
  $('level').textContent = String(S.level);
  $('hint-badge').textContent = S.hints === 0 ? '1' : 'AD';
  $('hint-badge').classList.toggle('ad', S.hints > 0);
  const sail = $<HTMLButtonElement>('sail-btn');
  sail.disabled = S.ship.dock.length > 0;
  sail.classList.toggle('ready', S.ship.dock.length === 0 && check(S.ship, lv).ok);
}

// ───────────────────────── layout ─────────────────────────
let W = 0;
let H = 0;
let dpr = 1;
const L = { bw: 0, bh: 0, colW: 0, colX: [] as number[], deckY: 0, waterY: 0, pivotX: 0, routeY: 0, dockTop: 0, dockBottom: 0, perRow: 1, gaugeY: 0, shipW: 0 };

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const n = lv.ncols;
  L.colW = Math.min(100, (W - 76) / n);
  L.bw = L.colW * 0.88;
  L.bh = L.bw * 0.6;
  L.perRow = Math.max(3, Math.floor((W - 24) / (L.bw + 8)));
  const dockRows = Math.ceil(lv.boxes / L.perRow);
  // Fit vertically: route + dock + gauge + stacks + hull/water.
  const need = 56 + dockRows * (L.bh + 10) + 30 + 78 + lv.height * L.bh + 110;
  if (need > H) {
    const k = Math.max(0.55, (H - 56 - 30 - 78 - 110) / (dockRows * (L.bh + 10) + lv.height * L.bh));
    L.bw *= Math.min(1, k);
    L.bh *= Math.min(1, k);
  }
  L.routeY = 26;
  // Spare height goes partly above the dock so the scene sits together, not split apart.
  L.dockTop = 56 + Math.max(0, H - need) * 0.35;
  L.dockBottom = L.dockTop + dockRows * (L.bh + 10) + 22;
  L.waterY = H - 64;
  L.deckY = L.waterY - 26;
  L.pivotX = W / 2;
  L.colX = Array.from({ length: n }, (_, c) => W / 2 + (c - (n - 1) / 2) * L.colW);
  L.shipW = n * L.colW + 30;
  L.gaugeY = Math.max(L.dockBottom + 48, L.deckY - lv.height * L.bh - 26);
}
window.addEventListener('resize', layout);
layout();

// ───────────────────────── animation state ─────────────────────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x: number) => {
  x = clamp01(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

type Sel = { kind: 'dock'; id: number } | { kind: 'col'; col: number } | null;
let selected: Sel = null;
let fly: { id: number; fx: number; fy: number; t0: number; dur: number } | null = null;
let tilt = 0;
let shakeAt = -1e9;
let sail: { t0: number } | null = null;
let winPending = false;
let hint: { move: Move; until: number } | null = null;
let tutorialMove: { key: string; move: Move | null } = { key: '', move: null };
let frozenAt: number | null = null;

const targetTilt = () => Math.max(-0.12, Math.min(0.12, balance(S.ship).diff * 0.03));

/** Ship-frame point → screen, applying the current list angle around the waterline pivot. */
function toScreen(x: number, y: number) {
  const dx = x - L.pivotX;
  const dy = y - L.waterY;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  return { x: L.pivotX + dx * c - dy * s, y: L.waterY + dx * s + dy * c };
}
function toShip(x: number, y: number) {
  const dx = x - L.pivotX;
  const dy = y - L.waterY;
  const c = Math.cos(-tilt);
  const s = Math.sin(-tilt);
  return { x: L.pivotX + dx * c - dy * s, y: L.waterY + dx * s + dy * c };
}
function dockSlot(i: number) {
  const row = Math.floor(i / L.perRow);
  const inRow = Math.min(L.perRow, lv.boxes - row * L.perRow);
  const col = i % L.perRow;
  return { x: W / 2 + (col - (inRow - 1) / 2) * (L.bw + 8), y: L.dockTop + 12 + row * (L.bh + 10) + L.bh / 2 };
}
/** Screen centre of a container, wherever it is. */
function boxPos(id: number) {
  const d = S.ship.dock.findIndex((b) => b.id === id);
  if (d >= 0) return dockSlot(d);
  for (let c = 0; c < S.ship.cols.length; c++) {
    const k = S.ship.cols[c].findIndex((b) => b.id === id);
    if (k >= 0) return toScreen(L.colX[c], L.deckY - (k + 0.5) * L.bh);
  }
  return { x: W / 2, y: H / 2 };
}

// ───────────────────────── drawing ─────────────────────────
function drawIcon(port: number, cx: number, cy: number, s: number, color = '#fff') {
  ctx.fillStyle = color;
  ctx.beginPath();
  switch ((port - 1) % 4) {
    case 0: ctx.arc(cx, cy, s * 0.45, 0, Math.PI * 2); break;
    case 1: ctx.moveTo(cx, cy - s * 0.52); ctx.lineTo(cx + s * 0.52, cy + s * 0.4); ctx.lineTo(cx - s * 0.52, cy + s * 0.4); break;
    case 2: ctx.rect(cx - s * 0.4, cy - s * 0.4, s * 0.8, s * 0.8); break;
    default:
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? s * 0.24 : s * 0.56;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
  }
  ctx.closePath();
  ctx.fill();
}

function drawBox(b: Box, cx: number, cy: number, bad: boolean, glow: boolean, now: number) {
  const w = L.bw;
  const h = L.bh * 0.9;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const color = PORTS[(b.port - 1) % PORTS.length];
  ctx.fillStyle = 'rgba(22,50,74,0.18)';
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 3, w, h, 5);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();
  // corrugation ribs
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 1; i < 6; i++) {
    const rx = x + (w * i) / 6;
    if (Math.abs(rx - cx) < h * 0.4) continue;
    ctx.moveTo(rx, y + 4);
    ctx.lineTo(rx, y + h - 4);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x + 3, y + 2, w - 6, 3);
  drawIcon(b.port, cx, cy, h * 0.5);
  // weight bars, bottom-right
  for (let i = 0; i < b.w; i++) {
    const bx = x + w - 7 - i * 5;
    ctx.fillStyle = 'rgba(22,50,74,0.75)';
    ctx.fillRect(bx, y + h - 6 - (i + 1) * 3, 3, (i + 1) * 3 + 2);
  }
  if (bad || glow) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    ctx.lineWidth = bad ? 3.5 : 3;
    ctx.strokeStyle = bad ? BAD : `rgba(255,255,255,${0.7 + 0.3 * pulse})`;
    ctx.beginPath();
    ctx.roundRect(x - 2, y - 2, w + 4, h + 4, 7);
    ctx.stroke();
    if (bad) {
      ctx.fillStyle = BAD;
      ctx.beginPath();
      ctx.arc(x + w, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w - 3, y - 3); ctx.lineTo(x + w + 3, y + 3);
      ctx.moveTo(x + w + 3, y - 3); ctx.lineTo(x + w - 3, y + 3);
      ctx.stroke();
    }
  }
}

function drawWater(now: number, speed: number) {
  const g = ctx.createLinearGradient(0, L.waterY, 0, H);
  g.addColorStop(0, '#2bb3c0');
  g.addColorStop(1, '#127a96');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, L.waterY + Math.sin(x / 26 + now / (700 / speed)) * 3);
  ctx.lineTo(W, H);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, L.waterY + 16 + Math.sin(x / 20 - now / (500 / speed)) * 2);
  ctx.stroke();
}

function drawRoute(current: number) {
  const n = lv.ports;
  const x0 = W / 2 - ((n - 1) / 2) * Math.min(80, (W - 80) / n);
  const step = Math.min(80, (W - 80) / n);
  ctx.strokeStyle = 'rgba(22,50,74,0.2)';
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(x0 - step * 0.7, L.routeY);
  ctx.lineTo(x0 + (n - 1) * step, L.routeY);
  ctx.stroke();
  ctx.setLineDash([]);
  // tiny ship marker at the start / current port
  const sx = current < 0 ? x0 - step * 0.7 : x0 + current * step;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(sx - 9, L.routeY + 9);
  ctx.lineTo(sx + 9, L.routeY + 9);
  ctx.lineTo(sx + 6, L.routeY + 14);
  ctx.lineTo(sx - 6, L.routeY + 14);
  ctx.fill();
  for (let p = 1; p <= n; p++) {
    const x = x0 + (p - 1) * step;
    const done = current >= p - 1;
    ctx.globalAlpha = current >= 0 && !done ? 0.45 : 1;
    ctx.fillStyle = PORTS[p - 1];
    ctx.beginPath();
    ctx.arc(x, L.routeY - 4, 13, 0, Math.PI * 2);
    ctx.fill();
    drawIcon(p, x, L.routeY - 4, 12);
    ctx.fillStyle = INK;
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(String(p), x, L.routeY + 11);
    ctx.globalAlpha = 1;
  }
}

function drawGauge(now: number) {
  const { left, right, diff } = balance(S.ship);
  const off = Math.abs(diff) > lv.tol;
  const x = W / 2;
  const y = L.gaugeY;
  const r = 30;
  const max = 6;
  const unit = Math.PI / 2 / max;
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(22,50,74,0.12)';
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.stroke();
  ctx.strokeStyle = '#22a06b';
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2 - Math.max(0.06, lv.tol * unit), -Math.PI / 2 + Math.max(0.06, lv.tol * unit));
  ctx.stroke();
  const a = -Math.PI / 2 + Math.max(-max, Math.min(max, diff)) * unit;
  const color = off ? BAD : INK;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4));
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '800 15px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillStyle = off && diff < 0 ? BAD : INK;
  ctx.fillText(String(left), x - r - 12, y - 6);
  ctx.textAlign = 'left';
  ctx.fillStyle = off && diff > 0 ? BAD : INK;
  ctx.fillText(String(right), x + r + 12, y - 6);
  if (off) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(now / 150);
    ctx.strokeStyle = BAD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 8, Math.PI, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.lineCap = 'butt';
}

function drawHull(listed: boolean) {
  const n = lv.ncols;
  const half = L.shipW / 2;
  const top = L.deckY;
  const bot = L.deckY + 50;
  ctx.fillStyle = listed ? '#c2414f' : '#24476b';
  ctx.beginPath();
  ctx.moveTo(L.pivotX - half - 14, top);
  ctx.lineTo(L.pivotX + half + 26, top - 12);
  ctx.lineTo(L.pivotX + half - 4, bot);
  ctx.lineTo(L.pivotX - half + 10, bot);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4fbfc';
  ctx.fillRect(L.pivotX - half - 8, top + 7, L.shipW + 22, 4);
  // deck slots: faint height-limit guides per column
  for (let c = 0; c < n; c++) {
    const x = L.colX[c] - L.bw / 2;
    ctx.strokeStyle = 'rgba(22,50,74,0.13)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, L.deckY - lv.height * L.bh, L.bw, lv.height * L.bh);
    ctx.setLineDash([]);
  }
  // centre mast: marks left/right halves
  ctx.strokeStyle = 'rgba(22,50,74,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L.pivotX, L.deckY + 2);
  ctx.lineTo(L.pivotX, L.deckY - lv.height * L.bh - 10);
  ctx.stroke();
}

function drawHand(x: number, y: number, now: number) {
  const bob = Math.sin(now / 220) * 6;
  ctx.font = `${Math.round(L.bh * 1.1)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('👆', x + 6, y + bob);
}

function frame(now: number) {
  if (frozenAt !== null) now = frozenAt;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // sail timeline: per port 1100 ms; boxes of the current port are craned off
  const PORT_MS = 1100;
  let portIdx = -1;
  let local = 0;
  let sailX = 0;
  if (sail) {
    const e = now - sail.t0;
    portIdx = Math.min(lv.ports - 1, Math.floor(e / PORT_MS));
    local = e - portIdx * PORT_MS;
    sailX = Math.sin(e / 300) * 3;
    if (e > lv.ports * PORT_MS + 200 && !winPending) {
      winPending = true;
      win();
    }
  }

  tilt += ((sail ? 0 : targetTilt()) - tilt) * 0.12;
  const shake = now - shakeAt < 420 ? Math.sin((now - shakeAt) / 25) * 6 * (1 - (now - shakeAt) / 420) : 0;
  const listed = Math.abs(balance(S.ship).diff) > lv.tol && !sail;

  drawRoute(sail ? portIdx : -1);

  // quay
  ctx.fillStyle = 'rgba(22,50,74,0.06)';
  ctx.beginPath();
  ctx.roundRect(12, L.dockTop, W - 24, L.dockBottom - L.dockTop - 10, 14);
  ctx.fill();
  if (selected?.kind === 'col') {
    ctx.strokeStyle = 'rgba(15,139,141,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawGauge(now);
  drawWater(now, sail ? 3 : 1);

  // port pier during sailing
  if (sail) {
    const k = ease(local / 300) - ease((local - 850) / 250);
    const px = W - 70 * k;
    ctx.fillStyle = '#8aa1b1';
    ctx.fillRect(px, L.waterY - 30, 80, 60);
    ctx.fillStyle = PORTS[portIdx];
    ctx.beginPath();
    ctx.arc(px + 30, L.waterY - 50, 14, 0, Math.PI * 2);
    ctx.fill();
    drawIcon(portIdx + 1, px + 30, L.waterY - 50, 13);
  }

  // ship (listed by balance)
  const bad = orderViolations(S.ship);
  ctx.save();
  ctx.translate(L.pivotX + shake + sailX, L.waterY);
  ctx.rotate(tilt);
  ctx.translate(-L.pivotX, -L.waterY);
  drawHull(listed);
  S.ship.cols.forEach((col, c) => {
    col.forEach((b, k) => {
      if (fly?.id === b.id) return;
      let y = L.deckY - (k + 0.5) * L.bh;
      if (sail) {
        if (b.port - 1 < portIdx) return;
        if (b.port - 1 === portIdx) {
          const u = ease((local - 350) / 500);
          if (u >= 1) return;
          y -= u * H * 0.5;
          ctx.globalAlpha = 1 - u;
          if (u > 0) {
            ctx.strokeStyle = 'rgba(22,50,74,0.5)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(L.colX[c], -H);
            ctx.lineTo(L.colX[c], y - L.bh / 2);
            ctx.stroke();
          }
        }
      }
      const isSel = selected?.kind === 'col' && selected.col === c && k === col.length - 1;
      drawBox(b, L.colX[c], y - (isSel ? L.bh * 0.3 : 0), bad.has(b.id), isSel, now);
      ctx.globalAlpha = 1;
    });
  });
  ctx.restore();

  // dock
  S.ship.dock.forEach((b, i) => {
    if (fly?.id === b.id) return;
    const p = dockSlot(i);
    const isSel = selected?.kind === 'dock' && selected.id === b.id;
    drawBox(b, p.x, p.y - (isSel ? L.bh * 0.3 : 0), false, isSel, now);
  });

  // crane: the moving container hangs from a cable
  if (fly) {
    const k = (now - fly.t0) / fly.dur;
    const to = boxPos(fly.id);
    const liftY = Math.min(fly.fy, to.y) - L.bh * 1.4;
    const x = fly.fx + (to.x - fly.fx) * easeInOut(k);
    const y = k < 0.3 ? fly.fy + (liftY - fly.fy) * ease(k / 0.3) : k < 0.7 ? liftY : liftY + (to.y - liftY) * easeInOut((k - 0.7) / 0.3);
    ctx.strokeStyle = 'rgba(22,50,74,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, y - L.bh / 2);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillRect(x - 10, 0, 20, 6);
    const box = [...S.ship.dock, ...S.ship.cols.flat()].find((b) => b.id === fly!.id);
    if (box) drawBox(box, x, y, false, false, now);
    if (k >= 1) {
      fly = null;
      landed();
    }
  }

  // hint / tutorial
  if (!fly && !sail && !winPending) {
    let m: Move | null = null;
    if (hint) {
      if (now > hint.until) hint = null;
      else m = hint.move;
    } else if (S.level === 1) {
      const key = JSON.stringify(S.ship);
      if (tutorialMove.key !== key) tutorialMove = { key, move: solve(S.ship, lv)?.[0] ?? null };
      m = tutorialMove.move;
    }
    if (m) {
      const selId = selected?.kind === 'dock' ? selected.id : selected?.kind === 'col' ? S.ship.cols[selected.col].at(-1)?.id : -1;
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.strokeStyle = `rgba(15,139,141,${0.4 + 0.5 * pulse})`;
      ctx.lineWidth = 3;
      let fx: number;
      let fy: number;
      if (selId !== m.id) {
        const p = boxPos(m.id);
        fx = p.x;
        fy = p.y;
        ctx.beginPath();
        ctx.roundRect(p.x - L.bw / 2 - 6, p.y - L.bh / 2 - 6, L.bw + 12, L.bh + 12, 9);
        ctx.stroke();
      } else if (m.to >= 0) {
        const p = toScreen(L.colX[m.to], L.deckY - (S.ship.cols[m.to].length + 0.5) * L.bh);
        fx = p.x;
        fy = p.y;
        ctx.beginPath();
        ctx.roundRect(p.x - L.bw / 2 - 6, p.y - L.bh / 2 - 6, L.bw + 12, L.bh + 12, 9);
        ctx.stroke();
      } else {
        fx = W / 2;
        fy = (L.dockTop + L.dockBottom) / 2;
        ctx.beginPath();
        ctx.roundRect(16, L.dockTop + 4, W - 32, L.dockBottom - L.dockTop - 18, 12);
        ctx.stroke();
      }
      if (S.level === 1 && !hint) drawHand(fx, fy + L.bh * 0.2, now);
    }
  }
  requestAnimationFrame(frame);
}

// ───────────────────────── game flow ─────────────────────────
function clank() {
  tone({ freq: 180, to: 90, duration: 0.09, type: 'square', volume: 0.22 });
  tone({ freq: 900, to: 600, duration: 0.05, type: 'triangle', volume: 0.12, delay: 0.01 });
}
function horn(fail = false) {
  const f = fail ? 98 : 131;
  tone({ freq: f, duration: fail ? 0.35 : 0.7, type: 'sawtooth', volume: 0.22 });
  tone({ freq: f * 1.5, duration: fail ? 0.35 : 0.7, type: 'sawtooth', volume: 0.12 });
}

function landed() {
  clank();
  haptic.light();
  refreshHud();
}

function doMove(m: Move) {
  const next = applyMove(S.ship, lv, m);
  if (!next) return false;
  const from = boxPos(m.id);
  S.history.push(S.ship);
  if (S.history.length > 80) S.history.shift();
  S.ship = next;
  S.moves++;
  save();
  selected = null;
  hint = null;
  fly = { id: m.id, fx: from.x, fy: from.y, t0: performance.now(), dur: 380 };
  tone({ freq: 300, to: 420, duration: 0.1, type: 'triangle', volume: 0.15 });
  return true;
}

function invalid() {
  haptic.error();
  tone({ freq: 150, to: 110, duration: 0.14, type: 'triangle', volume: 0.3 });
}

const busy = () => !!fly || !!sail || winPending;

function selectSound() {
  haptic.light();
  tone({ freq: 620, to: 760, duration: 0.06, type: 'triangle', volume: 0.2 });
}

/** target: a dock container id, a column index, or the dock area. */
function tap(target: { dock: number } | { col: number } | { area: true } | null) {
  if (busy()) return;
  if (!target) {
    selected = null;
    return;
  }
  if ('dock' in target) {
    if (selected?.kind === 'col') {
      if (!doMove({ id: S.ship.cols[selected.col].at(-1)!.id, to: -1 })) invalid();
      return;
    }
    if (selected?.kind === 'dock' && selected.id === target.dock) selected = null;
    else {
      selected = { kind: 'dock', id: target.dock };
      selectSound();
    }
    return;
  }
  if ('area' in target) {
    if (selected?.kind === 'col') doMove({ id: S.ship.cols[selected.col].at(-1)!.id, to: -1 });
    else selected = null;
    return;
  }
  const c = target.col;
  if (selected?.kind === 'dock') {
    if (!doMove({ id: selected.id, to: c })) invalid();
    return;
  }
  if (selected?.kind === 'col') {
    if (selected.col === c) selected = null;
    else if (!doMove({ id: S.ship.cols[selected.col].at(-1)!.id, to: c })) invalid();
    return;
  }
  if (S.ship.cols[c].length) {
    selected = { kind: 'col', col: c };
    selectSound();
  }
}

function hitTest(x: number, y: number): Parameters<typeof tap>[0] {
  for (let i = 0; i < S.ship.dock.length; i++) {
    const p = dockSlot(i);
    if (Math.abs(x - p.x) < L.bw / 2 + 4 && Math.abs(y - p.y) < L.bh / 2 + 6) return { dock: S.ship.dock[i].id };
  }
  if (y > L.dockTop && y < L.dockBottom) return { area: true };
  const s = toShip(x, y);
  if (s.y > L.deckY - lv.height * L.bh - L.bh * 1.5 && s.y < L.deckY + 50) {
    for (let c = 0; c < lv.ncols; c++) if (Math.abs(s.x - L.colX[c]) < L.colW / 2) return { col: c };
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const r = canvas.getBoundingClientRect();
  tap(hitTest(e.clientX - r.left, e.clientY - r.top));
});

$('sail-btn').addEventListener('click', () => {
  unlockAudio();
  if (busy() || S.ship.dock.length) return;
  const res = check(S.ship, lv);
  if (!res.ok) {
    const rule = !res.order && !res.balance ? 'both' : !res.order ? 'order' : 'balance';
    track('sail_fail', { level: S.level, rule });
    shakeAt = performance.now();
    horn(true);
    haptic.error();
    const btn = $('sail-btn');
    btn.classList.remove('fail');
    void btn.offsetWidth;
    btn.classList.add('fail');
    setTimeout(() => btn.classList.remove('fail'), 450);
    return;
  }
  selected = null;
  hint = null;
  sail = { t0: performance.now() };
  horn();
  haptic.medium();
  for (let p = 0; p < lv.ports; p++) setTimeout(() => { clank(); haptic.light(); }, p * 1100 + 450);
});

function win() {
  const st = stars(S.moves, lv.boxes, S.undos, S.hints);
  [0, 2, 4, 5, 7, 9].forEach((s, i) => tone({ freq: pentatonic(s), duration: 0.22, volume: 0.4, delay: i * 0.08 }));
  haptic.success();
  track('level_complete', { level: S.level, moves: S.moves, stars: st, hints: S.hints, duration_s: Math.round((Date.now() - levelStartedAt) / 1000) });
  $('win-title').textContent = t('levelN', { n: S.level });
  $('win-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= st ? '' : 'off'}">★</span>`).join('');
  $('win-moves').textContent = t('moves', { n: S.moves, p: lv.boxes });
  const completed = S.level;
  const best = store.get<Record<number, number>>('stars', {});
  best[completed] = Math.max(best[completed] ?? 0, st);
  store.set('stars', best);
  store.set('save', freshLevel(completed + 1));
  setTimeout(() => ($('win').hidden = false), 250);
  maybeRequestReview(completed, completed >= 8 && st >= 2);
}

function startLevel(state: Save) {
  S = state;
  lv = levelData(S.level).lv;
  save();
  selected = null;
  fly = null;
  sail = null;
  hint = null;
  winPending = false;
  levelStartedAt = Date.now();
  layout();
  tilt = targetTilt();
  refreshHud();
  $('toast').hidden = true;
  track('level_start', { level: S.level, boxes: lv.boxes, resumed: false });
}

$('next-btn').addEventListener('click', async () => {
  $('win').hidden = true;
  haptic.medium();
  const done = S.level;
  startLevel(freshLevel(done + 1));
  if (done >= 5) await interstitialMoment('next_level');
});

$('restart-btn').addEventListener('click', () => {
  unlockAudio();
  if (busy()) return;
  track('restart', { level: S.level, moves: S.moves });
  startLevel(freshLevel(S.level));
});

$('undo-btn').addEventListener('click', () => {
  unlockAudio();
  if (busy()) return;
  if (!S.history.length) return toast(t('noUndo'));
  S.ship = S.history.pop()!;
  S.undos++;
  selected = null;
  hint = null;
  save();
  refreshHud();
  haptic.light();
  tone({ freq: 500, to: 380, duration: 0.1, type: 'triangle', volume: 0.3 });
  track('undo', { level: S.level });
});

$('hint-btn').addEventListener('click', async () => {
  unlockAudio();
  if (busy()) return;
  // First hint in a level is free; more are behind a rewarded ad.
  if (S.hints > 0 && !(await showRewarded('hint'))) return;
  const moves = solve(S.ship, lv);
  if (!moves || !moves.length) return toast(t('noHint'));
  S.hints++;
  save();
  selected = null;
  hint = { move: moves[0], until: performance.now() + 4000 };
  refreshHud();
  haptic.light();
  track('hint', { level: S.level, n: S.hints });
});

// settings
for (const [id, k] of [['opt-sound', 'sound'], ['opt-haptics', 'haptics']] as const) {
  const el = $<HTMLInputElement>(id);
  el.checked = settings[k];
  el.addEventListener('change', () => {
    settings[k] = el.checked;
    setSoundEnabled(settings.sound);
    setHapticsEnabled(settings.haptics);
    store.set('settings', settings);
    if (k === 'haptics') haptic.medium();
  });
}
$('settings-btn').addEventListener('click', () => {
  unlockAudio();
  $('settings').hidden = false;
});
$('close-settings').addEventListener('click', () => ($('settings').hidden = true));
$('settings').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) $('settings').hidden = true;
});
$('privacy-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.open(PRIVACY_URL, '_blank');
});

// ───────────────────────── boot ─────────────────────────
tilt = targetTilt();
refreshHud();
void setupNative({
  darkBackground: false,
  onPause: save,
  onBack: () => {
    if (!$('settings').hidden) {
      $('settings').hidden = true;
      return true;
    }
    if (selected) {
      selected = null;
      return true;
    }
    return false;
  },
});
requestAnimationFrame(frame);

// Exposed for e2e/screenshot scripts.
(window as unknown as { __liman: unknown }).__liman = {
  get state() { return S; },
  get lv() { return lv; },
  solve: () => solve(S.ship, lv),
  busy,
  goto: (level: number) => startLevel(freshLevel(level)),
  load: (s: Save) => startLevel(s),
  freeze: (ms: number | null) => (frozenAt = ms === null ? null : performance.now() + ms),
  /** Screen points (canvas-relative) to tap a container or a column. */
  point: (target: { id: number } | { col: number } | 'dock') => {
    if (target === 'dock') return { x: 20, y: L.dockBottom - 6 };
    if ('id' in target) return boxPos(target.id);
    return toScreen(L.colX[target.col], L.deckY - L.bh * 0.5);
  },
};
