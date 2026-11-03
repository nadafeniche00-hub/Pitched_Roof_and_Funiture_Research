// Test plans with a known truth: attic floor plans made by the plan builder (shared/plans.js, fixed seeds), written as JSON (the truth) and drawn as PNG by render_plans.py.
// node server/eval/make_cases.mjs   then   python server/eval/render_plans.py   then   node --env-file=server/.env server/eval/sketch_eval.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_ROOM, sanitizeRoom } from '../../shared/engine.js';
import { generatePlans } from '../../shared/plans.js';

const OUT = new URL('./cases/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const SIZES = [[6, 8], [7, 9], [5.5, 7.5], [8, 10], [6.5, 8.5], [7.5, 7.5]];
const BRIEFS = [
  [['bedroom', 12], ['child', 10], ['bath', 5]],
  [['bedroom', 14], ['study', 8], ['bath', 5], ['storage', 4]],
  [['living', 18], ['kitchen', 9], ['bath', 5]],
  [['bedroom', 12], ['child', 10], ['study', 7], ['bath', 5], ['wc', 2.5]],
  [['living', 20], ['kitchen', 10], ['bedroom', 12], ['bath', 6]],
  [['bedroom', 13], ['child', 9], ['child', 9], ['bath', 5], ['storage', 4]],
];
let n = 0;
for (let i = 0; i < 12; i++) {
  const [w, d] = SIZES[i % SIZES.length];
  const kinds = BRIEFS[(i * 5) % BRIEFS.length];
  const room = sanitizeRoom({ ...DEFAULT_ROOM, width: w, depth: d, kneeWall: 1.2, pitch: 40, maxHeight: 3.2, dormers: [], stair: { x: w / 2 - 0.45, y: 0, w: 0.9, d: 2.2 } });
  const brief = { rooms: kinds.map(([type, area], k) => ({ id: `${type}${k + 1}`, type, area })), links: [] };
  const [plan] = generatePlans(room, brief, { seed: 11 + i });
  if (!plan) continue;
  const rooms = plan.rooms.map((r) => ({ id: r.id, type: r.type, x: +r.rect[0].toFixed(2), y: +r.rect[1].toFixed(2), w: +(r.rect[2] - r.rect[0]).toFixed(2), d: +(r.rect[3] - r.rect[1]).toFixed(2) }));
  const name = `case_${String(++n).padStart(2, '0')}`;
  writeFileSync(new URL(`${name}.json`, OUT), JSON.stringify({ name, footprint: { w, d }, rooms }, null, 1));
}
console.log(`${n} cases in server/eval/cases/`);
