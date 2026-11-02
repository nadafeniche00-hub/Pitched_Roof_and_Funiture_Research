// Runs the app's own plan generator (shared/plans.js) and technical-plan code (client/src/lib/techPlan.js) on the default attic and writes what the pipeline slide
// of the deck draws: the brief, raw random candidates with their scores, the best plans, and the primitives of the technical plan of the best one.
// Nothing here is drawn by hand. From the repository root:   node presentation/data/make_plan_sample.mjs
import * as mod from 'node:module';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

// client/src/lib imports '@shared/...' (a Vite alias): the same alias for Node
const shared = pathToFileURL(fileURLToPath(new URL('../../shared/', import.meta.url))).href;
if (mod.registerHooks) mod.registerHooks({ resolve: (s, c, n) => (s.startsWith('@shared/') ? n(shared + s.slice(8), c) : n(s, c)) });
else mod.register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { return s.startsWith('@shared/') ? n(${JSON.stringify(shared)} + s.slice(8), c) : n(s, c); }`));
const { sanitizeRoom, DEFAULT_ROOM } = await import('../../shared/engine.js');
const { generatePlans, sanitizeBrief } = await import('../../shared/plans.js');
const { techPrimitives } = await import('../../client/src/lib/techPlan.js');

const r2 = (v) => Math.round(v * 100) / 100, pt = (p) => p.map(r2);
const room = sanitizeRoom(DEFAULT_ROOM);
// "2 bedrooms, a bath next to them, a study of 6 m2" as the language model returns it (12 m2 bedroom and 5 m2 bath are the defaults of the prompt)
const brief = sanitizeBrief({
  rooms: [{ id: 'bed1', type: 'bedroom', area: 12 }, { id: 'bed2', type: 'bedroom', area: 12 }, { id: 'bath', type: 'bath', area: 5 }, { id: 'study', type: 'study', area: 6 }],
  links: [['bath', 'bed1', 'near'], ['bath', 'bed2', 'near']],
});
const slim = (p) => ({ score: r2(p.score), rooms: p.rooms.map((r) => ({ id: r.id, type: r.type, rect: r.rect.map(r2) })) });

// raw candidates: one random slicing tree each, no refinement (a different seed per tree)
const candidates = [];
for (let seed = 1; seed <= 400 && candidates.length < 30; seed++) {
  const p = generatePlans(room, brief, { seed, tries: 1, keep: 1, refine: 0 })[0];
  if (p) candidates.push(slim(p));
}
// the real run: 300 trees, 40 refinements of each of the best, three kept
const t0 = performance.now();
const best = generatePlans(room, brief, { seed: 1, tries: 300, keep: 3, refine: 40 });
const ms = Math.round(performance.now() - t0);
const top = best[0];

const tp = techPrimitives(room, { rooms: top.rooms, doors: top.doors }, [], { date: '2026-11-02' });
const P = tp.prims;
const technical = {
  walls: P.filter((p) => p.k === 'poly').map((p) => p.pts.map(pt)),
  doors: P.filter((p) => p.layer === 'TUEREN').map((p) => (p.k === 'line' ? { k: 'l', a: pt(p.a), b: pt(p.b) } : { k: 'a', c: pt(p.c), r: r2(p.r), a0: r2(p.a0), a1: r2(p.a1) })),
  windows: P.filter((p) => p.layer === 'FENSTER' && p.k === 'line').map((p) => [pt(p.a), pt(p.b)]),
  stair: P.filter((p) => p.layer === 'TREPPE' && p.k === 'line').map((p) => [pt(p.a), pt(p.b)]),
  dims: P.filter((p) => p.layer === 'BEMASSUNG' && p.k === 'line').map((p) => [pt(p.a), pt(p.b)]),
  dimText: P.filter((p) => p.layer === 'BEMASSUNG' && p.k === 'text').map((p) => ({ p: pt(p.p), s: p.s })),
  stamps: P.filter((p) => p.layer === 'RAUMSTEMPEL' && p.k === 'text').map((p) => ({ p: pt(p.p), h: p.h, s: p.s })),
};

const out = {
  room: { w: room.width, d: room.depth, knee: room.kneeWall, pitch: room.pitch, stair: [room.stair.x, room.stair.y, room.stair.x + room.stair.w, room.stair.y + room.stair.d] },
  brief, candidates, best: best.map(slim), parts: top.parts, ms, technical,
  counts: { prims: P.length, walls: technical.walls.length, doors: technical.doors.length },
};
fs.writeFileSync(new URL('./plan_sample.json', import.meta.url), JSON.stringify(out));
console.log('plan_sample.json', JSON.stringify(out).length, 'bytes;', candidates.length, 'candidates, scores', candidates.map((c) => c.score).join(' '), '| best', best.map((b) => r2(b.score)).join(' '), '|', ms, 'ms |', JSON.stringify(out.counts), '| parts', JSON.stringify(top.parts));
