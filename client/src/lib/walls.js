// Partition walls between rooms, from a layout: the unique inner edges of the room rectangles, door openings in them, and the strips
// and solids drawn from them. Used by the plan, the 3D view and the walk-through.
import * as THREE from 'three';
import { roofHeight } from '@shared/engine.js';
import { doorSwing } from '@shared/doors.js';
import { WALLS } from '@shared/knowledge.js';

export const DOOR_H = 2.05, WALL_MAX = 8; // walls rise all the way to the roof

/**
 * Walls of a layout: unique inner edges with their door openings, and thin rectangles for collision.
 * `autoDoors`: where the layout has no door data (rooms drawn or split by hand), every wall longer than 1.8 m gets a door in the middle.
 */
export function wallsOf(room, layout, { autoDoors = false, trimOuter = false } = {}) {
  const W = room.width, D = room.depth, seen = new Set(), walls = [], colliders = [];
  if (!layout) return { walls, colliders };
  const doors = layout.doors || [];
  const rectOf = Object.fromEntries((layout.rooms || []).map((r) => [r.id, r.rect]));
  const onOuter = (c, lim) => Math.abs(c) < 0.02 || Math.abs(c - lim) < 0.02;
  const add = (vertical, c, a0, b0) => {
    let a = a0, b = b0;
    // trimOuter: a partition stops at the inner face of the outer wall (WALLS.outer) instead of running through it (the technical plan draws the outer wall itself)
    if (trimOuter) { const lim = vertical ? D : W; if (a < 0.02) a = WALLS.outer; if (b > lim - 0.02) b = lim - WALLS.outer; }
    if (b - a < 0.05) return;
    const key = [vertical, c.toFixed(2), a.toFixed(2), b.toFixed(2)].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    let op = doors
      .filter((d) => d.vertical === vertical && Math.abs((vertical ? d.mid[0] : d.mid[1]) - c) < 0.06)
      // [start, end, side, hinge]: how the door opens (shared/doors.js): into the room behind it, hinged at the end nearer to the end of the wall
      .map((d) => { const m = (vertical ? d.mid[1] : d.mid[0]) - a, w = (d.width || 0.9) / 2, sw = rectOf[d.a] && rectOf[d.b] ? doorSwing(d, rectOf) : null; return sw ? [m - w, m + w, sw.side, sw.hinge] : [m - w, m + w]; })
      .filter((o) => o[1] > 0 && o[0] < b - a);
    if (autoDoors && !op.length && b - a > 1.8) op = [[(b - a) / 2 - 0.45, (b - a) / 2 + 0.45]];
    const p0 = vertical ? [c, a] : [a, c], p1 = vertical ? [c, b] : [b, c];
    walls.push({ p0, p1, op, vertical });
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

/** A partition wall that follows the roof: a vertical strip, opened (up to DOOR_H) where a door is. */
export function wallStrip(room, p0, p1, openings) {
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
  return g;
}

export const T_IN = WALLS.inner; // thickness of a partition: the inner wall of the technical plan (shared with lib/techPlan.js)

/**
 * The same wall with thickness (T_IN, as in the technical plan): both faces, the jambs of the door openings and the underside of the lintel in group 0, the cut face
 * on top in group 1 - drawn black in the 3D view, as a wall section is in a plan. Follows the roof; DOOR_H high openings.
 */
export function wallSolid(room, p0, p1, openings, t = T_IN) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy), n = Math.max(1, Math.round(len / 0.1));
  const nx = (-dy / len) * (t / 2), ny = (dx / len) * (t / 2), sides = [], tops = [];
  const quad = (out, a, b, c, d) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
  const at = (s) => [p0[0] + (dx * s) / len, p0[1] + (dy * s) / len];
  const isDoor = (i) => { const sm = ((i + 0.5) / n) * len; return openings.some((o) => sm > o[0] && sm < o[1]); };
  for (let i = 0; i < n; i++) {
    const s0 = (i / n) * len, s1 = ((i + 1) / n) * len, door = isDoor(i), bottom = door ? DOOR_H : 0;
    const a = at(s0), b = at(s1);
    const ha = Math.min(roofHeight(room, a[0], a[1]), WALL_MAX), hb = Math.min(roofHeight(room, b[0], b[1]), WALL_MAX);
    if (door && i > 0 && !isDoor(i - 1)) quad(sides, [a[0] + nx, 0, a[1] + ny], [a[0] - nx, 0, a[1] - ny], [a[0] - nx, Math.min(DOOR_H, ha), a[1] - ny], [a[0] + nx, Math.min(DOOR_H, ha), a[1] + ny]); // jamb where the opening starts
    if (!door && i > 0 && isDoor(i - 1)) quad(sides, [a[0] + nx, 0, a[1] + ny], [a[0] - nx, 0, a[1] - ny], [a[0] - nx, Math.min(DOOR_H, ha), a[1] - ny], [a[0] + nx, Math.min(DOOR_H, ha), a[1] + ny]); // and where it ends
    if (ha <= bottom && hb <= bottom) continue;
    const A = Math.max(ha, bottom), B = Math.max(hb, bottom);
    for (const sgn of [1, -1]) quad(sides, [a[0] + sgn * nx, bottom, a[1] + sgn * ny], [b[0] + sgn * nx, bottom, b[1] + sgn * ny], [b[0] + sgn * nx, B, b[1] + sgn * ny], [a[0] + sgn * nx, A, a[1] + sgn * ny]);
    quad(tops, [a[0] + nx, A, a[1] + ny], [b[0] + nx, B, b[1] + ny], [b[0] - nx, B, b[1] - ny], [a[0] - nx, A, a[1] - ny]); // the cut face
    if (door) quad(sides, [a[0] + nx, bottom, a[1] + ny], [b[0] + nx, bottom, b[1] + ny], [b[0] - nx, bottom, b[1] - ny], [a[0] - nx, bottom, a[1] - ny]); // lintel underside
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...sides, ...tops], 3));
  g.addGroup(0, sides.length / 3, 0);
  g.addGroup(sides.length / 3, tops.length / 3, 1);
  g.computeVertexNormals();
  return g;
}
