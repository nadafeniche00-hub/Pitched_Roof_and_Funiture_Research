// The technical plan must not print on top of itself: room stamps clear of furniture, door swings and the stair, furniture names inside their piece,
// dimension numbers apart. techPrimitives() returns what still overlaps ({ overlaps }); the free-spot search must beat the old "stamp in the middle".
import test from 'node:test';
import assert from 'node:assert/strict';
import * as mod from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

// client/src/lib imports '@shared/...' (a Vite alias): the same alias for Node
const shared = pathToFileURL(fileURLToPath(new URL('../../shared/', import.meta.url))).href;
mod.registerHooks({ resolve: (s, c, n) => (s.startsWith('@shared/') ? n(shared + s.slice(8), c) : n(s, c)) });
const { sanitizeRoom, DEFAULT_ROOM } = await import('../../shared/engine.js');
const { generatePlans, sanitizeBrief } = await import('../../shared/plans.js');
const { furnishPlan } = await import('../../shared/furnish.js');
const { techPrimitives } = await import('../../client/src/lib/techPlan.js');

const room = sanitizeRoom(DEFAULT_ROOM);
const brief = sanitizeBrief({
  rooms: [{ id: 'bed1', type: 'bedroom', area: 12 }, { id: 'bed2', type: 'bedroom', area: 12 }, { id: 'bath', type: 'bath', area: 5 }, { id: 'study', type: 'study', area: 6 }, { id: 'kid', type: 'child', area: 14 }],
  links: [['bath', 'bed1', 'near']],
});
const count = (kinds, only) => kinds.filter((k) => (only ? k.startsWith(only) : true)).length;

test('room stamps find free spots: fewer overlaps than the stamp in the middle of the room', () => {
  let before = 0, after = 0, plans = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const p = generatePlans(room, brief, { seed, tries: 60, keep: 1, refine: 10 })[0];
    if (!p) continue;
    plans++;
    const items = furnishPlan(room, p, { seed }).items;
    const layout = { rooms: p.rooms, doors: p.doors };
    before += count(techPrimitives(room, layout, items, { centreStamps: true }).overlaps, 'stamp');
    after += count(techPrimitives(room, layout, items).overlaps, 'stamp');
  }
  assert.ok(plans >= 3, 'plans were generated');
  console.log(`stamp overlaps over ${plans} plans: stamp in the middle ${before}, free spot ${after}`);
  assert.ok(after <= before, 'a free spot is never worse than the middle');
  assert.ok(after < before || before === 0, 'and it removes overlaps where there were some');
});

test('furniture keeps clear of the door swings of the plan (the engine reserves them)', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const p = generatePlans(room, brief, { seed, tries: 60, keep: 1, refine: 10 })[0];
    if (!p) continue;
    const items = furnishPlan(room, p, { seed }).items;
    const o = techPrimitives(room, { rooms: p.rooms, doors: p.doors }, items).overlaps;
    assert.equal(count(o, 'door-furniture'), 0, `seed ${seed}: furniture inside a door swing`);
    assert.equal(count(o, 'furniture-furniture'), 0, `seed ${seed}: furniture on furniture`);
  }
});

test('every door is drawn once, swinging where the engine says it swings', async () => {
  const { doorSwing } = await import('../../shared/doors.js');
  for (let seed = 1; seed <= 6; seed++) {
    const p = generatePlans(room, brief, { seed, tries: 60, keep: 1, refine: 10 })[0];
    if (!p) continue;
    const rects = Object.fromEntries(p.rooms.map((r) => [r.id, r.rect]));
    const drawn = techPrimitives(room, { rooms: p.rooms, doors: p.doors }, []).swings;
    assert.equal(drawn.length, p.doors.length, `seed ${seed}: one swing per door (no doubled arcs in the DXF)`);
    for (const d of p.doors) {
      const e = doorSwing(d, rects).rect;
      assert.ok(drawn.some((s) => s.every((v, i) => Math.abs(v - e[i]) < 0.03)), `seed ${seed}: the drawn swing of a door is the swing the furniture engine keeps free`);
    }
    assert.equal(count(techPrimitives(room, { rooms: p.rooms, doors: p.doors }, []).overlaps, 'door-door'), 0, `seed ${seed}: two leaves in one corner`);
  }
});
