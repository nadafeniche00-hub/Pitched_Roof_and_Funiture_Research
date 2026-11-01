// A roof as a triangle mesh: vertices [x, y, h] (x across, y along the house in plan metres, h = height above the attic floor) and triangles
// of vertex indices. The roof sculptor edits it; the engine reads heights from it (roofHeight / buildGrid in engine.js).

/** The automatic gabled roof as a mesh: eave corners at the knee wall, ridge along the middle. */
export function autoMesh(room) {
  const W = room.width, D = room.depth, kn = room.kneeWall;
  const r = Math.min(room.maxHeight, kn + Math.tan((room.pitch * Math.PI) / 180) * (W / 2));
  return {
    v: [[0, 0, kn], [W, 0, kn], [W, D, kn], [0, D, kn], [W / 2, 0, r], [W / 2, D, r]],
    t: [[0, 4, 5], [0, 5, 3], [4, 1, 2], [4, 2, 5], [0, 1, 4], [3, 5, 2]],
  };
}

const EPS = 1e-7;

/** Roof height at plan point (x, y); 0 where no triangle covers it (outside the roof outline). */
export function meshHeight(mesh, x, y, tris = mesh.t) {
  const v = mesh.v;
  let best = null;
  for (const [a, b, c] of tris) {
    const A = v[a], B = v[b], C = v[c];
    const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    if (Math.abs(den) < 1e-9) continue; // a vertical triangle (gable end): no plan area
    const l1 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / den;
    const l2 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / den;
    const l3 = 1 - l1 - l2;
    if (l1 < -EPS || l2 < -EPS || l3 < -EPS) continue;
    const h = l1 * A[2] + l2 * B[2] + l3 * C[2];
    if (best === null || h > best) best = h;
  }
  return best ?? 0;
}

const area3 = (A, B, C) => {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
};

/** Cut the whole roof with the vertical plane through plan points p0 and p1: every triangle it crosses becomes two or three. */
export function cutMesh(mesh, p0, p1) {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  if (L < 1e-6) return mesh;
  const nx = -(p1[1] - p0[1]) / L, ny = (p1[0] - p0[0]) / L;
  const v = mesh.v.map((a) => [...a]);
  const dist = (a) => (a[0] - p0[0]) * nx + (a[1] - p0[1]) * ny;
  const cache = new Map();
  const cross = (i, j) => {
    const k = i < j ? `${i},${j}` : `${j},${i}`;
    if (cache.has(k)) return cache.get(k);
    const a = v[i], b = v[j], da = dist(a), db = dist(b), t = da / (da - db);
    v.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    cache.set(k, v.length - 1);
    return v.length - 1;
  };
  const E = 1e-6, out = [];
  for (const tri of mesh.t) {
    const sg = tri.map((i) => { const d = dist(v[i]); return d > E ? 1 : d < -E ? -1 : 0; });
    if (!(sg.includes(1) && sg.includes(-1))) { out.push(tri); continue; }
    const pos = [], neg = [];
    for (let k = 0; k < 3; k++) {
      const i = tri[k], j = tri[(k + 1) % 3], si = sg[k], sj = sg[(k + 1) % 3];
      if (si >= 0) pos.push(i);
      if (si <= 0) neg.push(i);
      if (si * sj < 0) { const m = cross(i, j); pos.push(m); neg.push(m); }
    }
    for (const poly of [pos, neg]) for (let k = 1; k < poly.length - 1; k++) out.push([poly[0], poly[k], poly[k + 1]]);
  }
  return { v, t: out.filter(([a, b, c]) => area3(v[a], v[b], v[c]) > 1e-9) };
}

/** Insert a vertex on edge a-b (at fraction k from a) and split the triangles that share it. Returns { mesh, index }. */
export function splitEdge(mesh, a, b, k = 0.5) {
  const v = mesh.v.map((p) => [...p]), A = v[a], B = v[b];
  v.push([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]);
  const m = v.length - 1, t = [];
  for (const tri of mesh.t) {
    if (tri.includes(a) && tri.includes(b)) {
      const c = tri.find((i) => i !== a && i !== b);
      t.push([a, m, c], [m, b, c]);
    } else t.push(tri);
  }
  return { mesh: { v, t }, index: m };
}

/** Plain-data check for the server and the store: finite numbers, valid indices, sane sizes. */
export function sanitizeMesh(m, width, depth) {
  if (!m || !Array.isArray(m.v) || !Array.isArray(m.t) || m.v.length < 4 || m.v.length > 200 || m.t.length < 2 || m.t.length > 400) return null;
  const clampN = (x, lo, hi) => Math.min(hi, Math.max(lo, +x));
  const v = [];
  for (const p of m.v) {
    if (!Array.isArray(p) || p.length < 3 || !p.slice(0, 3).every((x) => Number.isFinite(+x))) return null;
    v.push([+clampN(p[0], -0.01, width + 0.01).toFixed(3), +clampN(p[1], -0.01, depth + 0.01).toFixed(3), +clampN(p[2], 0, 8).toFixed(3)]);
  }
  const t = [];
  for (const tri of m.t) {
    if (!Array.isArray(tri) || tri.length < 3 || !tri.slice(0, 3).every((i) => Number.isInteger(i) && i >= 0 && i < v.length)) return null;
    t.push([tri[0], tri[1], tri[2]]);
  }
  return { v, t };
}
