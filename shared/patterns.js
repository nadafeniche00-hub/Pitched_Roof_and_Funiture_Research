// Pattern tree: a short series of design questions that ends in a furniture pattern.
//
// Every answer narrows the pattern (use -> sleepers -> where the bed stands -> storage -> work corner). A finished
// path becomes a list of pieces, each with an anchor (`spec`) that the placement search has to respect:
//   backTo  slope | gable | wall | free   which wall the back of the piece stands against (see rules.anchorOk)
//   near    light                          within reach of a window or dormer
// In a gable roof the slope sides are x = 0 / W (low), the gable walls y = 0 / D (full height), so "low pieces under
// the slope, tall pieces on the gable" is the classic attic pattern and the tree makes that choice explicit.
import { anchorOk, lightGap } from './rules.js';

export const NODES = {
  use: {
    q: 'What is the room for?',
    options: [
      { id: 'sleep', label: 'Sleeping', hint: 'Bed first: its head wall decides the rest.', next: 'sleepers' },
      { id: 'study', label: 'Working', hint: 'Daylight first: the desk goes where the light is.', next: 'desks' },
      { id: 'live', label: 'Living', hint: 'Seating against walls keeps the middle for walking.', next: 'seating' },
      { id: 'bath', label: 'Bathroom', hint: 'Wet pieces together: one plumbing stack.', next: 'wet' },
    ],
  },
  sleepers: {
    q: 'How many people sleep here?',
    options: [
      { id: 'one', label: 'One', hint: 'Single bed, one side access is enough.', next: 'bedAt' },
      { id: 'two', label: 'Two', hint: 'Double bed: both sides should be free where possible.', next: 'bedAt' },
    ],
  },
  bedAt: {
    q: 'Where does the head of the bed stand?',
    options: [
      { id: 'slope', label: 'Under the slope', hint: 'The low side is wasted standing height anyway: sleep there, keep the tall middle free.', next: 'storage' },
      { id: 'gable', label: 'On a gable wall', hint: 'Full height at the head, the bed runs into the room.', next: 'storage' },
      { id: 'free', label: 'Free-standing', hint: 'Needs full height around it; costs the most floor.', next: 'storage' },
    ],
  },
  storage: {
    q: 'How is storage arranged?',
    options: [
      { id: 'slope', label: 'Low chests under the slope', hint: 'Chests (0.9 m) fit under the eaves; one tall wardrobe on the gable.', next: 'work' },
      { id: 'gable', label: 'Wardrobes on the gable walls', hint: 'Tall pieces only where the roof allows them.', next: 'work' },
      { id: 'both', label: 'Both', hint: 'A wardrobe on the gable and chests along the slope.', next: 'work' },
    ],
  },
  work: {
    q: 'A work corner?',
    options: [
      { id: 'light', label: 'Desk near a window or dormer', hint: 'Within 1.8 m of daylight.', next: null },
      { id: 'none', label: 'No desk', hint: 'Sleeping and storage only.', next: null },
    ],
  },
  desks: {
    q: 'How many work places?',
    options: [
      { id: 'one', label: 'One', next: 'deskAt' },
      { id: 'two', label: 'Two', next: 'deskAt' },
    ],
  },
  deskAt: {
    q: 'Where do the desks go?',
    options: [
      { id: 'light', label: 'By a window or dormer', hint: 'Daylight over the shoulder, a dormer gives the headroom.', next: 'deskStore' },
      { id: 'gable', label: 'Back to a gable wall', hint: 'Full height behind the chair.', next: 'deskStore' },
    ],
  },
  deskStore: {
    q: 'Storage for the work corner?',
    options: [
      { id: 'shelves', label: 'Tall shelves on a gable wall', hint: 'Shelves need 1.8 m: only the gable has it.', next: null },
      { id: 'low', label: 'Low chests under the slope', hint: 'Files and drawers in the low zone.', next: null },
    ],
  },
  seating: {
    q: 'Where does the seating stand?',
    options: [
      { id: 'slope', label: 'Back to the slope', hint: 'Seated heads need only 1.1 m: the low zone works.', next: 'seatExtra' },
      { id: 'gable', label: 'Back to a gable wall', hint: 'Faces down the length of the room.', next: 'seatExtra' },
      { id: 'free', label: 'Free-standing group', hint: 'A divider in a large room; needs the tall middle.', next: 'seatExtra' },
    ],
  },
  seatExtra: {
    q: 'Anything else?',
    options: [
      { id: 'shelf', label: 'A tall shelf on a gable wall', hint: 'Books and display.', next: null },
      { id: 'none', label: 'Nothing', hint: 'Sofa and armchair only.', next: null },
    ],
  },
  wet: {
    q: 'How are the wet pieces arranged?',
    options: [
      { id: 'stack', label: 'All on one gable wall', hint: 'One plumbing stack, full height for the shower.', next: null },
      { id: 'free', label: 'Free arrangement', hint: 'No anchor: the search places each piece.', next: null },
    ],
  },
};

/**
 * Follow a path of option ids from the root.
 * Returns the chosen options so far, the answers by node, the next question (null when the pattern is complete)
 * and `valid` = false if the path does not fit the tree.
 */
export function walk(path = []) {
  const chosen = [];
  const sel = {};
  let node = 'use';
  for (const id of path) {
    const opt = node && NODES[node].options.find((o) => o.id === id);
    if (!opt) return { chosen, sel, node, valid: false };
    chosen.push({ node, ...opt });
    sel[node] = opt.id;
    node = opt.next;
  }
  return { chosen, sel, node, valid: true };
}

const P = (type, spec) => (spec ? { type, spec } : { type });
const times = (n, f) => Array.from({ length: n }, f);

/** A finished path -> the pieces of the pattern, each with its anchor. */
export function buildPattern(path) {
  const { chosen, sel, node, valid } = walk(path);
  if (!valid || node !== null) return null;
  let pieces = [];
  switch (sel.use) {
    case 'sleep': {
      pieces.push(P(sel.sleepers === 'two' ? 'bed_double' : 'bed_single', { backTo: sel.bedAt }));
      if (sel.storage === 'slope') pieces.push(P('chest', { backTo: 'slope' }), P('wardrobe', { backTo: 'gable' }));
      else if (sel.storage === 'gable') pieces.push(...times(2, () => P('wardrobe', { backTo: 'gable' })));
      else pieces.push(P('wardrobe', { backTo: 'gable' }), ...times(2, () => P('chest', { backTo: 'slope' })));
      if (sel.work === 'light') pieces.push(P('desk', { near: 'light' }));
      break;
    }
    case 'study': {
      const n = sel.desks === 'two' ? 2 : 1;
      pieces.push(...times(n, () => P('desk', sel.deskAt === 'light' ? { near: 'light' } : { backTo: 'gable' })));
      pieces.push(...times(n, () => (sel.deskStore === 'shelves' ? P('shelf', { backTo: 'gable' }) : P('chest', { backTo: 'slope' }))));
      break;
    }
    case 'live': {
      pieces.push(P('sofa', { backTo: sel.seating }), P('armchair', { backTo: sel.seating === 'free' ? 'free' : 'wall' }));
      if (sel.seatExtra === 'shelf') pieces.push(P('shelf', { backTo: 'gable' }));
      break;
    }
    default: // bath
      pieces = ['toilet', 'basin', 'shower'].map((t) => (sel.wet === 'stack' ? P(t, { backTo: 'gable' }) : P(t)));
  }
  return { name: chosen.map((c) => c.label).join(' · '), notes: chosen.map((c) => c.hint).filter(Boolean), pieces };
}

/** Unplaced items for the pieces of a pattern. Ids are stable so a rerun keeps references. */
export const itemsFromPattern = (pattern) =>
  pattern.pieces.map((p, i) => ({ id: `t${i}`, type: p.type, x: 0, y: 0, rot: 0, placed: false, ...(p.spec ? { spec: p.spec } : {}) }));

/**
 * Candidate filter for candidatesFor(): the anchor of a piece as a position test.
 * spec.within (a room rectangle from the plan builder) is a hard limit; `hardOnly` keeps just that, for the relaxed second try.
 */
export function specFilter(room, spec, hardOnly = false) {
  if (!spec) return null;
  const w = spec.within;
  if (hardOnly && !w) return null;
  return (_cand, body, rot) => (!w || (body[0] >= w[0] - 1e-6 && body[1] >= w[1] - 1e-6 && body[2] <= w[2] + 1e-6 && body[3] <= w[3] + 1e-6))
    && (hardOnly || ((!spec.backTo || anchorOk(room, spec.backTo, body, rot, w)) && (spec.near !== 'light' || lightGap(room, body) <= 1.8)));
}
