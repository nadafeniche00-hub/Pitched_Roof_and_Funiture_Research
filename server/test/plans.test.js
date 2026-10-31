import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM } from '../../shared/engine.js';
import { EXAMPLE_BRIEF, countedArea, generatePlans, sanitizeBrief, sharedEdge } from '../../shared/plans.js';

const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);

test('shared edge of touching and separate rectangles', () => {
  assert.equal(sharedEdge([0, 0, 2, 2], [2, 0, 4, 1])?.len, 1);
  assert.equal(sharedEdge([0, 0, 2, 2], [2.5, 0, 4, 1]), null);
});

test('counted area follows roof height, not floor area', () => {
  const full = countedArea(DEFAULT_ROOM, [0, 0, DEFAULT_ROOM.width, DEFAULT_ROOM.depth]);
  assert.ok(full.counted < full.gross && full.counted > 0);
  const eave = countedArea(DEFAULT_ROOM, [0, 0.5, 0.3, 3]);
  assert.ok(eave.counted < eave.gross * 0.5, 'the strip under the eaves barely counts');
});

test('a brief is sanitised', () => {
  const b = sanitizeBrief({ rooms: [{ id: 'a', type: 'nope', area: 999 }, { id: 'a', type: 'bath' }], links: [['a', 'zzz'], ['a', 'a']] });
  assert.equal(b.rooms.length, 2);
  assert.equal(new Set(b.rooms.map((r) => r.id)).size, 2);
  assert.ok(b.rooms[0].area <= 40);
  assert.deepEqual(b.links, []);
});

test('plans tile the footprint, keep the stair in the hall and are reproducible', () => {
  const plans = generatePlans(DEFAULT_ROOM, EXAMPLE_BRIEF, { seed: 4 });
  assert.ok(plans.length >= 1);
  for (const p of plans) {
    const total = p.rooms.reduce((s, r) => s + area(r.rect), 0);
    assert.ok(Math.abs(total - DEFAULT_ROOM.width * DEFAULT_ROOM.depth) < 1e-6, 'rooms cover the floor exactly');
    const s = DEFAULT_ROOM.stair, hall = p.rooms.find((r) => r.id === 'hall').rect;
    assert.ok(hall[0] <= s.x + 1e-6 && hall[2] >= s.x + s.w - 1e-6 && hall[1] <= s.y + 1e-6 && hall[3] >= s.y + s.d - 1e-6, 'stair inside the hall');
    assert.ok(p.score >= 0 && p.score <= 1);
  }
  assert.deepEqual(plans.map((p) => p.score), generatePlans(DEFAULT_ROOM, EXAMPLE_BRIEF, { seed: 4 }).map((p) => p.score));
  assert.ok(plans[0].score >= plans.at(-1).score);
});

test('a room that cannot be wide enough is reported as narrow', () => {
  const room = { ...DEFAULT_ROOM, width: 3, depth: 7 };
  const brief = { rooms: [{ id: 'l', type: 'living', area: 14 }, { id: 'b', type: 'bedroom', area: 10 }], links: [] };
  const [best] = generatePlans(room, brief, { seed: 2 });
  assert.ok(best.findings.length > 0, 'a 3 m wide attic cannot satisfy these rooms without a finding');
});

test('furnished pieces stay inside their own room', async () => {
  const { furnishPlan } = await import('../../shared/furnish.js');
  const { CATALOG } = await import('../../shared/catalog.js');
  const [plan] = generatePlans(DEFAULT_ROOM, EXAMPLE_BRIEF, { seed: 4 });
  const out = furnishPlan(DEFAULT_ROOM, plan, { seed: 4 });
  assert.ok(out.total >= 8);
  assert.ok(out.placed >= out.total * 0.5, 'most pieces find a spot');
  for (const it of out.items.filter((i) => i.placed)) {
    const d = CATALOG[it.type], w = it.rot % 2 ? d.d : d.w, dd = it.rot % 2 ? d.w : d.d, r = it.spec.within;
    assert.ok(it.x >= r[0] - 1e-6 && it.y >= r[1] - 1e-6 && it.x + w <= r[2] + 1e-6 && it.y + dd <= r[3] + 1e-6, `${it.id} inside ${it.spec.room}`);
  }
});

test('the room tree builds a brief for every complete path and fits it to the roof', async () => {
  const { TREE, ROOT, briefFromPath, fitBrief } = await import('../../shared/roomTree.js');
  const paths = [];
  const grow = (path, node) => { if (node === null) { paths.push(path); return; } for (const o of TREE[node].options) grow([...path, o.id], o.next); };
  grow([], ROOT);
  assert.equal(paths.length, 4 * 2 * 2 * 2);
  for (const p of paths) { const b = briefFromPath(p); assert.ok(b && b.rooms.length >= 2, p.join('/')); assert.equal(sanitizeBrief(b).rooms.length, b.rooms.length); }
  assert.equal(briefFromPath(['single']), null);
  const big = briefFromPath(['kid2', 'yes', 'two', 'yes']);
  const fitted = fitBrief(big, 30);
  assert.ok(fitted.rooms.reduce((s, r) => s + r.area, 0) <= 30 * 0.92 - 4 + 1.5, 'scaled to the usable area');
});

test('a hand-drawn layout is scored once every piece is placed', async () => {
  const { hallRect, planFromRects } = await import('../../shared/plans.js');
  const brief = { rooms: [{ id: 'a', type: 'bedroom', area: 8 }], links: [] };
  const hall = hallRect(DEFAULT_ROOM);
  assert.equal(planFromRects(DEFAULT_ROOM, brief, { hall }), null);
  const r = planFromRects(DEFAULT_ROOM, brief, { hall, a: [hall[2], 0, 5, 3.5] });
  assert.ok(r && r.score > 0 && r.doors.length === 1);
});

test('a plan file becomes a brief and puzzle pieces, scaled to the roof', async () => {
  const { roomsFromPlanJson, guessType } = await import('../../shared/planImport.js');
  const data = { version: 1, footprint: { w: 10, d: 8 }, rooms: [
    { id: 'a', x: 0, y: 0, w: 4, d: 4, type: 'bedroom' }, { id: 'b', x: 4, y: 0, w: 4, d: 4 }, { id: 'c', x: 0, y: 4, w: 8, d: 4 }, { id: 'tiny', x: 9, y: 7, w: 0.5, d: 0.5 },
  ] };
  const out = roomsFromPlanJson(data, DEFAULT_ROOM);
  assert.equal(out.brief.rooms.length, 3, 'a closet of 0.25 m2 is dropped');
  assert.ok(out.brief.rooms.every((r) => r.area >= 2 && r.area <= 40));
  assert.equal(out.guessed, 2);
  const placed = Object.values(out.pieces).filter((p) => p.x !== null);
  for (const p of placed) assert.ok(p.x >= 0 && p.x + p.w <= DEFAULT_ROOM.width + 1e-6 && p.y + p.d <= DEFAULT_ROOM.depth + 1e-6, 'pieces lie inside the roof storey');
  assert.throws(() => roomsFromPlanJson({ rooms: [] }, DEFAULT_ROOM), /Not a plan file/);
  assert.equal(guessType(20), 'living');
  assert.equal(guessType(3), 'bath');
});
