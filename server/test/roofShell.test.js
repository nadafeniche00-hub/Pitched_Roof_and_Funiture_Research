// The walk view must show the roof the user sculpted, not the gable of the pitch: the shell takes the roof plane from the sculpted mesh (shared/roofMesh.js), like the engine does.
// Before this was fixed the outer skin took the plane from the knee wall and the pitch only, and treated everything above that plane as a dormer: the outside kept the old roof.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as mod from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const shared = pathToFileURL(fileURLToPath(new URL('../../shared/', import.meta.url))).href;
mod.registerHooks({ resolve: (s, c, n) => (s.startsWith('@shared/') ? n(shared + s.slice(8), c) : n(s, c)) });
const { sanitizeRoom, DEFAULT_ROOM, roofHeight } = await import('../../shared/engine.js');
const SHELL = process.env.ROOF_SHELL_MODULE || '../../client/src/lib/roofShell.js'; // another module can be tried against the same expectations
const { shellGeometries, ROOF_T } = await import(SHELL);

const W = 6, D = 8;
// a shed roof: 1 m high at x = 0, 3 m at x = W, the same all along y. The pitch of the room (30 degrees, knee wall 1 m) would make a gable that peaks in the middle at 2.7 m.
const shed = { v: [[0, 0, 1], [W, 0, 3], [W, D, 3], [0, D, 1]], t: [[0, 1, 2], [0, 2, 3]] };
const room = sanitizeRoom({ ...DEFAULT_ROOM, width: W, depth: D, kneeWall: 1, pitch: 30, maxHeight: 3.5, dormers: [], stair: null, roof: shed });

/** The top of the outer roof along x, at the middle of the depth: [[x, height], ...] from the triangles of the roof geometry. */
function profile(geo) {
  const p = geo.attributes.position, rows = new Map();
  for (let i = 0; i + 2 < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    if (Math.abs(cz - D / 2) > 0.4) continue;
    const key = Math.round(cx * 10);
    if (!rows.has(key) || cy > rows.get(key)) rows.set(key, cy); // the top surface, not the faces under it
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([k, y]) => [k / 10, y]);
}

test('the engine already knows the sculpted roof (what the shell is compared with)', () => {
  assert.ok(Math.abs(roofHeight(room, 1, 4) - 1.333) < 0.01);
  assert.ok(Math.abs(roofHeight(room, 5, 4) - 2.667) < 0.01);
});

test('the outer roof follows the sculpted mesh: one smooth slope from low to high, no gable and no steps', () => {
  const pr = profile(shellGeometries(room).roof).filter(([x]) => x >= 0.5 && x <= W - 0.5);
  assert.ok(pr.length > 40, `the roof was sampled (${pr.length} points)`);
  const slope = (pr.at(-1)[1] - pr[0][1]) / (pr.at(-1)[0] - pr[0][0]);
  assert.ok(Math.abs(slope - 2 / W) < 0.04, `the mean slope is the mesh's ${(2 / W).toFixed(3)}, not ${slope.toFixed(3)}`);
  for (let i = 1; i < pr.length; i++) assert.ok(pr[i][1] >= pr[i - 1][1] - 0.02, `the roof never falls towards the ridge at x = ${pr[i][0]} (the pitch's gable would)`);
  let worst = 0;
  for (let i = 1; i < pr.length; i++) worst = Math.max(worst, Math.abs(pr[i][1] - pr[i - 1][1]));
  assert.ok(worst < 0.12, `no step in the roof: the largest jump between neighbouring points is ${worst.toFixed(2)} m`);
});

test('the outer roof lies ROOF_T above the mesh, across the slope', () => {
  const pr = profile(shellGeometries(room).roof);
  const at = (x) => pr.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best))[1];
  const tilt = Math.hypot(1, 2 / W);
  for (const x of [1.5, 3, 4.5]) {
    const mesh = 1 + (2 * x) / W, got = at(x);
    assert.ok(Math.abs(got - (mesh + ROOF_T * tilt)) < 0.08, `x = ${x}: the roof is at ${got.toFixed(2)} m, the mesh plus its thickness is ${(mesh + ROOF_T * tilt).toFixed(2)} m`);
  }
});

test('without a sculpted roof the pitch still makes the gable it always did', () => {
  const plain = sanitizeRoom({ ...DEFAULT_ROOM, width: W, depth: D, kneeWall: 1, pitch: 30, maxHeight: 3.5, dormers: [], stair: null });
  const pr = profile(shellGeometries(plain).roof).filter(([x]) => x >= 0.5 && x <= W - 0.5);
  const top = pr.reduce((a, b) => (b[1] > a[1] ? b : a));
  assert.ok(Math.abs(top[0] - W / 2) < 0.4, `the ridge is in the middle, at x = ${top[0]}`);
  assert.ok(Math.abs(top[1] - (1 + Math.tan(Math.PI / 6) * 3 + ROOF_T * Math.hypot(1, Math.tan(Math.PI / 6)))) < 0.1, `its height is ${top[1].toFixed(2)} m`);
});
