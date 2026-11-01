// A Gaussian-splat look for any three.js scene: every mesh surface is sampled into flat, soft Gaussians ("splats"), lit once (baked: sun and
// sky outside, lamps inside) and handed to Spark (@sparkjsdev/spark, MIT, World Labs), a real 3D Gaussian Splatting renderer for three.js that
// sorts and draws them. Not a trained radiance field: it imitates the look of one from the models we already have. A scanned or trained
// splat file (.spz, .ply, .splat) would load into the same SplatMesh.
import * as THREE from 'three';
import { SplatMesh } from '@sparkjsdev/spark';

const LUT = new Float32Array(256).map((_, i) => Math.pow(i / 255, 2.2)); // sRGB byte to linear
const pix = new Map();

function pixels(map) {
  if (!map || !map.image) return null;
  const hit = pix.get(map.uuid);
  if (hit) return hit;
  const img = map.image, w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
  if (!w0 || (img.complete === false)) return null; // still loading
  const s = Math.min(1, 256 / Math.max(w0, h0)), c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w0 * s)); c.height = Math.max(2, Math.round(h0 * s));
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  const e = { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
  pix.set(map.uuid, e);
  return e;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Sample every mesh under `root` into splats.
 * Per mesh (userData): interior = lit by the lamps instead of the sun; density = splats per m2; size = disc diameter in metres; noSplat = skip.
 * Returns { mesh, count, pending } (mesh: a Spark SplatMesh; pending: some texture had not loaded yet, build again a moment later).
 */
export function buildSplats(root, o = {}) {
  const { density = 450, lamps = [], seed = 7, maxPerMesh = 90000, ambientIn = 0.2 } = o;
  const R = rng(seed);
  const pos = [], col = [], siz = [], nrm = [];
  let pending = false;
  root.updateWorldMatrix(true, true);
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], uv = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  const sun = new THREE.Vector3(0.45, 0.8, 0.35).normalize();

  root.traverse((m) => {
    if (!m.isMesh || m.userData.noSplat) return;
    const geo = m.geometry, P = geo.attributes.position, UV = geo.attributes.uv, VC = geo.attributes.color, idx = geo.index, vid = [0, 0, 0];
    if (!P) return;
    const nTri = idx ? idx.count / 3 : P.count / 3, world = m.matrixWorld;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    const cum = new Float64Array(nTri);
    let total = 0;
    const load = (t, k) => { const i = idx ? idx.getX(t * 3 + k) : t * 3 + k; vid[k] = i; v[k].fromBufferAttribute(P, i).applyMatrix4(world); if (UV) uv[k].fromBufferAttribute(UV, i); };
    for (let t = 0; t < nTri; t++) { load(t, 0); load(t, 1); load(t, 2); total += 0.5 * e1.subVectors(v[1], v[0]).cross(e2.subVectors(v[2], v[0])).length(); cum[t] = total; }
    if (total < 1e-6) return;
    const dens = m.userData.density ?? density, size = m.userData.size ?? 0.05;
    const count = Math.min(maxPerMesh, Math.max(24, Math.round(total * dens)));
    const flat = !!m.userData.flat; // colour from the material only (forest floor, foliage)
    const px = mat.map && !flat ? pixels(mat.map) : null;
    if (mat.map && !flat && !px) pending = true;
    const base = mat.color || new THREE.Color(1, 1, 1), unlit = mat.isMeshBasicMaterial, back = mat.side === THREE.BackSide, two = mat.side === THREE.DoubleSide, inside = !!m.userData.interior;
    const rep = mat.map ? mat.map.repeat : { x: 1, y: 1 }, off = mat.map ? mat.map.offset : { x: 0, y: 0 };

    for (let s = 0; s < count; s++) {
      const r = R() * total;
      let lo = 0, hi = nTri - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
      load(lo, 0); load(lo, 1); load(lo, 2);
      let a = R(), b = R();
      if (a + b > 1) { a = 1 - a; b = 1 - b; }
      const c = 1 - a - b;
      const x = v[0].x * c + v[1].x * a + v[2].x * b, y = v[0].y * c + v[1].y * a + v[2].y * b, z = v[0].z * c + v[1].z * a + v[2].z * b;
      n.crossVectors(e1.subVectors(v[1], v[0]), e2.subVectors(v[2], v[0])).normalize();
      if (back) n.negate();
      let cr = base.r, cg = base.g, cb = base.b;
      if (px && UV) {
        const u = uv[0].x * c + uv[1].x * a + uv[2].x * b, w = uv[0].y * c + uv[1].y * a + uv[2].y * b;
        const uu = (((u * rep.x + off.x) % 1) + 1) % 1, vv = (((w * rep.y + off.y) % 1) + 1) % 1;
        const i = ((Math.floor((1 - vv) * px.h) % px.h) * px.w + (Math.floor(uu * px.w) % px.w)) * 4;
        cr *= LUT[px.d[i]]; cg *= LUT[px.d[i + 1]]; cb *= LUT[px.d[i + 2]];
      }
      if (VC) { // vertex colours (forest foliage: dark inside, light at the tips)
        cr *= VC.getX(vid[0]) * c + VC.getX(vid[1]) * a + VC.getX(vid[2]) * b;
        cg *= VC.getY(vid[0]) * c + VC.getY(vid[1]) * a + VC.getY(vid[2]) * b;
        cb *= VC.getZ(vid[0]) * c + VC.getZ(vid[1]) * a + VC.getZ(vid[2]) * b;
      }
      let lr, lg, lb;
      if (unlit) { lr = lg = lb = 1; }
      else if (inside) {
        let L = ambientIn;
        for (const l of lamps) {
          const dx = l[0] - x, dy = l[1] - y, dz = l[2] - z, d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) || 1;
          const ndl = (n.x * dx + n.y * dy + n.z * dz) / d;
          L += (1.25 * (two ? Math.abs(ndl) : Math.max(ndl, 0.12))) / (1 + 0.55 * d2);
        }
        lr = L * 1.0; lg = L * 0.93; lb = L * 0.82; // warm white lamps, not a yellow cast
      } else {
        const up = 0.5 + 0.5 * n.y, ndl = Math.max(n.dot(sun), 0);
        lr = 0.36 * up + 0.88 * ndl + 0.05; lg = 0.4 * up + 0.8 * ndl + 0.05; lb = 0.46 * up + 0.66 * ndl + 0.06; // cool sky, warm low sun
      }
      const j = flat ? 1.7 + 1.0 * R() : 0.84 + 0.3 * R();
      pos.push(x, y, z); nrm.push(n.x, n.y, n.z); col.push(cr * lr * j, cg * lg * j, cb * lb * j); siz.push(size * (0.7 + 0.7 * R()));
    }
  });

  const N = pos.length / 3;
  const mesh = new SplatMesh({
    constructSplats: (splats) => {
      const c = new THREE.Vector3(), sc = new THREE.Vector3(), q = new THREE.Quaternion(), nn = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1), color = new THREE.Color();
      for (let i = 0; i < N; i++) {
        const sg = siz[i] * 0.5;
        c.set(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
        sc.set(sg, sg, sg * 0.2); // flat along the surface normal, like the Gaussians of a captured surface
        q.setFromUnitVectors(z, nn.set(nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]));
        color.setRGB(col[3 * i], col[3 * i + 1], col[3 * i + 2]);
        splats.pushSplat(c, sc, q, 0.9, color);
      }
    },
  });
  return { mesh, count: N, pending };
}
