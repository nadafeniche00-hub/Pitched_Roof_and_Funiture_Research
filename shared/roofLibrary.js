// The roof patterns that cover most existing German roofs (OpenStreetMap roof:shape tags, NRW LoD2 surveys): a mesh generator for each,
// and a recogniser that names the pattern of any roof mesh from its planes. Meshes: vertices [x, y, h], triangles of vertex indices.
import { autoMesh } from './roofMesh.js';

const tanD = (d) => Math.tan((d * Math.PI) / 180);
const build = (v, polys) => ({ v, t: polys.flatMap((p) => p.slice(2).map((_, i) => [p[0], p[i + 1], p[i + 2]])) });

/** id, label, and the key it has in the OSM counts (shared/statePatterns.json) */
export const PATTERNS = [
  { id: 'gabled', name: 'Gabled', osm: 'gabled', note: 'two slopes meeting at a ridge' },
  { id: 'hipped', name: 'Hipped', osm: 'hipped', note: 'four slopes, a short ridge' },
  { id: 'half-hipped', name: 'Half-hipped', osm: 'half-hipped', note: 'gable wall with a small hip on top' },
  { id: 'mansard', name: 'Mansard', osm: 'mansard', note: 'steep lower slope, shallow upper slope' },
  { id: 'pyramidal', name: 'Pyramid', osm: 'pyramidal', note: 'four slopes meeting at one point' },
  { id: 'skillion', name: 'Shed', osm: 'skillion', note: 'one slope' },
  { id: 'flat', name: 'Flat', osm: 'flat', note: 'no slope' },
];

/** The mesh of one pattern for the room's width, depth, knee wall and pitch. */
export function patternMesh(room, id) {
  const W = room.width, D = room.depth, kn = room.kneeWall, cap = room.maxHeight, pitch = room.pitch;
  const ridgeH = Math.min(cap, kn + tanD(pitch) * (W / 2));
  switch (id) {
    case 'gabled': return autoMesh(room);
    case 'hipped': {
      if (D <= W + 0.01) return patternMesh(room, 'pyramidal');
      const a = W / 2;
      return build([[0, 0, kn], [W, 0, kn], [W, D, kn], [0, D, kn], [W / 2, a, ridgeH], [W / 2, D - a, ridgeH]], [[0, 4, 5, 3], [1, 2, 5, 4], [0, 1, 4], [3, 5, 2]]);
    }
    case 'half-hipped': {
      const xl = W / 4, a = W / 4, hg = kn + ((ridgeH - kn) * xl) / (W / 2);
      return build(
        [[0, 0, kn], [W, 0, kn], [W, D, kn], [0, D, kn], [xl, 0, hg], [W - xl, 0, hg], [W / 2, a, ridgeH], [W / 2, D - a, ridgeH], [xl, D, hg], [W - xl, D, hg]],
        [[0, 4, 6, 7, 8, 3], [1, 2, 9, 7, 6, 5], [4, 5, 6], [8, 7, 9], [0, 1, 5, 4], [3, 2, 9, 8]],
      );
    }
    case 'mansard': {
      const bx = W * 0.2, hb = Math.min(cap * 0.85, kn + tanD(70) * bx), r = hb + tanD(20) * (W / 2 - bx);
      const row = (y) => [[0, y, kn], [bx, y, hb], [W / 2, y, r], [W - bx, y, hb], [W, y, kn]];
      return build([...row(0), ...row(D)], [[0, 1, 6, 5], [1, 2, 7, 6], [2, 3, 8, 7], [3, 4, 9, 8], [0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]);
    }
    case 'pyramidal': {
      const r = Math.min(cap, kn + tanD(pitch) * (Math.min(W, D) / 2));
      return build([[0, 0, kn], [W, 0, kn], [W, D, kn], [0, D, kn], [W / 2, D / 2, r]], [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]);
    }
    case 'skillion': {
      const hi = Math.min(cap, kn + tanD(Math.min(pitch, 20)) * W);
      return build([[0, 0, hi], [W, 0, kn], [W, D, kn], [0, D, hi], [0, 0, kn], [0, D, kn]], [[0, 1, 2, 3], [4, 1, 0], [5, 2, 3]]);
    }
    case 'flat': {
      const h = Math.min(cap, Math.max(kn, 2.7));
      return build([[0, 0, h], [W, 0, h], [W, D, h], [0, D, h]], [[0, 1, 2, 3]]);
    }
    default: return autoMesh(room);
  }
}

// ---------------------------------------------------------------- recognition
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * Name the pattern of a roof mesh: its sloped planes are grouped, the dominant ones (at least 3 % of the sloped area) decide the pattern,
 * smaller ones count as details (dormers, extrusions). Returns { id, name, planes, details, pitches, azimuths, known }.
 */
export function recognizeRoof(mesh) {
  const groups = [];
  let vertical = 0, total = 0;
  for (const tri of mesh.t) {
    const [A, B, C] = tri.map((i) => mesh.v[i]), n = cross(sub(B, A), sub(C, A)), len = Math.hypot(...n);
    if (len < 1e-9) continue;
    const area = len / 2;
    let u = [n[0] / len, n[1] / len, n[2] / len];
    if (Math.abs(u[2]) <= 0.2) { vertical += area; continue; } // wall-like triangle
    if (u[2] < 0) u = u.map((x) => -x);
    const d = u[0] * A[0] + u[1] * A[1] + u[2] * A[2];
    let g = groups.find((q) => Math.hypot(q.u[0] - u[0], q.u[1] - u[1], q.u[2] - u[2]) < 0.03 && Math.abs(q.d - d) < 0.06);
    if (!g) { g = { u, d, area: 0, tops: [] }; groups.push(g); }
    g.area += area; total += area;
    g.tops.push(Math.max(A[2], B[2], C[2]));
  }
  const pitchOf = (g) => (Math.acos(Math.min(1, g.u[2])) * 180) / Math.PI, azOf = (g) => ((Math.atan2(g.u[1], g.u[0]) * 180) / Math.PI + 360) % 360;
  const main = groups.filter((g) => g.area >= 0.03 * total).sort((a, b) => b.area - a.area);
  const sloped = main.filter((g) => pitchOf(g) > 6);
  const out = (id, extra = {}) => ({ id, name: id === 'custom' ? 'Custom' : PATTERNS.find((p) => p.id === id).name, planes: main.length, details: groups.length - (id === 'flat' ? main.length : sloped.length), pitches: main.map((g) => +pitchOf(g).toFixed(1)), azimuths: main.map((g) => Math.round(azOf(g))), known: id !== 'custom', ...extra });
  if (!main.length) return out('custom');
  if (!sloped.length) return out('flat');
  const opposite = (a, b, tol) => Math.abs(((a - b + 540) % 360) - 180) > 180 - tol; // facing away from each other
  if (sloped.length === 1) return out('skillion');
  if (sloped.length === 2) {
    const [p, q] = sloped;
    return opposite(azOf(p), azOf(q), 25) ? out('gabled') : out('custom');
  }
  if (sloped.length === 4) {
    const azs = sloped.map((g) => Math.round(azOf(g) / 30)), distinct = new Set(azs.map((a) => a % 12)).size;
    if (distinct <= 2) return out('mansard');
    const top = Math.max(...mesh.v.map((p) => p[2])), apex = mesh.v.filter((p) => p[2] > top - 0.02);
    if (apex.length <= 1) return out('pyramidal');
    return vertical > 0.5 ? out('half-hipped') : out('hipped');
  }
  return out('custom');
}
