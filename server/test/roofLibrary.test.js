import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM, sanitizeRoom } from '../../shared/engine.js';
import { meshHeight } from '../../shared/roofMesh.js';
import { PATTERNS, patternMesh, recognizeRoof } from '../../shared/roofLibrary.js';

const room = sanitizeRoom({ ...DEFAULT_ROOM, width: 8, depth: 11, kneeWall: 1, pitch: 40, maxHeight: 6 });

test('every pattern is recognised as itself', () => {
  for (const p of PATTERNS) {
    const r = recognizeRoof(patternMesh(room, p.id));
    assert.equal(r.id, p.id, `${p.id} was read as ${r.id} (${r.planes} planes, pitches ${r.pitches})`);
  }
});

test('every pattern covers the footprint with a plausible height', () => {
  for (const p of PATTERNS) {
    const m = patternMesh(room, p.id);
    for (const [x, y] of [[0.5, 0.5], [4, 5.5], [7.5, 10.5], [2, 8]]) {
      const h = meshHeight(m, x, y);
      assert.ok(h >= 0.9 && h <= 6.01, `${p.id} at ${x},${y} is ${h}`);
    }
  }
});

test('a gabled roof with a dormer extruded from it is still read as gabled, with details', () => {
  const m = patternMesh(room, 'gabled');
  m.v.push([5, 3, 3], [7, 3, 3], [7, 6, 3], [5, 6, 3]); // a small flat box top standing on the slope
  m.t.push([6, 7, 8], [6, 8, 9]);
  const r = recognizeRoof(m);
  assert.equal(r.id, 'gabled');
  assert.ok(r.details >= 1);
});
