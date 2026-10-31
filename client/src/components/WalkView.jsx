import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import * as THREE from 'three';
import { defOf } from '@shared/params.js';
import { getGrid, itemRects, roofHeight, stairRect, windowRect } from '@shared/engine.js';
import { buildFurniture, FRONT_ANGLE, preloadModels } from '../lib/furnitureModels.js';
import { makeTextures, pbr } from '../lib/textures.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// plan (x, y) -> three (x, z); height -> y. The attic sits on a lower storey (y from -3 to 0) so it reads as a house.
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
  const [ready, setReady] = useState(false);
  useEffect(() => { let on = true; preloadModels().then(() => on && setReady(true)); return () => { on = false; }; }, []);

  // renderer, loop and controls: once
  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa9c6e6);
    scene.fog = new THREE.Fog(0xa9c6e6, 30, 90);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
    camera.rotation.order = 'YXZ';
    const content = new THREE.Group();
    scene.add(content);
    const S = { yaw: Math.PI, pitch: 0, x: 0, z: 0, eye: EYE, keys: {}, outside: false, orbit: 0, colliders: [], tick: 0, last: performance.now(), locked: false, drag: false };
    T.current = { scene, camera, content, S, renderer };
    if (import.meta.env.DEV) window.__walk = T;

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const look = (dx, dy) => { S.yaw -= dx * 0.0025; S.pitch = Math.max(-1.3, Math.min(1.3, S.pitch - dy * 0.0025)); };
    const onMove = (e) => { if (S.locked || S.drag) look(e.movementX, e.movementY); };
    const onLock = () => { S.locked = document.pointerLockElement === renderer.domElement; };
    const canvas = renderer.domElement;
    const down = () => { S.drag = true; canvas.focus(); try { canvas.requestPointerLock?.(); } catch { /* the drag still looks around */ } };
    const up = () => { S.drag = false; };
    const key = (down) => (e) => {
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && /^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright|shift)$/i.test(e.key)) { S.keys[e.key.toLowerCase()] = down; if (down && e.key.startsWith('Arrow')) e.preventDefault(); }
      if (down && e.key.toLowerCase() === 'v' && e.target === canvas) S.outside = !S.outside;
    };
    const kd = key(true), ku = key(false);
    canvas.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', onMove);
    document.addEventListener('pointerlockchange', onLock);
    canvas.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    const free = (x, z) => {
      const W = T.current.dims?.W ?? 5, D = T.current.dims?.D ?? 7, rm = T.current.room;
      if (x < 0.25 || z < 0.25 || x > W - 0.25 || z > D - 0.25) return false;
      if (rm && roofHeight(rm, x, z) < MIN_HEAD) return false;
      return !S.colliders.some((c) => hitRect(x, z, RADIUS, c));
    };
    T.current.free = free;

    let raf = 0, alive = true;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - S.last) / 1000);
      S.last = now;
      const t = T.current;
      if (!t?.dims) return;
      const { W, D } = t.dims;
      if (S.outside) {
        S.orbit += dt * 0.18;
        const r = Math.max(W, D) * 1.5 + 5;
        camera.position.set(W / 2 + Math.sin(S.orbit) * r, 5.5, D / 2 + Math.cos(S.orbit) * r);
        camera.lookAt(W / 2, -0.6, D / 2);
      } else {
        const f = (S.keys.w || S.keys.arrowup ? 1 : 0) - (S.keys.s || S.keys.arrowdown ? 1 : 0);
        const sd = (S.keys.d ? 1 : 0) - (S.keys.a ? 1 : 0);
        if (S.keys.arrowleft) S.yaw += dt * 1.8;
        if (S.keys.arrowright) S.yaw -= dt * 1.8;
        const speed = (S.keys.shift ? 3.4 : 1.7) * dt;
        const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw), rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);
        const dx = (fx * f + rx * sd) * speed, dz = (fz * f + rz * sd) * speed;
        if (dx && free(S.x + dx, S.z)) S.x += dx;
        if (dz && free(S.x, S.z + dz)) S.z += dz;
        const rm = t.room;
        const target = Math.min(EYE, (rm ? roofHeight(rm, S.x, S.z) : 3) - 0.18);
        S.eye += (target - S.eye) * Math.min(1, dt * 8);
        camera.position.set(S.x, S.eye, S.z);
        camera.rotation.set(S.pitch, S.yaw, 0);
      }
      if (++S.tick % 12 === 0 && hud.current) {
        const r = t.layout?.rooms.find((q) => S.x >= q.rect[0] && S.x <= q.rect[2] && S.z >= q.rect[1] && S.z <= q.rect[3]);
        hud.current.textContent = S.outside ? 'exterior' : r ? `${r.id === 'hall' ? 'Stair hall' : r.type + ' · ' + r.id}  ·  ${r.counted.toFixed(1)} m² usable` : 'roof storey';
      }
      renderer.render(scene, camera);
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
    const wallMaps = pbr('wall', 0.5), roofMaps = pbr('roof', 0.7), floorMaps = pbr('floor', 0.5);
    const plaster = new THREE.MeshStandardMaterial({ ...wallMaps, roughness: 1, side: THREE.DoubleSide });
    const plasterOut = new THREE.MeshStandardMaterial({ ...wallMaps, roughness: 1, side: THREE.FrontSide });
    const inside = new THREE.MeshStandardMaterial({ ...wallMaps, roughness: 1, side: THREE.BackSide });
    const tiles = new THREE.MeshStandardMaterial({ ...roofMaps, roughness: 1, side: THREE.FrontSide });

    // lights
    const L = (o) => { o.userData.kind = 'light'; scene.add(o); return o; };
    L(new THREE.HemisphereLight(0xdfe9ff, 0x7a6a58, 0.5));
    L(new THREE.AmbientLight(0xffffff, 0.12));
    const sun = L(new THREE.DirectionalLight(0xfff1d6, 2.4));
    sun.position.set(W / 2 + 14, 20, D / 2 + 9);
    sun.target.position.set(W / 2, 0, D / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    sun.shadow.bias = -0.0004;
    scene.add(sun.target);
    sun.target.userData.kind = 'light';
    const lamps = layout ? layout.rooms.map((r) => [(r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2]) : [[W / 2, D * 0.25], [W / 2, D * 0.75]];
    for (const [lx, lz] of lamps) {
      const p = L(new THREE.PointLight(0xffd9a0, 6, 7, 1.5));
      p.position.set(lx, Math.max(1.4, Math.min(2.25, roofHeight(room, lx, lz) - 0.25)), lz);
    }

    // ground and lower storey
    const gtex = tx.grass.clone(); gtex.repeat.set(40, 40); gtex.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gtex, roughness: 1 }));
    ground.position.set(W / 2, -STOREY - 0.02, D / 2);
    ground.receiveShadow = true;
    content.add(ground);
    const lower = new THREE.Mesh(addUV(new THREE.BoxGeometry(W, STOREY, D)), plaster);
    lower.position.set(W / 2, -STOREY / 2, D / 2);
    lower.castShadow = true; lower.receiveShadow = true;
    content.add(lower);
    const winMat = new THREE.MeshStandardMaterial({ color: 0x1d2b3a, roughness: 0.15, metalness: 0.4 });
    for (const [z, rot] of [[-0.01, Math.PI], [D + 0.01, 0]]) for (let i = 0; i < 2; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), winMat);
      w.position.set(W * (0.28 + i * 0.44), -STOREY / 2 + 0.1, z); w.rotation.y = rot;
      content.add(w);
    }

    // roof shell: faces point outward; tiles on the roof and plaster on the walls outside, plaster everywhere inside
    const shell = shellGeometries(room);
    const roofOut = new THREE.Mesh(shell.roof, tiles); roofOut.castShadow = true; content.add(roofOut);
    const wallOut = new THREE.Mesh(shell.walls, plasterOut); wallOut.castShadow = true; content.add(wallOut);
    content.add(new THREE.Mesh(shell.roof, inside), new THREE.Mesh(shell.walls, inside));

    // attic floor with the stair opening
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(W, 0), new THREE.Vector2(W, -D), new THREE.Vector2(0, -D)]);
    const sr = stairRect(room);
    if (sr) shape.holes.push(new THREE.Path([new THREE.Vector2(sr[0], -sr[1]), new THREE.Vector2(sr[0], -sr[3]), new THREE.Vector2(sr[2], -sr[3]), new THREE.Vector2(sr[2], -sr[1])]));
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ ...floorMaps, roughness: 1 }));
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
    for (const w of walls) content.add(new THREE.Mesh(wallGeometry(room, w.p0, w.p1, w.op), plaster));

    // windows on the gables
    for (const w of room.windows) {
      const r = windowRect(room, w);
      if (!r) continue;
      const nS = r[1] < D / 2, cx = (r[0] + r[2]) / 2, cz = nS ? 0.02 : D - 0.02;
      if (r[3] - r[1] > 0.5 && r[2] - r[0] < 0.5) continue; // E/W windows in the knee wall: not drawn
      const top = Math.min(2.1, roofHeight(room, cx, nS ? 0 : D) - 0.1), sill = 0.9;
      if (top - sill < 0.3) continue;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(r[2] - r[0], top - sill), new THREE.MeshBasicMaterial({ color: 0xd8ecff }));
      glass.position.set(cx, (top + sill) / 2, cz);
      glass.rotation.y = nS ? 0 : Math.PI;
      content.add(glass);
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
      content.add(model);
      colliders.push([b[0], b[1], b[2], b[3]]);
    }

    S.colliders = colliders;
    // start in the stair hall, or the nearest free spot to the middle
    const hall = layout?.rooms.find((r) => r.id === 'hall');
    const [sx, sz] = hall ? [(hall.rect[0] + hall.rect[2]) / 2, (hall.rect[1] + hall.rect[3]) / 2] : [W / 2, D / 2];
    const spot = [[0, 0]].concat(Array.from({ length: 60 }, (_, i) => [Math.cos(i) * (0.2 + i * 0.07), Math.sin(i) * (0.2 + i * 0.07)])).map(([a, b]) => [sx + a, sz + b]).find(([x, z]) => t.free(x, z)) || [W / 2, D / 2];
    [S.x, S.z] = spot;
  }, [room, items, layout, ready]);

  return (
    <div className="card walkcard">
      <div className="cardhead">
        <h2>Walk <small>first person through the roof storey</small></h2>
      </div>
      <div className="walkstage">
        <div ref={mount} className="walk" />
        <div className="walkhud"><span ref={hud}>roof storey</span><i>drag or click to look · W A S D move · Shift run · V exterior</i></div>
        <div className="walkcross" aria-hidden="true" />
      </div>
    </div>
  );
}
