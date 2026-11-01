import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM, sanitizeRoom, roofHeight, getGrid } from '../../shared/engine.js';
import { autoMesh, meshHeight, cutMesh, splitEdge } from '../../shared/roofMesh.js';

const room = sanitizeRoom(DEFAULT_ROOM);

test('the automatic mesh reproduces the analytic gabled roof', () => {
  const m = autoMesh(room);
  for (const [x, y] of [[0.3, 1], [1.2, 3], [2.5, 3.5], [4.4, 6]]) {
    const analytic = Math.min(room.maxHeight, room.kneeWall + Math.tan((room.pitch * Math.PI) / 180) * Math.min(x, room.width - x));
    assert.ok(Math.abs(meshHeight(m, x, y) - analytic) < 1e-6, `at ${x},${y}`);
  }
});

test('a sculpted roof changes the grid heights', () => {
  const m = autoMesh(room);
  m.v[4][2] += 0.5; m.v[5][2] += 0.5; // raise the ridge
  const r = sanitizeRoom({ ...room, roof: m });
  assert.ok(r.roof);
  const base = roofHeight({ ...room, dormers: [] }, 2.5, 3.5), raised = roofHeight({ ...r, dormers: [] }, 2.5, 3.5);
  assert.ok(raised > base);
  assert.equal(getGrid({ ...r, dormers: [] }, 0.1).nx, Math.round(room.width / 0.1));
});

test('cutting along the middle keeps the heights and adds vertices', () => {
  const m = autoMesh(room), c = cutMesh(m, [0, 3.5], [5, 3.5]);
  assert.ok(c.v.length > m.v.length && c.t.length > m.t.length);
  for (const [x, y] of [[1, 1], [2, 5], [4, 3.6]]) assert.ok(Math.abs(meshHeight(c, x, y) - meshHeight(m, x, y)) < 1e-6);
});

test('splitting an edge keeps the surface and adds one vertex', () => {
  const m = autoMesh(room), { mesh, index } = splitEdge(m, 4, 5);
  assert.equal(mesh.v.length, m.v.length + 1);
  assert.equal(mesh.v[index][1], room.depth / 2);
  assert.ok(Math.abs(meshHeight(mesh, 1, 3) - meshHeight(m, 1, 3)) < 1e-6);
});

test('bad meshes are dropped by sanitizeRoom', () => {
  assert.equal(sanitizeRoom({ ...room, roof: { v: [[0, 0, 0]], t: [[0, 1, 2]] } }).roof, undefined);
});
