import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import * as THREE from 'three';
import { defOf } from '@shared/params.js';
import { getGrid, itemRects, roofHeight, stairRect, windowRect } from '@shared/engine.js';
import { buildFurniture, FRONT_ANGLE, preloadModels } from '../lib/furnitureModels.js';
import { makeTextures, makeFachwerk, pbr } from '../lib/textures.js';
import { SparkRenderer } from '@sparkjsdev/spark';
import { buildSplats } from '../lib/splat.js';
import { buildForest } from '../lib/forest.js';
import { partInfo, LAYERS } from '../lib/partInfo.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

// plan (x, y) -> three (x, z); height -> y. The attic sits on a lower storey (y from -3 to 0) so it reads as a house.
// default: plain extruded solids in flat colours; ?look=splat draws everything as Gaussian splats (Spark) in a misty forest
const LOOK = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('look') === 'splat' ? 'splat' : 'clean';
const EYE = 1.65, RADIUS = 0.22, MIN_HEAD = 1.25, WALL_MAX = 2.6, DOOR_H = 2.05, STOREY = 3;

function addUV(geo) {
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

/**
 * The roof shell from the height field with every face turned outward: tops (roof, dormer roofs and flat ceilings) in one geometry,
 * vertical faces (knee walls, gables, dormer cheeks) in another, so the outside can be tiles over plaster.
 */
function shellGeometries(room) {
  const { nx, ny, res, h } = getGrid(room, 0.1);
  const tan = Math.tan((room.pitch * Math.PI) / 180);
  const base = (x) => Math.min(room.maxHeight, room.kneeWall + tan * Math.min(x, room.width - x));
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : h[j * nx + i]);
  const top = [], wall = [];
  const tri = (out, a, b, c) => out.push(...a, ...b, ...c);
  const quadOut = (out, p0, p1, p2, p3, o) => {
    const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], v = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0) { [p1, p3] = [p3, p1]; }
    tri(out, p0, p1, p2); tri(out, p0, p2, p3);
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const hc = h[j * nx + i], x0 = i * res, x1 = x0 + res, z0 = j * res, z1 = z0 + res;
    const flat = hc > base((x0 + x1) / 2) + 1e-6;
    const ha = flat ? hc : Math.min(base(x0), hc + 0.5), hb = flat ? hc : base(x1);
    quadOut(top, [x0, ha, z0], [x0, ha, z1], [x1, hb, z1], [x1, hb, z0], [0, 1, 0]);
    for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const hn = at(i + di, j + dj);
      if (hn >= hc - 0.12) continue;
      if (di) { const x = di > 0 ? x1 : x0; quadOut(wall, [x, hn, z0], [x, hn, z1], [x, hc, z1], [x, hc, z0], [di, 0, 0]); }
      else { const z = dj > 0 ? z1 : z0; quadOut(wall, [x0, hn, z], [x1, hn, z], [x1, hc, z], [x0, hc, z], [0, 0, dj]); }
    }
  }
  const mk = (pos) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return addUV(g); };
  return { roof: mk(top), walls: mk(wall) };
}

/** A partition wall that follows the roof: a vertical strip, opened (up to DOOR_H) where a door is. */
function wallGeometry(room, p0, p1, openings) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy), n = Math.max(1, Math.round(len / 0.1));
  const pos = [];
  for (let i = 0; i < n; i++) {
    const s0 = (i / n) * len, s1 = ((i + 1) / n) * len, sm = (s0 + s1) / 2;
    const door = openings.some((o) => sm > o[0] && sm < o[1]);
    const bottom = door ? DOOR_H : 0;
    const a = [p0[0] + (dx * s0) / len, p0[1] + (dy * s0) / len], b = [p0[0] + (dx * s1) / len, p0[1] + (dy * s1) / len];
    const ha = Math.min(roofHeight(room, a[0], a[1]), WALL_MAX), hb = Math.min(roofHeight(room, b[0], b[1]), WALL_MAX);
    if (ha <= bottom && hb <= bottom) continue;
    const A = Math.max(ha, bottom), B = Math.max(hb, bottom);
    pos.push(a[0], bottom, a[1], b[0], bottom, b[1], b[0], B, b[1], a[0], bottom, a[1], b[0], B, b[1], a[0], A, a[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return addUV(g);
}

/** Walls of a layout: unique inner edges, their door openings, and thin rectangles for collision. */
function wallsOf(room, layout) {
  const W = room.width, D = room.depth, seen = new Set(), walls = [], colliders = [];
  if (!layout) return { walls, colliders };
  const onOuter = (c, lim) => Math.abs(c) < 0.02 || Math.abs(c - lim) < 0.02;
  const add = (vertical, c, a, b) => {
    if (b - a < 0.05) return;
    const key = [vertical, c.toFixed(2), a.toFixed(2), b.toFixed(2)].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const op = layout.doors
      .filter((d) => d.vertical === vertical && Math.abs((vertical ? d.mid[0] : d.mid[1]) - c) < 0.06)
      .map((d) => { const m = (vertical ? d.mid[1] : d.mid[0]) - a, w = (d.width || 0.9) / 2; return [m - w, m + w]; })
      .filter((o) => o[1] > 0 && o[0] < b - a);
    const p0 = vertical ? [c, a] : [a, c], p1 = vertical ? [c, b] : [b, c];
    walls.push({ p0, p1, op });
    let from = 0;
    for (const o of [...op].sort((x, y) => x[0] - y[0]).concat([[b - a, b - a]])) {
      if (o[0] - from > 0.02) { const s = a + from, e = a + o[0]; colliders.push(vertical ? [c - 0.05, s, c + 0.05, e] : [s, c - 0.05, e, c + 0.05]); }
      from = Math.max(from, o[1]);
    }
  };
  for (const r of layout.rooms) {
    const [x0, y0, x1, y1] = r.rect;
    if (!onOuter(y0, D)) add(false, y0, x0, x1);
    if (!onOuter(y1, D)) add(false, y1, x0, x1);
    if (!onOuter(x0, W)) add(true, x0, y0, y1);
    if (!onOuter(x1, W)) add(true, x1, y0, y1);
  }
  return { walls, colliders };
}

const hitRect = (x, z, r, c) => {
  const dx = Math.max(c[0] - x, 0, x - c[2]), dz = Math.max(c[1] - z, 0, z - c[3]);
  return dx * dx + dz * dz < r * r;
};

function disposeAll(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    const m = o.material;
    (Array.isArray(m) ? m : m ? [m] : []).forEach((mm) => mm.dispose());
  });
}

/** First-person walk through the roof storey (and a slow exterior orbit): the model of the prototype as an actual building. */
export default function WalkView() {
  const mount = useRef(null);
  const hud = useRef(null);
  const T = useRef(null);
  const room = useSelector((s) => s.room);
  const items = useSelector((s) => s.items);
  const layout = useSelector((s) => s.layout.plan);
  const result = useSelector((s) => s.analysis.result);
  const tipRef = useRef(null);
  const enterBtn = useRef(null);
  const dataRef = useRef({});
  dataRef.current = { room, items, result, layout };
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const tickRef = useRef(0);
  useEffect(() => { let on = true; preloadModels().then(() => on && setReady(true)); return () => { on = false; }; }, []);

  // renderer, loop and controls: once
  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    el.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fb2b9);
    scene.fog = new THREE.FogExp2(0x9fb2b9, 0.016);
    if (LOOK === 'splat') scene.add(new SparkRenderer({ renderer })); // draws and sorts the splats of every SplatMesh in the scene
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.32;
    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
    camera.rotation.order = 'YXZ';
    // post-processing: ambient occlusion for contact shadows, a little bloom on the bright windows, vignette, then tone mapping and anti-aliasing
    RectAreaLightUniformsLib.init();
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, 300, 150);
    gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.2, scale: 1.3, samples: 16 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 16 });
    gtao.enabled = LOOK !== 'splat';
    composer.addPass(gtao);
    const bloom = new UnrealBloomPass(new THREE.Vector2(300, 150), 0.22, 0.5, 0.92);
    composer.addPass(bloom);
    const vig = new ShaderPass(VignetteShader);
    vig.uniforms.offset.value = 0.9; vig.uniforms.darkness.value = 1.05;
    composer.addPass(vig);
    composer.addPass(new OutputPass());
    const smaa = new SMAAPass();
    composer.addPass(smaa);
    const content = new THREE.Group();
    scene.add(content);
    const S = { yaw: Math.PI, pitch: 0, x: 0, z: 0, eye: EYE, keys: {}, outside: true, auto: true, zoom: 1, elev: 0.28, orbit: 0.6, spawn: [0, 0], colliders: [], tick: 0, last: performance.now(), locked: false, drag: false };
    T.current = { scene, camera, content, S, renderer, composer };
    if (import.meta.env.DEV) window.__walk = T;

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const look = (dx, dy) => { S.yaw -= dx * 0.0025; S.pitch = Math.max(-1.3, Math.min(1.3, S.pitch - dy * 0.0025)); };
    const onMove = (e) => {
      if (S.outside) { if (S.drag) { S.auto = false; S.orbit -= e.movementX * 0.006; S.elev = Math.max(0.05, Math.min(1.2, S.elev + e.movementY * 0.004)); } return; }
      if (S.locked || S.drag) look(e.movementX, e.movementY);
    };
    const onLock = () => { S.locked = document.pointerLockElement === renderer.domElement; };
    const canvas = renderer.domElement;
    const down = () => { S.drag = true; canvas.focus(); try { if (!S.outside) canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* the drag still looks around */ } };
    const up = () => { S.drag = false; };
    const key = (down) => (e) => {
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && /^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright|shift|control|c| )$/i.test(e.key)) { S.keys[e.key.toLowerCase()] = down; if (down && (e.key.startsWith('Arrow') || e.key === ' ')) e.preventDefault(); }
      if (down && (e.key.toLowerCase() === 'v' || e.key === 'Enter') && e.target === canvas) { if (S.outside) T.current.enter(); else { S.outside = true; document.exitPointerLock?.(); } }
    };
    const kd = key(true), ku = key(false);
    canvas.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', onMove);
    document.addEventListener('pointerlockchange', onLock);
    // game-style hover: data at the cursor, and an exploded view of the layers behind the thing under it
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), xr = new THREE.Group();
    scene.add(xr);
    const X = { k: 0, target: 0, kind: null, tipAt: 0 };
    const clearX = () => { while (xr.children.length) { const c = xr.children.pop(); c.geometry?.dispose(); c.material?.dispose?.(); } };
    const showX = (kind, point, normal) => {
      if (X.kind === kind && xr.children.length) { xr.position.copy(point).addScaledVector(normal, 0.45); return; }
      clearX(); X.kind = kind; X.k = 0;
      const L = LAYERS[kind]; if (!L) return;
      L.forEach((l, i) => {
        const th = 0.02 + Math.sqrt(l.mm) / 650;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, th), new THREE.MeshBasicMaterial({ color: l.color, transparent: true, opacity: 0.94, depthTest: false }));
        slab.renderOrder = 20 + i; slab.userData.i = i;
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: 0x14161c, depthTest: false }));
        edge.renderOrder = 40; slab.add(edge);
        xr.add(slab);
      });
      xr.position.copy(point).addScaledVector(normal, 0.45);
      xr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    };
    const hover = (e) => {
      if (S.locked || S.drag) return;
      const now = performance.now(); if (now - X.tipAt < 50) return; X.tipAt = now;
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(T.current.content.children, true).find((h) => h.object.userData.part);
      const tip = tipRef.current;
      if (!hit || !tip) { X.target = 0; if (tip) tip.style.display = 'none'; return; }
      const part = hit.object.userData.part, d = dataRef.current;
      const info = partInfo(part, hit, d);
      tip.style.display = 'block';
      tip.style.transform = `translate(${Math.min(e.clientX - r.left + 18, r.width - 270)}px, ${Math.min(e.clientY - r.top + 16, r.height - 40 - (info.layers ? 22 * info.layers.length : 0) - 24 * info.rows.length)}px)`;
      tip.innerHTML = `<b>${info.title}</b>${info.rows.map(([k, v]) => `<div><span>${k}</span>${v}</div>`).join('')}${info.layers ? `<p>Layers, outside to inside (typical build-up)</p>${info.layers.map((l) => `<div class="ly"><i style="background:#${l.color.toString(16).padStart(6, '0')}"></i>${l.name}<em>${l.mm < 1 ? '0.2' : l.mm} mm</em></div>`).join('')}` : ''}`;
      const kind = info.explode;
      if (kind && hit.face) {
        const nrm = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (nrm.dot(ray.ray.direction) > 0) nrm.negate(); // facing the viewer
        showX(kind, hit.point, nrm); X.target = 1;
      } else X.target = 0;
    };
    canvas.addEventListener('pointermove', hover);
    canvas.addEventListener('pointerleave', () => { X.target = 0; if (tipRef.current) tipRef.current.style.display = 'none'; });
    T.current.explode = () => { X.k += (X.target - X.k) * 0.14; xr.visible = X.k > 0.01; const sp = 0.115; xr.children.forEach((c) => { c.position.z = (c.userData.i - (xr.children.length - 1) / 2) * sp * X.k; }); };
    canvas.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    canvas.addEventListener('wheel', (e) => { if (S.outside) { e.preventDefault(); S.zoom = Math.max(0.45, Math.min(2.2, S.zoom * (1 + e.deltaY * 0.001))); } }, { passive: false });
    canvas.addEventListener('dblclick', () => { if (S.outside) T.current.enter(); });

    const free = (x, z) => {
      const W = T.current.dims?.W ?? 5, D = T.current.dims?.D ?? 7, rm = T.current.room;
      if (x < 0.25 || z < 0.25 || x > W - 0.25 || z > D - 0.25) return false;
      if (rm && roofHeight(rm, x, z) < MIN_HEAD) return false;
      return !S.colliders.some((c) => hitRect(x, z, RADIUS, c));
    };
    T.current.free = free;
    T.current.enter = () => { [S.x, S.z] = S.spawn; S.yaw = Math.PI; S.pitch = 0; S.outside = false; document.exitPointerLock?.(); canvas.focus(); };

    let raf = 0, alive = true;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - S.last) / 1000);
      S.last = now;
      const t = T.current;
      if (!t?.dims) return;
      const { W, D } = t.dims;
      if (S.outside) {
        if (S.auto) S.orbit += dt * 0.12;
        const r = (Math.max(W, D) * 1.5 + 5) * S.zoom;
        camera.position.set(W / 2 + Math.sin(S.orbit) * r, 1.4 + S.elev * r * 0.9, D / 2 + Math.cos(S.orbit) * r);
        camera.lookAt(W / 2, -0.6, D / 2);
      } else {
        const f = (S.keys.w || S.keys.arrowup ? 1 : 0) - (S.keys.s || S.keys.arrowdown ? 1 : 0);
        const sd = (S.keys.d ? 1 : 0) - (S.keys.a ? 1 : 0);
        if (S.keys.arrowleft) S.yaw += dt * 1.8;
        if (S.keys.arrowright) S.yaw -= dt * 1.8;
        const crouch = !!(S.keys.control || S.keys.c);
        const speed = (S.keys.shift ? 1.1 : crouch ? 1.0 : 2.9) * dt; // like Counter-Strike: run by default, Shift walks quietly, Ctrl or C crouches
        const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
        const dx = (fx * f + rx * sd) * speed, dz = (fz * f + rz * sd) * speed;
        if (dx && free(S.x + dx, S.z)) S.x += dx;
        if (dz && free(S.x, S.z + dz)) S.z += dz;
        const rm = t.room;
        const ceil = (rm ? roofHeight(rm, S.x, S.z) : 3) - 0.18;
        const target = Math.min(crouch ? EYE - 0.6 : EYE, ceil);
        S.eye += (target - S.eye) * Math.min(1, dt * 12);
        if (S.keys[' '] && !S.air) { S.vy = 3.4; S.air = true; } // Space jumps
        if (S.air) { S.jh = (S.jh || 0) + S.vy * dt; S.vy -= 9.8 * dt; if (S.jh <= 0) { S.jh = 0; S.air = false; S.vy = 0; } }
        camera.position.set(S.x, Math.min(S.eye + (S.jh || 0), ceil + 0.08), S.z);
        camera.rotation.set(S.pitch, S.yaw, 0);
      }
      if (++S.tick % 12 === 0 && hud.current) {
        const r = t.layout?.rooms.find((q) => S.x >= q.rect[0] && S.x <= q.rect[2] && S.z >= q.rect[1] && S.z <= q.rect[3]);
        if (enterBtn.current) enterBtn.current.style.display = S.outside ? 'block' : 'none';
        hud.current.textContent = S.outside ? 'exterior' : r ? `${r.id === 'hall' ? 'Stair hall' : r.type + ' · ' + r.id}  ·  ${r.counted.toFixed(1)} m² usable` : 'roof storey';
      }
      t.explode?.();
      composer.render();
    };
    const loop = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      frame(now);
    };
    T.current.frame = frame;
    T.current.resize = resize;
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('mousedown', down);
      canvas.removeEventListener('keydown', kd);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('keyup', ku);
      document.removeEventListener('pointerlockchange', onLock);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      disposeAll(scene);
      composer.dispose();
      renderer.dispose();
      canvas.remove();
      T.current = null;
    };
  }, []);

  // the building: rebuilt when the room, the furniture or the layout changes
  useEffect(() => {
    const t = T.current;
    if (!t) return;
    const { scene, content, S } = t;
    [...content.children].forEach((c) => { content.remove(c); disposeAll(c); });
    scene.children.filter((c) => c.userData.kind === 'light').forEach((c) => scene.remove(c));
    const W = room.width, D = room.depth;
    t.dims = { W, D }; t.room = room; t.layout = layout;
    const tx = t.tex || (t.tex = makeTextures());
    const plain = LOOK === 'clean'; // plain extrusions: flat colours, no texture maps
    const wallMaps = plain ? {} : pbr('wall', 0.5), roofMaps = plain ? {} : pbr('roof', 0.7), floorMaps = plain ? {} : pbr('floor', 0.5);
    const coolWall = plain ? new THREE.Color(0xe9e6df) : new THREE.Color(0.9, 0.9, 0.92); // near-neutral: the scanned plaster is beige, so it is cooled a little
    const plaster = new THREE.MeshStandardMaterial({ ...wallMaps, color: coolWall, roughness: 1, side: THREE.DoubleSide });
    const fach = plain ? null : (t.fach || (t.fach = makeFachwerk()));
    const plasterOut = new THREE.MeshStandardMaterial(plain ? { color: 0xece9e2, roughness: 1, side: THREE.FrontSide } : { map: fach, roughness: 1, side: THREE.FrontSide });
    const inside = new THREE.MeshStandardMaterial({ ...wallMaps, color: coolWall, roughness: 1, side: THREE.BackSide });
    const tiles = new THREE.MeshStandardMaterial({ ...roofMaps, color: plain ? new THREE.Color(0xa4503a) : new THREE.Color(0.88, 0.84, 0.82), roughness: 1, side: THREE.FrontSide });
    const tag = (mesh, u) => { Object.assign(mesh.userData, u); return mesh; };

    // lights
    const L = (o) => { o.userData.kind = 'light'; scene.add(o); return o; };
    L(new THREE.HemisphereLight(0xdde6f2, 0x5a5248, 0.32));
    L(new THREE.AmbientLight(0xffffff, 0.05));
    const sun = L(new THREE.DirectionalLight(0xfff0dc, 2.2));
    sun.position.set(W / 2 + 14, 20, D / 2 + 9);
    sun.target.position.set(W / 2, 0, D / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    sun.shadow.bias = -0.0004;
    scene.add(sun.target);
    sun.target.userData.kind = 'light';
    const lamps = layout ? layout.rooms.map((r) => [(r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2]) : [[W / 2, D * 0.25], [W / 2, D * 0.75]];
    const lamp3 = [];
    for (const [lx, lz] of lamps) {
      const p = L(new THREE.PointLight(0xffe6c8, 6, 7, 1.5));
      p.position.set(lx, Math.max(1.4, Math.min(2.25, roofHeight(room, lx, lz) - 0.25)), lz);
      lamp3.push([p.position.x, p.position.y, p.position.z]);
    }

    // ground and lower storey
    const fkey = Math.round(W) + 'x' + Math.round(D);
    if (!t.forest || t.forestKey !== fkey) { // the forest around the house, built once per room size
      if (t.forest) { scene.remove(t.forest); disposeAll(t.forest); }
      if (t.forestSplat) { scene.remove(t.forestSplat); t.forestSplat.dispose?.(); }
      t.forest = buildForest(W / 2, D / 2, -STOREY, { clear: Math.max(W, D) * 0.75 + 4, plain: LOOK === 'clean' });
      t.forestKey = fkey; t.forestSplat = null;
      scene.add(t.forest);
    }
    const lower = tag(new THREE.Mesh(addUV(new THREE.BoxGeometry(W, STOREY, D)), plasterOut), { part: 'wall', density: 650, size: 0.055 });
    lower.position.set(W / 2, -STOREY / 2, D / 2);
    lower.castShadow = true; lower.receiveShadow = true;
    content.add(lower);
    const winMat = new THREE.MeshStandardMaterial({ color: 0x1d2b3a, roughness: 0.15, metalness: 0.4 });
    for (const [z, rot] of [[-0.01, Math.PI], [D + 0.01, 0]]) for (let i = 0; i < 2; i++) {
      const w = tag(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), winMat), { density: 500, size: 0.05 });
      w.position.set(W * (0.28 + i * 0.44), -STOREY / 2 + 0.1, z); w.rotation.y = rot;
      content.add(w);
    }

    // roof shell: faces point outward; tiles on the roof and plaster on the walls outside, plaster everywhere inside
    const shell = shellGeometries(room);
    const roofOut = tag(new THREE.Mesh(shell.roof, tiles), { part: 'roof', density: 800, size: 0.065 }); roofOut.castShadow = true; content.add(roofOut);
    const wallOut = tag(new THREE.Mesh(shell.walls, plasterOut), { part: 'wall', density: 650, size: 0.055 }); wallOut.castShadow = true; content.add(wallOut);
    content.add(tag(new THREE.Mesh(shell.roof, inside), { part: 'roof', interior: true, density: 600, size: 0.05 }), tag(new THREE.Mesh(shell.walls, inside), { part: 'wall', interior: true, density: 600, size: 0.05 }));

    // attic floor with the stair opening
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(W, 0), new THREE.Vector2(W, -D), new THREE.Vector2(0, -D)]);
    const sr = stairRect(room);
    if (sr) shape.holes.push(new THREE.Path([new THREE.Vector2(sr[0], -sr[1]), new THREE.Vector2(sr[0], -sr[3]), new THREE.Vector2(sr[2], -sr[3]), new THREE.Vector2(sr[2], -sr[1])]));
    const floor = tag(new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ ...floorMaps, color: plain ? new THREE.Color(0xcaa57a) : new THREE.Color(0.95, 0.92, 0.9), roughness: 1 })), { part: 'floor', interior: true, density: 800, size: 0.045 });
    floor.receiveShadow = true;
    content.add(floor);
    const colliders = [];
    if (sr) {
      colliders.push([sr[0] - 0.02, sr[1] - 0.02, sr[2] + 0.02, sr[3] + 0.02]);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(sr[2] - sr[0], STOREY, sr[3] - sr[1]), new THREE.MeshBasicMaterial({ color: 0x15181d, side: THREE.BackSide }));
      shaft.position.set((sr[0] + sr[2]) / 2, -STOREY / 2, (sr[1] + sr[3]) / 2);
      content.add(shaft);
    }

    // partition walls from the layout
    const { walls, colliders: wc } = wallsOf(room, layout);
    colliders.push(...wc);
    for (const w of walls) content.add(tag(new THREE.Mesh(wallGeometry(room, w.p0, w.p1, w.op), plaster), { part: 'partition', interior: true, density: 650, size: 0.05 }));

    // windows on the gables
    for (const w of room.windows) {
      const r = windowRect(room, w);
      if (!r) continue;
      const nS = r[1] < D / 2, cx = (r[0] + r[2]) / 2, cz = nS ? 0.02 : D - 0.02;
      if (r[3] - r[1] > 0.5 && r[2] - r[0] < 0.5) continue; // E/W windows in the knee wall: not drawn
      const top = Math.min(2.1, roofHeight(room, cx, nS ? 0 : D) - 0.1), sill = 0.9;
      if (top - sill < 0.3) continue;
      const glassMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      glassMat.color.setRGB(1.6, 1.85, 2.2); // brighter than 1: the bloom pass makes it glow
      const glass = tag(new THREE.Mesh(new THREE.PlaneGeometry(r[2] - r[0], top - sill), glassMat), { part: 'window', density: 700, size: 0.05 });
      glass.position.set(cx, (top + sill) / 2, cz);
      glass.rotation.y = nS ? 0 : Math.PI;
      content.add(glass);
      const area = new THREE.RectAreaLight(0xcfe2ff, 12, r[2] - r[0], top - sill); // soft daylight falling in through the window
      area.position.set(cx, (top + sill) / 2, cz + (nS ? 0.05 : -0.05));
      area.lookAt(cx, (top + sill) / 2 - 0.4, nS ? cz + 2 : cz - 2);
      area.userData.kind = 'light';
      scene.add(area);
      const fm = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
      const hw = r[2] - r[0], hh = top - sill;
      for (const [fw, fh, fx, fy] of [[hw + 0.08, 0.05, 0, hh / 2], [hw + 0.08, 0.05, 0, -hh / 2], [0.05, hh, hw / 2, 0], [0.05, hh, -hw / 2, 0], [0.03, hh, 0, 0]]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.06), fm);
        f.position.set(cx + fx, (top + sill) / 2 + fy, cz + (nS ? 0.01 : -0.01));
        content.add(f);
      }
    }

    // furniture
    for (const it of items) {
      if (!it.placed) continue;
      const def = defOf(it), b = itemRects(def, it).body;
      const model = buildFurniture(it.type, def.w, def.d, def.h, def.color);
      model.rotation.y = FRONT_ANGLE[it.rot] ?? 0;
      model.position.set((b[0] + b[2]) / 2, 0.003, (b[1] + b[3]) / 2);
      model.traverse((o) => { if (o.isMesh) { o.userData.interior = true; o.userData.density = 1100; o.userData.size = 0.035; o.userData.part = 'furniture'; o.userData.itemId = it.id; } });
      content.add(model);
      colliders.push([b[0], b[1], b[2], b[3]]);
    }

    if (LOOK === 'splat') { // turn the finished scene into Gaussian splats and hide the solid meshes
      if (t.houseSplat) { scene.remove(t.houseSplat); t.houseSplat.dispose?.(); t.houseSplat = null; }
      if (!t.forestSplat) {
        const f = buildSplats(t.forest, { seed: 13, density: 60, maxPerMesh: 450000 });
        t.forestSplat = f.mesh; scene.add(f.mesh);
        t.forest.traverse((m) => { if (m.isMesh) m.visible = false; });
      }
      const h = buildSplats(content, { seed: 5, density: 600, lamps: lamp3, ambientIn: 0.2 });
      t.houseSplat = h.mesh; scene.add(h.mesh);
      content.traverse((m) => { if (m.isMesh) m.visible = false; });
      if (h.pending && tickRef.current < 3) { tickRef.current += 1; setTimeout(() => setTick((n) => n + 1), 1800); } // textures were still loading: build once more
    }
    S.colliders = colliders;
    // start in the stair hall, or the nearest free spot to the middle
    const hall = layout?.rooms.find((r) => r.id === 'hall');
    const [sx, sz] = hall ? [(hall.rect[0] + hall.rect[2]) / 2, (hall.rect[1] + hall.rect[3]) / 2] : [W / 2, D / 2];
    const spot = [[0, 0]].concat(Array.from({ length: 60 }, (_, i) => [Math.cos(i) * (0.2 + i * 0.07), Math.sin(i) * (0.2 + i * 0.07)])).map(([a, b]) => [sx + a, sz + b]).find(([x, z]) => t.free(x, z)) || [W / 2, D / 2];
    S.spawn = spot;
    if (!S.outside) [S.x, S.z] = spot;
  }, [room, items, layout, ready, tick]);

  return (
    <div className="card walkcard">
      <div className="cardhead">
        <h2>Walk <small>first person through the roof storey</small></h2>
      </div>
      <div className="walkstage">
        <div ref={mount} className="walk" />
        <div ref={tipRef} className="walktip" style={{ display: "none" }} /><button ref={enterBtn} className="walkenter" onClick={() => T.current?.enter?.()}>Enter the house</button><div className="walkhud"><span ref={hud}>exterior</span><i>outside: drag to orbit · wheel to zoom · double-click or Enter to go in · inside: click to capture the mouse, mouse looks · W A S D move · Shift walk · Ctrl crouch · Space jump · Esc release · V outside</i></div>
        <div className="walkcross" aria-hidden="true" />
      </div>
    </div>
  );
}
