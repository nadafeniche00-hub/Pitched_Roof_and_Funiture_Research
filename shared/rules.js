// Planning rules for the furniture layout.
//
// Two kinds of checks, both pure functions of plain data (browser, Node, tests):
//   fact check   - are the numbers believable? (a 1.4 m deep wardrobe is a typo, a window in a 0.9 m knee wall is not a window)
//   layout rules - does the arrangement follow common architectural practice? (bed head against a wall, free landing at the stair, ...)
//
// The thresholds are planning rules of thumb for design exploration, not code requirements: every rule says why it exists
// and can be switched off in the UI. Findings are `warn` (fix it) or `info` (a choice worth knowing about).
import { CATALOG } from './catalog.js';
import { defOf } from './params.js';
import { dormerRect, roofHeight, stairRect, windowRect } from './engine.js';
import { WALLS } from './knowledge.js';

const TOL = 0.1; // "touching a wall" - the 10 cm placement lattice
const cm = (v) => Math.round(v * 100);
const fix = (v) => v.toFixed(2);

// ---------------------------------------------------------------- geometry helpers (rects are [x0, y0, x1, y1])

export const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
export const rectGap = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
const grow = (r, m) => [r[0] - m, r[1] - m, r[2] + m, r[3] + m];

/** The attic as a person can use it: the footprint minus the outer wall (WALLS.outer, shared/knowledge.js). The walls a piece stands against are its faces. */
export const clearRoom = (room) => [WALLS.outer, WALLS.outer, room.width - WALLS.outer, room.depth - WALLS.outer];

/**
 * Distance from the back of a piece (the side opposite its front) to the wall behind it. `within` = the rectangle of the room the piece stands in (a plan from the
 * plan builder): its partition walls are walls too. Without it the walls are the outline of the attic.
 */
export function backGap(room, b, rot, within) {
  const r = within || clearRoom(room);
  switch (rot) {
    case 0: return b[1] - r[1];
    case 1: return r[2] - b[2];
    case 2: return r[3] - b[3];
    default: return b[0] - r[0];
  }
}
export const wallGap = (room, b, within) => {
  const r = within || clearRoom(room);
  return Math.min(b[0] - r[0], b[1] - r[1], r[2] - b[2], r[3] - b[3]);
};

/**
 * Does a piece with its body `b` and rotation `rot` satisfy a pattern anchor?
 *   slope  back to the eaves side (x = 0 / W): rotation 1 or 3
 *   gable  back to a gable wall (y = 0 / D): rotation 0 or 2
 *   wall   back to any wall;   free  standing clear of every wall (>= 30 cm)
 */
export function anchorOk(room, backTo, b, rot, within) {
  switch (backTo) {
    case 'slope': return rot % 2 === 1 && backGap(room, b, rot) <= TOL;
    case 'gable': return rot % 2 === 0 && backGap(room, b, rot) <= TOL;
    case 'wall': return backGap(room, b, rot, within) <= TOL; // a partition of the room counts
    case 'free': return wallGap(room, b, within) >= 0.3;
    default: return true;
  }
}

/** Rectangles that bring daylight: windows and dormers. */
export const lightRects = (room) => [...room.windows.map((w) => windowRect(room, w)), ...room.dormers.map((d) => dormerRect(room, d))];

/** Distance to the nearest daylight source, Infinity if the room has none. */
export const lightGap = (room, b) => lightRects(room).reduce((m, r) => Math.min(m, rectGap(b, r)), Infinity);

// ---------------------------------------------------------------- fact check: dimensions

// plausible real-world ranges [min, max] in metres per base type
const PLAUSIBLE = {
  bed_double: { w: [1.4, 2.2], d: [1.9, 2.3], h: [0.3, 1.2] },
  bed_single: { w: [0.8, 1.4], d: [1.9, 2.3], h: [0.3, 1.2] },
  wardrobe: { w: [0.5, 3.0], d: [0.35, 0.8], h: [1.6, 2.7] },
  chest: { w: [0.5, 2.0], d: [0.3, 0.65], h: [0.6, 1.3] },
  shelf: { w: [0.4, 1.2], d: [0.2, 0.45], h: [1.4, 2.7] },
  desk: { w: [0.9, 2.2], d: [0.5, 1.0], h: [0.65, 0.85] },
  sofa: { w: [1.4, 3.3], d: [0.7, 1.15], h: [0.6, 1.05] },
  armchair: { w: [0.6, 1.1], d: [0.6, 1.1], h: [0.6, 1.1] },
  toilet: { w: [0.3, 0.5], d: [0.5, 0.85], h: [0.3, 1.0] },
  basin: { w: [0.4, 1.4], d: [0.35, 0.6], h: [0.7, 1.1] },
  shower: { w: [0.7, 1.6], d: [0.7, 1.6], h: [1.9, 2.4] },
};

// smallest usual free depth in front of / beside a piece before it is hard to use
const MIN_CLEAR = {
  bed_double: { side: 0.5 },
  bed_single: { side: 0.5 },
  wardrobe: { front: 0.7 },
  chest: { front: 0.6 },
  shelf: { front: 0.5 },
  desk: { front: 0.8 },
  sofa: { front: 0.5 },
  armchair: { front: 0.4 },
  toilet: { front: 0.55 },
  basin: { front: 0.55 },
  shower: { front: 0.5 },
};

const DIM_NAME = { w: 'width', d: 'depth', h: 'height' };

/** Believable dimensions and clearances for one piece (uses the resolved values: category, product, own overrides). */
export function factCheckItem(item) {
  const out = [];
  if (!CATALOG[item.type]) return [{ code: 'fact-type', severity: 'warn', msg: `Unknown furniture type "${item.type}"` }];
  const def = defOf(item);
  const range = PLAUSIBLE[item.type];
  for (const k of ['w', 'd', 'h']) {
    const [lo, hi] = range[k];
    if (def[k] < lo || def[k] > hi) {
      out.push({ code: 'fact-dim', severity: 'warn', msg: `${def.label}: ${DIM_NAME[k]} ${fix(def[k])} m is unusual (typically ${fix(lo)}–${fix(hi)} m) - typo or wrong type?` });
    }
  }
  const min = MIN_CLEAR[item.type] || {};
  for (const [k, v] of Object.entries(min)) {
    if ((def.clear[k] || 0) < v) out.push({ code: 'fact-clear', severity: 'info', msg: `${def.label}: ${k} clearance ${fix(def.clear[k] || 0)} m is below the usual ${fix(v)} m` });
  }
  return out;
}

// ---------------------------------------------------------------- fact check: room

export function factCheckRoom(room) {
  const out = [];
  const warn = (code, msg, severity = 'warn') => out.push({ code, severity, msg });
  const ridge = room.kneeWall + Math.tan((room.pitch * Math.PI) / 180) * (room.width / 2);
  if (room.kneeWall > room.maxHeight) warn('fact-knee', `Knee wall (${fix(room.kneeWall)} m) is higher than the ceiling (${fix(room.maxHeight)} m)`);
  if (room.maxHeight > ridge + 0.01) warn('fact-ridge', `The ridge is only ${fix(ridge)} m high - a ceiling at ${fix(room.maxHeight)} m cannot exist`, 'info');
  if (room.pitch < 22 || room.pitch > 60) warn('fact-pitch', `A ${room.pitch}° pitch is unusual for a pitched roof (most are 22–60°)`, 'info');
  if (room.stair) {
    if (room.stair.w < 0.8) warn('fact-stair', `Stair opening ${fix(room.stair.w)} m wide: a usable stair needs about 0.8 m`);
    const r = stairRect(room);
    const hs = Math.min(...[[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]].map(([x, y]) => roofHeight(room, Math.min(x, room.width), Math.min(y, room.depth))));
    if (hs < 2.0) warn('fact-stair-head', `Only ${fix(hs)} m headroom at the stair opening (about 2.0 m expected)`);
  }
  for (const d of room.doors) if (d.width < 0.8) warn('fact-door', `A door ${fix(d.width)} m wide is narrow (about 0.8 m minimum)`);
  for (const w of room.windows) {
    const len = w.wall === 'N' || w.wall === 'S' ? room.width : room.depth;
    if (w.pos - w.width / 2 < 0 || w.pos + w.width / 2 > len) warn('fact-window-pos', `Window on wall ${w.wall} runs past the wall`);
    if (w.wall === 'E' || w.wall === 'W') warn('fact-window-knee', `A window on the ${w.wall} wall sits in a ${fix(room.kneeWall)} m knee wall - use a dormer or roof window`, 'info');
  }
  for (const d of room.dormers) {
    const r = dormerRect(room, d);
    if (r[1] < 0 || r[3] > room.depth || r[0] < 0 || r[2] > room.width) warn('fact-dormer', 'A dormer sticks out of the room');
  }
  return out;
}

// ---------------------------------------------------------------- layout rules

// Each rule: scope 'item' -> check(ctx, piece) returns a message or null; scope 'room' -> check(ctx) returns [{ msg, itemId? }].
// ctx = { room, items, placed: [{ it, def, b, res }], metrics, light }
const isType = (...t) => (p) => t.includes(p.it.type);
const beds = (ctx) => ctx.items.filter((i) => i.type.startsWith('bed_'));

export const RULES = [
  {
    id: 'bed-head-wall', scope: 'item', severity: 'warn', when: isType('bed_double', 'bed_single'),
    title: 'Bed head against a wall',
    why: 'A bed head wants a wall (or the slope) behind it: stability, draught, and the room stays open on the other three sides.',
    check: ({ room }, p) => { const g = backGap(room, p.b, p.it.rot, p.it.spec?.within); return g > TOL ? `${p.def.label}: head is ${cm(g)} cm from the wall behind it` : null; },
  },
  {
    id: 'tall-against-wall', scope: 'item', severity: 'warn', when: isType('wardrobe', 'shelf'),
    title: 'Tall pieces stand against a wall',
    why: 'Tall furniture in the open cuts the room in two and has nothing to stand against.',
    check: ({ room }, p) => (wallGap(room, p.b, p.it.spec?.within) > TOL ? `${p.def.label} stands ${cm(wallGap(room, p.b, p.it.spec?.within))} cm off every wall` : null),
  },
  {
    id: 'stair-landing', scope: 'item', severity: 'warn', when: () => true,
    title: 'Keep the stair landing free',
    why: 'People arrive at the top of the stair carrying things and need about 0.8 m of free floor before the first piece.',
    check: ({ room }, p) => {
      const s = stairRect(room);
      return s && overlaps(p.b, grow(s, 0.8)) && !overlaps(p.b, s) ? `${p.def.label} is within 0.8 m of the stair opening` : null;
    },
  },
  {
    id: 'desk-daylight', scope: 'item', severity: 'info', when: isType('desk'),
    title: 'Desk near daylight',
    why: 'Work places are comfortable within about 1.8 m of a window or dormer.',
    check: ({ room }, p) => { const g = lightGap(room, p.b); return Number.isFinite(g) && g > 1.8 ? `${p.def.label} is ${fix(g)} m from the nearest window or dormer` : null; },
  },
  {
    id: 'sofa-back', scope: 'item', severity: 'info', when: isType('sofa'),
    title: 'Sofa back to a wall',
    why: 'A floating sofa works as a divider in a big room; in an attic it usually just eats floor.',
    check: ({ room }, p) => (backGap(room, p.b, p.it.rot, p.it.spec?.within) > TOL && wallGap(room, p.b, p.it.spec?.within) > TOL ? `${p.def.label} floats in the room` : null),
  },
  {
    id: 'bed-both-sides', scope: 'item', severity: 'info', when: isType('bed_double'),
    title: 'Double bed reachable from both sides',
    why: 'Two sleepers should each get out of bed without climbing over the other.',
    check: (_c, p) => {
      const a = p.res?.zones.sideA, b = p.res?.zones.sideB;
      if (a === undefined || b === undefined) return null;
      const free = (a >= 0.9) + (b >= 0.9);
      return free === 2 ? null : free === 1 ? 'Only one side of the double bed is free' : 'Neither side of the double bed is fully free';
    },
  },
  {
    id: 'wet-group', scope: 'room', severity: 'warn',
    title: 'Wet pieces share one stack',
    why: 'WC, basin and shower within about 2.5 m of each other keep the plumbing short and cheap.',
    check: ({ placed }) => {
      const wet = placed.filter((p) => ['toilet', 'basin', 'shower'].includes(p.it.type));
      let far = 0;
      for (let i = 0; i < wet.length; i++) for (let j = i + 1; j < wet.length; j++) far = Math.max(far, rectGap(wet[i].b, wet[j].b));
      return far > 2.5 ? [{ msg: `Wet pieces are up to ${fix(far)} m apart` }] : [];
    },
  },
  {
    id: 'storage-per-bed', scope: 'room', severity: 'warn',
    title: 'Storage for every sleeper',
    why: 'Rule of thumb: about 1.0 m of wardrobe, chest or shelf run per sleeper, or clothes end up on the floor.',
    check: (ctx) => {
      const b = beds(ctx);
      if (!b.length) return [];
      const sleepers = b.reduce((n, i) => n + (i.type === 'bed_double' ? 2 : 1), 0);
      const run = ctx.items.filter((i) => ['wardrobe', 'chest', 'shelf'].includes(i.type)).reduce((a, i) => a + defOf(i).w, 0);
      return run < sleepers - 1e-9 ? [{ msg: `${fix(run)} m of storage for ${sleepers} sleeper${sleepers > 1 ? 's' : ''} (plan about ${fix(sleepers)} m)` }] : [];
    },
  },
  {
    id: 'bedroom-area', scope: 'room', severity: 'warn',
    title: 'Counted floor area for the beds',
    why: 'Rule of thumb for counted (not gross) area: about 8 m² for a single and 10 m² for a double bedroom.',
    check: (ctx) => {
      const b = beds(ctx);
      if (!b.length || !ctx.metrics) return [];
      const need = b.some((i) => i.type === 'bed_double') ? 10 : 8;
      return ctx.metrics.counted < need ? [{ msg: `Only ${fix(ctx.metrics.counted)} m² of counted floor for a bedroom (about ${need} m² expected)` }] : [];
    },
  },
  {
    id: 'escape-light', scope: 'room', severity: 'warn',
    title: 'Sleeping room needs an opening',
    why: 'A bedroom needs daylight and a second way out: at least one window, roof window or dormer.',
    check: (ctx) => (beds(ctx).length && !ctx.light.length ? [{ msg: 'There is a bed but no window or dormer in the room' }] : []),
  },
];

/**
 * Run the layout rules on the current layout.
 * `result` is the output of evaluate() (zones and metrics); `disabled` lists rule ids to skip.
 * Returns findings: { rule, title, severity, msg, itemId? } - only placed pieces are judged by item rules.
 */
export function checkLayout(room, items, result, { disabled = [] } = {}) {
  const resById = Object.fromEntries((result?.items || []).map((r) => [r.id, r]));
  const placed = items
    .filter((it) => it.placed && CATALOG[it.type])
    .map((it) => {
      const def = defOf(it);
      const w = it.rot % 2 ? def.d : def.w;
      const d = it.rot % 2 ? def.w : def.d;
      return { it, def, b: [it.x, it.y, it.x + w, it.y + d], res: resById[it.id] };
    });
  const ctx = { room, items, placed, metrics: result?.metrics, light: lightRects(room) };
  const out = [];
  for (const rule of RULES) {
    if (disabled.includes(rule.id)) continue;
    const base = { rule: rule.id, title: rule.title, severity: rule.severity };
    if (rule.scope === 'item') {
      for (const p of placed) if (rule.when(p)) { const msg = rule.check(ctx, p); if (msg) out.push({ ...base, msg, itemId: p.it.id }); }
    } else {
      for (const f of rule.check(ctx)) out.push({ ...base, ...f });
    }
  }
  return out;
}

const PENALTY = { warn: 0.04, info: 0.01 };

/** How much the rule findings take off the design score used by the iteration loop. */
export const layoutPenalty = (findings) => findings.reduce((a, f) => a + PENALTY[f.severity], 0);
