import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, solve, DEFAULT_ROOM as SAMPLE } from '../../shared/engine.js';
// the tests pin the small 5 x 7 m attic they were written for; the app's sample house is bigger
const DEFAULT_ROOM = { ...SAMPLE, width: 5, depth: 7, kneeWall: 0.9, pitch: 38, maxHeight: 3, dormers: [{ side: 'left', center: 3.5 }], stair: { x: 2, y: 0.2, w: 0.9, d: 2 }, windows: [{ wall: 'N', pos: 2.5, width: 1 }, { wall: 'S', pos: 2.5, width: 1 }] };
import { PRESETS } from '../../shared/presets.js';

const run = (p) => solve(p.room, p.items, { seed: 7 });

test('every preset yields a finite, bounded index', () => {
  for (const p of PRESETS) {
    const { result } = run(p);
    console.log(p.id.padEnd(9), 'index', result.metrics.index.toFixed(2), 'fits', result.metrics.fits + '/' + result.metrics.total,
      'counted', result.metrics.counted.toFixed(1) + '/' + result.metrics.gross.toFixed(1), 'conn', result.metrics.connectivity.toFixed(2));
    assert.ok(result.metrics.index >= 0 && result.metrics.index <= 1);
  }
});

test('evaluation separates a roof storey that works from one that does not', () => {
  const [good, typical, bad] = PRESETS.map((p) => run(p).result.metrics);
  assert.ok(good.index > typical.index, 'steep+dormers beats typical');
  assert.ok(typical.index > bad.index, 'typical beats shallow');
  assert.ok(good.fits > bad.fits);
});

test('a wardrobe at the knee wall fails on headroom', () => {
  const items = [{ id: 'w', type: 'wardrobe', x: 0, y: 5.5, rot: 0, placed: true }];
  const r = evaluate(DEFAULT_ROOM, items);
  assert.equal(r.items[0].status, 'fail');
  assert.ok(r.items[0].issues.some((i) => i.code === 'headroom'));
});

test('a bed under the low zone is fine, the same bed blocking the stair is not', () => {
  const room = { ...DEFAULT_ROOM, dormers: [] };
  const okBed = evaluate(room, [{ id: 'b', type: 'bed_double', x: 0.1, y: 4, rot: 1, placed: true }]);
  assert.notEqual(okBed.items[0].status, 'unplaced');
  const onStair = evaluate(room, [{ id: 'b', type: 'bed_double', x: 1.5, y: 0.2, rot: 0, placed: true }]);
  assert.ok(onStair.items[0].issues.some((i) => i.code === 'stair'));
});

test('overlap is reported on both pieces', () => {
  const items = [
    { id: 'a', type: 'chest', x: 2, y: 4, rot: 0, placed: true },
    { id: 'b', type: 'chest', x: 2.5, y: 4, rot: 0, placed: true },
  ];
  const r = evaluate(DEFAULT_ROOM, items);
  assert.ok(r.items.every((i) => i.issues.some((x) => x.code === 'overlap')));
});

test('the same wardrobe inside the dormer fits - the dormer buys the height back', () => {
  const r = evaluate(DEFAULT_ROOM, [{ id: 'w', type: 'wardrobe', x: 0, y: 3, rot: 1, placed: true }]);
  assert.ok(!r.items[0].issues.some((i) => i.code === 'headroom'));
});
