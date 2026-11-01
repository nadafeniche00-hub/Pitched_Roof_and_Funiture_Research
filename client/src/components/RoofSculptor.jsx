import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { autoMesh, cutMesh, splitEdge } from '@shared/roofMesh.js';
import { roomActions } from '../store/roomSlice.js';
import { heatColor } from './PlanView.jsx';
import { Icon, IconBtn } from './Icon.jsx';
import { PATTERNS, patternMesh, recognizeRoof } from '@shared/roofLibrary.js';
import { nationalShare, coverage, pitchPercentile, TOTAL, SURVEYED } from '../lib/roofStats.js';

// Roof sculptor, after the Editable Poly of 3ds Max: sub-object modes (vertex 1, edge 2, polygon 4, element 5), Ctrl-click to add to or
// remove from the selection, a gumball (arrows: one axis, squares: a plane, ball: free) that moves the whole selection with snapping,
// and Extrude, Inset, Weld, Remove, Split edge and a drawn splitting plane. The roof is a triangle mesh; a "polygon" is a group of
// coplanar triangles that share edges. plan [x, y, h] -> three (x, h, y)
const P3 = (p) => new THREE.Vector3(p[0], p[2], p[1]);
const GRID = 0.05, SNAP_V = 0.12;
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const AXIS_LABEL = { x: 'X across', y: 'Height', z: 'Z along', free: 'Free' };
const MODES = [['v', 'vertex', '1'], ['e', 'edge', '2'], ['p', 'polygon', '4'], ['el', 'element', '5']];

const clone = (m) => ({ v: m.v.map((p) => [...p]), t: m.t.map((q) => [...q]) });
const ek = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
const EMPTY = { vs: [], es: [], ts: [] };

// ---------------------------------------------------------------- mesh helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const triNormal = (m, tri) => { const [a, b, c] = tri.map((i) => m.v[i]); return cross3(sub(b, a), sub(c, a)); }; // length = twice the area
const unit = (n) => { const l = Math.hypot(...n) || 1; return [n[0] / l, n[1] / l, n[2] / l]; };

function edgeMap(m) {
  const map = new Map();
  m.t.forEach((tri, i) => [[0, 1], [1, 2], [2, 0]].forEach(([p, q]) => { const k = ek(tri[p], tri[q]); (map.get(k) || map.set(k, []).get(k)).push(i); }));
  return map;
}
/** the coplanar triangles around triangle `ti` that share edges: what 3ds Max would call one polygon */
function polygonOf(m, ti) {
  const em = edgeMap(m), n0 = unit(triNormal(m, m.t[ti])), p0 = m.v[m.t[ti][0]], seen = new Set([ti]), q = [ti];
  while (q.length) {
    const cur = q.pop(), tri = m.t[cur];
    for (const [p, r] of [[0, 1], [1, 2], [2, 0]]) for (const nb of em.get(ek(tri[p], tri[r])) || []) {
      if (seen.has(nb)) continue;
      const nn = unit(triNormal(m, m.t[nb]));
      if (Math.abs(dot3(nn, n0)) < 0.9998 || m.t[nb].some((i) => Math.abs(dot3(n0, sub(m.v[i], p0))) > 1e-3)) continue;
      seen.add(nb); q.push(nb);
    }
  }
  return [...seen];
}
/** every triangle connected to `ti` through shared edges */
function elementOf(m, ti) {
  const em = edgeMap(m), seen = new Set([ti]), q = [ti];
  while (q.length) {
    const tri = m.t[q.pop()];
    for (const [p, r] of [[0, 1], [1, 2], [2, 0]]) for (const nb of em.get(ek(tri[p], tri[r])) || []) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
  }
  return [...seen];
}
const vertsOf = (m, sel) => [...new Set([...sel.vs, ...sel.es.flat(), ...sel.ts.flatMap((i) => m.t[i] || [])])].filter((i) => i < m.v.length);

/** drop unused vertices and degenerate triangles */
function compact(m) {
  const t = m.t.filter(([a, b, c]) => a !== b && b !== c && a !== c && Math.hypot(...triNormal(m, [a, b, c])) > 1e-9);
  const used = [...new Set(t.flat())].sort((a, b) => a - b), map = new Map(used.map((o, i) => [o, i]));
  return { v: used.map((i) => [...m.v[i]]), t: t.map((tri) => tri.map((i) => map.get(i))) };
}

/** Extrude (offset along the polygon's outward normal) or Inset (toward its centre): the selected triangles move onto copies of their vertices, a ring of triangles joins old and new. */
function dupRegion(m, ts, mode, amt, centre) {
  const set = new Set(ts), v = m.v.map((p) => [...p]), t = [];
  const used = [...new Set(ts.flatMap((i) => m.t[i]))];
  let n = [0, 0, 0];
  for (const i of ts) { // outward: away from the middle of the house
    const a = triNormal(m, m.t[i]), c = m.t[i].map((k) => m.v[k]).reduce((s, p) => [s[0] + p[0] / 3, s[1] + p[1] / 3, s[2] + p[2] / 3], [0, 0, 0]);
    const f = dot3(a, sub(c, centre)) < 0 ? -1 : 1;
    n = [n[0] + a[0] * f, n[1] + a[1] * f, n[2] + a[2] * f];
  }
  n = unit(n);
  const mid = used.reduce((s, i) => [s[0] + m.v[i][0] / used.length, s[1] + m.v[i][1] / used.length, s[2] + m.v[i][2] / used.length], [0, 0, 0]);
  const map = new Map();
  for (const i of used) {
    const p = m.v[i];
    let q;
    if (mode === 'extrude') q = [p[0] + n[0] * amt, p[1] + n[1] * amt, p[2] + n[2] * amt];
    else { const d = sub(mid, p), L = Math.hypot(...d) || 1, k = Math.min(amt, L * 0.8) / L; q = [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k]; }
    map.set(i, v.length); v.push(q);
  }
  const em = edgeMap(m);
  m.t.forEach((tri, i) => {
    if (!set.has(i)) { t.push(tri); return; }
    t.push(tri.map((k) => map.get(k)));
    for (const [p, r] of [[0, 1], [1, 2], [2, 0]]) { // boundary edges of the selection get a side wall
      const a = tri[p], b = tri[r];
      if ((em.get(ek(a, b)) || []).some((o) => o !== i && set.has(o))) continue;
      t.push([a, b, map.get(b)], [a, map.get(b), map.get(a)]);
    }
  });
  return { mesh: { v, t }, ts: ts.slice() }; // the selected triangles keep their indices
}

function weld(m, vs) {
  if (vs.length < 2) return m;
  const keep = vs[0], v = m.v.map((p) => [...p]);
  v[keep] = [0, 1, 2].map((c) => vs.reduce((s, i) => s + m.v[i][c], 0) / vs.length);
  const set = new Set(vs);
  return compact({ v, t: m.t.map((tri) => tri.map((i) => (set.has(i) ? keep : i))) });
}

export default function RoofSculptor({ onClose }) {
  const room = useSelector((s) => s.room);
  const dispatch = useDispatch();
  const mount = useRef(null);
  const wrapRef = useRef(null);
  const tipRef = useRef(null);
  const T = useRef(null);
  const undo = useRef([]);
  const redo = useRef([]);
  const [mesh, setMesh] = useState(() => clone(room.roof || autoMesh(room)));
  const [mode, setMode] = useState('p');
  const [sel, setSel] = useState(EMPTY);
  const [tool, setTool] = useState('move');
  const [axis, setAxis] = useState('y');
  // snapping, after Blender: what to snap to (vertex, edge, edge middle, face, increment), which point of the selection snaps (closest or centre)
  const [snapCfg, setSnapCfg] = useState({ on: true, vertex: true, edge: true, mid: true, face: false, incr: true, step: 0.05, source: 'closest' });
  const [cutA, setCutA] = useState(null);
  const [note, setNote] = useState('');
  const [amt, setAmt] = useState(0.4);
  const S = useRef({});
  S.current = { mesh, sel, mode, tool, axis, snapCfg, cutA, room };

  const commit = (m) => dispatch(roomActions.setParam({ key: 'roof', value: m }));
  const push = () => { undo.current.push(clone(S.current.mesh)); redo.current = []; if (undo.current.length > 60) undo.current.shift(); };
  const apply = (m, nextSel = EMPTY) => { push(); setMesh(m); commit(m); setSel(nextSel); };
  const count = sel.vs.length + sel.es.length + sel.ts.length;
  const reading = recognizeRoof(mesh); // which pattern this roof is, from its planes
  const known = PATTERNS.find((p) => p.id === reading.id);
  const mainPitch = reading.pitches.length ? Math.max(...reading.pitches) : 0;

  // the automatic roof changed (pitch, knee wall, width or depth edited in the side panel): start again from it
  useEffect(() => { if (!room.roof) { setMesh(autoMesh(room)); setSel(EMPTY); undo.current = []; } }, [room.roof, room.width, room.depth, room.pitch, room.kneeWall]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- scene
  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 300);
    const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0a8, 1.3));
    const sunL = new THREE.DirectionalLight(0xffffff, 1.2); sunL.position.set(6, 12, 4); scene.add(sunL);
    const stat = new THREE.Group(), dyn = new THREE.Group(), pv = new THREE.Group();
    scene.add(stat, dyn, pv);
    let gum = null; // the gumball keeps the same size on screen, wherever the camera is
    const render = () => { if (gum) gum.scale.setScalar(camera.position.distanceTo(gum.position) * 0.11); renderer.render(scene, camera); };
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); render(); };
    controls.addEventListener('change', render);
    const ro = new ResizeObserver(resize); ro.observe(el);
    const { width: W, depth: D, maxHeight: MH } = S.current.room;
    const dist = (0.5 * Math.hypot(W, D, MH) / Math.sin((camera.fov * Math.PI) / 360)) * 0.85;
    controls.target.set(W / 2, MH * 0.35, D / 2);
    camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(0.75, 0.7, 1).normalize(), dist);
    controls.update();

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf1efe8 }));
    ground.position.set(W / 2, -0.005, D / 2); stat.add(ground);
    const grid = new THREE.GridHelper(Math.max(W, D) * 3, Math.round(Math.max(W, D) * 3), 0xcfcfcf, 0xe6e6e6); grid.position.set(W / 2, -0.01, D / 2); stat.add(grid);
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, MH, D)), new THREE.LineBasicMaterial({ color: 0xb7b7b7 })); box.position.set(W / 2, MH / 2, D / 2); stat.add(box);

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    ray.params.Line.threshold = 0.14;
    const t = { scene, camera, controls, render, dyn, pv, verts: [], edges: [], edgeLines: null, roofMesh: null, ray, ndc, drag: null, hover: null, handles: [], setGum: (g) => { gum = g; } };
    T.current = t;
    if (new URLSearchParams(window.location.search).has('debug')) window.__sculpt = { T, S, camera, renderer }; // test hook

    const setRay = (e) => { const b = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
    const others = (skip) => S.current.mesh.v.map((p, i) => [p, i]).filter(([, i]) => !skip.includes(i));
    const snapComp = (c, val, skip) => { // snap one coordinate to the plan outline (or a wall height), a nearby vertex, else to the grid
      const rm = S.current.room, fixed = c === 0 ? [0, rm.width] : c === 1 ? [0, rm.depth] : [rm.kneeWall, 1, 2, rm.maxHeight];
      for (const f of fixed) if (Math.abs(f - val) < (c === 2 ? 0.1 : 0.2)) return [f, c === 2 ? 'wall height' : 'plan outline'];
      let best = null, bd = SNAP_V;
      for (const [p] of others(skip)) { const d = Math.abs(p[c] - val); if (d < bd) { bd = d; best = p[c]; } }
      if (best !== null) return [best, 'vertex'];
      const sc = S.current.snapCfg;
      return sc.on && sc.incr ? [Math.round(val / sc.step) * sc.step, 'increment'] : [val, ''];
    };
    const lim = (c, v) => (c === 0 ? Math.max(0, Math.min(S.current.room.width, v)) : c === 1 ? Math.max(0, Math.min(S.current.room.depth, v)) : Math.max(0, Math.min(6, v)));

    const pickVert = () => ray.intersectObjects(t.verts, false)[0];
    const pickEdge = () => { if (!t.edgeLines) return null; const h = ray.intersectObject(t.edgeLines, false)[0]; return h ? t.edges[Math.floor(h.index / 2)] : null; };
    const pickTri = () => { const h = t.roofMesh ? ray.intersectObject(t.roofMesh, false)[0] : null; return h ? h.faceIndex : null; };

    // a point on the roof (or the ground) for the cutting plane, snapped to vertices, edge middles, grid
    const cutPoint = () => {
      let p = null;
      const hit = t.roofMesh ? ray.intersectObject(t.roofMesh, false)[0] : null;
      if (hit) p = hit.point.clone();
      else { const g = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3()); if (g) p = g; }
      if (!p) return null;
      let out = [p.x, p.z, p.y], how = '';
      let bd = 0.25;
      const sc = S.current.snapCfg;
      if (sc.on && sc.vertex) for (const q of S.current.mesh.v) { const d = P3(q).distanceTo(p); if (d < bd) { bd = d; out = [...q]; how = 'vertex'; } }
      if (!how && sc.on && sc.mid) for (const [a, b] of t.edges) { const A = S.current.mesh.v[a], B = S.current.mesh.v[b], m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]; const d = P3(m).distanceTo(p); if (d < bd) { bd = d; out = m; how = 'edge middle'; } }
      if (!how && sc.on && sc.edge) {
        const ln = new THREE.Line3(), q = new THREE.Vector3();
        for (const [a, b] of t.edges) { ln.set(P3(S.current.mesh.v[a]), P3(S.current.mesh.v[b])); ln.closestPointToPoint(p, true, q); const d = q.distanceTo(p); if (d < bd) { bd = d; out = [q.x, q.z, q.y]; how = 'edge'; } }
      }
      if (!how && sc.on && sc.incr) { out = [Math.round(out[0] / sc.step) * sc.step, Math.round(out[1] / sc.step) * sc.step, out[2]]; how = 'increment'; }
      setNote(how ? `snapped to ${how}` : '');
      return out;
    };

    const updatePreview = () => {
      while (pv.children.length) { const c = pv.children.pop(); c.geometry?.dispose(); c.material?.dispose?.(); }
      const A = S.current.cutA, B = t.hover;
      if (t.snapMark) { const mk = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), new THREE.MeshBasicMaterial({ color: 0xffc533, depthTest: false })); mk.position.copy(t.snapMark); mk.renderOrder = 35; pv.add(mk); }
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
    // Blender-style element snapping: the target under the cursor is the nearest vertex, edge middle, point on an edge, or point on a face
    const toScr = (p) => { const v = p.clone().project(camera), b = renderer.domElement.getBoundingClientRect(); return [b.left + ((v.x + 1) / 2) * b.width, b.top + ((1 - v.y) / 2) * b.height]; };
    const findTarget = (e, idx) => {
      const cfg = S.current.snapCfg, m = S.current.mesh, skip = new Set(idx), cands = [];
      const cur = [e.clientX, e.clientY], pd = (q) => Math.hypot(q[0] - cur[0], q[1] - cur[1]);
      if (cfg.vertex) m.v.forEach((p, i) => { if (!skip.has(i)) { const w = P3(p); cands.push({ p: w, kind: 'vertex', score: pd(toScr(w)) - 10, d: pd(toScr(w)) }); } });
      for (const [a, b] of t.edges) {
        if (skip.has(a) || skip.has(b)) continue;
        const A = P3(m.v[a]), B = P3(m.v[b]);
        if (cfg.mid) { const w = A.clone().add(B).multiplyScalar(0.5), d = pd(toScr(w)); cands.push({ p: w, kind: 'edge middle', score: d - 6, d }); }
        if (cfg.edge) { const w = new THREE.Vector3(); ray.ray.distanceSqToSegment(A, B, undefined, w); const d = pd(toScr(w)); cands.push({ p: w, kind: 'edge', score: d, d }); }
      }
      const best = cands.filter((c) => c.d <= 22).sort((x, y) => x.score - y.score)[0];
      if (best) return best;
      if (cfg.face) { // the face under the cursor (the faces being moved are ignored)
        let hit = null, hd = Infinity; const w = new THREE.Vector3();
        for (const tri of m.t) {
          if (tri.some((i) => skip.has(i))) continue;
          if (ray.ray.intersectTriangle(P3(m.v[tri[0]]), P3(m.v[tri[1]]), P3(m.v[tri[2]]), false, w)) { const dd = w.distanceTo(ray.ray.origin); if (dd < hd) { hd = dd; hit = w.clone(); } }
        }
        if (hit) return { p: hit, kind: 'face', score: 12, d: 0 };
      }
      return null;
    };
    let downAt = null;
    const axisParam = (rr, c, a) => { // where on the axis line through c the pointer ray comes closest
      const d = rr.direction, w = rr.origin.clone().sub(c), b = d.dot(a), den = 1 - b * b;
      if (den < 1e-4) return null;
      return (a.dot(w) - b * d.dot(w)) / den;
    };
    const fmt = (v) => (Math.abs(v) < 1 ? `${Math.round(v * 100)} cm` : `${v.toFixed(2)} m`);
    const AXCOL = { x: '#d64545', y: '#2f9e5b', z: '#3f6fd6', free: '#14161c', plane: '#14161c' };
    const showTip = (e, d, adj) => { // the small window at the cursor: how far, in cm or m, or the typed value
      const el = tipRef.current, wrap = wrapRef.current;
      if (!el || !wrap || !e) return;
      const b = wrap.getBoundingClientRect(), single = ['x', 'y', 'z'].includes(d.ax);
      const comp = { x: 0, z: 1, y: 2 }[d.ax];
      const typed = d.typed !== undefined && d.typed !== '';
      const body = typed ? `<b>${d.typed}</b> ${d.cm ? 'cm' : 'm'}<span class="caret"></span>`
        : single ? `<b>${fmt(adj[comp])}</b>` : `x ${fmt(adj[0])} · z ${fmt(adj[1])} · h ${fmt(adj[2])}`;
      el.style.display = 'block';
      el.style.transform = `translate(${Math.round(e.clientX - b.left + 18)}px, ${Math.round(e.clientY - b.top + 18)}px)`;
      el.innerHTML = `<i style="background:${AXCOL[d.ax]}"></i>${body}<small>${single ? 'type a value · C cm/m · Enter sets · Esc cancels' : 'pick an arrow to type a value'}</small>`;
    };
    t.lim = lim;
    t.applyAdj = (d, adj) => {
      const m = clone(S.current.mesh);
      d.idx.forEach((i, k) => { for (let c = 0; c < 3; c++) m.v[i][c] = d.orig[k][c] + adj[c]; });
      d.moved = true; d.adj = adj; setMesh(m);
    };
    t.typedAdj = (d) => { // an exact distance typed along the arrow's axis replaces the mouse
      const comp = { x: 0, z: 1, y: 2 }[d.ax];
      if (comp === undefined) { showTip(t.lastEvent, d, d.adj || [0, 0, 0]); return; }
      const v = (parseFloat(d.typed) || 0) * (d.cm ? 0.01 : 1), adj = [0, 0, 0];
      adj[comp] = lim(comp, d.orig[0][comp] + v) - d.orig[0][comp];
      t.snapMark = null; t.applyAdj(d, adj); showTip(t.lastEvent, d, adj);
    };
    t.endDrag = (ok) => {
      const d = t.drag;
      if (!d) return;
      t.drag = null; controls.enabled = true; t.snapMark = null;
      if (tipRef.current) tipRef.current.style.display = 'none';
      if (ok && d.moved) commit(S.current.mesh);
      else if (!ok) { const m = undo.current.pop(); if (m) setMesh(m); } // Esc: back to where it was
      else undo.current.pop();
      t.updatePreview();
    };
    t.startGrab = () => { // G: grab the selection without holding a button; move the mouse or type a value, click or Enter to set
      const m = S.current.mesh, e = t.lastEvent;
      if (!e || t.drag || S.current.tool !== 'move') return;
      const idx = vertsOf(m, S.current.sel);
      if (!idx.length) return;
      setRay(e);
      const orig = idx.map((i) => [...m.v[i]]);
      const c3 = orig.reduce((acc, p) => acc.add(P3(p)), new THREE.Vector3()).multiplyScalar(1 / orig.length);
      const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
      const ax = S.current.axis;
      const anchor = ax === 'free' ? ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, c3), new THREE.Vector3()) : axisParam(ray.ray, c3, AXES[ax]);
      if (anchor === null || anchor === undefined) return;
      t.drag = { idx, orig, c3, camDir, anchor, ax, moved: false, grab: true };
      controls.enabled = false; push(); showTip(e, t.drag, [0, 0, 0]);
    };
    const onDown = (e) => {
      downAt = [e.clientX, e.clientY];
      if (t.drag?.grab) { t.endDrag(true); downAt = null; return; } // a click confirms a grab
      if (S.current.tool !== 'move' || e.button !== 0) return;
      setRay(e);
      const { sel: cs, mesh: m } = S.current;
      const gh = t.handles.length ? ray.intersectObjects(t.handles, false)[0] : null; // a gumball handle: move the whole selection
      if (!gh) return;
      const idx = vertsOf(m, cs);
      if (!idx.length) return;
      const orig = idx.map((i) => [...m.v[i]]);
      const c3 = orig.reduce((acc, p) => acc.add(P3(p)), new THREE.Vector3()).multiplyScalar(1 / orig.length);
      const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
      let ax = S.current.axis, nrm = camDir;
      const hd = gh.object.userData.handle; // 'x' | 'y' | 'z' arrows, 'xz' | 'xy' | 'zy' planes, 'free' ball
      if (hd.length === 1) { ax = hd; setAxis(hd); } else if (hd === 'free') ax = 'free';
      else { ax = 'plane'; nrm = AXES[['x', 'y', 'z'].find((a) => !hd.includes(a))]; }
      const planar = ax === 'free' || ax === 'plane';
      const anchor = planar ? ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(nrm, c3), new THREE.Vector3()) : axisParam(ray.ray, c3, AXES[ax]);
      if (anchor === null || anchor === undefined) return;
      t.drag = { idx, orig, c3, camDir: nrm, anchor, ax, moved: false };
      controls.enabled = false;
      push();
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      setRay(e);
      t.lastEvent = e;
      const d = t.drag;
      if (!d) {
        if (S.current.tool === 'cut') { t.hover = cutPoint(); updatePreview(); }
        return;
      }
      if (d.typed) { showTip(e, d, d.adj || [0, 0, 0]); return; } // a typed value wins over the mouse
      let delta = new THREE.Vector3();
      if (d.ax === 'free' || d.ax === 'plane') {
        const p = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(d.camDir, d.c3), new THREE.Vector3());
        if (!p) return;
        delta = p.sub(d.anchor);
      } else {
        const s = axisParam(ray.ray, d.c3, AXES[d.ax]);
        if (s === null) return;
        delta = AXES[d.ax].clone().multiplyScalar(s - d.anchor);
      }
      const cfg = S.current.snapCfg, active = cfg.on !== (e.ctrlKey || e.metaKey); // Ctrl flips snapping while dragging, as in Blender
      const first = d.orig[0], adj = [0, 0, 0]; let how = '';
      const target = active && (cfg.vertex || cfg.edge || cfg.mid || cfg.face) ? findTarget(e, d.idx) : null;
      t.snapMark = null;
      if (target) {
        const srcs = d.orig.map((p) => P3(p));
        const src = cfg.source === 'center' ? d.c3 : srcs.reduce((b, p) => (p.distanceTo(target.p) < b.distanceTo(target.p) ? p : b), srcs[0]);
        let dl = target.p.clone().sub(src);
        if (d.ax === 'x' || d.ax === 'y' || d.ax === 'z') dl = AXES[d.ax].clone().multiplyScalar(dl.dot(AXES[d.ax])); // an arrow keeps its axis
        else if (d.ax === 'plane') dl.addScaledVector(d.camDir, -dl.dot(d.camDir));
        const dq = [dl.x, dl.z, dl.y];
        for (let c = 0; c < 3; c++) adj[c] = lim(c, first[c] + dq[c]) - first[c];
        how = target.kind; t.snapMark = target.p;
      } else {
        const dp = [delta.x, delta.z, delta.y]; // plan x, plan y, height
        const comps = [0, 1, 2].filter((c) => Math.abs(dp[c]) > 1e-9);
        for (const c of comps) { const [sv, h] = snapComp(c, first[c] + dp[c], d.idx); const v = lim(c, active ? sv : first[c] + dp[c]); adj[c] = v - first[c]; if (h && active) how = h; }
      }
      setNote(how ? `snapped to ${how}` : '');
      t.applyAdj(d, adj);
      showTip(e, d, adj);
    };
    const onUp = (e) => {
      const d = t.drag;
      if (d) {
        if (d.grab) return; // a grab ends with a click or Enter
        t.endDrag(true);
        downAt = null;
        return;
      }
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return; // that was an orbit
      downAt = null;
      setRay(e);
      if (S.current.tool === 'cut') {
        const p = cutPoint();
        if (!p) return;
        const A = S.current.cutA;
        if (!A) setCutA(p);
        else if (Math.hypot(p[0] - A[0], p[1] - A[1]) > 0.05) { const m = cutMesh(S.current.mesh, A, p); push(); setMesh(m); commit(m); setCutA(null); setSel(EMPTY); }
        return;
      }
      // sub-object selection; Ctrl or Shift adds to the selection or removes from it
      const add = e.ctrlKey || e.metaKey || e.shiftKey, md = S.current.mode, m = S.current.mesh, cur = S.current.sel;
      const toggle = (list, item, same) => (list.some((x) => same(x, item)) ? list.filter((x) => !same(x, item)) : [...list, item]);
      if (md === 'v') {
        const h = pickVert();
        if (!h) { if (!add) setSel(EMPTY); return; }
        const i = h.object.userData.i;
        setSel({ ...EMPTY, vs: add ? toggle(cur.vs, i, (x, y) => x === y) : [i] });
      } else if (md === 'e') {
        const h = pickEdge();
        if (!h) { if (!add) setSel(EMPTY); return; }
        setSel({ ...EMPTY, es: add ? toggle(cur.es, h, (x, y) => ek(...x) === ek(...y)) : [h] });
      } else {
        const ti = pickTri();
        if (ti === null) { if (!add) setSel(EMPTY); return; }
        const grp = md === 'el' ? elementOf(m, ti) : polygonOf(m, ti), has = grp.every((i) => cur.ts.includes(i));
        setSel({ ...EMPTY, ts: add ? (has ? cur.ts.filter((i) => !grp.includes(i)) : [...new Set([...cur.ts, ...grp])]) : grp });
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
    for (const [a, b, c] of mesh.t) for (const [i, j] of [[a, b], [b, c], [c, a]]) { const k = ek(i, j); if (!seen.has(k)) seen.set(k, i < j ? [i, j] : [j, i]); }
    t.edges = [...seen.values()];
    const ep = [];
    for (const [a, b] of t.edges) ep.push(...P3(mesh.v[a]).toArray(), ...P3(mesh.v[b]).toArray());
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
    t.edgeLines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x14161c }));
    dyn.add(t.edgeLines);
    // the selection, drawn on top
    if (sel.ts.length) {
      const sp = [];
      for (const ti of sel.ts) for (const i of mesh.t[ti] || []) sp.push(mesh.v[i][0], mesh.v[i][2], mesh.v[i][1]);
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      const ov = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xe8452c, transparent: true, opacity: 0.55, depthTest: false, side: THREE.DoubleSide })); ov.renderOrder = 24; dyn.add(ov);
    }
    for (const [a, b] of sel.es) {
      const A = P3(mesh.v[a]), B = P3(mesh.v[b]);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), new THREE.MeshBasicMaterial({ color: 0xe8452c, depthTest: false }));
      tube.position.copy(A).add(B).multiplyScalar(0.5); tube.scale.y = A.distanceTo(B);
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); tube.renderOrder = 25; dyn.add(tube);
    }
    const hot = new Set(vertsOf(mesh, sel));
    t.verts = mode === 'v' ? mesh.v.map((p, i) => {
      const on = hot.has(i);
      const m = new THREE.Mesh(new THREE.SphereGeometry(on ? 0.1 : 0.07, 14, 12), new THREE.MeshBasicMaterial({ color: on ? 0xe8452c : 0x14161c, depthTest: false }));
      m.position.copy(P3(p)); m.userData.i = i; m.renderOrder = 26; dyn.add(m); return m;
    }) : [];
    // the gumball: arrows (one axis), squares (a plane), ball (free)
    t.handles = [];
    if (hot.size && tool === 'move') {
      const ids = [...hot];
      const c = ids.reduce((acc, i) => acc.add(P3(mesh.v[i])), new THREE.Vector3()).multiplyScalar(1 / ids.length);
      const COL = { x: 0xd64545, y: 0x2f9e5b, z: 0x3f6fd6 };
      const gm = new THREE.Group(); gm.position.copy(c);
      const mat = (col, op = 1) => new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: op, side: THREE.DoubleSide });
      const add = (m, handle, order = 40) => { m.userData.handle = handle; m.renderOrder = order; gm.add(m); t.handles.push(m); return m; };
      for (const ax of ['x', 'y', 'z']) {
        const on = axis === ax, d = AXES[ax], q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        const shaft = add(new THREE.Mesh(new THREE.CylinderGeometry(on ? 0.045 : 0.03, on ? 0.045 : 0.03, 0.85, 8), mat(COL[ax])), ax);
        shaft.position.copy(d).multiplyScalar(0.575); shaft.quaternion.copy(q);
        const cone = add(new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 14), mat(COL[ax])), ax);
        cone.position.copy(d).multiplyScalar(1.15); cone.quaternion.copy(q);
      }
      for (const [name, u, v2, n, colr] of [['xz', 'x', 'z', 'y', COL.y], ['xy', 'x', 'y', 'z', COL.z], ['zy', 'z', 'y', 'x', COL.x]]) {
        const sq = add(new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), mat(colr, 0.55)), name);
        sq.position.copy(AXES[u]).multiplyScalar(0.4).addScaledVector(AXES[v2], 0.4);
        sq.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), AXES[n]);
      }
      add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat(0xffffff)), 'free', 41);
      dyn.add(gm); t.setGum(gm);
    } else t.setGum(null);
    t.updatePreview?.();
    t.render();
  }, [mesh, sel, axis, tool, mode]);
  useEffect(() => { T.current?.updatePreview?.(); }, [tool, cutA]);

  // ---------------------------------------------------------------- operations (the Edit Poly rollout)
  const switchMode = (md) => {
    setMode(md); setTool('move');
    setSel(md === 'v' ? { ...EMPTY, vs: vertsOf(mesh, sel) } : EMPTY); // vertices carry over, the rest starts clean
  };
  const doExtrude = () => { if (!sel.ts.length) return; const r = dupRegion(mesh, sel.ts, 'extrude', amt, [room.width / 2, room.depth / 2, 0]); apply(r.mesh, { ...EMPTY, ts: r.ts }); };
  const doInset = () => { if (!sel.ts.length) return; const r = dupRegion(mesh, sel.ts, 'inset', amt, [room.width / 2, room.depth / 2, 0]); apply(r.mesh, { ...EMPTY, ts: r.ts }); };
  const doWeld = () => { const vs = vertsOf(mesh, sel); if (vs.length < 2) return; apply(weld(mesh, vs)); };
  const doRemove = () => {
    let ts = sel.ts;
    if (sel.vs.length) ts = mesh.t.map((tri, i) => (tri.some((k) => sel.vs.includes(k)) ? i : -1)).filter((i) => i >= 0);
    if (!ts.length) return;
    const drop = new Set(ts), m = compact({ v: mesh.v, t: mesh.t.filter((_, i) => !drop.has(i)) });
    if (m.t.length < 2) { setNote('a roof needs at least two faces'); return; }
    apply(m);
  };
  const doSplitEdge = () => { if (!sel.es.length) return; let m = mesh, last = null; for (const [a, b] of sel.es) { const r = splitEdge(m, a, b); m = r.mesh; last = r.index; } apply(m, { ...EMPTY, vs: [last] }); setMode('v'); };
  const doSelectAll = () => setSel(mode === 'v' ? { ...EMPTY, vs: mesh.v.map((_, i) => i) } : mode === 'e' ? { ...EMPTY, es: T.current.edges.map((e) => [...e]) } : { ...EMPTY, ts: mesh.t.map((_, i) => i) });
  const doUndo = () => { const m = undo.current.pop(); if (!m) return; redo.current.push(clone(S.current.mesh)); setMesh(m); commit(m); setSel(EMPTY); };
  const doRedo = () => { const m = redo.current.pop(); if (!m) return; undo.current.push(clone(S.current.mesh)); setMesh(m); commit(m); setSel(EMPTY); };
  const doReset = () => { undo.current = []; setSel(EMPTY); setCutA(null); dispatch(roomActions.setParam({ key: 'roof', value: null })); setMesh(autoMesh(room)); };
  const oneVertex = sel.vs.length === 1 ? mesh.v[sel.vs[0]] : null;
  const setCoord = (c, value) => {
    if (!oneVertex || !Number.isFinite(value)) return;
    const m = clone(mesh); m.v[sel.vs[0]][c] = Math.max(0, Math.min(c === 0 ? room.width : c === 1 ? room.depth : 6, value)); apply(m, sel);
  };

  // ---------------------------------------------------------------- keys
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase(), tt = T.current, dd = tt?.drag;
      if (dd) { // numeric input, as in Blender: type the distance, Enter sets it, Esc cancels
        if (/^[0-9.,-]$/.test(e.key)) { dd.typed = (dd.typed || '') + (e.key === ',' ? '.' : e.key); tt.typedAdj(dd); e.preventDefault(); return; }
        if (e.key === 'Backspace') { dd.typed = (dd.typed || '').slice(0, -1); tt.typedAdj(dd); e.preventDefault(); return; }
        if (k === 'c') { dd.cm = !dd.cm; if (dd.typed) tt.typedAdj(dd); e.preventDefault(); return; }
        if (e.key === 'Enter') { e.preventDefault(); tt.endDrag(true); return; }
        if (e.key === 'Escape') { e.preventDefault(); tt.endDrag(false); return; }
      }
      if (k === 'g') { tt?.startGrab(); return; }
      if (k === 'tab' && e.shiftKey) { e.preventDefault(); setSnapCfg((c) => ({ ...c, on: !c.on })); return; } // Shift+Tab toggles snapping
      if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'a') { e.preventDefault(); doSelectAll(); return; }
      if (k === '1') switchMode('v'); else if (k === '2') switchMode('e'); else if (k === '4') switchMode('p'); else if (k === '5') switchMode('el');
      else if (k === 'x') setAxis('x'); else if (k === 'y' || k === 'h') setAxis('y'); else if (k === 'z') setAxis('z'); else if (k === 'f') setAxis('free');
      else if (k === 'c') { setTool('cut'); setCutA(null); } else if (k === 'm') setTool('move');
      else if (k === 'delete' || k === 'backspace') doRemove();
      else if (k === 'escape') { setCutA(null); setSel(EMPTY); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const hint = tool === 'cut'
    ? (cutA ? 'click the second point: the vertical plane through both splits every roof face it crosses' : 'click two points on the roof to draw a splitting plane')
    : `${MODES.find((m) => m[0] === mode)[1]} mode: click to select, Ctrl-click to add or remove, then drag the gumball (arrows: one axis, squares: a plane, white ball: free), or press G and type a distance`;

  return (
    <div className="card sculpt">
      <div className="cardhead">
        <h2>Roof sculptor <small>{hint}</small></h2>
        <button className="mini primary" onClick={onClose}>done</button>
      </div>
      <div className="facebar sculptbar patterns">
        <span className="seg">
          {PATTERNS.map((p) => (
            <button key={p.id} className={reading.id === p.id ? 'primary' : ''} title={`${p.name}: ${p.note}. ${nationalShare(p.osm).toFixed(1)} % of ${(TOTAL / 1e6).toFixed(2)} million tagged homes in Germany`} aria-label={p.name}
              onClick={() => { apply(patternMesh(room, p.id)); }}>
              <Icon name={p.id} size={26} /><span className="cap">{nationalShare(p.osm) >= 0.1 ? nationalShare(p.osm).toFixed(nationalShare(p.osm) < 10 ? 1 : 0) + ' %' : '<0.1 %'}</span>
            </button>
          ))}
        </span>
        <span className="reading" title={`The seven patterns describe ${coverage().toFixed(0)} % of the tagged homes in Germany`}>
          <Icon name={reading.known ? reading.id : 'custom'} size={22} />
          <b>{reading.name}</b>{reading.details > 0 && <em> + {reading.details} detail{reading.details > 1 ? 's' : ''}</em>}
          {known && <span> · {nationalShare(known.osm).toFixed(1)} % of homes</span>}
          {reading.id === 'gabled' && mainPitch > 0 && <span> · {mainPitch.toFixed(0)}° sits at percentile {pitchPercentile(mainPitch)} of {SURVEYED.n.toLocaleString("en")} surveyed gabled roofs in {SURVEYED.city}</span>}
        </span>
      </div>
      <div className="facebar sculptbar">
        <b>Sub-object</b>
        <span className="seg">
          {MODES.map(([k, label, key]) => <button key={k} className={mode === k && tool === 'move' ? 'primary' : ''} onClick={() => switchMode(k)}>{label} ({key})</button>)}
        </span>
        <span className="seg">
          <button className={tool === 'cut' ? 'primary' : ''} onClick={() => { setTool('cut'); setCutA(null); }}>split plane (C)</button>
        </span>
        <span className="snapnote">{count ? `${count} selected` : 'nothing selected'}</span>
        {note && <span className="snapnote">{note}</span>}
      </div>
      <div className="facebar sculptbar">
        <b>Edit</b>
        <label className="inline">amount <input type="number" step="0.05" min="0.05" value={amt} onChange={(e) => setAmt(Math.max(0.05, e.target.valueAsNumber || 0.05))} style={{ width: 64 }} /> m</label>
        <button className="mini" disabled={!sel.ts.length} onClick={doExtrude}>extrude</button>
        <button className="mini" disabled={!sel.ts.length} onClick={doInset}>inset</button>
        <button className="mini" disabled={vertsOf(mesh, sel).length < 2} onClick={doWeld}>weld</button>
        <button className="mini" disabled={!sel.es.length} onClick={doSplitEdge}>split edge</button>
        <IconBtn icon="remove" label="Delete the selected faces or vertices (Del)" disabled={!sel.ts.length && !sel.vs.length} onClick={doRemove} />
        <button className="mini ghost" onClick={doSelectAll}>select all (Ctrl A)</button>
        <IconBtn icon="undo" label="Undo (Ctrl+Z)" onClick={doUndo} />
        <IconBtn icon="redo" label="Redo (Ctrl+Y)" onClick={doRedo} />
        <button className="mini ghost" onClick={doReset}>back to automatic roof</button>
      </div>
      <div className="facebar sculptbar">
        <b>Gumball</b>
        <span className="seg">
          {Object.keys(AXIS_LABEL).map((a) => <button key={a} className={axis === a ? 'primary' : ''} onClick={() => setAxis(a)}>{AXIS_LABEL[a]}</button>)}
        </span>
        <span className="snapmenu">
          <IconBtn icon="magnet" label="Snapping on or off (Shift+Tab). Hold Ctrl while dragging to flip it" active={snapCfg.on} onClick={() => setSnapCfg((c) => ({ ...c, on: !c.on }))} />
          <details>
            <summary title="Snap settings" aria-label="Snap settings">▾</summary>
            <div className="snappop">
              <b>Snap to</b>
              {[['vertex', 'Vertex'], ['edge', 'Edge'], ['mid', 'Edge middle'], ['face', 'Face'], ['incr', 'Increment']].map(([k, label]) => (
                <label key={k} className="inline"><input type="checkbox" checked={snapCfg[k]} onChange={(e) => setSnapCfg((c) => ({ ...c, [k]: e.target.checked }))} /> {label}</label>
              ))}
              <label className="inline">step <select value={snapCfg.step} onChange={(e) => setSnapCfg((c) => ({ ...c, step: +e.target.value }))}>{[0.01, 0.05, 0.1, 0.25, 0.5, 1].map((s) => <option key={s} value={s}>{s * 100} cm</option>)}</select></label>
              <b>Snap with</b>
              <label className="inline"><select value={snapCfg.source} onChange={(e) => setSnapCfg((c) => ({ ...c, source: e.target.value }))}><option value="closest">Closest point</option><option value="center">Centre of selection</option></select></label>
            </div>
          </details>
        </span>
        {oneVertex && [['x', 0], ['y', 1], ['height', 2]].map(([label, c]) => (
          <label key={c} className="inline">{label}
            <input type="number" step="0.05" value={+oneVertex[c].toFixed(2)} onChange={(e) => setCoord(c, e.target.valueAsNumber)} style={{ width: 70 }} /> m
          </label>
        ))}
      </div>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <div ref={mount} className="scene3d" style={{ background: '#fff' }} />
        <div ref={tipRef} className="dragtip" style={{ display: 'none' }} />
      </div>
      <p className="hint">Heights count for the usable area only where the roof is 1 m or higher (half) and 2 m or higher (full). The numbers on the right follow the sculpted roof. The walk-through still builds the automatic roof.</p>
    </div>
  );
}
