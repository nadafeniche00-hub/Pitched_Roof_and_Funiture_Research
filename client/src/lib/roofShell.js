// The roof shell of the walk view as geometry: two skins (inner = the room as drawn, outer = pushed out by the thickness of the roof and the walls), built from the height field of the engine
// and the roof plane under it: a sculpted roof mesh when there is one, else the pitch. Plain JavaScript on three.js geometry, so it can be tested without the browser.
import * as THREE from 'three';
import { getGrid } from '@shared/engine.js';
import { meshHeight } from '@shared/roofMesh.js';

export function addUV(geo) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= 0.5) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Thickness of the roof (measured across the slope) and of the outer walls in m. The typical build-ups of partInfo.js come to about 0.29 m (roof) and 0.27 m (wall).
export const ROOF_T = 0.3, WALL_T = 0.4; // wall: 36.5 cm masonry (the outer wall of the technical plan) plus plaster, in whole cells of the 10 cm grid

/**
 * The roof shell as two skins with the thickness of the building between them (so nothing is drawn twice on the same spot, which no renderer likes).
 * The inner skin is the surface of the room as drawn: width, depth and heights are clear dimensions, and its faces turn into the room. The outer skin is that
 * surface pushed out: the roof by ROOF_T across the slope, the walls and the cheeks of the dormers by WALL_T. Tops (roof, dormer roofs, flat ceilings) and vertical
 * faces (knee walls, gables, dormer cheeks) are separate geometries, so the outside can be tiles over plaster.
 */
export function shellGeometries(room) {
  const { nx, ny, res, h } = getGrid(room, 0.1);
  const tan = Math.tan((room.pitch * Math.PI) / 180);
  // the roof plane without the dormers: a sculpted roof mesh when there is one (it overrides the pitch, as in the engine), else the pitch. Outside the plan a mesh goes on at the height of its nearest edge.
  const custom = room.roof || null;
  const cx = (x) => Math.min(room.width, Math.max(0, x)), cy = (y) => Math.min(room.depth, Math.max(0, y));
  const base = (x, y) => Math.min(room.maxHeight, custom ? meshHeight(custom, cx(x), cy(y)) : room.kneeWall + tan * Math.min(x, room.width - x));
  const P = Math.max(1, Math.round(WALL_T / res)); // wall thickness in cells
  const tri = (out, a, b, c) => out.push(...a, ...b, ...c);
  const quadOut = (out, p0, p1, p2, p3, o) => {
    const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], v = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0) { [p1, p3] = [p3, p1]; }
    tri(out, p0, p1, p2); tri(out, p0, p2, p3);
  };
  /** The surface of a height field of NX x NY columns (the plan origin at column ox): tops and vertical faces, turned along `sign` (1 away from the columns, -1 into them). */
  const skin = (NX, NY, ox, hOf, edgesOf, sign) => {
    const top = [], wall = [];
    const col = (I, J) => (I < 0 || J < 0 || I >= NX || J >= NY ? 0 : hOf(I, J));
    for (let J = 0; J < NY; J++) for (let I = 0; I < NX; I++) {
      const hc = hOf(I, J), x0 = (I - ox) * res, x1 = x0 + res, z0 = (J - ox) * res, z1 = z0 + res;
      const [ha, hb] = edgesOf(I, J);
      quadOut(top, [x0, ha, z0], [x0, ha, z1], [x1, hb, z1], [x1, hb, z0], [0, sign, 0]);
      for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const hn = col(I + di, J + dj);
        if (hn >= hc - 0.12) continue;
        // a wall runs from the surface of the lower column up to the surface of this one, both sloped (no saw-tooth along gables, no hairline gaps along dormer cheeks)
        const [na, nb] = edgesOf(I + di, J + dj);
        if (di) { const x = di > 0 ? x1 : x0, t = di > 0 ? hb : ha, b = di > 0 ? na : nb; quadOut(wall, [x, b, z0], [x, b, z1], [x, t, z1], [x, t, z0], [sign * di, 0, 0]); }
        else { const z = dj > 0 ? z1 : z0; quadOut(wall, [x0, na, z], [x1, nb, z], [x1, hb, z], [x0, ha, z], [0, 0, sign * dj]); }
      }
    }
    return { top, wall };
  };

  // inner skin: the room as drawn. Height at the left and right edge of a cell: sloped on the open roof, level where a dormer or a flat ceiling stands; 0 outside
  const edgesIn = (i, j) => {
    if (i < 0 || j < 0 || i >= nx || j >= ny) return [0, 0];
    const hc = h[j * nx + i], x0 = i * res, x1 = x0 + res, yc = (j + 0.5) * res;
    return hc > base((x0 + x1) / 2, yc) + 1e-6 ? [hc, hc] : [Math.min(base(x0, yc), hc + 0.5), base(x1, yc)];
  };
  const inner = skin(nx, ny, 0, (i, j) => h[j * nx + i], edgesIn, -1);

  // outer skin: the same field on a grid that is P cells wider all round. Outside the room the roof plane simply goes on; the roof is lifted by its thickness across the
  // slope (ROOF_T / cos), a level roof (dormer, flat ceiling) by ROOF_T, and the level cells spread over P cells so that their walls stand WALL_T further out.
  const NX = nx + 2 * P, NY = ny + 2 * P;
  const hO = new Float32Array(NX * NY), eL = new Float32Array(NX * NY), eR = new Float32Array(NX * NY);
  const tilt = (x, y) => Math.hypot(1, (base(x + res / 2, y) - base(x - res / 2, y)) / res, (base(x, y + res / 2) - base(x, y - res / 2)) / res); // 1 / cos of the slope, in x and in y
  const level = [];
  for (let J = 0; J < NY; J++) for (let I = 0; I < NX; I++) {
    const i = I - P, j = J - P, x0 = i * res, x1 = x0 + res, xc = x0 + res / 2, yc = (j + 0.5) * res, k = J * NX + I;
    const inside = i >= 0 && j >= 0 && i < nx && j < ny;
    const hc = inside ? h[j * nx + i] : Math.max(0, base(xc, yc));
    if (inside && hc > base(xc, yc) + 1e-6) { hO[k] = eL[k] = eR[k] = hc + ROOF_T; level.push([I, J, hc + ROOF_T]); continue; }
    const tv = ROOF_T * tilt(xc, yc);
    const a = inside ? Math.min(base(x0, yc), hc + 0.5) : Math.max(0, base(x0, yc)), b = inside ? base(x1, yc) : Math.max(0, base(x1, yc));
    hO[k] = hc + tv; eL[k] = a + tv; eR[k] = b + tv;
  }
  for (const [I, J, t] of level) for (let dJ = -P; dJ <= P; dJ++) for (let dI = -P; dI <= P; dI++) {
    const II = I + dI, JJ = J + dJ;
    if (II < 0 || JJ < 0 || II >= NX || JJ >= NY) continue;
    const k = JJ * NX + II;
    if (t > hO[k]) hO[k] = eL[k] = eR[k] = t;
  }
  const outer = skin(NX, NY, P, (I, J) => hO[J * NX + I], (I, J) => (I < 0 || J < 0 || I >= NX || J >= NY ? [0, 0] : [eL[J * NX + I], eR[J * NX + I]]), 1);

  const mk = (pos) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return addUV(g); };
  return { roof: mk(outer.top), walls: mk(outer.wall), roofIn: mk(inner.top), wallsIn: mk(inner.wall) };
}
