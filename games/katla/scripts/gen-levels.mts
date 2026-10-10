// Regenerates src/levels.json from the seeded generator.
// Usage: node --experimental-strip-types games/katla/scripts/gen-levels.mts
import { writeFileSync } from 'node:fs';
import { generateLevel, LEVEL_COUNT, packLevel } from '../src/game.ts';

const out = [];
for (let n = 1; n <= LEVEL_COUNT; n++) {
  const l = generateLevel(n);
  out.push(packLevel(l));
  if (n % 10 === 0) console.log(n, 'par', l.par, 'target', l.target.length);
}
// Stable sort by par so difficulty ramps smoothly (early levels keep their seeded order).
out.sort((a, b) => a.p - b.p);
writeFileSync(new URL('../src/levels.json', import.meta.url), JSON.stringify(out));
console.log('pars', out.map((l) => l.p).join(''));
