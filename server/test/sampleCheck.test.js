// A real storey of a Revit sample as a template of the app, and the app's rules held against its rooms. The export here is made up, in the shape of pipeline/revit/SampleExport (no Revit data
// is in the repository): an attic of 8 x 10 m with a gabled roof, three rooms and a stair.
import test from 'node:test';
import assert from 'node:assert/strict';
import { typeFromName, polyArea, minRect, deriveTemplate, headroom, checkRooms } from '../../shared/sampleCheck.js';

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const wall = (a, b, top = 4.1) => ({ function: 'Exterior', p0: [...a, 3], p1: [...b, 3], box: { min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), 3], max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), top] } });
const sample = {
  source: 'Made up.rvt',
  roofs: [{ type: 'Ziegeldach', level: 'Dachgeschoss', kind: 'FootPrintRoof', box: { min: [-0.5, -0.5, 4], max: [8.5, 10.5, 7.1] } }],
  attic: {
    level: { name: 'Dachgeschoss', elevation_m: 3 },
    walls: [wall([0, 0], [8, 0]), wall([8, 0], [8, 10]), wall([8, 10], [0, 10]), wall([0, 10], [0, 0])],
    rooms: [
      { name: 'Schlafzimmer', number: '1', area_m2: 18, loops: [rect(0, 0, 4, 4.5)] },
      { name: 'Bad', number: '2', area_m2: 7.5, loops: [rect(4, 0, 8, 1.9)] },
      { name: 'Abstellraum', number: '3', area_m2: 1.2, loops: [rect(0, 9, 0.4, 10)] },
    ],
    windows: [{ at: [4, 0, 4], width_mm: 1200 }],
    doors: [],
    stairs: [{ box: { min: [3.5, 4, 3], max: [4.5, 6.4, 6] } }],
  },
};

test('rooms are typed from their German, English and Japanese names', () => {
  assert.equal(typeFromName('Schlafzimmer'), 'bedroom');
  assert.equal(typeFromName('Bad'), 'bath');
  assert.equal(typeFromName('Gäste-WC'), 'wc');
  assert.equal(typeFromName('Küche'), 'kitchen');
  assert.equal(typeFromName('Abstellraum'), 'storage');
  assert.equal(typeFromName('Kitchen'), 'kitchen');
  assert.equal(typeFromName('寝室'), 'bedroom');
  assert.equal(typeFromName('Foyer 7'), null);
});

test('polygon area, and the smallest rectangle around a polygon (also a turned one)', () => {
  assert.equal(polyArea(rect(0, 0, 4, 5)), 20);
  const m = minRect(rect(0, 0, 4, 5));
  assert.ok(Math.abs(m.short - 4) < 1e-9 && Math.abs(m.long - 5) < 1e-9);
  const turned = rect(0, 0, 4, 1).map(([x, y]) => [x * Math.cos(0.6) - y * Math.sin(0.6), x * Math.sin(0.6) + y * Math.cos(0.6)]);
  const t = minRect(turned);
  assert.ok(Math.abs(t.short - 1) < 1e-6 && Math.abs(t.long - 4) < 1e-6);
});

test('the attic of a sample becomes a room of the app: footprint, knee wall, pitch from the roof, stair, window', () => {
  const t = deriveTemplate(sample);
  assert.equal(t.pitched, true);
  assert.equal(t.room.width, 8);
  assert.equal(t.room.depth, 10);
  assert.equal(t.room.kneeWall, 1.1, 'the top of the exterior walls above the floor');
  assert.ok(Math.abs(t.room.pitch - 36.9) < 0.2, `pitch ${t.room.pitch}: the ridge stands 3 m above the top of the knee wall over a run of 4 m`);
  assert.ok(t.room.stair.w > 0 && t.room.stair.d > 2);
  assert.equal(t.room.windows[0].wall === 'N' || t.room.windows[0].wall === 'S' || t.room.windows[0].wall === 'W' || t.room.windows[0].wall === 'E', true);
  assert.equal(t.rooms.length, 3);
});

test('a flat roof is not a pitched template', () => {
  const flat = { ...sample, roofs: [{ ...sample.roofs[0], box: { min: [-0.5, -0.5, 4.05], max: [8.5, 10.5, 4.2] } }] };
  const t = deriveTemplate(flat);
  assert.equal(t.pitched, false);
  assert.ok(t.notes.some((n) => /flat roof/.test(n)));
  assert.equal(deriveTemplate({ ...sample, attic: null }), null);
});

test('headroom under the roof: a room by the eave stands lower than one at the ridge', () => {
  const t = deriveTemplate(sample);
  const eave = headroom(t.room, rect(0, 0, 0.8, 4));
  const ridge = headroom(t.room, rect(3.6, 0, 4.4, 4));
  assert.ok(eave.full < ridge.full, 'the strip along the eave is lower: part of it stands only 1 to 2 m');
  assert.ok(eave.half > 0 && eave.low === 0, 'knee wall 1.1 m: nothing is under 1 m');
  assert.equal(ridge.full, 1, 'at the ridge all of it stands 2 m');
  assert.ok(ridge.counted > eave.counted);
});

test('the rules of the app on real rooms: a closet of 1.2 m2 is small, a room outside the real plans is said so', () => {
  const t = deriveTemplate(sample);
  const rows = checkRooms(t, { bedroom: { p5: 10, p95: 21.5 }, bath: { p5: 1.5, p95: 6.5 } });
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.deepEqual(by.Schlafzimmer.flags.filter((f) => /small|narrow|thin/.test(f)), [], 'a bedroom of 4 x 4.5 m is fine');
  assert.ok(by.Bad.flags.some((f) => /outside the real plans/.test(f)), '7.6 m2 is above the 95th percentile of real baths');
  assert.ok(by.Abstellraum.flags.some((f) => /narrow/.test(f)) && by.Abstellraum.flags.some((f) => /small/.test(f)), '0.4 x 1 m is narrower than 0.8 m and smaller than 1 m2');
});
