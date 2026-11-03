// Furnish the rooms of a generated plan: every room gets a small programme, each piece is anchored to its room rectangle
// (spec.within is a hard limit) and to a wall rule, then the fold loop places them hardest-first.
// Pure functions of plain data (browser, Node, tests). The programmes are rules of thumb for exploration.
import { runLoop } from './iterate.js';
import { swingRects } from './doors.js';
import { netRect } from './plans.js';

// [catalogue type, anchor] per room type. Kitchens have no catalogue pieces yet, so they stay empty.
const PROGRAMME = {
  bedroom: (area) => [[area >= 10 ? 'bed_double' : 'bed_single', 'wall'], ['wardrobe', 'wall'], ['chest', 'wall']],
  child: () => [['bed_single', 'wall'], ['desk', 'light'], ['wardrobe', 'wall']],
  living: () => [['sofa', 'wall'], ['armchair', 'free'], ['shelf', 'wall']],
  study: () => [['desk', 'light'], ['shelf', 'wall']],
  bath: (area) => (area >= 4 ? [['toilet', 'wall'], ['basin', 'wall'], ['shower', 'wall']] : [['toilet', 'wall'], ['basin', 'wall']]),
  wc: () => [['toilet', 'wall'], ['basin', 'wall']],
  storage: () => [['shelf', 'wall']],
  kitchen: () => [],
};

/** Items for the rooms of one plan, each limited to its own rectangle. */
export function programmeFor(plan, room) {
  const items = [];
  for (const r of plan.rooms) {
    const make = PROGRAMME[r.type];
    if (!make) continue;
    make(r.counted).forEach(([type, anchor], k) => {
      const spec = { within: room ? netRect(room, r.rect) : r.rect, room: r.id }; // between the walls: nothing stands in a wall
      if (anchor === 'light') spec.near = 'light'; else spec.backTo = anchor;
      items.push({ id: `${r.id}-${type}-${k}`, type, x: 0, y: 0, rot: 0, placed: false, spec });
    });
  }
  return items;
}

/** Furnish a whole plan. Returns { items, placed, total, byRoom } (byRoom: room id -> { placed, total }). */
export function furnishPlan(room, plan, opts = {}) {
  const items = programmeFor(plan, room);
  if (!items.length) return { items: [], placed: 0, total: 0, byRoom: {} };
  // the swing of every door of the plan stays free: it is part of the room for the engine (room.swings)
  const swings = swingRects(plan);
  const { frames } = runLoop(swings.length ? { ...room, swings } : room, items, { kind: 'fold', seed: opts.seed ?? 1, rules: opts.rules, disabled: opts.disabled });
  const out = frames.at(-1).items;
  const byRoom = {};
  for (const it of out) {
    const r = (byRoom[it.spec.room] ||= { placed: 0, total: 0 });
    r.total += 1;
    if (it.placed) r.placed += 1;
  }
  return { items: out, placed: out.filter((i) => i.placed).length, total: out.length, byRoom };
}
