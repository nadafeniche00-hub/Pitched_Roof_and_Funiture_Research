import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, getGrid, roofHeight, DEFAULT_ROOM } from '../../shared/engine.js';

// 4 x 4 m, knee wall 1.0, 45 deg: h(x) = 1 + min(x, 4 - x)  ->  1.0 .. 3.0 at the ridge, capped at 3.0
const R = { ...DEFAULT_ROOM, width: 4, depth: 4, kneeWall: 1.0, pitch: 45, maxHeight: 3.0, dormers: [], stair: null, windows: [], doors: [] };

test('analytic roof height agrees with the grid at every cell centre', () => {
  const g = getGrid(DEFAULT_ROOM, 0.05);
  for (let j = 0; j < g.ny; j += 7) for (let i = 0; i < g.nx; i += 7) {
    const h = roofHeight(DEFAULT_ROOM, (i + 0.5) * g.res, (j + 0.5) * g.res);
    assert.ok(Math.abs(h - g.h[j * g.nx + i]) < 1e-4);
  }
});

test('area counting: >=2.0 m counts fully, 1.0-2.0 m counts half, below 1.0 m not at all', () => {
  const m = evaluate(R, []).metrics;
  assert.ok(Math.abs(m.gross - 16) < 1e-6);
  assert.ok(Math.abs(m.counted - 12) < 1e-6, `counted ${m.counted}`); // 8 m2 full + 8 m2 half
  assert.ok(Math.abs(m.usableRatio - 0.75) < 1e-6);
  assert.equal(m.lost, 0);
});

test('a lower knee wall loses floor area entirely', () => {
  const m = evaluate({ ...R, kneeWall: 0.4 }, []).metrics;
  assert.ok(m.lost > 0 && m.counted < 12);
});

test('a dormer raises the ceiling inside its footprint only', () => {
  const room = { ...R, dormers: [{ side: 'left', center: 2, width: 1.5, depth: 1.2, height: 2.4 }] };
  assert.equal(roofHeight(room, 0.3, 2), 2.4);
  assert.ok(roofHeight(room, 0.3, 0.2) < 1.5); // outside the dormer, same x
});

test('maxHeight caps the ridge (collar-tie ceiling)', () => {
  const room = { ...R, width: 8, maxHeight: 2.5 };
  assert.equal(roofHeight(room, 4, 1), 2.5);
});

test('a stair that arrives under the slope cannot be circulated from', () => {
  const room = { ...R, kneeWall: 0.3, pitch: 20, stair: { x: 1.5, y: 0.2, w: 0.9, d: 2 } };
  assert.equal(evaluate(room, []).metrics.connectivity, 0);
});
