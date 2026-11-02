import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM, DEFAULT_RULES, roofHeight, itemRects, sanitizeRoom } from '../../shared/engine.js';
import { generatePlans, EXAMPLE_BRIEF, sharedEdge } from '../../shared/plans.js';
import { furnishPlan } from '../../shared/furnish.js';
import { defOf } from '../../shared/params.js';
import { CATALOG } from '../../shared/catalog.js';
import { ADJACENCY, DATASETS, KNOWLEDGE, LBO, NEUFERT, WOFLV, rulebook } from '../../shared/knowledge.js';
import { doorSwing, placeDoor, swingConflicts, swingRects } from '../../shared/doors.js';

// the attic of the example plan that showed bad placements: 6.00 x 7.50 m, knee wall 1.20 m, 45 degrees, stair at the north gable
const ATTIC = sanitizeRoom({ ...DEFAULT_ROOM, width: 6, depth: 7.5, kneeWall: 1.2, pitch: 45, maxHeight: 3.0, dormers: [], stair: { x: 2.2, y: 0, w: 0.9, d: 2.2 }, windows: [{ wall: 'N', pos: 3, width: 1.2 }, { wall: 'S', pos: 3.3, width: 1.2 }], doors: [] });
const BRIEF = { rooms: [{ id: 'work', type: 'study', area: 4 }, { id: 'bath', type: 'bath', area: 3 }, { id: 'kid', type: 'child', area: 14 }, { id: 'bed', type: 'bedroom', area: 14 }], links: [['bath', 'bed', 'near']] };

const lowest = (room, r) => { let m = Infinity; for (let x = r[0] + 0.05; x < r[2]; x += 0.1) for (let y = r[1] + 0.05; y < r[3]; y += 0.1) m = Math.min(m, roofHeight(room, x, y)); return m; };
const headStrip = (b, rot, len) => [[b[0], b[1], b[2], b[1] + len], [b[2] - len, b[1], b[2], b[3]], [b[0], b[3] - len, b[2], b[3]], [b[0], b[1], b[0] + len, b[3]]][rot];
const overlap = (a, b) => a[0] < b[2] - 1e-6 && b[0] < a[2] - 1e-6 && a[1] < b[3] - 1e-6 && b[1] < a[3] - 1e-6;

test('the knowledge file says what the engine does: the WoFlV rule is the one the area count uses', () => {
  assert.equal(WOFLV.fullFrom, DEFAULT_RULES.fullH);
  assert.equal(WOFLV.halfFrom, DEFAULT_RULES.halfH);
  assert.equal(WOFLV.halfFactor, DEFAULT_RULES.halfFactor);
});

test('every entry names its source, the code rules are marked for checking, the datasets are described and not used', () => {
  assert.ok(KNOWLEDGE.length >= 8);
  for (const k of KNOWLEDGE) assert.ok(k.source && k.rule && k.used && ['statute', 'standard', 'graph'].includes(k.kind), k.id);
  assert.ok(LBO.verify && KNOWLEDGE.filter((k) => k.id.startsWith('lbo')).every((k) => k.verify), 'the Landesbauordnung values are marked as to be checked');
  assert.ok(DATASETS.length >= 3 && DATASETS.every((d) => d.used === false && d.ref));
  assert.ok(ADJACENCY.every((a) => ['want', 'avoid'].includes(a.kind) && a.why));
  const text = rulebook();
  for (const needle of ['WoFlV', String(LBO.atticHeight), String(NEUFERT.headSit), String(NEUFERT.basinStanding), 'bathroom next to the bedrooms']) assert.ok(text.includes(needle), needle);
});

test('the catalogue takes the headroom of beds and wet pieces from the knowledge file', () => {
  for (const t of ['bed_double', 'bed_single']) {
    assert.equal(CATALOG[t].headH, NEUFERT.headSit);
    assert.equal(CATALOG[t].headLen, NEUFERT.headZone);
    assert.equal(CATALOG[t].useH, NEUFERT.standing);
  }
  assert.equal(CATALOG.basin.useH, NEUFERT.basinStanding);
  assert.equal(CATALOG.shower.useH, NEUFERT.showerStanding);
  assert.equal(CATALOG.toilet.useH, NEUFERT.standing);
});

test('a bed is never put where a person cannot sit up: the head end has headroom in every plan of the example attic', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const [plan] = generatePlans(ATTIC, BRIEF, { seed });
    const out = furnishPlan(ATTIC, plan, { seed });
    for (const it of out.items.filter((i) => i.placed && i.type.startsWith('bed_'))) {
      const def = defOf(it), head = headStrip(itemRects(def, it).body, it.rot, def.headLen);
      assert.ok(lowest(ATTIC, head) >= NEUFERT.headSit - 1e-6, `seed ${seed}: ${it.id} head end ${lowest(ATTIC, head).toFixed(2)} m`);
    }
  }
});

test('a bed under the 1.20 m knee wall is refused by the engine, with a reason', async () => {
  const { evaluate } = await import('../../shared/engine.js');
  const bed = { id: 'b', type: 'bed_single', x: 0, y: 3, rot: 3, placed: true }; // head against the knee wall: 1.20 m over the head end
  const r = evaluate(ATTIC, [bed]).items[0];
  assert.equal(r.status, 'fail');
  assert.ok(r.issues.some((i) => i.code === 'head'), r.issues.map((i) => i.code).join());
});

test('wet pieces: the standing zone of a basin is 1.90 m high, the shower stands where the roof is 2.0 m', () => {
  for (const seed of [1, 2, 3]) {
    const [plan] = generatePlans(ATTIC, { rooms: [{ id: 'bath', type: 'bath', area: 5 }, { id: 'kid', type: 'child', area: 12 }], links: [] }, { seed });
    const out = furnishPlan(ATTIC, plan, { seed });
    for (const it of out.items.filter((i) => i.placed && i.type === 'shower')) assert.ok(lowest(ATTIC, itemRects(defOf(it), it).body) >= NEUFERT.showerStanding - 1e-6, 'shower under 2.0 m');
  }
});

test('a door opens into the room behind it, hinged at the nearer end of the wall, and sits close to that end', () => {
  const rects = { hall: [2.2, 0, 3.1, 2.2], kid: [0, 2.2, 3.1, 7.5] }; // the hall above the child room: a horizontal wall at y = 2.2 from x = 2.2 to 3.1
  const e = sharedEdge(rects.hall, rects.kid);
  assert.equal(e.vertical, false);
  const door = { a: 'hall', b: 'kid', vertical: false, width: 0.9, mid: placeDoor(e, rects.hall, rects.kid, 0.9, [2.65, 1.1]) };
  const sw = doorSwing(door, rects);
  assert.equal(sw.into, 'kid');
  assert.ok(sw.rect[1] >= 2.2 - 1e-9 && sw.rect[3] <= 2.2 + 0.9 + 1e-9, 'the swing lies on the side of the child room');
  const long = { hall: [0, 0, 4, 2], big: [0, 2, 4, 6] };
  const e2 = sharedEdge(long.hall, long.big);
  const mid = placeDoor(e2, long.hall, long.big, 0.9, [4, 1]); // the stair is at the east end: the door goes west
  assert.ok(mid[0] < 1, `door at x ${mid[0]}`);
  const d2 = { a: 'hall', b: 'big', vertical: false, width: 0.9, mid };
  assert.equal(doorSwing(d2, long).hinge, 0, 'hinged at the west end, next to the wall');
  assert.equal(doorSwing(d2, long).side, 1, 'opens towards +y, the room behind');
});

test('no piece of furniture stands inside the swing of a door of the plan', () => {
  for (const seed of [1, 2, 3, 4]) {
    const [plan] = generatePlans(ATTIC, BRIEF, { seed });
    const swings = swingRects(plan), out = furnishPlan(ATTIC, plan, { seed });
    assert.ok(swings.length === plan.doors.length && swings.length > 0);
    const shrink = (b, m) => [b[0] + m, b[1] + m, b[2] - m, b[3] - m]; // the engine marks the 5 cm cells whose centre lies inside: a piece may reach into a swing by up to a cell
    for (const it of out.items.filter((i) => i.placed)) for (const s of swings) assert.ok(!overlap(shrink(itemRects(defOf(it), it).body, 0.05), s), `${it.id} in a swing (seed ${seed}): body ${itemRects(defOf(it), it).body.map((v) => v.toFixed(2))} swing ${s.map((v) => v.toFixed(2))}`);
  }
});

test('two doors that swing into the same corner are a finding', () => {
  const plan = { rooms: [{ id: 'hall', rect: [0, 0, 2, 2] }, { id: 'a', rect: [0, 2, 1, 4] }, { id: 'b', rect: [1, 2, 2, 4] }], doors: [{ a: 'hall', b: 'a', vertical: false, width: 0.9, mid: [0.55, 2] }, { a: 'hall', b: 'b', vertical: false, width: 0.9, mid: [1.45, 2] }] };
  assert.deepEqual(swingConflicts(plan), []); // 0.55 +- 0.45 = 0.1..1.0 and 1.0..1.9: they touch at x = 1.0, they do not overlap
  plan.doors[1].mid = [1.2, 2];
  assert.equal(swingConflicts(plan).length, 1);
});

test('the plan builder reports the attic height rule and the neighbours', () => {
  const flat = sanitizeRoom({ ...DEFAULT_ROOM, kneeWall: 0.6, pitch: 22, maxHeight: 2.3, dormers: [] });
  const [plan] = generatePlans(flat, { rooms: [{ id: 'bed', type: 'bedroom', area: 10 }, { id: 'bath', type: 'bath', area: 4 }], links: [] }, { seed: 3 });
  assert.ok(plan.findings.some((f) => f.rule === 'lbo-height'), plan.findings.map((f) => f.msg).join(' | '));
  const kb = generatePlans(ATTIC, { rooms: [{ id: 'k', type: 'kitchen', area: 8 }, { id: 'l', type: 'living', area: 16 }], links: [] }, { seed: 3 });
  assert.ok(kb[0].rooms.length === 3);
});
