// The classic German facade as real geometry (not a texture): a timber frame (Fachwerk: sill plate, posts, rails, corner braces, bargeboards on the gables) over
// light plaster, a stone plinth (Sockel), casement windows with a cross of glazing bars, stone sills and green shutters (Fensterlaeden) on the storey below.
// Plain extrusions, so the model stays honest; names carry the material (timber, plinth, window_frame, sill, shutter) for the Blender and Unreal import.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const POST = 0.14, RAIL = 0.13, DEPTH = 0.07; // timber: 14 x 7 cm posts, 13 cm rails, standing 7 cm proud of the plaster
export const LOWER_WINDOW = { w: 1.1, h: 1.3, at: [0.28, 0.72] }; // the windows of the storey below: width, height, positions as shares of the width

/** A box of size (len x w x d) along the segment a-b, lying in a face with the outward normal n, on its outside. */
function beam(a, b, n, w, d) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), u = B.clone().sub(A), len = u.length();
  if (len < 0.02) return null;
  u.normalize();
  const N = new THREE.Vector3(...n), v = new THREE.Vector3().crossVectors(N, u).normalize(); // u x v = N: a right-handed basis, nothing is mirrored
  const g = new THREE.BoxGeometry(len, w, d);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(u, v, N));
  const m = A.clone().add(B).multiplyScalar(0.5).addScaledVector(N, d / 2);
  g.translate(m.x, m.y, m.z);
  return g;
}

const merge = (list) => { const l = list.filter(Boolean); return l.length ? mergeGeometries(l.map((g) => g.toNonIndexed ? g.toNonIndexed() : g)) : null; };

/**
 * @param room   { width, depth, kneeWall, pitch, maxHeight, windows }
 * @param o      { T: outer wall thickness, STOREY: height of the storey below, ROOF_T: roof thickness }
 * @returns {{ timber, plinth, frames, sills, shutters }} BufferGeometries in world space (y = 0 is the attic floor), or null where empty
 */
export function facade(room, { T, STOREY, ROOF_T }) {
  const W = room.width, D = room.depth, tp = Math.tan((room.pitch * Math.PI) / 180), cp = Math.cos((room.pitch * Math.PI) / 180);
  const topAt = (x) => Math.min(room.kneeWall + tp * Math.min(x, W - x), room.maxHeight) + ROOF_T / cp; // outer roof surface over the gable plane
  const timber = [], frames = [], sills = [], shutters = [];
  const faces = [
    { n: [0, 0, -1], pt: (s, y) => [s, y, -T], s0: -T, s1: W + T, gable: 'N' },
    { n: [0, 0, 1], pt: (s, y) => [s, y, D + T], s0: -T, s1: W + T, gable: 'S' },
    { n: [-1, 0, 0], pt: (s, y) => [-T, y, s], s0: -T, s1: D + T },
    { n: [1, 0, 0], pt: (s, y) => [W + T, y, s], s0: -T, s1: D + T },
  ];
  const wy = -STOREY / 2 + 0.1, wTop = wy + LOWER_WINDOW.h / 2, wBot = wy - LOWER_WINDOW.h / 2; // the window openings of the storey below

  for (const f of faces) {
    const { n, pt } = f, b = (s0, y0, s1, y1, w = RAIL, d = DEPTH) => timber.push(beam(pt(s0, y0), pt(s1, y1), n, w, d));
    const yTop = -0.12, yBase = -STOREY + 0.55, wins = f.gable ? LOWER_WINDOW.at.map((k) => W * k) : [];
    // ---- storey below: plate, rails, posts, braces
    b(f.s0 + 0.05, yBase, f.s1 - 0.05, yBase); b(f.s0 + 0.05, yTop, f.s1 - 0.05, yTop);
    if (wins.length) { b(f.s0 + 0.05, wBot, f.s1 - 0.05, wBot, 0.1); b(f.s0 + 0.05, wTop, f.s1 - 0.05, wTop, 0.1); } else b(f.s0 + 0.05, -STOREY / 2, f.s1 - 0.05, -STOREY / 2, 0.1);
    const stops = [f.s0 + 0.07, ...wins.flatMap((x) => [x - LOWER_WINDOW.w / 2 - 0.07, x + LOWER_WINDOW.w / 2 + 0.07]), f.s1 - 0.07].sort((p, q) => p - q);
    const posts = new Set(stops.map((s) => +s.toFixed(3)));
    for (let i = 0; i + 1 < stops.length; i += 2) { // the free spans (corner to window, window to window, window to corner): a post every 1.5 m at most
      const gap = stops[i + 1] - stops[i], k = Math.max(1, Math.ceil(gap / 1.5));
      for (let j = 1; j < k; j++) posts.add(+(stops[i] + (gap * j) / k).toFixed(3));
    }
    for (const s of posts) b(s, yBase, s, yTop, POST);
    b(f.s0 + 0.07, yTop - 0.95, f.s0 + 1.02, yTop, 0.1); b(f.s1 - 0.07, yTop - 0.95, f.s1 - 1.02, yTop, 0.1); // head braces (Kopfbaender) at the corners

    // ---- windows, sills and shutters of the storey below
    for (const x of wins) {
      const { w, h } = LOWER_WINDOW, x0 = x - w / 2, x1 = x + w / 2;
      const bar = (s0, y0, s1, y1, wd = 0.06) => frames.push(beam(pt(s0, y0), pt(s1, y1), n, wd, 0.09));
      bar(x0, wBot + 0.03, x1, wBot + 0.03, 0.07); bar(x0, wTop - 0.03, x1, wTop - 0.03, 0.07); bar(x0 + 0.03, wBot, x0 + 0.03, wTop, 0.07); bar(x1 - 0.03, wBot, x1 - 0.03, wTop, 0.07); // casement frame
      bar(x, wBot, x, wTop, 0.05); bar(x0, wy + 0.2, x1, wy + 0.2, 0.05); // the cross of glazing bars (mullion and transom)
      sills.push(beam(pt(x0 - 0.1, wBot - 0.045), pt(x1 + 0.1, wBot - 0.045), n, 0.06, 0.16));
      for (const side of [-1, 1]) { // shutters, open, hinged on the jambs
        const c0 = side < 0 ? x0 - 0.6 : x1 + 0.05, c1 = side < 0 ? x0 - 0.05 : x1 + 0.6;
        shutters.push(beam(pt((c0 + c1) / 2, wBot), pt((c0 + c1) / 2, wTop), n, c1 - c0, 0.045));
      }
    }

    // ---- the knee wall of the attic on the long sides: base rail, a rail under the eaves, a post every 1.5 m
    if (!f.gable) {
      const yK = Math.max(0.55, topAt(-T) - 0.12), k = Math.max(1, Math.ceil((f.s1 - f.s0) / 1.5));
      b(f.s0 + 0.05, 0.06, f.s1 - 0.05, 0.06); b(f.s0 + 0.05, yK, f.s1 - 0.05, yK, 0.1);
      for (let j = 0; j <= k; j++) { const p = f.s0 + 0.07 + ((f.s1 - f.s0 - 0.14) * j) / k; b(p, 0.06, p, yK, POST); }
    }

    // ---- gables of the attic: rails, posts under the roof edge, corner braces, bargeboards
    if (f.gable) {
      const gw = (room.windows || []).filter((o) => o.wall === f.gable).map((o) => [o.pos - o.width / 2 - 0.08, o.pos + o.width / 2 + 0.08]);
      const free = (s) => !gw.some(([a, c]) => s > a && s < c);
      const span = (y) => { let lo = null, hi = null; for (let s = f.s0; s <= f.s1 + 1e-6; s += 0.04) if (topAt(s) - 0.14 >= y) { if (lo === null) lo = s; hi = s; } return lo === null ? null : [lo + 0.05, hi - 0.05]; };
      for (const y of [0.06, 0.95, 1.85]) { const sp = span(y); if (sp && sp[1] - sp[0] > 0.3) b(sp[0], y, sp[1], y, y < 0.1 ? RAIL : 0.1); }
      const xs = new Set([f.s0 + 0.07, f.s1 - 0.07, W / 2, ...gw.flat().map((v) => +v.toFixed(2))]);
      for (const s of xs) { if (s < f.s0 + 0.05 || s > f.s1 - 0.05) continue; if (!free(s) && s !== f.s0 + 0.07 && s !== f.s1 - 0.07) continue; const top = topAt(s) - 0.12; if (top > 0.2) b(s, 0.06, s, top, POST); }
      for (const [s, dir] of [[f.s0 + 0.07, 1], [f.s1 - 0.07, -1]]) { const s2 = s + dir * 1.05, y2 = Math.min(1.25, topAt(s2) - 0.2); if (y2 > 0.5 && free(s2)) b(s, 0.06, s2, y2, 0.1); }
      for (const sgn of [-1, 1]) { // the bargeboard (Ortbrett) over each rafter edge
        const sA = sgn < 0 ? f.s0 - 0.04 : f.s1 + 0.04, sB = W / 2;
        timber.push(beam(pt(sA, topAt(sA) - 0.1), pt(sB, topAt(sB) - 0.1), n, 0.22, 0.09));
      }
    }
  }

  const plinth = new THREE.BoxGeometry(W + 2 * T + 0.08, 0.5, D + 2 * T + 0.08);
  plinth.translate(W / 2, -STOREY + 0.25, D / 2);
  return { timber: merge(timber), plinth, frames: merge(frames), sills: merge(sills), shutters: merge(shutters) };
}
