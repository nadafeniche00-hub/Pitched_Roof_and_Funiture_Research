// The distilled MSD files (pipeline/oracle/msd/distill.py): what real flats contain and how they connect, and 350 real flats to copy from. Checked against what the script promises, and against the
// facts of the real plans that the app has to respect (a bath opens into the corridor, not into a bedroom).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MSD_PRIORS as P } from '../../shared/msdPriors.js';
import { MSD_EXEMPLARS as E } from '../../shared/msdExemplars.js';

const NET = new Set(['bedroom', 'living', 'kitchen', 'dining', 'corridor', 'storeroom', 'bath']);
const TYPES = new Set([...NET, 'balcony']);
const area = (poly) => Math.abs(poly.reduce((s, [x1, y1], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + x1 * y2 - x2 * y1; }, 0)) / 2;
const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);

test('the size buckets follow each other, hold every flat, and every distribution adds up', () => {
  assert.equal(P.buckets[0].from, 0);
  for (let i = 1; i < P.buckets.length; i++) assert.equal(P.buckets[i].from, P.buckets[i - 1].to, 'no gap and no overlap');
  assert.equal(P.buckets.at(-1).to, null);
  assert.equal(P.buckets.reduce((s, b) => s + b.flats, 0), P.flats_used);
  for (const b of P.buckets.filter((x) => x.flats > 100)) {
    assert.ok(Math.abs(sum(b.bedrooms) - 1) < 0.02, `bedrooms of ${b.from}-${b.to}`);
    assert.ok(Math.abs(sum(b.baths) - 1) < 0.02, `baths of ${b.from}-${b.to}`);
    assert.ok(Math.abs(sum(b.area_share) - 1) < 0.03, `area shares of ${b.from}-${b.to} add up to ${sum(b.area_share).toFixed(3)}`);
    assert.ok(b.net_area_median >= b.from && (b.to === null || b.net_area_median < b.to));
  }
  assert.ok(Math.abs(sum(P.entrance_opens_into) - 1) < 0.02);
});

test('bigger flats have more bedrooms: the median flat of 100 to 130 m2 has three', () => {
  const mean = (b) => Object.entries(b.bedrooms).reduce((s, [k, v]) => s + k * v, 0);
  for (let i = 1; i < P.buckets.length; i++) assert.ok(mean(P.buckets[i]) > mean(P.buckets[i - 1]), `bucket ${i}`);
  assert.ok(P.buckets[5].bedrooms['3'] > P.buckets[5].bedrooms['2']);
});

test('how real flats connect: a bath opens into the corridor, almost never into a bedroom; the front door opens into the corridor', () => {
  const c = P.adjacency.connected_to, d = P.adjacency.door_to;
  for (const t of Object.keys(c)) for (const v of Object.values(c[t])) assert.ok(v >= 0 && v <= 1);
  assert.ok(c.bath.corridor > 0.8, `bath -> corridor ${c.bath.corridor}`);
  assert.ok(d.bath.bedroom < 0.1, `bath -> bedroom by a door ${d.bath.bedroom}: the hand-written link "bath near the bedroom" is about a shared wall, not a door`);
  assert.ok(c.bedroom.corridor > 0.8);
  assert.ok(c.living.kitchen > 0.5 && c.kitchen.living > 0.4, 'kitchen and living room are open to each other in most flats');
  assert.ok(P.entrance_opens_into.corridor > 0.85);
});

test('the exemplars are 300 to 400 real flats, spread over all the sizes', () => {
  assert.ok(E.length >= 300 && E.length <= 400, `${E.length} exemplars`);
  assert.equal(new Set(E.map((x) => x.id)).size, E.length, 'ids are unique');
  for (const b of P.buckets) assert.ok(E.filter((x) => x.area >= b.from && (b.to === null || x.area < b.to)).length >= 5, `at least 5 flats of ${b.from}-${b.to} m2`);
  assert.ok(E.some((x) => x.bedrooms === 0) && E.some((x) => x.bedrooms >= 4), 'from studio to big family flat');
});

test('every exemplar is a whole flat: known room types, real polygons, turned long side along x, valid connections', () => {
  for (const x of E) {
    assert.ok(x.rooms.length >= 3 && x.rooms.length <= 12, x.id);
    const types = x.rooms.map((r) => r.type);
    assert.ok(types.every((t) => TYPES.has(t)), `${x.id}: ${types}`);
    assert.ok(types.includes('bath') && (types.includes('bedroom') || types.includes('living')), `${x.id}: a bath and a bedroom or living room`);
    if (x.area > 40.05) assert.ok(types.includes('bedroom') && types.includes('kitchen') && types.includes('living'), `${x.id}: from 40 m2 a bedroom, a kitchen and a living room that the data names`); // the area is rounded to 0.1
    const pts = x.rooms.flatMap((r) => r.polygon);
    const [x0, y0, x1, y1] = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
    assert.ok(Math.abs(x0) < 0.011 && Math.abs(y0) < 0.011, `${x.id}: moved to the origin`);
    assert.ok(x1 - x0 >= (y1 - y0) * 0.75, `${x.id}: the long side lies along x (a turned flat can be a little off)`);
    for (const r of x.rooms) { assert.ok(r.polygon.length >= 3); assert.ok(area(r.polygon) >= 0.8, `${x.id}: a room of ${area(r.polygon)} m2`); }
    const net = x.rooms.reduce((s, r) => s + (NET.has(r.type) ? area(r.polygon) : 0), 0);
    assert.ok(Math.abs(net - x.area) < Math.max(0.2, x.area * 0.003), `${x.id}: net area ${net.toFixed(1)} against ${x.area}`);
    for (const [a, b, k] of x.edges) assert.ok(a >= 0 && a < b && b < x.rooms.length && (k === 'd' || k === 'p'), `${x.id}: edge ${a} ${b} ${k}`);
    assert.ok(x.entrance.length >= 1 && x.entrance.every((i) => i >= 0 && i < x.rooms.length), `${x.id}: entrance`);
    // every room can be reached from the entrance: a flat is one connected group
    const seen = new Set(x.entrance), stack = [...x.entrance];
    while (stack.length) { const n = stack.pop(); for (const [a, b] of x.edges) { const m = a === n ? b : b === n ? a : null; if (m !== null && !seen.has(m)) { seen.add(m); stack.push(m); } } }
    assert.equal(seen.size, x.rooms.length, `${x.id}: all rooms connected`);
  }
});

test('the priors say where they come from, and no room of an exemplar is a stair', () => {
  assert.match(P.source, /Modified Swiss Dwellings/);
  assert.ok(P.flats_used > 15000 && P.floors_read === 5372);
  assert.ok(E.every((x) => x.rooms.every((r) => r.type !== 'stairs')));
});
