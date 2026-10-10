import { describe, expect, it } from 'vitest';
import { LEVEL_COUNT, continueSim, createSim, flip, generateLevel, oracle, params, reachable, route, starsFor, step, type Level } from './game';

function run(sim: ReturnType<typeof createSim>, seconds: number) {
  const evs = [];
  for (let i = 0; i < seconds * 60 && sim.status === 'play'; i++) evs.push(...step(sim, 1 / 60));
  return evs;
}

/** Level 1 with a single custom train. */
function oneTrain(color: number, t = 0.1): Level {
  const lv = generateLevel(1);
  return { ...lv, goal: 1, trains: [{ t, tunnel: 0, color, speed: 2, target: -1 }] };
}

describe('simulation', () => {
  it('a train follows the switch to the station it points at', () => {
    const lv = oneTrain(0);
    const sw = lv.switches[0];
    const sim = createSim(lv);
    const stationOf = (state: number) => lv.net.edges[lv.net.nodes[sw].out[state]].to;
    // point the switch at the station with colour 0
    if (lv.net.nodes[stationOf(sim.sw[sw])].color !== 0) flip(sim, sw);
    const evs = run(sim, 20);
    expect(evs.some((e) => e.kind === 'deliver')).toBe(true);
    expect(sim.delivered).toBe(1);
    expect(sim.hearts).toBe(3);
    expect(sim.status).toBe('win');
  });

  it('a wrong station costs a heart', () => {
    const lv = oneTrain(0);
    const sw = lv.switches[0];
    const sim = createSim(lv);
    const stationOf = (state: number) => lv.net.edges[lv.net.nodes[sw].out[state]].to;
    if (lv.net.nodes[stationOf(sim.sw[sw])].color === 0) flip(sim, sw);
    const evs = run(sim, 20);
    expect(evs.some((e) => e.kind === 'wrong')).toBe(true);
    expect(sim.hearts).toBe(2);
    expect(sim.delivered).toBe(0);
  });

  it('flip only works on switches', () => {
    const lv = generateLevel(1);
    const sim = createSim(lv);
    const s = lv.switches[0];
    const before = sim.sw[s];
    expect(flip(sim, s)).toBe(true);
    expect(sim.sw[s]).toBe(1 - before);
    expect(flip(sim, 0)).toBe(false); // tunnel
  });

  it('two trains at the same spot crash and cost a heart', () => {
    const lv = generateLevel(1);
    const test: Level = { ...lv, goal: 5, trains: [{ t: 0.5, tunnel: 0, color: 0, speed: 1, target: -1 }, { t: 0.5, tunnel: 0, color: 1, speed: 1, target: -1 }] };
    const sim = createSim(test);
    const evs = run(sim, 2);
    expect(evs.filter((e) => e.kind === 'crash').length).toBe(1);
    expect(sim.hearts).toBe(2);
    expect(sim.trains.length).toBe(0);
  });

  it('a fast train rear-ends a slow one on the same track', () => {
    const lv = generateLevel(1);
    const test: Level = { ...lv, goal: 5, trains: [{ t: 0.1, tunnel: 0, color: 0, speed: 0.3, target: -1 }, { t: 1, tunnel: 0, color: 1, speed: 3, target: -1 }] };
    const sim = createSim(test);
    const evs = run(sim, 3);
    expect(evs.some((e) => e.kind === 'crash')).toBe(true);
  });

  it('loses at zero hearts and continue gives one heart back', () => {
    const lv = oneTrain(0);
    lv.trains.push({ t: 30, tunnel: 0, color: 0, speed: 2, target: -1 });
    const sim = createSim(lv, { hearts: 1 });
    const sw = lv.switches[0];
    const stationOf = (state: number) => lv.net.edges[lv.net.nodes[sw].out[state]].to;
    if (lv.net.nodes[stationOf(sim.sw[sw])].color === 0) flip(sim, sw);
    run(sim, 20);
    expect(sim.status).toBe('lose');
    continueSim(sim);
    expect(sim.status).toBe('play');
    expect(sim.hearts).toBe(1);
    flip(sim, sw);
    run(sim, 40);
    expect(sim.status).toBe('win');
  });

  it('stars follow hearts left', () => {
    expect(starsFor(3, false)).toBe(3);
    expect(starsFor(2, false)).toBe(2);
    expect(starsFor(1, false)).toBe(1);
    expect(starsFor(3, true)).toBe(1);
  });
});

describe('generator', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(generateLevel(42))).toBe(JSON.stringify(generateLevel(42)));
  });

  it('ramps up difficulty', () => {
    const a = params(1);
    const b = params(150);
    expect(a.colors).toBe(2);
    expect(b.colors).toBe(6);
    expect(b.stations).toBeGreaterThan(a.stations);
    expect(b.speed).toBeGreaterThan(a.speed);
    expect(b.goal).toBeGreaterThan(a.goal);
    expect(b.twoTunnels).toBe(true);
    expect(a.twoTunnels).toBe(false);
  });

  it('all 150 levels are valid and solvable', () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const lv = generateLevel(n);
      const { net } = lv;
      const tunnels = net.nodes.flatMap((nd, i) => (nd.kind === 'tunnel' ? [i] : []));
      const stations = net.nodes.flatMap((nd, i) => (nd.kind === 'station' ? [i] : []));
      // every station reachable from some tunnel; every colour has a station
      const reach = new Set(tunnels.flatMap((t) => reachable(net, t)));
      for (const s of stations) expect(reach.has(s), `level ${n} station ${s}`).toBe(true);
      expect(new Set(stations.map((s) => net.nodes[s].color)).size).toBe(lv.colors);
      // switches have exactly two branches
      for (const s of lv.switches) expect(net.nodes[s].out.length).toBe(2);
      // every train has a route to a station of its colour
      expect(lv.trains.length).toBeGreaterThanOrEqual(lv.goal + 2);
      for (const tr of lv.trains) {
        expect(net.nodes[tr.target].color).toBe(tr.color);
        expect(route(net, tr.tunnel, tr.target), `level ${n}`).not.toBeNull();
      }
      // perfect routing delivers everything with no crash and human-sized reaction gaps
      expect(oracle(lv), `level ${n}`).toBe(-1);
    }
  }, 60_000);
});
