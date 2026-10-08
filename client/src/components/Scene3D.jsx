import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CATALOG } from '@shared/catalog.js';
import { getGrid, itemRects, stairRect } from '@shared/engine.js';
import { heatColor, useHeatImage, STATUS_COLOR } from './PlanView.jsx';

// plan (x, y) -> three (x, z); height -> y

function roofGeometry(room) {
  const g = getGrid(room, 0.1);
  const { nx, ny, res, h } = g;
  const tan = Math.tan((room.pitch * Math.PI) / 180);
  const base = (x) => Math.min(room.maxHeight, room.kneeWall + tan * Math.min(x, room.width - x));
  const pos = [], col = [];
  const tri = (a, b, c, color) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(...color); };
  const quad = (a, b, c, d, color) => { tri(a, b, c, color); tri(a, c, d, color); };
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : h[j * nx + i]);
  const C = (hh) => heatColor(hh).map((v) => v / 255);

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const hc = h[j * nx + i];
      const x0 = i * res, x1 = x0 + res, z0 = j * res, z1 = z0 + res;
      const flat = hc > base((x0 + x1) / 2) + 1e-6; // dormer cell: flat ceiling
      const ha = flat ? hc : Math.min(base(x0), hc + 0.5), hb = flat ? hc : base(x1);
      const color = C(hc);
      quad([x0, ha, z0], [x1, hb, z0], [x1, hb, z1], [x0, ha, z1], color);
      // vertical faces towards lower neighbours (and the outside) - dormer cheeks, eave walls, gables
      for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const hn = at(i + di, j + dj);
        if (hn >= hc - 0.12) continue;
        const lo = hn, hi = hc;
        if (di) { const x = di > 0 ? x1 : x0; quad([x, lo, z0], [x, lo, z1], [x, hi, z1], [x, hi, z0], color); }
        else { const z = dj > 0 ? z1 : z0; quad([x0, lo, z], [x1, lo, z], [x1, hi, z], [x0, hi, z], color); }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

function disposeAll(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    const m = o.material;
    (Array.isArray(m) ? m : m ? [m] : []).forEach((mm) => { mm.map?.dispose(); mm.dispose(); });
  });
}

export default function Scene3D() {
  const mount = useRef(null);
  const T = useRef(null);
  const room = useSelector((s) => s.room);
  const items = useSelector((s) => s.items);
  const result = useSelector((s) => s.analysis.result);
  const showClearances = useSelector((s) => s.ui.showClearances);
  const heat = useHeatImage(room);
  const [roofOpacity, setRoofOpacity] = useState(0.35);

  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 12, 4);
    scene.add(sun);
    const content = new THREE.Group();
    scene.add(content);

    const render = () => renderer.render(scene, camera);
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    controls.addEventListener('change', render);
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    T.current = { scene, camera, controls, content, render, resize };
    resize();
    return () => {
      ro.disconnect();
      controls.dispose();
      disposeAll(scene);
      renderer.dispose();
      renderer.domElement.remove();
      T.current = null;
    };
  }, []);

  // camera framing when the room size changes
  const fit = () => {
    const t = T.current;
    if (!t) return;
    const { width: W, depth: D } = room;
    const r = Math.max(W, D);
    t.controls.target.set(W / 2, 0.8, D / 2);
    t.camera.position.set(W / 2 + r * 0.9, r * 0.95, D / 2 + r * 1.15);
    t.controls.update();
    t.render();
  };
  useEffect(fit, [room.width, room.depth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = T.current;
    if (!t) return;
    const { content } = t;
    [...content.children].forEach((c) => { content.remove(c); disposeAll(c); });
    const W = room.width, D = room.depth;

    // floor with the height map as texture
    const tex = new THREE.TextureLoader().load(heat, t.render);
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex }));
    floor.position.set(W / 2, 0, D / 2);
    content.add(floor);

    // roof surface (translucent so the interior stays visible)
    if (roofOpacity > 0) {
      content.add(new THREE.Mesh(roofGeometry(room), new THREE.MeshStandardMaterial({
        vertexColors: true, transparent: true, opacity: roofOpacity, side: THREE.DoubleSide, depthWrite: false, roughness: 1,
      })));
    }

    // stair opening
    const sr = stairRect(room);
    if (sr) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sr[2] - sr[0], sr[3] - sr[1]).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x20232a }));
      m.position.set((sr[0] + sr[2]) / 2, 0.01, (sr[1] + sr[3]) / 2);
      content.add(m);
    }

    // furniture + clearances
    const byId = Object.fromEntries((result?.items || []).map((r) => [r.id, r]));
    for (const it of items) {
      if (!it.placed) continue;
      const def = CATALOG[it.type];
      const rects = itemRects(def, it);
      const status = byId[it.id]?.status || 'ok';
      const b = rects.body;
      const box = new THREE.Mesh(new THREE.BoxGeometry(b[2] - b[0], def.h, b[3] - b[1]), new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.8 }));
      box.position.set((b[0] + b[2]) / 2, def.h / 2, (b[1] + b[3]) / 2);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: STATUS_COLOR[status] }));
      box.add(edges);
      content.add(box);
      if (showClearances) {
        for (const [k, r] of Object.entries(rects)) {
          if (k === 'body') continue;
          const z = byId[it.id]?.zones?.[k] ?? 1;
          const p = new THREE.Mesh(new THREE.PlaneGeometry(r[2] - r[0], r[3] - r[1]).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: z >= 0.9 ? 0x2f9e5b : 0xd64545, transparent: true, opacity: 0.4, depthWrite: false }));
          p.position.set((r[0] + r[2]) / 2, 0.02, (r[1] + r[3]) / 2);
          content.add(p);
        }
      }
    }

    // a 1.75 m person for scale
    const person = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x23262b });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.2, 4, 10), mat);
    body.position.y = 0.77;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat);
    head.position.y = 1.64;
    person.add(body, head);
    person.position.set(W / 2, 0, D * 0.62);
    content.add(person);

    t.render();
  }, [room, items, result, heat, roofOpacity, showClearances]);

  return (
    <div className="card">
      <div className="cardhead">
        <h2>3D <small>drag to orbit, scroll to zoom, right-drag to pan</small></h2>
        <label>roof <input type="range" min="0" max="0.9" step="0.05" value={roofOpacity} onChange={(e) => setRoofOpacity(+e.target.value)} aria-label="Roof opacity" /></label>
        <button className="mini" onClick={fit}>reset view</button>
      </div>
      <div ref={mount} className="scene3d" />
    </div>
  );
}
