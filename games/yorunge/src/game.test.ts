import { describe, expect, it } from 'vitest';
import {
  FLY_SPEED,
  STEP,
  WORLD_W,
  continueRun,
  ensurePlanets,
  hitAngles,
  newGame,
  release,
  start,
  step,
  tangent,
  type GameEvent,
  type GameState,
} from './game';

const IPAD_VIEW = (WORLD_W * 1024) / 768; // shortest portrait view we support

function runUntil(s: GameState, pred: (e: GameEvent[]) => boolean, max = 1200) {
  for (let i = 0; i < max; i++) if (pred(step(s))) return true;
  return false;
}

function orbitAt(s: GameState, planet: number, angle: number) {
  ensurePlanets(s, planet + 6);
  s.sat.planet = planet;
  s.sat.flying = false;
  s.sat.angle = angle;
  s.camY = s.planets[planet].y;
}

describe('orbit', () => {
  it('rotates while waiting and stays on the ring', () => {
    const s = newGame(1);
    const a0 = s.sat.angle;
    step(s);
    const p = s.planets[0];
    expect(s.sat.angle - a0).toBeCloseTo(p.omega * STEP * s.sat.dir);
    expect(Math.hypot(s.sat.x - p.x, s.sat.y - p.y)).toBeCloseTo(p.ring);
  });

  it('cannot release before start', () => {
    const s = newGame(1);
    expect(release(s)).toBe(false);
    start(s);
    expect(release(s)).toBe(true);
    expect(release(s)).toBe(false);
  });

  it('releases along the tangent, perpendicular to the radius, in the direction of rotation', () => {
    for (const dir of [1, -1] as const) {
      const s = newGame(2);
      start(s);
      s.sat.dir = dir;
      s.sat.angle = 0.7;
      step(s);
      const p = s.planets[0];
      const before = { x: s.sat.x, y: s.sat.y };
      release(s);
      const rx = s.sat.x - p.x;
      const ry = s.sat.y - p.y;
      expect(Math.hypot(s.sat.vx, s.sat.vy)).toBeCloseTo(FLY_SPEED);
      expect(rx * s.sat.vx + ry * s.sat.vy).toBeCloseTo(0, 6);
      const tg = tangent(s.sat.angle, dir);
      expect(s.sat.vx / FLY_SPEED).toBeCloseTo(tg.x);
      // the satellite keeps moving the same way it was orbiting
      expect(Math.sign(rx * s.sat.vy - ry * s.sat.vx)).toBe(dir);
      step(s);
      expect(Math.hypot(s.sat.x - before.x, s.sat.y - before.y)).toBeCloseTo(FLY_SPEED * STEP, 3);
    }
  });
});

describe('capture', () => {
  it('snaps into the ring, sets rotation from the approach side, scores once', () => {
    for (const side of [1, -1]) {
      const s = newGame(3);
      start(s);
      const p = s.planets[1];
      s.sat.flying = true;
      // fly straight up, offset to one side of the planet centre
      s.sat.x = p.x + side * p.ring * 0.5;
      s.sat.y = p.y - p.ring - 30;
      s.sat.vx = 0;
      s.sat.vy = FLY_SPEED;
      let cap: GameEvent | undefined;
      runUntil(s, (ev) => !!(cap = ev.find((e) => e.type === 'capture')));
      expect(cap).toMatchObject({ type: 'capture', planet: 1, scored: true, perfect: false });
      expect(s.sat.flying).toBe(false);
      expect(Math.hypot(s.sat.x - p.x, s.sat.y - p.y)).toBeCloseTo(p.ring);
      // passing on the right while going up => counter-clockwise (y up)
      expect(s.sat.dir).toBe(side > 0 ? 1 : -1);
      expect(s.score).toBe(1);
    }
  });

  it('a central hit is perfect and builds a combo', () => {
    const s = newGame(4);
    start(s);
    for (const target of [1, 2]) {
      const p = s.planets[target];
      s.sat.flying = true;
      s.sat.x = p.x + 2;
      s.sat.y = p.y - p.ring - 10;
      s.sat.vx = 0;
      s.sat.vy = FLY_SPEED;
      runUntil(s, (ev) => ev.some((e) => e.type === 'capture'));
    }
    expect(s.combo).toBe(2);
    expect(s.score).toBe(2);
  });

  it('missing everything is game over; one continue respawns on the last planet', () => {
    const s = newGame(5);
    start(s);
    s.sat.flying = true;
    s.sat.vx = -FLY_SPEED;
    s.sat.vy = 0;
    expect(runUntil(s, (ev) => ev.some((e) => e.type === 'lost'))).toBe(true);
    expect(s.phase).toBe('over');
    expect(continueRun(s)).toBe(true);
    expect(s.phase).toBe('play');
    expect(s.sat.planet).toBe(0);
    expect(s.sat.flying).toBe(false);
    s.phase = 'over';
    expect(continueRun(s)).toBe(false);
  });

  it('collecting a star gives one extra point', () => {
    const s = newGame(6);
    start(s);
    s.stars.push({ x: 100, y: 50, taken: false });
    s.sat.flying = true;
    s.sat.x = 100;
    s.sat.y = 20;
    s.sat.vx = 0;
    s.sat.vy = FLY_SPEED;
    let got = false;
    for (let i = 0; i < 20; i++) got ||= step(s).some((e) => e.type === 'star');
    expect(got).toBe(true);
    expect(s.score).toBe(1);
  });
});

describe('generator', () => {
  it('is deterministic per seed', () => {
    const a = newGame(42);
    const b = newGame(42);
    ensurePlanets(a, 50);
    ensurePlanets(b, 50);
    expect(a.planets).toEqual(b.planets);
  });

  it('keeps rings apart, inside the screen and inside one view height', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = newGame(seed, IPAD_VIEW);
      ensurePlanets(s, 150);
      for (let i = 1; i < s.planets.length; i++) {
        const p = s.planets[i - 1];
        const q = s.planets[i];
        expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThan(p.ring + q.ring + 40);
        expect(q.y).toBeGreaterThan(p.y);
        expect(q.x - q.ring).toBeGreaterThan(0);
        expect(q.x + q.ring).toBeLessThan(WORLD_W);
        expect(q.y + q.ring - p.y).toBeLessThan(IPAD_VIEW * 0.75);
      }
    }
  });

  it('every next planet is reachable from some release angle (many seeds, early and late)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = newGame(seed * 7919, IPAD_VIEW);
      start(s);
      for (const i of [0, 1, 2, 3, 5, 8, 13, 20, 40, 75, 120]) {
        orbitAt(s, i, 0);
        const { hits, best } = hitAngles(s);
        // a fair window: at least 6 degrees of release angle
        expect(hits.length, `seed ${seed} planet ${i}`).toBeGreaterThanOrEqual(3);
        expect(best).not.toBeNull();
      }
    }
  }, 30_000);

  it('a full run of best releases keeps scoring', () => {
    const s = newGame(99, IPAD_VIEW);
    start(s);
    for (let n = 0; n < 25; n++) {
      const { best } = hitAngles(s);
      // one orbit tick lands exactly on `best`
      s.sat.angle = best! - s.sat.dir * s.planets[s.sat.planet].omega * STEP;
      step(s);
      release(s);
      expect(runUntil(s, (ev) => ev.some((e) => e.type === 'capture' || e.type === 'lost'))).toBe(true);
      expect(s.phase).toBe('play');
    }
    expect(s.reached).toBe(25);
  });
});
