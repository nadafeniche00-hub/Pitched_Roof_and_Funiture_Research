// Many plans from the app's own code, written as plain geometry for the Python rule system (usable_oracle). Nothing is re-implemented here: the plan builder (shared/plans.js), the furniture
// engine (shared/furnish.js) and the wall builder (client/src/lib/walls.js + mergeWalls.js) run exactly as the app runs them; this file only varies the input and writes down what came out.
//   node pipeline/oracle/export_cases.mjs [--n 60] [--seed 1] [--out pipeline/oracle/out/cases.json]
// Case = { id, room, thickness, rooms, doors, walls, furniture }; all lengths in metres, x right, y down, origin at the outer corner of the footprint.
import { mkdirSync, writeFileSync } from 'node:fs';
import * as mod from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const shared = pathToFileURL(fileURLToPath(new URL('../../shared/', import.meta.url))).href;
mod.registerHooks({ resolve: (s, c, n) => (s.startsWith('@shared/') ? n(shared + s.slice(8), c) : n(s, c)) }); // client/src/lib imports '@shared/...' (a Vite alias)
const { sanitizeRoom, DEFAULT_ROOM, mulberry32, itemRects } = await import('../../shared/engine.js');
const { generatePlans, ROOM_TYPES, HALL } = await import('../../shared/plans.js');
const { furnishPlan } = await import('../../shared/furnish.js');
const { defOf } = await import('../../shared/params.js');
const { wallsOf, T_IN } = await import('../../client/src/lib/walls.js');
const { mergeWalls } = await import('../../client/src/lib/mergeWalls.js');
const { T_OUT } = await import('../../client/src/lib/techPlan.js');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('n', 60)), SEED = Number(arg('seed', 1)), OUT = arg('out', 'pipeline/oracle/out/cases.json');
const rnd = mulberry32(SEED);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi, step = 0.1) => Math.round((lo + rnd() * (hi - lo)) / step) * step;

const KINDS = ['bedroom', 'child', 'living', 'kitchen', 'study', 'bath', 'wc', 'storage'];
const r2 = (v) => +v.toFixed(3);
const cases = [];
let tries = 0;
while (cases.length < N && tries < N * 6) {
  tries += 1;
  const W = between(5, 9), D = between(6.5, 11);
  const windows = [];
  // valid input only: a window lies on its wall, clear of the corners (0.5 m) and 0.3 m from the next window; the audit must not blame the app for impossible windows
  const addWindow = (wall, len, lo, hi) => {
    for (let k = 0; k < 12; k++) {
      const width = r2(between(lo, hi)), pos = r2(between(0.5 + width / 2, len - 0.5 - width / 2));
      if (windows.every((o) => o.wall !== wall || Math.abs(o.pos - pos) > (o.width + width) / 2 + 0.3)) { windows.push({ wall, pos, width }); return; }
    }
  };
  for (const wall of ['N', 'S']) for (let k = 0, n = 1 + Math.floor(rnd() * 3); k < n; k++) addWindow(wall, W, 0.9, 1.6);
  for (const wall of ['W', 'E']) if (rnd() < 0.6) addWindow(wall, D, 0.9, 1.4);
  const stairOnGable = rnd() < 0.5;
  const room = sanitizeRoom({ ...DEFAULT_ROOM, width: W, depth: D, kneeWall: between(0.8, 1.6), pitch: between(30, 50, 1), maxHeight: 3.2, dormers: [], windows,
    stair: stairOnGable ? { x: r2(W / 2 - 0.45), y: 0, w: 0.9, d: 2.2 } : { x: 0.3, y: r2(D / 2 - 1.1), w: 0.9, d: 2.2 } });
  const n = 3 + Math.floor(rnd() * 4);
  const rooms = Array.from({ length: n }, (_, i) => { const type = i === 0 ? 'bedroom' : i === 1 ? 'bath' : pick(KINDS); return { id: `${type}${i + 1}`, type, area: r2(ROOM_TYPES[type].area * (0.8 + rnd() * 0.5)) }; });
  const [plan] = generatePlans(room, { rooms, links: [] }, { seed: Math.floor(rnd() * 1e6), tries: 120, refine: 20, hardTries: 360 });
  if (!plan) continue;
  const layout = { rooms: plan.rooms, doors: plan.doors || [] };
  const walls = mergeWalls(wallsOf(room, layout, { autoDoors: !layout.doors.length, trimOuter: true }).walls);
  const fur = furnishPlan(room, plan, { seed: 1 });
  cases.push({
    id: `case_${String(cases.length + 1).padStart(3, '0')}`,
    brief: rooms,
    app_flags: { narrow: plan.narrow, clashes: plan.clashes }, // what the plan builder itself said about this plan: a flagged plan is a brief that did not fit, shown to the user as warnings
    room: { width: room.width, depth: room.depth, kneeWall: room.kneeWall, pitch: room.pitch, windows: room.windows, doors: room.doors, stair: room.stair },
    thickness: { outer: T_OUT, inner: T_IN },
    types: Object.fromEntries(Object.entries({ ...ROOM_TYPES, hall: HALL }).map(([k, v]) => [k, { min: v.min, minArea: v.minArea, area: v.area }])),
    rooms: plan.rooms.map((r) => ({ id: r.id, type: r.type, rect: r.rect.map(r2), counted: r2(r.counted ?? 0) })),
    doors: layout.doors.map((d) => ({ a: d.a, b: d.b, mid: d.mid.map(r2), vertical: !!d.vertical, width: d.width ?? 0.9 })),
    walls: walls.map((w) => ({ p0: w.p0.map(r2), p1: w.p1.map(r2), op: w.op.map((o) => o.slice(0, 2).map(r2)) })),
    furniture: fur.items.filter((i) => i.placed).map((i) => ({ id: i.id, type: i.type, room: i.spec.room, body: itemRects(defOf(i), i).body.map(r2) })),
  });
}
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify({ made_by: 'pipeline/oracle/export_cases.mjs', seed: SEED, cases }, null, 0));
console.log(`${cases.length} cases (${tries} tries) -> ${OUT}; ${cases.reduce((s, c) => s + c.furniture.length, 0)} placed pieces`);
