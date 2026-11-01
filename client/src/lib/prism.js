// A room as a prism cut by the roof: the floor rectangle extruded up to the roof surface (or to `cap` if that is lower).
// Returns the triangles of the top and of the four sides separately, so a picked face can be highlighted on its own.
import { roofHeight } from '@shared/engine.js';

const STEP = 0.1;

export function prismParts(room, rect, cap = Infinity) {
  const [x0, z0, x1, z1] = rect;
  const nx = Math.max(1, Math.round((x1 - x0) / STEP)), nz = Math.max(1, Math.round((z1 - z0) / STEP));
  const e = 1e-3;
  const hAt = (x, z) => Math.min(cap, roofHeight(room, Math.min(room.width - e, Math.max(e, x)), Math.min(room.depth - e, Math.max(e, z))));
  const X = (i) => x0 + ((x1 - x0) * i) / nx, Z = (j) => z0 + ((z1 - z0) * j) / nz;
  const H = Array.from({ length: nz + 1 }, (_, j) => Array.from({ length: nx + 1 }, (_, i) => hAt(X(i), Z(j))));
  const top = [], px = [], nxp = [], pz = [], nzp = [];
  let peak = 0;
  const q = (out, a, b, c, d) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    q(top, [X(i), H[j][i], Z(j)], [X(i + 1), H[j][i + 1], Z(j)], [X(i + 1), H[j + 1][i + 1], Z(j + 1)], [X(i), H[j + 1][i], Z(j + 1)]);
    peak = Math.max(peak, H[j][i], H[j + 1][i + 1]);
  }
  for (let j = 0; j < nz; j++) {
    q(nxp, [x0, 0, Z(j)], [x0, 0, Z(j + 1)], [x0, H[j + 1][0], Z(j + 1)], [x0, H[j][0], Z(j)]);
    q(px, [x1, 0, Z(j)], [x1, 0, Z(j + 1)], [x1, H[j + 1][nx], Z(j + 1)], [x1, H[j][nx], Z(j)]);
  }
  for (let i = 0; i < nx; i++) {
    q(nzp, [X(i), 0, z0], [X(i + 1), 0, z0], [X(i + 1), H[0][i + 1], z0], [X(i), H[0][i], z0]);
    q(pz, [X(i), 0, z1], [X(i + 1), 0, z1], [X(i + 1), H[nz][i + 1], z1], [X(i), H[nz][i], z1]);
  }
  return { top, px, nx: nxp, pz, nz: nzp, peak };
}
