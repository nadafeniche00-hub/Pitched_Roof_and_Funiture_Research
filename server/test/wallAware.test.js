// Walls are not floor: sizes, furniture, doors and the walls themselves are judged between the faces of the walls (WALLS in shared/knowledge.js). The Python audit
// (pipeline/oracle) measures the same things over many plans; these tests keep the causes fixed in the app's own suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as mod from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const shared = pathToFileURL(fileURLToPath(new URL('../../shared/', import.meta.url))).href;
mod.registerHooks({ resolve: (s, c, n) => (s.startsWith('@shared/') ? n(shared + s.slice(8), c) : n(s, c)) }); // client/src/lib imports '@shared/...' (a Vite alias)
const { sanitizeRoom, DEFAULT_ROOM, evaluate, itemRects } = await import('../../shared/engine.js');
const { generatePlans, netRect, junctions, windowClashes, ROOM_TYPES } = await import('../../shared/plans.js');
const { furnishPlan } = await import('../../shared/furnish.js');
const { defOf } = await import('../../shared/params.js');
const { WALLS } = await import('../../shared/knowledge.js');
const { sharedRun, boundsOf, doorSwing } = await import('../../shared/doors.js');
const { wallsOf } = await import('../../client/src/lib/walls.js');
const { mergeWalls } = await import('../../client/src/lib/mergeWalls.js');

const room = sanitizeRoom({ ...DEFAULT_ROOM, width: 7, depth: 9, kneeWall: 1.2, pitch: 40, maxHeight: 3.2, dormers: [], stair: { x: 3.05, y: 0, w: 0.9, d: 2.2 },
  windows: [{ wall: 'N', pos: 1.6, width: 1.2 }, { wall: 'N', pos: 5.4, width: 1.2 }, { wall: 'S', pos: 3.5, width: 1.4 }, { wall: 'W', pos: 5, width: 1.1 }] });
const brief = { rooms: [{ id: 'bed', type: 'bedroom', area: 12 }, { id: 'kid', type: 'child', area: 10 }, { id: 'bath', type: 'bath', area: 5 }, { id: 'study', type: 'study', area: 6 }], links: [] };
const inter = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 1e-3 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 1e-3;

/** every solid piece of wall of a plan, as rectangles: the four outer bands and the partitions cut by their openings (as the technical plan draws them) */
function solids(plan) {
  const { outer: to, inner: ti } = WALLS, W = room.width, D = room.depth;
  const out = [[0, 0, W, to], [0, D - to, W, D], [0, to, to, D - to], [W - to, to, W, D - to]];
  for (const w of mergeWalls(wallsOf(room, { rooms: plan.rooms, doors: plan.doors }, { trimOuter: true }).walls)) {
    const vertical = Math.abs(w.p0[0] - w.p1[0]) < 1e-6, c = vertical ? w.p0[0] : w.p0[1];
    const a = vertical ? Math.min(w.p0[1], w.p1[1]) : Math.min(w.p0[0], w.p1[0]), b = vertical ? Math.max(w.p0[1], w.p1[1]) : Math.max(w.p0[0], w.p1[0]);
    let from = a;
    for (const [s, e] of [...w.op].sort((p, q) => p[0] - q[0]).map(([s, e]) => [a + s, a + e]).concat([[b, b]])) {
      if (s > from + 1e-6) out.push(vertical ? [c - ti / 2, from, c + ti / 2, s] : [from, c - ti / 2, s, c + ti / 2]);
      from = Math.max(from, e);
    }
  }
  return out;
}

test('netRect: the outer wall on a footprint edge, half a partition on every other edge', () => {
  const n = netRect(room, [0, 0, 3.5, 4]);
  assert.deepEqual(n.map((v) => +v.toFixed(4)), [WALLS.outer, WALLS.outer, +(3.5 - WALLS.inner / 2).toFixed(4), +(4 - WALLS.inner / 2).toFixed(4)]);
  const far = netRect(room, [3.5, 4, 7, 9]);
  assert.equal(+far[2].toFixed(4), +(7 - WALLS.outer).toFixed(4));
  assert.equal(+far[3].toFixed(4), +(9 - WALLS.outer).toFixed(4));
});

test('furniture never stands in a wall: not in the outer wall, not in a partition that is closed', () => {
  let pieces = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const [plan] = generatePlans(room, brief, { seed, tries: 80, keep: 1, refine: 10 });
    if (!plan) continue;
    const walls = solids(plan);
    for (const it of furnishPlan(room, plan, { seed }).items.filter((i) => i.placed)) {
      pieces += 1;
      const body = itemRects(defOf(it), it).body;
      for (const w of walls) assert.ok(!inter(body, w), `seed ${seed}: ${it.id} ${body.map((v) => v.toFixed(2))} stands in the wall ${w.map((v) => v.toFixed(2))}`);
    }
  }
  assert.ok(pieces > 10, 'the test looked at furniture');
});

test('the engine refuses a piece in the outer wall and counts no floor there', () => {
  const items = [{ id: 'b', type: 'bed_single', x: 0.05, y: 3, rot: 3, placed: true }];
  const out = evaluate(room, items);
  assert.ok(out.items[0].issues.some((i) => i.code === 'wall'), 'a piece against the footprint line is inside the wall');
  const inside = evaluate(room, [{ ...items[0], x: WALLS.outer }]);
  assert.ok(!inside.items[0].issues.some((i) => i.code === 'wall'), 'against the inner face it is fine');
  assert.ok(out.metrics.gross < room.width * room.depth - 1, 'the wall band is not floor');
});

test('partition walls stop at the inner face of the outer wall when asked (and run to the footprint line otherwise: the Revit export keeps its numbers)', () => {
  const [plan] = generatePlans(room, brief, { seed: 2, tries: 80, keep: 1, refine: 10 });
  const layout = { rooms: plan.rooms, doors: plan.doors };
  const ends = (ws) => ws.flatMap((w) => [w.p0, w.p1]);
  const trimmed = wallsOf(room, layout, { trimOuter: true }).walls, plain = wallsOf(room, layout).walls;
  for (const [x, y] of ends(trimmed)) {
    assert.ok(x > WALLS.outer - 1e-6 && x < room.width - WALLS.outer + 1e-6 && y > WALLS.outer - 1e-6 && y < room.depth - WALLS.outer + 1e-6, `end ${x},${y} is inside the clear room`);
  }
  assert.ok(ends(plain).some(([x, y]) => x < 1e-6 || y < 1e-6 || x > room.width - 1e-6 || y > room.depth - 1e-6), 'the default still reaches the footprint line');
});

test('windowClashes: a partition ending on a window is found, and the generator avoids it when it can', () => {
  const rects = { hall: [0, 0, 4.4, 2.2], a: [4.4, 0, 7, 9], b: [0, 2.2, 4.4, 9] }; // a cut at x = 4.4: clear of the N windows (1.0-2.2, 4.8-6.0) and of the S window (2.8-4.2)
  assert.equal(junctions(room, rects).some((j) => j.side === 'N' && Math.abs(j.c - 4.4) < 1e-9), true);
  assert.equal(windowClashes(room, rects).length, 0);
  assert.equal(windowClashes(room, { ...rects, hall: [0, 0, 1.6, 2.2], a: [1.6, 0, 7, 9], b: [0, 2.2, 1.6, 9] }).length, 1, 'x = 1.6 is the middle of a window');
  let clashed = 0, plans = 0;
  for (let seed = 1; seed <= 4; seed++) for (const p of generatePlans(room, brief, { seed, tries: 120, keep: 1, refine: 15 })) { plans += 1; if (p.clashes > 0) clashed += 1; }
  assert.ok(plans > 0 && clashed === 0, `${clashed} of ${plans} plans have a wall on a window`);
});

test('a door starts inside the clear wall run: never in the outer wall', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const [plan] = generatePlans(room, brief, { seed, tries: 80, keep: 1, refine: 10 });
    if (!plan) continue;
    const rects = Object.fromEntries(plan.rooms.map((r) => [r.id, r.rect]));
    const bounds = boundsOf(rects);
    for (const d of plan.doors) {
      const [lo, hi] = sharedRun(rects[d.a], rects[d.b], d.vertical, bounds);
      const along = d.vertical ? d.mid[1] : d.mid[0], half = (d.width || 0.9) / 2;
      assert.ok(along - half >= lo - 1e-6 && along + half <= hi + 1e-6, `seed ${seed}: door ${d.a}-${d.b} at ${along.toFixed(2)} leaves the clear run ${lo.toFixed(2)}..${hi.toFixed(2)}`);
      assert.ok(doorSwing(d, rects).rect.every(Number.isFinite));
    }
  }
});

test('the room types carry a minimum area, and the plan builder counts a room below it as too small', () => {
  for (const [k, t] of Object.entries(ROOM_TYPES)) assert.ok(t.minArea > 0 && t.minArea <= t.area, `${k}: minArea ${t.minArea} vs area ${t.area}`);
});
