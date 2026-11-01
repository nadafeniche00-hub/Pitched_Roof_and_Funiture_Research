// A procedural forest around the house: dark pines, broad-leaved trees, undergrowth and a forest floor. Plain meshes with density hints in
// userData, so the splat renderer (lib/splat.js) turns them into soft foliage and the clean renderer can still draw them as solids.
import * as THREE from 'three';
import { mulberry32 } from '@shared/engine.js';

const col = (h, s, l) => new THREE.Color().setHSL(h / 360, s, l);
const std = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 });

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2b3022'; g.fillRect(0, 0, 256, 256);
  let a = 5;
  const r = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const tones = ['#1f2a1b', '#3a3a26', '#473a2a', '#2f4023', '#222a1c', '#55472f'];
  for (let i = 0; i < 4200; i++) { g.fillStyle = tones[Math.floor(r() * tones.length)]; g.globalAlpha = 0.35 + r() * 0.5; g.fillRect(r() * 256, r() * 256, 1 + r() * 4, 1 + r() * 3); }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(20, 20);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The forest group around (cx, cz), standing on the ground plane at height y0. Trees keep `clear` metres away from the house. */
export function buildForest(cx, cz, y0, { seed = 3, clear = 9, outer = 46, trees = 74, plain = false } = {}) {
  const R = mulberry32(seed), g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(outer + 6, 72).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial(plain ? { color: 0x6f8f55, roughness: 1 } : { color: 0x3d5a2c, map: floorTexture(), roughness: 1 }));
  ground.position.set(cx, y0 - 0.02, cz);
  ground.receiveShadow = true;
  ground.userData = { density: 90, size: 0.3, flat: true };
  g.add(ground);

  // foliage: irregular crowns (noisy surfaces) with vertex colours, dark inside and sunlit at the top, drawn as leaf-sized splats
  const paint = (geo, cy0, cy1, hue, sat, lo, hi, R2) => {
    const P = geo.attributes.position, C = new Float32Array(P.count * 3), c = new THREE.Color();
    for (let i = 0; i < P.count; i++) {
      const t = Math.min(1, Math.max(0, (P.getY(i) - cy0) / (cy1 - cy0)));
      c.setHSL((hue + (R2() - 0.5) * 22) / 360, sat * (0.85 + 0.3 * R2()), lo + (hi - lo) * (0.2 + 0.8 * t) * (0.7 + 0.5 * R2()));
      C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    return geo;
  };
  const rough = (geo, amt, R2) => { // lumpy, uneven outline instead of a smooth ball
    const P = geo.attributes.position, seen = new Map(), v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      const k = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      if (!seen.has(k)) seen.set(k, 1 + (R2() - 0.5) * amt);
      v.multiplyScalar(seen.get(k)); P.setXYZ(i, v.x, v.y, v.z);
    }
    return geo;
  };
  const white = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, vertexColors: true });

  for (let i = 0; i < trees; i++) {
    const rad = Math.sqrt(clear * clear + R() * (outer * outer - clear * clear)), ang = R() * Math.PI * 2;
    const x = cx + Math.cos(ang) * rad, z = cz + Math.sin(ang) * rad, tree = new THREE.Group();
    const pine = R() < 0.5, h = pine ? 4 + R() * 3 : 3.2 + R() * 2.2;
    const trunk = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.1, 0.26, h, 9, 4), 0, h, 28, 0.25, 0.05, 0.14, R), white());
    trunk.position.y = h / 2;
    trunk.userData = { density: 700, size: 0.045, flat: true };
    tree.add(trunk);
    if (pine) { // spruce: drooping, ragged tiers
      const tiers = 6 + Math.floor(R() * 3), hue = 140 + R() * 20, top = h + 1.2;
      for (let k = 0; k < tiers; k++) {
        const f = k / tiers, r = 2.2 * (1 - f) + 0.25, hh = 1.5;
        const geo = rough(new THREE.ConeGeometry(r, hh, 14, 3, true), 0.38, R);
        const cone = new THREE.Mesh(paint(geo, -hh / 2, hh / 2, hue, 0.38, 0.05, 0.22, R), white());
        cone.position.y = h * 0.32 + f * (top - h * 0.32);
        cone.rotation.y = R() * 6;
        cone.userData = { density: 150, size: 0.15, flat: true };
        tree.add(cone);
      }
    } else { // broad-leaved: several lumpy crowns on a bare trunk
      const hue = 85 + R() * 30, blobs = 4 + Math.floor(R() * 3);
      for (let k = 0; k < blobs; k++) {
        const rr = 1.0 + R() * 0.9;
        const geo = rough(new THREE.IcosahedronGeometry(rr, 3), 0.6, R);
        const b = new THREE.Mesh(paint(geo, -rr, rr, hue, 0.45, 0.05, 0.26, R), white());
        b.position.set((R() - 0.5) * 2.4, h + 0.2 + R() * 1.8, (R() - 0.5) * 2.4);
        b.scale.set(1.15, 0.85, 1.15);
        b.userData = { density: 130, size: 0.17, flat: true };
        tree.add(b);
      }
    }
    tree.position.set(x, y0, z);
    tree.rotation.y = R() * 6.28;
    const s = 0.85 + R() * 0.4; tree.scale.set(s, s, s);
    g.add(tree);
  }

  for (let i = 0; i < 160; i++) { // ferns and bushes
    const rad = Math.sqrt(clear * clear * 0.4 + R() * (outer * outer * 0.7)), ang = R() * Math.PI * 2, rr = 0.35 + R() * 0.5;
    const b = new THREE.Mesh(paint(rough(new THREE.IcosahedronGeometry(rr, 2), 0.7, R), -rr, rr, 90 + R() * 40, 0.5, 0.05, 0.22, R), white());
    b.position.set(cx + Math.cos(ang) * rad, y0 + rr * 0.35, cz + Math.sin(ang) * rad);
    b.scale.y = 0.6;
    b.userData = { density: 260, size: 0.1, flat: true };
    g.add(b);
  }

  // grass: tufts of thin blades, dark at the root, light at the tip; thick near the house, thinner further out
  const tufts = 4200, pos = [], colr = [], c = new THREE.Color();
  for (let i = 0; i < tufts; i++) {
    const near = R() < 0.6, rad = near ? clear * 0.35 + R() * clear * 1.6 : clear + R() * (outer - clear), ang = R() * Math.PI * 2;
    const tx = cx + Math.cos(ang) * rad, tz = cz + Math.sin(ang) * rad, hue = 70 + R() * 35, hgt = 0.18 + R() * 0.4;
    for (let b = 0; b < 6; b++) {
      const a = R() * 6.28, lean = (R() - 0.3) * 0.25, w = 0.022 + R() * 0.02, ox = (R() - 0.5) * 0.18, oz = (R() - 0.5) * 0.18, hh = hgt * (0.6 + R() * 0.6);
      const bx = tx + ox, bz = tz + oz, cs = Math.cos(a), sn = Math.sin(a);
      pos.push(bx - cs * w, y0, bz - sn * w, bx + cs * w, y0, bz + sn * w, bx + Math.cos(a + 1.5) * lean * hh, y0 + hh, bz + Math.sin(a + 1.5) * lean * hh);
      c.setHSL(hue / 360, 0.5, 0.06 + R() * 0.04); colr.push(c.r, c.g, c.b, c.r, c.g, c.b);
      c.setHSL((hue + 8) / 360, 0.55, 0.2 + R() * 0.14); colr.push(c.r, c.g, c.b);
    }
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  gg.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  gg.computeVertexNormals();
  const grass = new THREE.Mesh(gg, white());
  grass.userData = { density: 2600, size: 0.05, flat: true, noRay: true };
  g.add(grass);
  return g;
}
