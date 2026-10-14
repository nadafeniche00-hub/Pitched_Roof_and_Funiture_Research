import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, itemRects, DEFAULT_ROOM } from '../../shared/engine.js';
import { CATALOG } from '../../shared/catalog.js';

const OPEN = { ...DEFAULT_ROOM, dormers: [], stair: null, windows: [{ wall: 'N', pos: 2.5, width: 1 }], doors: [] };
const put = (type, x, y, rot = 0, id = type) => ({ id, type, x, y, rot, placed: true });
const issues = (r, i = 0) => r.items[i].issues.map((x) => x.code);

test('the front clearance rotates with the piece (clockwise on the plan)', () => {
  const def = CATALOG.wardrobe; // 1.2 x 0.6, front 0.8
  const r0 = itemRects(def, put('wardrobe', 3, 3, 0));
  assert.deepEqual(r0.body.map((v) => +v.toFixed(2)), [3, 3, 4.2, 3.6]);
  assert.ok(Math.abs(r0.front[1] - 3.6) < 1e-9 && Math.abs(r0.front[3] - 4.4) < 1e-9); // below it
  const r1 = itemRects(def, put('wardrobe', 3, 3, 1));
  assert.deepEqual(r1.body.map((v) => +v.toFixed(2)), [3, 3, 3.6, 4.2]);
  assert.ok(Math.abs(r1.front[2] - 3.0) < 1e-9 && Math.abs(r1.front[0] - 2.2) < 1e-9); // to its left
  const r2 = itemRects(def, put('wardrobe', 3, 3, 2));
  assert.ok(Math.abs(r2.front[3] - 3.0) < 1e-9); // above it
});

test('a bed in open floor with free sides and foot end fits', () => {
  const r = evaluate(OPEN, [put('bed_double', 1.7, 2, 0)]);
  assert.equal(r.items[0].status, 'ok', JSON.stringify(r.items[0].issues));
});

test('a tall piece must not block a window; a low one may', () => {
  const tall = evaluate(OPEN, [put('wardrobe', 1.9, 0, 0)]);
  assert.ok(issues(tall).includes('window'));
  const low = evaluate(OPEN, [put('chest', 2.0, 0, 0)]);
  assert.ok(!issues(low).includes('window'));
});

test('clearance in front of a wardrobe pushed against a wall is not available', () => {
  // front faces the wall (rot 2: front points up, body at y = 0)
  const r = evaluate({ ...OPEN, windows: [] }, [put('wardrobe', 1.9, 0, 2)]); // full-height floor, front points out of the room
  assert.notEqual(r.items[0].status, 'ok');
  assert.ok(!issues(r).includes('headroom'));
  assert.ok(issues(r).includes('clearance'));
});

test('overlapping pieces are both flagged; moving one away clears it', () => {
  const a = evaluate(OPEN, [put('chest', 2, 4, 0, 'a'), put('chest', 2.4, 4, 0, 'b')]);
  assert.ok(issues(a, 0).includes('overlap') && issues(a, 1).includes('overlap'));
  const b = evaluate(OPEN, [put('chest', 2, 4, 0, 'a'), put('chest', 2, 5.5, 0, 'b')]);
  assert.ok(!issues(b, 0).includes('overlap') && !issues(b, 1).includes('overlap'));
});

test('unplaced pieces count as not fitting', () => {
  const r = evaluate(OPEN, [{ ...put('desk', 0, 0), placed: false }]);
  assert.equal(r.items[0].status, 'unplaced');
  assert.equal(r.metrics.furnish, 0);
});
