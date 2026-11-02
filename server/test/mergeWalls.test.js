import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeWalls } from '../../client/src/lib/mergeWalls.js';

// wallsOf gives every room's own edge, so neighbours overlap: [start, end] of a door is measured from p0 of the piece it sits in
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('overlapping pieces on one line become one wall; the door stays at the same place', () => {
  const out = mergeWalls([
    { p0: [0, 4], p1: [4.6, 4], op: [[3.6, 4.5]] },       // the long edge of the room below
    { p0: [3.5, 4], p1: [4.6, 4], op: [[0.1, 1.0]] },     // the same door seen from the stair hall (3.5 + 0.1 = 3.6 ... 4.5)
    { p0: [0, 4], p1: [3.5, 4], op: [] },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].p0, [0, 4]);
  assert.deepEqual(out[0].p1, [4.6, 4]);
  assert.equal(out[0].op.length, 1);
  assert.ok(near(out[0].op[0][0], 3.6) && near(out[0].op[0][1], 4.5));
});

test('pieces that only touch are joined, a gap keeps two walls', () => {
  assert.equal(mergeWalls([{ p0: [0, 2], p1: [2, 2], op: [] }, { p0: [2, 2], p1: [5, 2], op: [] }]).length, 1);
  assert.equal(mergeWalls([{ p0: [0, 2], p1: [2, 2], op: [] }, { p0: [3, 2], p1: [5, 2], op: [] }]).length, 2);
});

test('vertical walls are merged along y, and a door is cut to the piece it falls in', () => {
  const out = mergeWalls([{ p0: [3, 0], p1: [3, 4], op: [[3.2, 3.9]] }, { p0: [3, 4], p1: [3, 7], op: [] }]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].p0, [3, 0]);
  assert.deepEqual(out[0].p1, [3, 7]);
  assert.deepEqual(out[0].op, [[3.2, 3.9]]);
  const apart = mergeWalls([{ p0: [3, 0], p1: [3, 4], op: [[3.2, 3.9]] }, { p0: [3, 5], p1: [3, 7], op: [] }]);
  assert.equal(apart.length, 2);
  assert.equal(apart.find((w) => w.p0[1] === 5).op.length, 0);
});

test('parallel walls on different lines stay apart', () => {
  assert.equal(mergeWalls([{ p0: [0, 4.005], p1: [4.6, 4.005], op: [] }, { p0: [4.6, 4.134], p1: [8, 4.134], op: [] }]).length, 2);
});
