// How a partition door sits and opens: one rule for the plan builder (where the door goes), the technical plan (how it is drawn), the furniture (the swing stays
// free) and the checks. Plain data in, plain data out (browser, Node, tests). A door of a plan: { a, b, mid:[x,y], vertical, width }, a = the room on the stair
// side, b = the room behind the door.
//
// The rule (Neufert, circulation): a door opens into the room behind it, is hinged next to a wall end so that the open leaf lies against that wall, and nothing
// stands inside its swing. A door in the middle of a wall, opening into the hall, leaves a pocket on each side of the leaf and takes the hall away.
import { NEUFERT } from './knowledge.js';

export const DOOR_WIDTH = NEUFERT.doorLeaf;
const END_GAP = 0.25; // the opening starts at least this far from the end of the wall run: the frame and a strip of wall beside it

/** The run of the wall two rooms share, along the wall: [lo, hi] (y for a vertical wall, x for a horizontal one). */
export const sharedRun = (ra, rb, vertical) => (vertical ? [Math.max(ra[1], rb[1]), Math.min(ra[3], rb[3])] : [Math.max(ra[0], rb[0]), Math.min(ra[2], rb[2])]);

/**
 * The centre of a door on the wall two rooms share (`edge` = sharedEdge() of the plan builder). A door goes close to the end of the wall that is farther from
 * `away` (the stair), so its leaf can lie against the wall behind it; a wall too short for that keeps the door in the middle.
 */
export function placeDoor(edge, ra, rb, width = DOOR_WIDTH, away = null) {
  const [lo, hi] = sharedRun(ra, rb, edge.vertical);
  if (hi - lo < width + 2 * END_GAP) return edge.mid;
  const pt = (s) => (edge.vertical ? [edge.mid[0], s] : [s, edge.mid[1]]);
  const a = pt(lo + END_GAP + width / 2), b = pt(hi - END_GAP - width / 2);
  if (!away) return a;
  const far = (p) => Math.hypot(p[0] - away[0], p[1] - away[1]);
  return far(a) >= far(b) ? a : b;
}

/**
 * The swing of a door. Returns
 *   rect    the square the leaf sweeps, [x0, y0, x1, y1]: the opening times the width of the leaf, on the side of room b
 *   side    +1 / -1: which side of the wall (seen along it, in the direction of increasing x or y) the leaf opens to; +1 = left of that direction
 *   hinge   0 hinged at the start of the opening, 1 at its end: the end nearer to the end of the wall run
 *   into    the id of the room it opens into
 */
export function doorSwing(door, rects) {
  const w = door.width || DOOR_WIDTH, ra = rects[door.a], rb = rects[door.b];
  const [lo, hi] = sharedRun(ra, rb, door.vertical);
  const along = door.vertical ? door.mid[1] : door.mid[0], c = door.vertical ? door.mid[0] : door.mid[1];
  const s0 = along - w / 2, s1 = along + w / 2;
  const hinge = s0 - lo <= hi - s1 ? 0 : 1;
  const bPlus = door.vertical ? (rb[0] + rb[2]) / 2 > c : (rb[1] + rb[3]) / 2 > c; // room b lies on the + side of the wall (x for a vertical wall, y for a horizontal one)
  const reach = bPlus ? [c, c + w] : [c - w, c];
  const rect = door.vertical ? [reach[0], s0, reach[1], s1] : [s0, reach[0], s1, reach[1]];
  const side = door.vertical ? (bPlus ? -1 : 1) : (bPlus ? 1 : -1); // the left of "increasing y" is -x, the left of "increasing x" is +y
  return { rect, side, hinge, into: door.b, w };
}

/** The swing squares of all the doors of a plan, ready for the furniture engine (room.swings). */
export function swingRects(plan) {
  const rects = Object.fromEntries((plan.rooms || []).map((r) => [r.id, r.rect]));
  return (plan.doors || []).filter((d) => rects[d.a] && rects[d.b]).map((d) => doorSwing(d, rects).rect);
}

const overlap = (a, b) => a[0] < b[2] - 1e-6 && b[0] < a[2] - 1e-6 && a[1] < b[3] - 1e-6 && b[1] < a[3] - 1e-6;

/** Pairs of doors whose swings overlap (two leaves in the same corner of the floor), as [i, j] indices into plan.doors. */
export function swingConflicts(plan) {
  const rects = Object.fromEntries((plan.rooms || []).map((r) => [r.id, r.rect]));
  const sw = (plan.doors || []).map((d) => (rects[d.a] && rects[d.b] ? doorSwing(d, rects).rect : null));
  const out = [];
  for (let i = 0; i < sw.length; i++) for (let j = i + 1; j < sw.length; j++) if (sw[i] && sw[j] && overlap(sw[i], sw[j])) out.push([i, j]);
  return out;
}
