// The shared test case for pipeline/analysis/compare_frameworks.py: three roof shapes (gabled, hipped, half-hipped) over one 8 x 10 m attic,
// one room layout (from the plan generator) and the numbers OUR OWN engine gives for it (the reference the other tools are compared with).
import fs from 'node:fs';
import { DEFAULT_ROOM, sanitizeRoom, getGrid } from '../../shared/engine.js';
import { patternMesh } from '../../shared/roofLibrary.js';
import { generatePlans, EXAMPLE_BRIEF, countedArea } from '../../shared/plans.js';

const room = sanitizeRoom({ ...DEFAULT_ROOM, dormers: [], stair: { x: 3.55, y: 0.3, w: 0.9, d: 2.4 } });
const plans = generatePlans(room, EXAMPLE_BRIEF, { seed: 4 });
const plan = plans[0];
const roofs = {};
for (const id of ['gabled', 'hipped', 'half-hipped']) roofs[id] = patternMesh(room, id);

const reference = {};
for (const [id, mesh] of Object.entries(roofs)) {
  const r = sanitizeRoom({ ...room, roof: mesh });
  const t0 = performance.now();
  const rooms = {};
  for (const rm of plan.rooms) rooms[rm.id] = countedArea(r, rm.rect).counted;
  getGrid(r, 0.05); // warm
  const t1 = performance.now();
  const times = [];
  for (let i = 0; i < 5; i++) { const a = performance.now(); for (const rm of plan.rooms) countedArea({ ...r, _n: i }, rm.rect).counted; times.push(performance.now() - a); }
  times.sort((a, b) => a - b);
  reference[id] = { rooms, total: Object.values(rooms).reduce((s, v) => s + v, 0), ms_median: +times[2].toFixed(2) };
}

const out = {
  room: { width: room.width, depth: room.depth, kneeWall: room.kneeWall, pitch: room.pitch, maxHeight: room.maxHeight },
  rules: { fullH: 2.0, halfH: 1.0 },
  layout: { rooms: plan.rooms.map((r) => ({ id: r.id, type: r.type, rect: r.rect })), doors: plan.doors || [], stair: room.stair },
  roofs,
  reference,
};
fs.mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../data/compare_case.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('rooms:', plan.rooms.map((r) => `${r.id}(${r.type}) ${r.rect.map((v) => +v.toFixed(2)).join(',')}`).join(' | '));
console.log('reference (counted m2, our engine, 10 cm grid):');
for (const [k, v] of Object.entries(reference)) console.log(' ', k.padEnd(12), v.total.toFixed(3), JSON.stringify(Object.fromEntries(Object.entries(v.rooms).map(([a, b]) => [a, +b.toFixed(2)]))), v.ms_median + ' ms');
