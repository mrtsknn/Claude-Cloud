import { describe, expect, it } from 'vitest';
import {
  addTime, bark, BARK_CD, BARK_R, barkReady, botAct, createRushState, createState, dogStats, DOG_R, DOG_SPEED, DT, FEATURE_LEVEL,
  generateLevel, H, insidePen, KIND, LANE, LEVEL_COUNT, levelParams, pennedCount, reachable, RUSH_MISS_LIMIT, rushContinue,
  SHEEP_R, starsFor, step, UPGRADE_MAX, W, type Level, type State,
} from './game';

/** Runs the herding bot (one decision every 6 steps, like a player re-touching ~10×/s). */
function run(s: State, maxSec = 600, bot = true) {
  for (let i = 0; i < maxSec * 60 && !s.result; i++) {
    if (bot && i % 6 === 0) botAct(s);
    step(s);
  }
  return s;
}

/** An empty meadow with the given animals (for focused behaviour tests). */
function meadow(L: Partial<Level> & Pick<Level, 'animals'>): State {
  const base = generateLevel(1);
  return createState({ ...base, fences: [], circles: [], wolves: 0, button: null, level: 50, ...L });
}

describe('generator', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(generateLevel(37))).toBe(JSON.stringify(generateLevel(37)));
  });

  it('every level: right herd, animals outside pen and obstacles, everything reachable', () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const L = generateLevel(n);
      const P = levelParams(n);
      expect(L.animals.length).toBe(P.total);
      expect(L.animals.filter((a) => a.kind === 'black').length).toBe(P.black);
      expect(L.animals.filter((a) => a.kind === 'lamb').length).toBe(P.lambs);
      expect(L.animals.filter((a) => a.kind === 'goat').length).toBe(P.goats);
      expect(L.animals.filter((a) => a.kind === 'goose').length).toBe(P.geese);
      for (const a of L.animals) {
        expect(insidePen(L.pen, a, -SHEEP_R)).toBe(false);
        expect(a.x).toBeGreaterThan(0);
        expect(a.x).toBeLessThan(W);
        expect(a.y).toBeLessThan(H);
        for (const c of L.circles) if (c.kind !== 'mud') expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeGreaterThan(c.r + KIND[a.kind].r);
        if (a.kind === 'lamb') expect(L.animals[a.mother].kind).toBe('sheep');
      }
      expect(!!L.button).toBe(P.gate);
      expect(reachable(L.pen, L.fences, L.circles, [...L.animals, L.dog, ...(L.button ? [L.button] : [])])).toBe(true);
      expect(L.timeLimit).toBeGreaterThan(30);
    }
  });

  it('obstacles leave lanes (no dead-end pockets) to the side walls', () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const L = generateLevel(n);
      for (const c of L.circles) if (!c.hedge && c.kind !== 'mud') expect(Math.min(c.x - c.r, W - c.x - c.r)).toBeGreaterThanOrEqual(LANE - 0.01);
      for (const f of L.fences) expect(Math.min(f.a.x, f.b.x, W - f.a.x, W - f.b.x)).toBeGreaterThanOrEqual(LANE - 0.01);
    }
  });

  it('difficulty rises and each feature is introduced on its own level', () => {
    expect(levelParams(1).total).toBeLessThan(levelParams(120).total);
    expect(levelParams(100).wolves).toBeGreaterThan(0);
    expect(levelParams(100).black).toBeGreaterThan(0);
    const has = (n: number) => {
      const P = levelParams(n);
      return { lamb: P.lambs > 0, black: P.black > 0, mud: P.mud > 0, goat: P.goats > 0, wolf: P.wolves > 0, gate: P.gate, goose: P.geese > 0 };
    };
    for (const [f, lvl] of Object.entries(FEATURE_LEVEL)) {
      if (f === 'bark') continue;
      for (let n = 1; n < lvl; n++) expect([f, n, has(n)[f as keyof ReturnType<typeof has>]]).toEqual([f, n, false]);
      expect([f, has(lvl)[f as keyof ReturnType<typeof has>]]).toEqual([f, true]);
    }
  });
});

describe('fairness', () => {
  it('the bot herds every one of the 120 levels with at least 15 % of the time to spare', () => {
    const tight: string[] = [];
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const s = run(createState(generateLevel(n)), 999);
      const used = s.time / s.timeLimit;
      if (s.result !== 'win' || used > 0.85) tight.push(`L${n}: ${s.result} ${pennedCount(s)}/${s.sheep.length} ${s.time.toFixed(1)}/${s.timeLimit}s`);
    }
    expect(tight).toEqual([]);
  }, 180_000);
});

describe('simulation', () => {
  it('is deterministic for the same inputs', () => {
    const a = run(createState(generateLevel(41)), 20);
    const b = run(createState(generateLevel(41)), 20);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sheep flee from the dog', () => {
    const s = createState(generateLevel(1));
    const sh = s.sheep[0];
    s.dog.x = sh.x;
    s.dog.y = sh.y + 40;
    s.target = { x: s.dog.x, y: s.dog.y };
    const y0 = sh.y;
    for (let i = 0; i < 30; i++) step(s);
    expect(sh.y).toBeLessThan(y0 - 5);
  });

  it('the dog accelerates instead of teleporting to full speed', () => {
    const s = meadow({ animals: [{ x: 300, y: 200, kind: 'sheep', mother: -1 }] });
    s.dog.x = 100; s.dog.y = 500;
    s.target = { x: 300, y: 500 };
    step(s);
    expect(s.dog.vx).toBeGreaterThan(0);
    expect(s.dog.vx).toBeLessThan(DOG_SPEED * 0.4);
    for (let i = 0; i < 30; i++) step(s);
    expect(s.dog.vx).toBeGreaterThan(DOG_SPEED * 0.95);
  });

  it('black sheep is slower, geese are faster', () => {
    const speed = (kind: 'sheep' | 'black' | 'goose') => {
      const s = meadow({ animals: [{ x: W / 2, y: H / 2, kind, mother: -1 }] });
      s.dog.x = W / 2; s.dog.y = H / 2 + 30;
      s.target = { ...s.dog };
      for (let i = 0; i < 40; i++) step(s);
      return Math.hypot(s.sheep[0].x - W / 2, s.sheep[0].y - H / 2);
    };
    expect(speed('black')).toBeLessThan(speed('sheep'));
    expect(speed('goose')).toBeGreaterThan(speed('sheep'));
  });

  it('animals never pass through pen walls or ponds; dog stays out of the pen', () => {
    const s = run(createState(generateLevel(40)), 40);
    for (const sh of s.sheep) for (const c of s.circles) if (c.kind !== 'mud') expect(Math.hypot(sh.x - c.x, sh.y - c.y)).toBeGreaterThanOrEqual(c.r + KIND[sh.kind].r - 0.5);
    expect(insidePen(s.pen, s.dog, DOG_R)).toBe(false);
  });

  it('time runs out → lose; continue adds time', () => {
    const s = createState(generateLevel(3));
    run(s, 999, false);
    expect(s.result).toBe('lose');
    addTime(s);
    expect(s.result).toBe(null);
    for (let i = 0; i < 60; i++) step(s);
    expect(s.result).toBe(null);
  });

  it('stars by time left', () => {
    const s = createState(generateLevel(1));
    s.time = 0;
    expect(starsFor(s)).toBe(3);
    s.time = s.timeLimit * 0.7;
    expect(starsFor(s)).toBe(2);
    s.time = s.timeLimit * 0.95;
    expect(starsFor(s)).toBe(1);
  });
});

describe('bark', () => {
  it('scares animals inside the radius only, then needs a cooldown', () => {
    const s = meadow({ animals: [{ x: 180, y: 400, kind: 'sheep', mother: -1 }, { x: 180, y: 400 - BARK_R - 40, kind: 'sheep', mother: -1 }] });
    s.dog.x = 180; s.dog.y = 400 + 100; // outside the normal flee range of sheep 0
    s.target = { ...s.dog };
    expect(barkReady(s)).toBe(true);
    expect(bark(s)).toBe(true);
    expect(s.events).toContainEqual({ type: 'bark', scared: 1 });
    const y0 = s.sheep[0].y, y1 = s.sheep[1].y;
    for (let i = 0; i < 30; i++) step(s);
    expect(y0 - s.sheep[0].y).toBeGreaterThan(30);
    expect(Math.abs(y1 - s.sheep[1].y)).toBeLessThan(10);
    expect(bark(s)).toBe(false);
    for (let i = 0; i < BARK_CD / DT; i++) step(s);
    expect(barkReady(s)).toBe(true);
  });

  it('is learnt on level 3 (not available before) and chases wolves off', () => {
    expect(createState(generateLevel(FEATURE_LEVEL.bark - 1)).barkEnabled).toBe(false);
    expect(bark(createState(generateLevel(1)))).toBe(false);
    const s = createState(generateLevel(30));
    step(s);
    const w = s.wolves[0];
    s.dog.x = w.x + (w.x < W / 2 ? 90 : -90); s.dog.y = w.y;
    expect(bark(s)).toBe(true);
    expect(w.hidden).toBeGreaterThan(0);
  });
});

describe('new animals and obstacles', () => {
  it('goats hop over fences, sheep are stopped by them', () => {
    const fence = { a: { x: 80, y: 360 }, b: { x: 280, y: 360 } };
    const cross = (kind: 'sheep' | 'goat') => {
      const s = meadow({ fences: [fence], animals: [{ x: 180, y: 400, kind, mother: -1 }] });
      s.dog.x = 180; s.dog.y = 440;
      for (let i = 0; i < 120; i++) { s.target = { x: 180, y: s.sheep[0].y + 40 }; step(s); }
      return s.sheep[0].y;
    };
    expect(cross('sheep')).toBeGreaterThan(360);
    expect(cross('goat')).toBeLessThan(360);
  });

  it('mud slows the dog', () => {
    const dist = (mud: boolean) => {
      const s = meadow({ animals: [{ x: 300, y: 200, kind: 'sheep', mother: -1 }], circles: mud ? [{ x: 180, y: 400, r: 60, kind: 'mud' }] : [] });
      s.dog.x = 140; s.dog.y = 400;
      s.target = { x: 400, y: 400 };
      for (let i = 0; i < 20; i++) step(s);
      return s.dog.x - 140;
    };
    expect(dist(true)).toBeLessThan(dist(false) * 0.75);
  });

  it('a lamb follows its mother', () => {
    const s = meadow({ animals: [{ x: 120, y: 450, kind: 'sheep', mother: -1 }, { x: 140, y: 470, kind: 'lamb', mother: 0 }] });
    s.dog.x = 330; s.dog.y = 620;
    for (let i = 0; i < 60; i++) { s.sheep[0].x = 120 + i * 2; s.sheep[0].y = 450; step(s); }
    for (let i = 0; i < 120; i++) step(s);
    const [m, l] = s.sheep;
    expect(Math.hypot(m.x - l.x, m.y - l.y)).toBeLessThan(40);
  });

  it('the pen gate stays shut for animals until the dog steps on the button', () => {
    const L = generateLevel(FEATURE_LEVEL.gate);
    const s = createState(L);
    expect(s.gateOpen).toBe(false);
    const sh = s.sheep[0];
    sh.x = s.pen.gx; sh.y = s.pen.y + s.pen.h + 12;
    for (let i = 0; i < 90; i++) { sh.vy = -80; step(s); }
    expect(sh.penned).toBe(false);
    s.dog.x = L.button!.x; s.dog.y = L.button!.y;
    step(s);
    expect(s.gateOpen).toBe(true);
    expect(s.events).toContainEqual({ type: 'gate' });
  });
});

describe('dog upgrades', () => {
  it('each upgrade improves its stat and is capped at level 5', () => {
    const base = dogStats();
    const max = dogStats({ speed: UPGRADE_MAX, bark: UPGRADE_MAX, cd: UPGRADE_MAX });
    expect(max.speed).toBeGreaterThan(base.speed);
    expect(max.barkR).toBeGreaterThan(base.barkR);
    expect(max.barkCd).toBeLessThan(base.barkCd);
    expect(dogStats({ speed: 99, bark: 99, cd: 99 })).toEqual(max);
    expect(max.barkCd).toBeGreaterThan(2);
  });
});

describe('rush (endless)', () => {
  it('waves arrive, the bot pens a good number, missed animals end the run', () => {
    const s = createRushState();
    run(s, 900);
    expect(s.result).toBe('lose');
    expect(s.rush!.missed).toBe(RUSH_MISS_LIMIT);
    expect(s.rush!.wave).toBeGreaterThan(4);
    expect(s.rush!.score).toBeGreaterThan(8);
    expect(pennedCount(s)).toBe(s.rush!.score);
  }, 60_000);

  it('penned animals leave the pen; continue grants one more miss', () => {
    const s = createRushState();
    for (let i = 0; i < 60; i++) step(s);
    const a = s.sheep[0];
    a.x = s.pen.x + s.pen.w / 2; a.y = s.pen.y + s.pen.h / 2;
    step(s);
    expect(a.penned).toBe(true);
    expect(s.rush!.score).toBe(1);
    for (let i = 0; i < 120; i++) step(s);
    expect(s.sheep.includes(a)).toBe(false);
    s.rush!.missed = RUSH_MISS_LIMIT;
    s.result = 'lose';
    rushContinue(s);
    expect(s.result).toBe(null);
    expect(s.rush!.missed).toBe(RUSH_MISS_LIMIT - 1);
  });
});
