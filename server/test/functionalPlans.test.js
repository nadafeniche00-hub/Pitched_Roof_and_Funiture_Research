// A plan is functional when its rooms are big enough, not too thin, and no wall ends on a window: the plan builder makes the brief fit the roof (fitToRoof) and, if the best layout still is not
// functional, tries a little less (every area 15 % smaller, then the least important room left out). The numbers come from 127,908 real rooms (pipeline/oracle/msd); the audit of the oracle
// (pipeline/oracle) measures the same things over many plans.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRoom, DEFAULT_ROOM } from '../../shared/engine.js';
import { ROOM_TYPES, HALL, THIN, fitToRoof, generatePlans, netRect, typeOf, capacity } from '../../shared/plans.js';

const room = sanitizeRoom({ ...DEFAULT_ROOM, width: 6, depth: 8, kneeWall: 1.2, pitch: 40, maxHeight: 3.2, dormers: [], stair: { x: 2.55, y: 0, w: 0.9, d: 2.2 } });
const fits = { rooms: [{ id: 'a', type: 'bedroom', area: 10 }, { id: 'b', type: 'bath', area: 4 }, { id: 'c', type: 'study', area: 5 }], links: [] };
const huge = { rooms: [{ id: 'a', type: 'bedroom', area: 12 }, { id: 'b', type: 'child', area: 10 }, { id: 'c', type: 'living', area: 20 }, { id: 'd', type: 'kitchen', area: 9 }, { id: 'e', type: 'bath', area: 5 }, { id: 'f', type: 'study', area: 8 }, { id: 'g', type: 'storage', area: 4 }], links: [['a', 'e', 'near'], ['g', 'a', 'near']] };

/** what the oracle's rules check on a plan, here on the rooms between the walls */
function problems(plan) {
  const out = [];
  for (const r of plan.rooms) {
    const t = typeOf(r.type), n = netRect(room, r.rect), w = n[2] - n[0], d = n[3] - n[1], lo = Math.min(w, d);
    if (lo < t.min - 1e-6) out.push(`${r.id} ${lo.toFixed(2)} m wide`);
    if (w * d < (t.minArea || 0) - 1e-6) out.push(`${r.id} ${(w * d).toFixed(1)} m2`);
    if (Math.max(w, d) / lo > t.maxAspect * THIN + 1e-6) out.push(`${r.id} ${(Math.max(w, d) / lo).toFixed(1)}:1`);
  }
  return out;
}

test('every room type carries the numbers calibrated on real plans', () => {
  for (const [k, t] of Object.entries({ ...ROOM_TYPES, hall: HALL })) assert.ok(t.maxAspect >= 1.5 && t.maxAspect <= 4, `${k}: maxAspect ${t.maxAspect}`);
  assert.equal(ROOM_TYPES.kitchen.min, 1.8, 'the old 2.2 m flagged 31 % of real kitchens');
  assert.equal(ROOM_TYPES.storage.min, 0.8, 'the old 1.2 m flagged 48 % of real storerooms');
  assert.equal(ROOM_TYPES.bedroom.maxAspect, 2.0, 'the 95th percentile of real bedrooms is 1.95');
});

test('a brief that fits is left alone', () => {
  const r = fitToRoof(room, fits);
  assert.deepEqual(r.notes, []);
  assert.deepEqual(r.brief.rooms.map((x) => x.area), [10, 4, 5]);
});

test('a brief that asks for too much is made to fit: the least important rooms go first and links to them go too', () => {
  const r = fitToRoof(room, huge);
  assert.ok(r.notes.length > 0);
  assert.ok(r.brief.rooms.length < huge.rooms.length);
  assert.ok(r.brief.rooms.some((x) => x.type === 'bedroom'), 'the bedroom stays: it is dropped last');
  assert.ok(!r.brief.rooms.some((x) => x.type === 'storage'), 'storage goes first');
  assert.ok(r.brief.links.every(([a, b]) => r.brief.rooms.some((x) => x.id === a) && r.brief.rooms.some((x) => x.id === b)), 'no link to a room that is gone');
  const budget = capacity(room, huge).have * 0.9 - HALL.area;
  assert.ok(r.brief.rooms.reduce((s, x) => s + x.area, 0) <= budget + 0.5, 'what is left fits what the roof gives');
  assert.ok(r.brief.rooms.every((x) => x.area >= (typeOf(x.type).minArea || 2) - 1e-9), 'no room below its minimum area');
});

test('plans are functional: no room too small or too thin, no wall on a window, and the notes say what changed', () => {
  let tested = 0, changed = 0;
  for (const brief of [fits, huge]) {
    for (let seed = 1; seed <= 3; seed++) {
      const plans = generatePlans(room, brief, { seed });
      assert.ok(plans.length > 0, 'a plan is made');
      for (const p of plans) {
        tested += 1;
        assert.deepEqual(problems(p), [], `seed ${seed}: the rooms between the walls`);
        assert.equal(p.clashes, 0, 'no wall on a window');
        assert.ok(Array.isArray(p.adjusted));
        if (p.adjusted.length) changed += 1;
      }
    }
  }
  assert.ok(tested >= 6 && changed > 0, 'the oversized brief was changed, and said so');
  assert.deepEqual(generatePlans(room, fits, { seed: 1 })[0].adjusted, [], 'the brief that fits was not changed');
});

test('fit: false and degrade: false give the old behaviour: every room, whatever it costs', () => {
  const [p] = generatePlans(room, huge, { seed: 1, fit: false, degrade: false });
  assert.equal(p.rooms.length, huge.rooms.length + 1, 'all the rooms and the hall');
  assert.deepEqual(p.adjusted, []);
});
