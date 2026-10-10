/**
 * Build meta (Royal Match / Gardenscapes model): level wins earn stars; stars are spent on the
 * tasks of the current area, in any order. When every task of an area is done the area reward
 * (coins + card packs) can be claimed and the next area opens. Data-driven: each game supplies
 * its areas (ids, task ids, star costs, rewards) and the layered SVG art (see ui.ts).
 */
import { track } from '../analytics';
import { int, persisted, type StoreOptions } from './persist';

export interface BuildTask {
  id: string;
  /** Stars to build it (1–3 recommended). */
  cost: number;
}

export interface BuildArea {
  id: string;
  tasks: BuildTask[];
  reward: { coins: number; packs?: number };
}

export interface BuildOptions extends StoreOptions {
  areas: BuildArea[];
}

interface BuildState {
  stars: number;
  /** Index of the area being built (= areas.length when everything is built). */
  area: number;
  /** Task ids finished in the current area. */
  done: string[];
  /** Total stars ever earned (analytics, "all done" screens). */
  earned: number;
}

export function createBuild(o: BuildOptions) {
  const areas = o.areas;
  const db = persisted<BuildState>(o, 'build');
  const raw = db.load();
  const s: BuildState = {
    stars: int(raw?.stars, 0),
    area: int(raw?.area, 0, 0, areas.length),
    done: [],
    earned: int(raw?.earned, 0),
  };
  const known = new Set(areas[s.area]?.tasks.map((t) => t.id) ?? []);
  s.done = Array.isArray(raw?.done) ? [...new Set((raw!.done as unknown[]).filter((id): id is string => typeof id === 'string' && known.has(id)))] : [];
  const save = () => db.save(s);

  const api = {
    areas,
    onChange: db.onChange,
    get stars() {
      return s.stars;
    },
    get earned() {
      return s.earned;
    },
    /** 0-based index of the current area (areas.length when all are built). */
    get areaIndex() {
      return s.area;
    },
    /** The area being built, or null when every area is finished. */
    area(): BuildArea | null {
      return areas[s.area] ?? null;
    },
    allDone: () => s.area >= areas.length,
    isDone: (taskId: string) => s.done.includes(taskId),
    doneTasks: () => new Set(s.done),
    progress(): { done: number; total: number } {
      return { done: s.done.length, total: areas[s.area]?.tasks.length ?? 0 };
    },
    /** First unbuilt task in list order (the home screen's "next task"). */
    nextTask(): BuildTask | null {
      return areas[s.area]?.tasks.find((t) => !s.done.includes(t.id)) ?? null;
    },
    /** Every task built: the reward is waiting for claimArea(). */
    areaComplete(): boolean {
      const a = areas[s.area];
      return !!a && a.tasks.every((t) => s.done.includes(t.id));
    },
    canBuild(taskId?: string): boolean {
      const t = taskId ? areas[s.area]?.tasks.find((x) => x.id === taskId) : api.nextTask();
      return !!t && !s.done.includes(t.id) && s.stars >= t.cost;
    },
    addStars(n: number) {
      const k = Math.max(0, Math.floor(n));
      s.stars += k;
      s.earned += k;
      save();
    },
    /** Spends stars on a task; returns false when it is unknown, done or unaffordable. */
    build(taskId: string): boolean {
      const a = areas[s.area];
      const t = a?.tasks.find((x) => x.id === taskId);
      if (!a || !t || s.done.includes(t.id) || s.stars < t.cost) return false;
      s.stars -= t.cost;
      s.done.push(t.id);
      track('build_task', { area: a.id, task: t.id });
      save();
      return true;
    },
    /** Claims a finished area's reward and opens the next area. */
    claimArea(): BuildArea['reward'] | null {
      const a = areas[s.area];
      if (!a || !api.areaComplete()) return null;
      s.area++;
      s.done = [];
      track('build_area', { area: a.id });
      save();
      return a.reward;
    },
  };
  return api;
}

export type Build = ReturnType<typeof createBuild>;
