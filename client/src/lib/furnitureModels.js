// Procedural furniture for the 3D views, modelled after the clean look of Revit furniture families:
// simple, believable proportions, a few materials, no decoration. Everything is built from the catalogue size
// (w x d x h), so a piece resized in the inspector is resized in 3D too.
//
// Local frame: x = width, y up, z = depth; the FRONT of the piece faces +z (rotation 0). The caller turns the group
// with rotation.y and places it on the floor. These are stand-ins: real Revit geometry would arrive through IFC.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const WOOD = '#b48b5a', DARK = '#5f4128', WHITE = '#f1efe9', METAL = '#b9bec6', CERAMIC = '#f6f7f8';

const mats = new Map();
const mat = (color, o = {}) => {
  const key = color + JSON.stringify(o);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o }));
  return mats.get(key);
};

const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y + h / 2, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
};
const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 20) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y + h / 2, z);
  o.castShadow = true;
  return o;
};
const hash = (n) => { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); };

function bed(w, d, h, color) {
  const g = new THREE.Group();
  const legH = 0.1;
  g.add(box(w, 0.2, d, mat(WOOD), 0, legH, 0));
  g.add(box(w - 0.08, 0.2, d - 0.14, mat(WHITE, { roughness: 0.95 }), 0, legH + 0.2, 0.02));
  g.add(box(w - 0.04, 0.07, d * 0.6, mat(color, { roughness: 0.95 }), 0, legH + 0.4, d * 0.17));
  const pillows = w > 1.2 ? 2 : 1;
  for (let i = 0; i < pillows; i++) {
    const pw = w > 1.2 ? (w - 0.3) / 2 : w - 0.3;
    g.add(box(pw, 0.12, 0.38, mat(WHITE, { roughness: 0.95 }), pillows === 2 ? (i ? 1 : -1) * (pw / 2 + 0.04) : 0, legH + 0.4, -d / 2 + 0.34));
  }
  g.add(box(w + 0.02, 0.9, 0.06, mat(DARK), 0, 0, -d / 2 + 0.03));
  return g;
}

function wardrobe(w, d, h) {
  const g = new THREE.Group();
  g.add(box(w, h - 0.06, d - 0.02, mat(WOOD), 0, 0.06, -0.01));
  g.add(box(w - 0.04, 0.06, d - 0.06, mat(DARK), 0, 0, -0.02));
  const n = w > 0.9 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const dw = (w - 0.04) / n - 0.01;
    const x = -w / 2 + 0.02 + dw / 2 + i * (dw + 0.01) + 0.005;
    g.add(box(dw, h - 0.14, 0.02, mat('#c19a68'), x, 0.1, d / 2 - 0.01));
    g.add(box(0.02, 0.22, 0.025, mat(METAL, { metalness: 0.8, roughness: 0.3 }), n === 2 ? x + (i ? -1 : 1) * (dw / 2 - 0.05) : x + dw / 2 - 0.05, h * 0.45, d / 2 + 0.01));
  }
  return g;
}

function chest(w, d, h) {
  const g = new THREE.Group();
  g.add(box(w, h - 0.05, d - 0.02, mat(WOOD), 0, 0.05, -0.01));
  g.add(box(w - 0.06, 0.05, d - 0.08, mat(DARK), 0, 0, 0));
  const rows = 3, dh = (h - 0.12) / rows;
  for (let i = 0; i < rows; i++) {
    g.add(box(w - 0.06, dh - 0.015, 0.02, mat('#c19a68'), 0, 0.07 + i * dh, d / 2 - 0.01));
    g.add(box(0.14, 0.02, 0.025, mat(METAL, { metalness: 0.8, roughness: 0.3 }), 0, 0.07 + i * dh + dh * 0.55, d / 2 + 0.01));
  }
  return g;
}

function shelf(w, d, h) {
  const g = new THREE.Group();
  const wood = mat('#a98763');
  g.add(box(0.03, h, d, wood, -w / 2 + 0.015, 0, 0));
  g.add(box(0.03, h, d, wood, w / 2 - 0.015, 0, 0));
  g.add(box(w, h, 0.01, mat('#8c6d4c'), 0, 0, -d / 2 + 0.005));
  const rows = Math.max(3, Math.round(h / 0.38));
  for (let i = 0; i <= rows; i++) {
    const y = (i * (h - 0.03)) / rows;
    g.add(box(w, 0.03, d, wood, 0, y, 0));
    if (i < rows) {
      let x = -w / 2 + 0.05;
      for (let k = 0; k < 9 && x < w / 2 - 0.1; k++) {
        const bw = 0.025 + hash(i * 31 + k) * 0.03, bh = 0.18 + hash(i * 17 + k * 3) * 0.12;
        if (hash(i * 7 + k) < 0.3) { x += 0.08; continue; }
        g.add(box(bw, Math.min(bh, (h - 0.03) / rows - 0.05), d * 0.7, mat(['#6e2d2d', '#2d4a6e', '#3d5a3a', '#8a7a4a', '#4a3a5a'][Math.floor(hash(i + k * 5) * 5)]), x + bw / 2, y + 0.03, 0));
        x += bw + 0.005;
      }
    }
  }
  return g;
}

function chair(x, z) {
  const g = new THREE.Group();
  const m = mat('#2f333a');
  g.add(box(0.44, 0.05, 0.44, m, 0, 0.43, 0));
  g.add(box(0.44, 0.4, 0.04, m, 0, 0.5, -0.2));
  for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) g.add(box(0.03, 0.43, 0.03, mat(METAL), lx, 0, lz));
  g.position.set(x, 0, z);
  g.rotation.y = Math.PI;
  return g;
}

function desk(w, d, h) {
  const g = new THREE.Group();
  const top = h - 0.03;
  g.add(box(w, 0.03, d, mat(WOOD), 0, top, 0));
  for (const sx of [-1, 1]) g.add(box(0.03, top, d - 0.06, mat(DARK), sx * (w / 2 - 0.03), 0, 0));
  g.add(box(w - 0.1, 0.35, 0.02, mat(DARK), 0, top - 0.35, -d / 2 + 0.05));
  g.add(chair(w * 0.1, d / 2 + 0.1));
  return g;
}

function sofa(w, d, h, color) {
  const g = new THREE.Group();
  const fab = mat(color, { roughness: 0.95 });
  g.add(box(w, 0.2, d, mat(DARK), 0, 0.08, 0));
  const n = w > 1.5 ? 3 : 2, cw = (w - 0.3) / n;
  for (let i = 0; i < n; i++) g.add(box(cw - 0.01, 0.2, d - 0.28, fab, -w / 2 + 0.15 + cw / 2 + i * cw, 0.28, 0.1));
  g.add(box(w, 0.5, 0.22, fab, 0, 0.28, -d / 2 + 0.11));
  for (const sx of [-1, 1]) g.add(box(0.15, 0.3, d, fab, sx * (w / 2 - 0.075), 0.28, 0));
  return g;
}

function armchair(w, d, h, color) {
  const g = new THREE.Group();
  const fab = mat(color, { roughness: 0.95 });
  g.add(box(w, 0.2, d, mat(DARK), 0, 0.08, 0));
  g.add(box(w - 0.3, 0.2, d - 0.28, fab, 0, 0.28, 0.1));
  g.add(box(w, 0.5, 0.2, fab, 0, 0.28, -d / 2 + 0.1));
  for (const sx of [-1, 1]) g.add(box(0.15, 0.3, d, fab, sx * (w / 2 - 0.075), 0.28, 0));
  return g;
}

function toilet(w, d) {
  const g = new THREE.Group();
  const c = mat(CERAMIC, { roughness: 0.25 });
  g.add(box(w * 0.9, 0.4, 0.17, c, 0, 0.4, -d / 2 + 0.09));
  const bowl = cyl(w * 0.45, w * 0.3, 0.4, c, 0, 0, d * 0.05, 24);
  bowl.scale.z = (d * 0.7) / (w * 0.9);
  g.add(bowl);
  const seat = cyl(w * 0.46, w * 0.46, 0.03, mat('#e8eaec', { roughness: 0.3 }), 0, 0.4, d * 0.05, 24);
  seat.scale.z = (d * 0.7) / (w * 0.9);
  g.add(seat);
  return g;
}

function basin(w, d, h) {
  const g = new THREE.Group();
  const c = mat(CERAMIC, { roughness: 0.25 });
  g.add(cyl(0.06, 0.08, h - 0.15, mat(CERAMIC), 0, 0, -d / 2 + 0.1, 16));
  g.add(box(w, 0.15, d, c, 0, h - 0.15, 0));
  g.add(cyl(0.012, 0.012, 0.12, mat(METAL, { metalness: 0.9, roughness: 0.2 }), 0, h, -d / 2 + 0.07, 10));
  return g;
}

function shower(w, d, h) {
  const g = new THREE.Group();
  g.add(box(w, 0.08, d, mat('#dfe3e6', { roughness: 0.4 }), 0, 0, 0));
  const glass = mat('#bfe3f0', { transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false });
  g.add(box(w, h - 0.1, 0.012, glass, 0, 0.08, d / 2 - 0.006));
  g.add(box(0.012, h - 0.1, d, glass, w / 2 - 0.006, 0.08, 0));
  g.add(box(0.03, h, 0.03, mat(METAL, { metalness: 0.9, roughness: 0.25 }), w / 2 - 0.015, 0, d / 2 - 0.015));
  g.add(cyl(0.012, 0.012, 0.8, mat(METAL, { metalness: 0.9, roughness: 0.2 }), -w / 2 + 0.06, h - 0.9, -d / 2 + 0.05, 10));
  g.add(cyl(0.09, 0.09, 0.015, mat(METAL, { metalness: 0.9, roughness: 0.2 }), -w / 2 + 0.2, h - 0.15, -d / 2 + 0.2, 16));
  return g;
}

const BUILDERS = { bed_double: bed, bed_single: bed, wardrobe, chest, shelf, desk, sofa, armchair, toilet, basin, shower };

// ---------------------------------------------------------------- real models (Poly Haven, CC0, see public/CREDITS.txt)

// catalogue type -> model folder in public/models, and the yaw (radians) that turns the model's front towards +z
const POLY = {
  bed_double: { id: 'GothicBed_01', yaw: 0 },
  bed_single: { id: 'vintage_day_bed', yaw: 0 },
  sofa: { id: 'sofa_02', yaw: 0 },
  armchair: { id: 'modern_arm_chair_01', yaw: 0 },
  wardrobe: { id: 'modern_wooden_cabinet', yaw: 0 },
  chest: { id: 'drawer_cabinet', yaw: 0 },
  shelf: { id: 'wooden_display_shelves_01', yaw: 0 },
  desk: { id: 'metal_office_desk', yaw: 0 },
};
// ?furn=revit shows the families exported from Revit 2025 (tools/revit-export, German content library) where we have a good one
const REVIT = {
  bed_double: { url: '/furniture/bed_double.glb', yaw: 0 },
  bed_single: { url: '/furniture/bed_single.glb', yaw: 0 },
  wardrobe: { url: '/furniture/wardrobe.glb', yaw: 0 },
  chest: { url: '/furniture/chest.glb', yaw: 0 },
  shelf: { url: '/furniture/shelf.glb', yaw: 0 },
  desk: { url: '/furniture/desk.glb', yaw: 0 },
};
const REAL = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('furn') === 'revit' ? REVIT : POLY;
const urlOf = (r) => r.url || `/models/${r.id}/${r.id}.gltf`;
const loaded = new Map(); // model id -> { scene, size }
let loading = null;

/** Load the real models once. Resolves when every model is in (a failed one just stays procedural). */
export function preloadModels() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  const urls = [...new Set(Object.values(REAL).map(urlOf))];
  loading = Promise.all(urls.map((url) => new Promise((resolve) => {
    loader.load(url, (g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) o.material.envMapIntensity = 0.8; } });
      const box = new THREE.Box3().setFromObject(g.scene), size = box.getSize(new THREE.Vector3());
      loaded.set(url, { scene: g.scene, size, min: box.min });
      resolve(true);
    }, undefined, () => resolve(false));
  })));
  return loading;
}

/** The real model scaled to the catalogue footprint (w x d) and height (h), standing on the floor at the origin. */
function real(type, w, d, h) {
  const r = REAL[type], m = r && loaded.get(urlOf(r));
  if (!m) return null;
  const inner = m.scene.clone(true);
  const pivot = new THREE.Group();
  inner.position.set(-(m.min.x + m.size.x / 2), -m.min.y, -(m.min.z + m.size.z / 2));
  pivot.add(inner);
  pivot.scale.set(w / m.size.x, h / m.size.y, d / m.size.z);
  const g = new THREE.Group();
  g.add(pivot);
  g.rotation.y = r.yaw;
  const out = new THREE.Group();
  out.add(g);
  if (type === 'desk') out.add(chair(w * 0.1, d / 2 + 0.1));
  return out;
}

/** A furniture group for a catalogue type, sized w x d x h (metres), origin on the floor at the footprint centre. */
export function buildFurniture(type, w, d, h, color = '#7a7f87') {
  const r = real(type, w, d, h);
  if (r) return r;
  const make = BUILDERS[type];
  if (!make) return box(w, h, d, mat(color));
  return make(w, d, h, color);
}

/** Turn a piece to its plan rotation (0..3): its front looks along the engine's FRONT direction. */
export const FRONT_ANGLE = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
