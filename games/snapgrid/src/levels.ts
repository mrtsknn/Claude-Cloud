/** Runtime access to the shipped level pack (src/levels.json, see scripts/gen-levels.mts). */
import packed from './levels.json';
import { LEVEL_COUNT, generateDaily, unpackLevel, type LevelDef, type PackedLevel } from './adventure';

const PACK = packed as PackedLevel[];
const cache = new Map<string, LevelDef>();

export function getLevel(n: number): LevelDef {
  const i = Math.max(1, Math.min(LEVEL_COUNT, Math.floor(n)));
  const key = `L${i}`;
  let def = cache.get(key);
  if (!def) cache.set(key, (def = unpackLevel(i, PACK[i - 1])));
  return def;
}

/** Today's daily challenge (generated from the date; a few ms, memoised). */
export function dailyLevel(day: string): LevelDef {
  const key = `D${day}`;
  let def = cache.get(key);
  if (!def) cache.set(key, (def = generateDaily(day)));
  return def;
}
