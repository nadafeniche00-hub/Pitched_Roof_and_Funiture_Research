import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { autoMesh, cutMesh, splitEdge } from '@shared/roofMesh.js';
import { roomActions } from '../store/roomSlice.js';
import { heatColor } from './PlanView.jsx';

// Roof sculptor: the roof as a triangle mesh whose vertices and edges can be picked and moved along one axis at a time (ortho),
// snapped to the grid and to the other vertices; a vertical plane drawn with two clicks splits every roof face it crosses.
// plan [x, y, h] -> three (x, h, y)
const P3 = (p) => new THREE.Vector3(p[0], p[2], p[1]);
const GRID = 0.05, SNAP_V = 0.12;
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const AXIS_LABEL = { x: 'X across', y: 'Height', z: 'Z along', free: 'Free' };

const clone = (m) => ({ v: m.v.map((p) => [...p]), t: m.t.map((q) => [...q]) });

export default function RoofSculptor({ onClose }) {
  const room = useSelector((s) => s.room);
  const dispatch = useDispatch();
  const mount = useRef(null);
  const T = useRef(null);
  const undo = useRef([]);
  const [mesh, setMesh] = useState(() => clone(room.roof || autoMesh(room)));
  const [sel, setSel] = useState(null); // { k: 'v', i } | { k: 'e', a, b }
  const [tool, setTool] = useState('move');
  const [axis, setAxis] = useState('y');
  const [snap, setSnap] = useState(true);
  const [cutA, setCutA] = useState(null);
  const [note, setNote] = useState('');
  const S = useRef({});
  S.current = { mesh, sel, tool, axis, snap, cutA, room };

  const commit = (m) => dispatch(roomActions.setParam({ key: 'roof', value: m }));
  const push = () => { undo.current.push(clone(S.current.mesh)); if (undo.current.length > 60) undo.current.shift(); };
  const apply = (m, { save = true } = {}) => { if (save) push(); setMesh(m); commit(m); };

  // the automatic roof changed (pitch, knee wall, width or depth edited in the side panel): start again from it
  useEffect(() => { if (!room.roof) { setMesh(autoMesh(room)); setSel(null); undo.current = []; } }, [room.roof, room.width, room.depth, room.pitch, room.kneeWall]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- scene
  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a8, 1.3));
    const sunL = new THREE.DirectionalLight(0xffffff, 1.2); sunL.position.set(6, 12, 4); scene.add(sunL);
    const stat = new THREE.Group(), dyn = new THREE.Group(), pv = new THREE.Group();
    scene.add(stat, dyn, pv);
    const render = () => renderer.render(scene, camera);
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); render(); };
    controls.addEventListener('change', render);
    const ro = new ResizeObserver(resize); ro.observe(el);
    const { width: W, depth: D, maxHeight: MH } = S.current.room;
    const r = Math.max(W, D);
    controls.target.set(W / 2, 1.3, D / 2);
    camera.position.set(W / 2 + r * 0.95, r * 0.9, D / 2 + r * 1.25);
    controls.update();

    // static: ground, grid, the room's footprint and its height box
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf1efe8 }));
    ground.position.set(W / 2, -0.005, D / 2); stat.add(ground);
    const grid = new THREE.GridHelper(Math.max(W, D) * 3, Math.round(Math.max(W, D) * 3), 0xcfcfcf, 0xe6e6e6); grid.position.set(W / 2, -0.01, D / 2); stat.add(grid);
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, MH, D)), new THREE.LineBasicMaterial({ color: 0xb7b7b7 })); box.position.set(W / 2, MH / 2, D / 2); stat.add(box);

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    ray.params.Line.threshold = 0.08;
    const t = { scene, camera, controls, render, dyn, pv, verts: [], edges: [], edgeLines: null, roofMesh: null, ray, ndc, drag: null, hover: null };
    T.current = t;

    const setRay = (e) => { const b = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
    const others = (skip) => S.current.mesh.v.map((p, i) => [p, i]).filter(([, i]) => !skip.includes(i));
    const snapComp = (c, val, skip) => { // snap one coordinate to a nearby vertex, else to the grid
      let best = null, bd = SNAP_V;
      for (const [p] of others(skip)) { const d = Math.abs(p[c] - val); if (d < bd) { bd = d; best = p[c]; } }
      if (best !== null) return [best, 'vertex'];
      return S.current.snap ? [Math.round(val / GRID) * GRID, 'grid'] : [val, ''];
    };
    const lim = (c, v) => (c === 0 ? Math.max(0, Math.min(S.current.room.width, v)) : c === 1 ? Math.max(0, Math.min(S.current.room.depth, v)) : Math.max(0, Math.min(6, v)));

    const pickVert = () => ray.intersectObjects(t.verts, false)[0];
    const pickEdge = () => { if (!t.edgeLines) return null; const h = ray.intersectObject(t.edgeLines, false)[0]; return h ? t.edges[Math.floor(h.index / 2)] : null; };

    // a point on the roof (or the ground) for the cutting plane, snapped to vertices, edge middles, grid
    const cutPoint = () => {
      let p = null;
      const hit = t.roofMesh ? ray.intersectObject(t.roofMesh, false)[0] : null;
      if (hit) p = hit.point.clone();
      else { const g = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3()); if (g) p = g; }
      if (!p) return null;
      let out = [p.x, p.z, p.y], how = '';
      let bd = 0.25;
      for (const q of S.current.mesh.v) { const d = P3(q).distanceTo(p); if (d < bd) { bd = d; out = [...q]; how = 'vertex'; } }
      if (!how) for (const [a, b] of t.edges) { const A = S.current.mesh.v[a], B = S.current.mesh.v[b], m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]; const d = P3(m).distanceTo(p); if (d < bd) { bd = d; out = m; how = 'edge middle'; } }
      if (!how && S.current.snap) { out = [Math.round(out[0] / GRID) * GRID, Math.round(out[1] / GRID) * GRID, out[2]]; how = 'grid'; }
      setNote(how ? `snapped to ${how}` : '');
      return out;
    };

    const updatePreview = () => {
      while (pv.children.length) { const c = pv.children.pop(); c.geometry?.dispose(); c.material?.dispose?.(); }
      const A = S.current.cutA, B = t.hover;
      if (S.current.tool !== 'cut' || !B) { render(); return; }
      const dot = (p, col) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshBasicMaterial({ color: col, depthTest: false })); m.position.copy(P3(p)); m.renderOrder = 30; pv.add(m); };
      dot(B, 0x2f7d4f);
      if (A) {
        dot(A, 0xe8452c);
        const a = P3(A), b = new THREE.Vector3(B[0], A[2], B[1]), dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
        if (len > 0.05) {
          const plane = new THREE.Mesh(new THREE.PlaneGeometry((S.current.room.width + S.current.room.depth) * 2, 8), new THREE.MeshBasicMaterial({ color: 0xe8452c, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
          plane.position.set((a.x + b.x) / 2, 3, (a.z + b.z) / 2); plane.rotation.y = -Math.atan2(dz, dx); plane.renderOrder = 20; pv.add(plane);
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, new THREE.Vector3(b.x, a.y, b.z)]), new THREE.LineBasicMaterial({ color: 0xe8452c, depthTest: false })); line.renderOrder = 31; pv.add(line);
        }
      }
      render();
    };
    t.updatePreview = updatePreview;

    // ---------------- pointer
    let downAt = null;
    const onDown = (e) => {
      downAt = [e.clientX, e.clientY];
      if (S.current.tool !== 'move' || e.button !== 0) return;
      setRay(e);
      const vh = pickVert(), eh = vh ? null : pickEdge();
      if (!vh && !eh) return;
      const m = S.current.mesh;
      const idx = vh ? [vh.object.userData.i] : eh;
      const selection = vh ? { k: 'v', i: idx[0] } : { k: 'e', a: eh[0], b: eh[1] };
      setSel(selection);
      const orig = idx.map((i) => [...m.v[i]]);
      const c3 = orig.reduce((acc, p) => acc.add(P3(p)), new THREE.Vector3()).multiplyScalar(1 / orig.length);
      const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
      const ax = S.current.axis;
      const anchor = ax === 'free' ? ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, c3), new THREE.Vector3()) : axisParam(ray.ray, c3, AXES[ax]);
      if (anchor === null || anchor === undefined) return;
      t.drag = { idx, orig, c3, camDir, anchor, ax, moved: false };
      controls.enabled = false;
      push();
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const axisParam = (rr, c, a) => { // where on the axis line through c the pointer ray comes closest
      const d = rr.direction, w = rr.origin.clone().sub(c), b = d.dot(a), den = 1 - b * b;
      if (den < 1e-4) return null;
      return (a.dot(w) - b * d.dot(w)) / den;
    };
    const onMove = (e) => {
      setRay(e);
      const d = t.drag;
      if (!d) {
        if (S.current.tool === 'cut') { t.hover = cutPoint(); updatePreview(); }
        return;
      }
      let delta = new THREE.Vector3();
      if (d.ax === 'free') {
        const p = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(d.camDir, d.c3), new THREE.Vector3());
        if (!p) return;
        delta = p.sub(d.anchor);
      } else {
        const s = axisParam(ray.ray, d.c3, AXES[d.ax]);
        if (s === null) return;
        delta = AXES[d.ax].clone().multiplyScalar(s - d.anchor);
      }
      const dp = [delta.x, delta.z, delta.y]; // plan x, plan y, height
      const first = d.orig[0], skip = d.idx, comps = [0, 1, 2].filter((c) => Math.abs(dp[c]) > 1e-9);
      const adj = [0, 0, 0]; let how = '';
      for (const c of comps) { const [sv, h] = snapComp(c, first[c] + dp[c], skip); const v = lim(c, sv); adj[c] = v - first[c]; if (h) how = h; }
      setNote(how ? `snapped to ${how}` : '');
      const m = clone(S.current.mesh);
      d.idx.forEach((i, k) => { for (let c = 0; c < 3; c++) m.v[i][c] = d.orig[k][c] + adj[c]; });
      d.moved = true;
      setMesh(m);
    };
    const onUp = (e) => {
      const d = t.drag;
      if (d) {
        t.drag = null; controls.enabled = true;
        if (d.moved) commit(S.current.mesh); else undo.current.pop();
        downAt = null;
        return;
      }
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return; // that was an orbit
      downAt = null;
      setRay(e);
      if (S.current.tool === 'move') {
        const vh = pickVert(), eh = vh ? null : pickEdge();
        setSel(vh ? { k: 'v', i: vh.object.userData.i } : eh ? { k: 'e', a: eh[0], b: eh[1] } : null);
      } else {
        const p = cutPoint();
        if (!p) return;
        const A = S.current.cutA;
        if (!A) setCutA(p);
        else if (Math.hypot(p[0] - A[0], p[1] - A[1]) > 0.05) { const m = cutMesh(S.current.mesh, A, p); push(); setMesh(m); commit(m); setCutA(null); setSel(null); }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointerleave', () => { t.hover = null; updatePreview(); });
    resize();
    return () => {
      ro.disconnect(); controls.dispose();
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      renderer.dispose(); renderer.domElement.remove(); T.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- redraw the roof when the mesh or the selection changes
  useEffect(() => {
    const t = T.current; if (!t) return;
    const { dyn } = t;
    while (dyn.children.length) { const c = dyn.children.pop(); c.geometry?.dispose(); c.material?.dispose?.(); }
    const pos = [], col = [];
    for (const tri of mesh.t) for (const i of tri) { const p = mesh.v[i], c = heatColor(p[2]); pos.push(p[0], p[2], p[1]); col.push(c[0] / 255, c[1] / 255, c[2] / 255); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const roof = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.88, roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    dyn.add(roof); t.roofMesh = roof;
    // edges (unique)
    const seen = new Map();
    for (const [a, b, c] of mesh.t) for (const [i, j] of [[a, b], [b, c], [c, a]]) { const k = i < j ? `${i},${j}` : `${j},${i}`; if (!seen.has(k)) seen.set(k, i < j ? [i, j] : [j, i]); }
    t.edges = [...seen.values()];
    const ep = [];
    for (const [a, b] of t.edges) ep.push(...P3(mesh.v[a]).toArray(), ...P3(mesh.v[b]).toArray());
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
    t.edgeLines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x14161c }));
    dyn.add(t.edgeLines);
    // the selected edge or vertex, drawn on top
    const hot = new THREE.LineBasicMaterial({ color: 0xe8452c, depthTest: false });
    if (sel?.k === 'e') {
      const hl = new THREE.Line(new THREE.BufferGeometry().setFromPoints([P3(mesh.v[sel.a]), P3(mesh.v[sel.b])]), hot); hl.renderOrder = 25;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), new THREE.MeshBasicMaterial({ color: 0xe8452c, depthTest: false }));
      const A = P3(mesh.v[sel.a]), B = P3(mesh.v[sel.b]); tube.position.copy(A).add(B).multiplyScalar(0.5); tube.scale.y = A.distanceTo(B);
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); tube.renderOrder = 25;
      dyn.add(hl, tube);
    }
    t.verts = mesh.v.map((p, i) => {
      const on = (sel?.k === 'v' && sel.i === i) || (sel?.k === 'e' && (sel.a === i || sel.b === i));
      const m = new THREE.Mesh(new THREE.SphereGeometry(on ? 0.1 : 0.07, 14, 12), new THREE.MeshBasicMaterial({ color: on ? 0xe8452c : 0x14161c, depthTest: false }));
      m.position.copy(P3(p)); m.userData.i = i; m.renderOrder = 26; dyn.add(m); return m;
    });
    t.updatePreview?.();
    t.render();
  }, [mesh, sel]);
  useEffect(() => { T.current?.updatePreview?.(); }, [tool, cutA]);

  // ---------------------------------------------------------------- keys
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); doUndo(); return; }
      if (k === 'x') setAxis('x'); else if (k === 'y' || k === 'h') setAxis('y'); else if (k === 'z') setAxis('z'); else if (k === 'f') setAxis('free');
      else if (k === 'c') { setTool('cut'); setCutA(null); } else if (k === 'm') setTool('move');
      else if (k === 'escape') { setCutA(null); setSel(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const doUndo = () => { const m = undo.current.pop(); if (!m) return; setMesh(m); commit(m); setSel(null); };
  const doSplit = () => { if (sel?.k !== 'e') return; const { mesh: m, index } = splitEdge(mesh, sel.a, sel.b); apply(m); setSel({ k: 'v', i: index }); };
  const doReset = () => { undo.current = []; setSel(null); setCutA(null); dispatch(roomActions.setParam({ key: 'roof', value: null })); setMesh(autoMesh(room)); };
  const setCoord = (c, value) => {
    if (sel?.k !== 'v' || !Number.isFinite(value)) return;
    const m = clone(mesh); m.v[sel.i][c] = Math.max(0, Math.min(c === 0 ? room.width : c === 1 ? room.depth : 6, value)); apply(m);
  };
  const sv = sel?.k === 'v' ? mesh.v[sel.i] : null;

  return (
    <div className="card sculpt">
      <div className="cardhead">
        <h2>Roof sculptor <small>{tool === 'move' ? 'click a vertex or an edge, then drag it along one axis' : cutA ? 'click the second point: the vertical plane through both splits every roof face it crosses' : 'click two points on the roof to draw a splitting plane'}</small></h2>
        <button className="mini primary" onClick={onClose}>done</button>
      </div>
      <div className="facebar sculptbar">
        <span className="seg">
          <button className={tool === 'move' ? 'primary' : ''} onClick={() => setTool('move')}>move (M)</button>
          <button className={tool === 'cut' ? 'primary' : ''} onClick={() => { setTool('cut'); setCutA(null); }}>split plane (C)</button>
        </span>
        {tool === 'move' && (
          <span className="seg">
            {Object.keys(AXIS_LABEL).map((a) => <button key={a} className={axis === a ? 'primary' : ''} onClick={() => setAxis(a)}>{AXIS_LABEL[a]}</button>)}
          </span>
        )}
        <label className="inline"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> snap to grid {GRID * 100} cm</label>
        <button className="mini" disabled={sel?.k !== 'e'} onClick={doSplit}>split edge</button>
        <button className="mini" onClick={doUndo} disabled={!undo.current.length}>undo</button>
        <button className="mini ghost" onClick={doReset}>back to automatic roof</button>
        {note && <span className="snapnote">{note}</span>}
      </div>
      {sv && (
        <div className="facebar sculptbar">
          <b>vertex {sel.i}</b>
          {[['x across', 0], ['y along', 1], ['height', 2]].map(([label, c]) => (
            <label key={c} className="inline">{label}
              <input type="number" step="0.05" value={+sv[c].toFixed(2)} onChange={(e) => setCoord(c, e.target.valueAsNumber)} style={{ width: 70 }} /> m
            </label>
          ))}
        </div>
      )}
      <div ref={mount} className="scene3d" style={{ background: '#fff' }} />
      <p className="hint">Heights count for the usable area only where the roof is 1 m or higher (half) and 2 m or higher (full). The numbers on the right follow the sculpted roof. The walk-through still builds the automatic roof.</p>
    </div>
  );
}
