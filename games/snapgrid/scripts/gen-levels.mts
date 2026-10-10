// Regenerates src/levels.json (the 200 adventure levels) from the seeded generator.
// Every level is solved by the greedy bot before it is written; the piece limit is derived
// from the bot's piece count. Usage: node games/snapgrid/scripts/gen-levels.mts
import { writeFileSync } from 'node:fs';
import { LEVEL_COUNT, generate, levelSeed, levelSpec, packLevel } from '../src/adventure.ts';

const out = [];
const t0 = Date.now();
for (let n = 1; n <= LEVEL_COUNT; n++) {
  const def = generate(n, levelSeed(n), levelSpec(n));
  out.push(packLevel(def));
  if (n % 10 === 0 || n <= 10) {
    const goals = def.goals.map((g) => `${g.type}:${g.target}`).join(' ');
    console.log(String(n).padStart(3), goals.padEnd(22), 'bot', String(def.botUsed).padStart(2), 'limit', def.limit, 'fill', def.board.filter(Boolean).length);
  }
}
writeFileSync(new URL('../src/levels.json', import.meta.url), JSON.stringify(out));
console.log(`wrote ${out.length} levels in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
