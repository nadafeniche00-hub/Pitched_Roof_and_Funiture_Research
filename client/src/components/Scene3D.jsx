import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { defOf } from '@shared/params.js';
import { getGrid, itemRects, stairRect, roofHeight } from '@shared/engine.js';
import { heatColor, useHeatImage, STATUS_COLOR } from './PlanView.jsx';
import { sunVectorPlan, sunPath } from '../lib/solar.js';
import { buildFurniture, FRONT_ANGLE, preloadModels } from '../lib/furnitureModels.js';

// plan (x, y) -> three (x, z); height -> y

export function roofGeometry(room) {
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
  const site = useSelector((s) => s.site);
  const wind = useSelector((s) => s.wind.data);
  const [roofOpacity, setRoofOpacity] = useState(0.35);
  const [showWind, setShowWind] = useState(false);
  const [ready, setReady] = useState(false);
  const layoutPlan = useSelector((s) => s.layout.plan);
  const [cells, setCells] = useState([]); // the plan, extruded: one prism per room, each with its own height
  const [sel, setSel] = useState(null); // { id, face } the face under the last click
  const fromLayout = () => (layoutPlan?.rooms?.length ? layoutPlan.rooms.map((r) => ({ id: r.id, type: r.type, rect: [...r.rect], h: null })) : [{ id: 'room', type: 'room', rect: [0, 0, room.width, room.depth], h: null }]);
  useEffect(() => { setCells(fromLayout()); setSel(null); }, [layoutPlan, room.width, room.depth]); // eslint-disable-line react-hooks/exhaustive-deps
  const hOf = (c) => c.h ?? Math.max(0.5, Math.min(room.maxHeight, roofHeight(room, (c.rect[0] + c.rect[2]) / 2, (c.rect[1] + c.rect[3]) / 2)));
  useEffect(() => { let on = true; preloadModels().then(() => on && setReady(true)); return () => { on = false; }; }, []);

  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.2);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 12, 4);
    scene.add(sun);
    scene.add(sun.target);
    const content = new THREE.Group();
    scene.add(content);
    const sky = new THREE.Group(); // sun marker, sun path, wind streaks
    scene.add(sky);

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
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let downAt = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', (e) => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return; // a drag is an orbit, not a click
      downAt = null;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(T.current?.rooms || [], false)[0];
      if (!hit) { setSel(null); return; }
      const n = hit.face.normal, face = Math.abs(n.y) > 0.5 ? 'top' : Math.abs(n.x) > 0.5 ? (n.x > 0 ? 'px' : 'nx') : n.z > 0 ? 'pz' : 'nz';
      setSel({ id: hit.object.userData.id, face });
    });
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    T.current = { scene, camera, controls, content, sky, sun, hemi, render, resize, rooms: [] };
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

    // the plan, extruded: a prism per room (see-through, so the heat map below stays readable); the picked face is highlighted
    t.rooms = [];
    cells.forEach((c) => {
      const [x0, z0, x1, z1] = c.rect, h = hOf(c), on = sel?.id === c.id;
      const hue = ([...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) * 47) % 360;
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue / 360, 0.4, 0.8), transparent: true, opacity: on ? 0.8 : 0.5, roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, emissive: on ? 0x331105 : 0x000000 }));
      m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
      m.userData.id = c.id;
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: on ? 0xe8452c : 0x14161c })));
      content.add(m);
      t.rooms.push(m);
      if (on && sel.face) { // highlight of the selected face
        const w = x1 - x0, d = z1 - z0, F = sel.face;
        const g = F === 'top' ? new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2) : F === 'px' || F === 'nx' ? new THREE.PlaneGeometry(d, h).rotateY(Math.PI / 2) : new THREE.PlaneGeometry(w, h);
        const p = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe8452c, transparent: true, opacity: 0.55, depthTest: false, side: THREE.DoubleSide }));
        p.renderOrder = 10;
        p.position.set(F === 'px' ? x1 + 0.005 : F === 'nx' ? x0 - 0.005 : (x0 + x1) / 2, F === 'top' ? h + 0.005 : h / 2, F === 'pz' ? z1 + 0.005 : F === 'nz' ? z0 - 0.005 : (z0 + z1) / 2);
        content.add(p);
      }
    });

    // furniture + clearances
    const byId = Object.fromEntries((result?.items || []).map((r) => [r.id, r]));
    for (const it of items) {
      if (!it.placed) continue;
      const def = defOf(it);
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
  }, [room, items, result, heat, roofOpacity, showClearances, ready, cells, sel]); // eslint-disable-line react-hooks/exhaustive-deps

  // sun: light direction, marker and the day's path
  useEffect(() => {
    const t = T.current;
    if (!t) return;
    const { sky, sun } = t;
    [...sky.children].filter((c) => c.userData.kind === 'sun').forEach((c) => { sky.remove(c); disposeAll(c); });
    const cx = room.width / 2, cz = room.depth / 2, R = Math.max(room.width, room.depth) * 1.3 + 3;
    const toWorld = (v) => new THREE.Vector3(cx + v.x * R, Math.max(0, v.z) * R, cz + v.y * R);
    const now = sunVectorPlan(site, site.date, site.hour);
    const pos = toWorld(now);
    const up = now.alt > 0;
    sun.position.copy(up ? pos : new THREE.Vector3(cx, 20, cz));
    sun.target.position.set(cx, 0, cz);
    sun.intensity = up ? 0.4 + 1.2 * Math.min(1, now.alt / 30) : 0.05;
    t.hemi.intensity = up ? 1.2 : 0.5;

    const g = new THREE.Group();
    g.userData.kind = 'sun';
    const path = sunPath(site).map((v) => toWorld(v));
    if (path.length > 1) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), new THREE.LineBasicMaterial({ color: 0xf0a500 })));
    if (up) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffc933 }));
      orb.position.copy(pos);
      g.add(orb);
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pos, new THREE.Vector3(cx, 0.5, cz)]), new THREE.LineDashedMaterial({ color: 0xffc933, dashSize: 0.3, gapSize: 0.2 }));
      ray.computeLineDistances();
      g.add(ray);
    }
    sky.add(g);
    t.render();
  }, [site, room.width, room.depth]);

  // wind: animated streaks flowing along the prevailing storm direction (plan-space coordinates)
  useEffect(() => {
    const t = T.current;
    if (!t || !showWind || !wind || wind.stormDir == null) return undefined;
    const { sky } = t;
    const N = 90, LEN = 0.9, H = 6;
    const cx = room.width / 2, cz = room.depth / 2;
    const span = Math.max(room.width, room.depth) + 8;
    const rel = ((wind.stormDir + 180 - site.azimuth) * Math.PI) / 180; // direction the wind blows TO
    const dx = Math.sin(rel), dz = -Math.cos(rel);
    const speed = wind.vbEst * 0.22;
    // pos = distance along the wind (-span/2..span/2) and across it, relative to the building centre
    const across = (p) => [(-dz) * p.c, dx * p.c];
    const seed = Array.from({ length: N }, () => ({ a: (Math.random() - 0.5) * span, c: (Math.random() - 0.5) * span, y: 0.3 + Math.random() * H }));
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(N * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x6fb7f0, transparent: true, opacity: 0.7 }));
    lines.frustumCulled = false;
    sky.add(lines);
    let last = performance.now(), raf = 0;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      seed.forEach((p, i) => {
        p.a += speed * dt;
        if (p.a > span / 2) { p.a = -span / 2; p.c = (Math.random() - 0.5) * span; p.y = 0.3 + Math.random() * H; }
        const [ox, oz] = across(p);
        const x = cx + dx * p.a + ox, z = cz + dz * p.a + oz;
        arr.set([x - dx * LEN, p.y, z - dz * LEN, x, p.y, z], i * 6);
      });
      geo.attributes.position.needsUpdate = true;
      t.render();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); sky.remove(lines); disposeAll(lines); t.render(); };
  }, [showWind, wind, site.azimuth, room.width, room.depth]);

  // push/pull, subdivide, delete: the selected face edits its room
  const cur = cells.find((c) => c.id === sel?.id);
  const FACE = { top: 'top', px: 'east side', nx: 'west side', pz: 'south side', nz: 'north side' };
  const val = (c, F) => (F === 'top' ? hOf(c) : F === 'px' ? c.rect[2] : F === 'nx' ? c.rect[0] : F === 'pz' ? c.rect[3] : c.rect[1]);
  const range = (c, F) => {
    const [x0, z0, x1, z1] = c.rect, W = room.width, D = room.depth;
    return F === 'top' ? [0.5, room.maxHeight] : F === 'px' ? [x0 + 0.5, W] : F === 'nx' ? [0, x1 - 0.5] : F === 'pz' ? [z0 + 0.5, D] : [0, z1 - 0.5];
  };
  const push = (v) => setCells((cs) => cs.map((c) => {
    if (c.id !== sel.id) return c;
    const [lo, hi] = range(c, sel.face), x = Math.max(lo, Math.min(hi, v)), r = [...c.rect];
    if (sel.face === 'top') return { ...c, h: x };
    if (sel.face === 'px') r[2] = x; else if (sel.face === 'nx') r[0] = x; else if (sel.face === 'pz') r[3] = x; else r[1] = x;
    return { ...c, rect: r };
  }));
  const split = (axis, k = 0.5) => setCells((cs) => cs.flatMap((c) => {
    if (c.id !== sel.id) return [c];
    const [x0, z0, x1, z1] = c.rect, h = c.h;
    if (axis === 'x') { const xm = x0 + (x1 - x0) * k; return [{ ...c, id: c.id + 'a', rect: [x0, z0, xm, z1], h }, { ...c, id: c.id + 'b', rect: [xm, z0, x1, z1], h }]; }
    const zm = z0 + (z1 - z0) * k; return [{ ...c, id: c.id + 'a', rect: [x0, z0, x1, zm], h }, { ...c, id: c.id + 'b', rect: [x0, zm, x1, z1], h }];
  }));
  const remove = () => { setCells((cs) => cs.filter((c) => c.id !== sel.id)); setSel(null); };
  const reset = () => { setCells(fromLayout()); setSel(null); };
  const area = cur ? (cur.rect[2] - cur.rect[0]) * (cur.rect[3] - cur.rect[1]) : 0;

  return (
    <div className="card">
      <div className="cardhead">
        <h2>3D <small>drag to orbit, scroll to zoom, click a face to edit it</small></h2>
        <label><input type="checkbox" checked={showWind} disabled={!wind || wind.stormDir == null} onChange={(e) => setShowWind(e.target.checked)} /> wind</label>

        <label>roof <input type="range" min="0" max="0.9" step="0.05" value={roofOpacity} onChange={(e) => setRoofOpacity(+e.target.value)} aria-label="Roof opacity" /></label>
        <button className="mini" onClick={fit}>reset view</button>
      </div>
      {cur ? (
        <div className="facebar">
          <b>{cur.type !== 'room' ? cur.type + ' · ' : ''}{cur.id}</b><span>{FACE[sel.face]} · {area.toFixed(1)} m² · {hOf(cur).toFixed(2)} m high</span>
          <label>{sel.face === 'top' ? 'height' : 'push / pull'}
            <input type="range" min={range(cur, sel.face)[0]} max={range(cur, sel.face)[1]} step="0.05" value={val(cur, sel.face)} onChange={(e) => push(+e.target.value)} />
            <output>{val(cur, sel.face).toFixed(2)} m</output>
          </label>
          <button className="mini" onClick={() => split('x')}>split left | right</button>
          <button className="mini" onClick={() => split('z')}>split front / back</button>
          <button className="mini ghost" onClick={remove}>delete</button>
          <button className="mini ghost" onClick={reset}>reset plan</button>
        </div>
      ) : <p className="hint facehint">Click a room face to select it. Then push or pull it, split the room in two, or delete it.</p>}
      <div ref={mount} className="scene3d" style={{ background: '#fff' }} />
    </div>
  );
}
