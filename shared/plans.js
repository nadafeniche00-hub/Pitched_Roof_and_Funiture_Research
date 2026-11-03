// Plan builder: a brief (rooms with wanted areas + links between them) becomes room rectangles under the roof.
//
// Method (deliberately simple and explainable): random slicing trees. A slicing tree cuts the footprint into one rectangle per room;
// the cut positions follow the wanted areas, the stair is never cut through, and the room holding the stair becomes the hall.
// Many seeded trees are scored, the best few are refined by nudging cut positions, and the top different ones are returned.
// Areas are counted by roof height (the same 100 / 50 / 0 % logic as the furniture engine), so a room under the slope is judged
// on what a person can use, not on its floor area.
//
// Pure functions of plain data (browser, Node, tests). Thresholds are planning rules of thumb for exploration, not code requirements.
import { getGrid, mulberry32, stairRect, dormerRect, DEFAULT_RULES } from './engine.js';
import { ADJACENCY, LBO, WALLS } from './knowledge.js';
import { DOOR_WIDTH, placeDoor, swingConflicts, boundsOf } from './doors.js';

const EPS = 1e-6;
const RES = 0.1;

// min = narrowest clear width (m), area = default counted area (m2), share = needed counted/gross share, light = needs daylight, sleep = a pass-through is unwelcome
export const ROOM_TYPES = {
  bedroom: { label: 'Bedroom', min: 2.4, minArea: 7, maxAspect: 2.0, area: 14, share: 0.6, light: true, sleep: true },
  child: { label: 'Child room', min: 2.4, minArea: 6, maxAspect: 2.0, area: 12, share: 0.6, light: true, sleep: true },
  living: { label: 'Living room', min: 3.0, minArea: 12, maxAspect: 2.5, area: 28, share: 0.6, light: true, sleep: false },
  kitchen: { label: 'Kitchen', min: 1.8, minArea: 5, maxAspect: 2.5, area: 8, share: 0.6, light: true, sleep: false },
  study: { label: 'Study', min: 2.0, minArea: 4, maxAspect: 2.2, area: 10, share: 0.55, light: true, sleep: false },
  bath: { label: 'Bathroom', min: 1.5, minArea: 2.5, maxAspect: 2.2, area: 4, share: 0.5, light: false, sleep: false },
  wc: { label: 'WC', min: 0.9, minArea: 1.2, maxAspect: 2.5, area: 1.5, share: 0.5, light: false, sleep: false },
  storage: { label: 'Storage', min: 0.8, minArea: 1, maxAspect: 2.8, area: 2.2, share: 0, light: false, sleep: false },
};
// area (the size a new room starts with) is the median of the real rooms of its kind, Modified Swiss Dwellings, net m2 (pipeline/oracle/msd/calibration_results.json): bedroom 14.3, kitchen 8.0, living room 27.6
// (a Swiss living room often includes the dining area), bath 3.8, storage 2.2. The data has no child room, study or WC: a child room is a bedroom of the lower quartile (12.1), a study is no smaller than the
// smallest real bedrooms (5th percentile, 10.0), a WC is the smallest real bathrooms (5th percentile, 1.5). Rounded. A study of 4 m2 or a bedroom of 8 m2 exists in no real plan of the data (bedroom 1st percentile 8.7).
// min (narrowest clear width) and maxAspect (longest proportion, long side over short side) are checked against 127,908 real rooms of 5,372 plans (Modified Swiss Dwellings, pipeline/oracle/msd):
// the old kitchen width of 2.2 m flagged 31 % of real kitchens and the old storage width of 1.2 m 48 % of real storerooms (now 1.8 and 0.8 m); maxAspect is the 95th percentile of real rooms
// (bedroom 1.95, bath 2.2, kitchen 2.46, living 2.45, storage 2.72, hall 3.96), rounded up. Swiss flats, not attics: the lower end of what real plans contain, not a design target.
export const HALL = { label: 'Stair hall', min: 1.2, minArea: 3, maxAspect: 4.0, area: 4, share: 0.4, light: false, sleep: false };
export const THIN = 1.3; // a room longer than maxAspect x THIN is too thin to be a room of its kind (95th percentile of real rooms plus 30 %)

export const typeOf = (t) => (t === 'hall' ? HALL : ROOM_TYPES[t] || ROOM_TYPES.storage);

export const EXAMPLE_BRIEF = {
  rooms: [
    { id: 'bed', type: 'bedroom', area: 14 },
    { id: 'kid', type: 'child', area: 12 },
    { id: 'bath', type: 'bath', area: 4 },
    { id: 'study', type: 'study', area: 10 },
  ],
  links: [['bath', 'bed', 'near']],
};

/** Keep a brief inside sane ranges. */
export function sanitizeBrief(b = {}) {
  const used = new Set();
  const rooms = (Array.isArray(b.rooms) ? b.rooms : [])
    .slice(0, 8)
    .map((r, i) => {
      let id = String(r?.id || `r${i}`).slice(0, 16);
      if (used.has(id) || id === 'hall') id = `r${i}`;
      used.add(id);
      const type = ROOM_TYPES[r?.type] ? r.type : 'storage';
      const a = Number(r?.area);
      return { id, type, area: Number.isFinite(a) ? Math.min(40, Math.max(2, a)) : ROOM_TYPES[type].area };
    });
  const ids = new Set(rooms.map((r) => r.id));
  const links = (Array.isArray(b.links) ? b.links : [])
    .filter((l) => Array.isArray(l) && ids.has(l[0]) && ids.has(l[1]) && l[0] !== l[1])
    .map((l) => [l[0], l[1], l[2] === 'must' ? 'must' : 'near']);
  return { rooms, links };
}

// ---------------------------------------------------------------- geometry

const area = (r) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
const centre = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];

/** Shared wall of two rectangles: { len, mid:[x,y] } or null. */
export function sharedEdge(a, b) {
  const tol = 0.02;
  const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
  if (Math.abs(a[2] - b[0]) < tol || Math.abs(b[2] - a[0]) < tol) {
    const len = ov(a[1], a[3], b[1], b[3]);
    if (len > tol) { const x = Math.abs(a[2] - b[0]) < tol ? a[2] : a[0]; return { len, vertical: true, mid: [x, Math.max(a[1], b[1]) + len / 2] }; }
  }
  if (Math.abs(a[3] - b[1]) < tol || Math.abs(b[3] - a[1]) < tol) {
    const len = ov(a[0], a[2], b[0], b[2]);
    if (len > tol) { const y = Math.abs(a[3] - b[1]) < tol ? a[3] : a[1]; return { len, vertical: false, mid: [Math.max(a[0], b[0]) + len / 2, y] }; }
  }
  return null;
}

/** The share of a rectangle (0..1) where the roof is at least `h` high. */
export function shareAbove(room, r, h) {
  const g = getGrid(room, RES);
  const i0 = Math.max(0, Math.floor(r[0] / RES + EPS)), i1 = Math.min(g.nx, Math.ceil(r[2] / RES - EPS));
  const j0 = Math.max(0, Math.floor(r[1] / RES + EPS)), j1 = Math.min(g.ny, Math.ceil(r[3] / RES - EPS));
  let n = 0, hit = 0;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { n += 1; if (g.h[j * g.nx + i] >= h - EPS) hit += 1; }
  return n ? hit / n : 0;
}

/** Counted and gross area of a rectangle, by roof height (same rule as the furniture engine). */
const EDGE = 0.02; // a room edge or wall end within 2 cm of the footprint line is on it

/** The room as a person can use it: the layout rectangle minus the outer wall on a footprint edge and half a partition wall on every other edge (WALLS, shared/knowledge.js). */
export function netRect(room, r) {
  const { outer: to, inner: ti } = WALLS;
  return [r[0] + (r[0] <= EDGE ? to : ti / 2), r[1] + (r[1] <= EDGE ? to : ti / 2), r[2] - (r[2] >= room.width - EDGE ? to : ti / 2), r[3] - (r[3] >= room.depth - EDGE ? to : ti / 2)];
}

/** Where partition walls end on the outer wall: [{ side: 'N' | 'S' | 'W' | 'E', c }], c = position of the partition along that outer wall. */
export function junctions(room, rects) {
  const seen = new Set(), out = [];
  const add = (side, c) => { const k = side + c.toFixed(2); if (!seen.has(k)) { seen.add(k); out.push({ side, c }); } };
  for (const [x0, y0, x1, y1] of Object.values(rects)) {
    for (const x of [x0, x1]) if (x > EDGE && x < room.width - EDGE) { if (y0 <= EDGE) add('N', x); if (y1 >= room.depth - EDGE) add('S', x); }
    for (const y of [y0, y1]) if (y > EDGE && y < room.depth - EDGE) { if (x0 <= EDGE) add('W', y); if (x1 >= room.width - EDGE) add('E', y); }
  }
  return out;
}

/** The junctions that fall inside a window opening: the partition would end on the window. `clear` = extra distance kept from the opening, in metres. */
export function windowClashes(room, rects, clear = 0.05) {
  const half = WALLS.inner / 2 + clear;
  return junctions(room, rects).filter((j) => (room.windows || []).some((w) => w.wall === j.side && j.c + half > w.pos - w.width / 2 && j.c - half < w.pos + w.width / 2));
}

export function countedArea(room, r, rules = DEFAULT_RULES) {
  // each grid cell counts by its own height, weighted by how much of the cell lies inside the rectangle: walls that are not on the 10 cm grid
  // no longer move area from one room to its neighbour (found by comparing with Shapely, COMPAS, TopologicPy and IfcOpenShell)
  const g = getGrid(room, RES);
  const i0 = Math.max(0, Math.floor(r[0] / RES + EPS)), i1 = Math.min(g.nx, Math.ceil(r[2] / RES - EPS));
  const j0 = Math.max(0, Math.floor(r[1] / RES + EPS)), j1 = Math.min(g.ny, Math.ceil(r[3] / RES - EPS));
  const cover = (k, lo, hi) => Math.max(0, Math.min((k + 1) * RES, hi) - Math.max(k * RES, lo)) / RES;
  let counted = 0, gross = 0;
  for (let j = j0; j < j1; j++) {
    const wy = cover(j, r[1], r[3]);
    for (let i = i0; i < i1; i++) {
      const w = cover(i, r[0], r[2]) * wy, h = g.h[j * g.nx + i];
      gross += w;
      counted += w * (h >= rules.fullH - EPS ? 1 : h >= rules.halfH - EPS ? rules.halfFactor : 0);
    }
  }
  const cell = RES * RES;
  return { counted: counted * cell, gross: gross * cell };
}

// ---------------------------------------------------------------- slicing tree

function buildTree(ids, rng) {
  if (ids.length === 1) return { leaf: ids[0] };
  const k = 1 + Math.floor(rng() * (ids.length - 1));
  return { a: buildTree(ids.slice(0, k), rng), b: buildTree(ids.slice(k), rng), t: (rng() - 0.5) * 0.16, flip: rng() };
}

const leavesOf = (n, out = []) => { if (n.leaf !== undefined) out.push(n); else { leavesOf(n.a, out); leavesOf(n.b, out); } return out; };
const cutsOf = (n, out = []) => { if (n.leaf === undefined) { out.push(n); cutsOf(n.a, out); cutsOf(n.b, out); } return out; };
const cloneTree = (n) => (n.leaf !== undefined ? { ...n } : { ...n, a: cloneTree(n.a), b: cloneTree(n.b) });

function weight(n, target) { return n.leaf !== undefined ? target[n.leaf] : weight(n.a, target) + weight(n.b, target); }

/** Lay a tree out in a rectangle. `stair` is never crossed by a cut: the cut snaps to its edge. */
function layout(n, r, target, stair, out = {}) {
  if (n.leaf !== undefined) { out[n.leaf] = r; return out; }
  const wa = weight(n.a, target), wb = weight(n.b, target);
  const w = r[2] - r[0], d = r[3] - r[1];
  const along = (w >= d) === (n.flip >= 0.2); // cut across the longer side, most of the time
  const frac = Math.min(0.85, Math.max(0.15, wa / (wa + wb) + n.t));
  const lo = along ? r[0] : r[1], hi = along ? r[2] : r[3];
  let c = lo + frac * (hi - lo);
  if (stair) {
    const s0 = along ? stair[0] : stair[1], s1 = along ? stair[2] : stair[3];
    const o0 = along ? stair[1] : stair[0], o1 = along ? stair[3] : stair[2];
    const r0 = along ? r[1] : r[0], r1 = along ? r[3] : r[2];
    if (o0 < r1 && o1 > r0 && c > s0 && c < s1) {
      const near = c - s0 < s1 - c ? s0 : s1, far = near === s0 ? s1 : s0;
      c = near >= lo + 0.6 && near <= hi - 0.6 ? near : far;
    }
  }
  c = Math.min(hi - 0.6, Math.max(lo + 0.6, c));
  const ra = along ? [r[0], r[1], c, r[3]] : [r[0], r[1], r[2], c];
  const rb = along ? [c, r[1], r[2], r[3]] : [r[0], c, r[2], r[3]];
  layout(n.a, ra, target, stair, out);
  layout(n.b, rb, target, stair, out);
  return out;
}

// ---------------------------------------------------------------- scoring

const SEVERITY_ORDER = { warn: 0, info: 1 };

/** Score one layout (rects by id). Returns { score, parts, findings, routes, rooms }. */
export function scorePlan(room, brief, rects, opts = {}) {
  const rules = opts.rules || DEFAULT_RULES;
  const ids = ['hall', ...brief.rooms.map((r) => r.id)];
  const kind = Object.fromEntries([['hall', 'hall'], ...brief.rooms.map((r) => [r.id, r.type])]);
  const want = Object.fromEntries([['hall', HALL.area], ...brief.rooms.map((r) => [r.id, r.area])]);
  const label = (id) => (id === 'hall' ? 'Stair hall' : `${typeOf(kind[id]).label} (${id})`);
  const findings = [];
  const rooms = ids.map((id) => {
    const rect = rects[id], net = netRect(room, rect); // judged on the room between the walls, not on the rectangle that includes them
    const { counted, gross } = countedArea(room, net, rules);
    return { id, type: kind[id], rect, net, counted, gross, share: gross > 0 ? counted / gross : 0, w: net[2] - net[0], d: net[3] - net[1] };
  });

  // 1 area: counted against wanted
  let areaS = 0;
  for (const r of rooms) {
    const err = Math.abs(r.counted - want[r.id]) / want[r.id];
    areaS += Math.max(0, 1 - err);
    if (err > 0.3 && r.id !== 'hall') findings.push({ room: r.id, severity: 'warn', msg: `${label(r.id)}: ${r.counted.toFixed(1)} m² counted, wanted ${want[r.id].toFixed(0)} m².` });
  }
  areaS /= rooms.length;

  // 2 shape: not too narrow between the walls, not a corridor
  let shapeS = 0, narrowN = 0;
  for (const r of rooms) {
    const t = typeOf(r.type), lo = Math.min(r.w, r.d), hi = Math.max(r.w, r.d);
    const maxA = t.maxAspect || 2.5, ratio = hi / lo;
    const narrow = Math.min(1, lo / t.min), aspect = ratio <= maxA ? 1 : Math.max(0, 1 - (ratio - maxA) / maxA);
    shapeS += narrow * narrow * 0.6 + aspect * 0.4;
    if (ratio > maxA * THIN) narrowN += 1; // too thin for a room of its kind
    if (lo < t.min || (t.minArea && r.w * r.d < t.minArea)) narrowN += 1; // narrower than the rule, or smaller than the provisional minimum area (a planning rule of thumb), between the walls
    if (lo < t.min * 0.9) findings.push({ room: r.id, severity: 'warn', msg: `${label(r.id)} is only ${lo.toFixed(2)} m wide between the walls (rule of thumb: at least ${t.min} m).` });
    else if (ratio > maxA * THIN) findings.push({ room: r.id, severity: 'warn', msg: `${label(r.id)} is long and thin (${hi.toFixed(1)} × ${lo.toFixed(1)} m): 95 % of real rooms of its kind are at most ${maxA}:1.` });
  }
  shapeS /= rooms.length;

  // 3 headroom: enough of the room counts
  let headS = 0, headN = 0;
  for (const r of rooms) {
    const need = typeOf(r.type).share;
    if (need <= 0) continue;
    headN += 1;
    headS += Math.min(1, r.share / need);
    if (r.share < need * 0.8) findings.push({ room: r.id, severity: 'warn', msg: `${label(r.id)}: only ${Math.round(r.share * 100)} % of the floor is usable height.` });
  }
  headS = headN ? headS / headN : 1;

  // 4 access graph: doors are shared walls of at least 0.9 m
  const edge = (a, b) => { const e = sharedEdge(rects[a], rects[b]); return e && e.len >= 0.9 ? e : null; };
  const adj = Object.fromEntries(ids.map((a) => [a, ids.filter((b) => b !== a && edge(a, b))]));
  const dist = { hall: 0 }, parent = {}, queue = ['hall'];
  while (queue.length) {
    const a = queue.shift();
    for (const b of adj[a]) if (dist[b] === undefined) { dist[b] = dist[a] + 1; parent[b] = a; queue.push(b); }
  }
  let accessS = 0;
  const routes = {};
  // a door sits close to the end of its wall, away from the stair, so the open leaf lies against the wall (shared/doors.js)
  const sr = stairRect(room), away = sr ? [(sr[0] + sr[2]) / 2, (sr[1] + sr[3]) / 2] : null;
  const doors = Object.keys(parent).map((id) => {
    const e = edge(parent[id], id), width = Math.min(DOOR_WIDTH, e.len);
    return { a: parent[id], b: id, mid: placeDoor(e, rects[parent[id]], rects[id], width, away, boundsOf(rects)), vertical: e.vertical, width };
  });
  for (const r of rooms) {
    if (r.id === 'hall') continue;
    if (dist[r.id] === undefined) { findings.push({ room: r.id, severity: 'warn', msg: `${label(r.id)} cannot be reached from the stair.` }); continue; }
    const path = [r.id];
    while (parent[path[0]]) path.unshift(parent[path[0]]);
    const pts = [centre(rects.hall)];
    for (let i = 1; i < path.length; i++) pts.push(edge(path[i - 1], path[i]).mid, centre(rects[path[i]]));
    routes[r.id] = pts;
    const through = path.slice(1, -1).filter((p) => typeOf(kind[p]).sleep);
    let s = dist[r.id] === 1 ? 1 : dist[r.id] === 2 ? 0.7 : 0.4;
    if (through.length) { s *= 0.4; findings.push({ room: r.id, severity: 'warn', msg: `To reach ${label(r.id)} you walk through ${label(through[0])}.` }); }
    accessS += s;
  }
  accessS /= Math.max(1, rooms.length - 1);

  // 5 links asked for in the brief
  let linkS = 1;
  if (brief.links.length) {
    linkS = 0;
    for (const [a, b, strength] of brief.links) {
      const e = sharedEdge(rects[a], rects[b]);
      const ok = e && e.len >= (strength === 'must' ? 0.9 : 0.5);
      linkS += ok ? 1 : strength === 'must' ? 0 : 0.2;
      if (!ok) findings.push({ room: a, severity: strength === 'must' ? 'warn' : 'info', msg: `${label(a)} and ${label(b)} do not share a wall${strength === 'must' ? ' (required)' : ' (wanted)'}.` });
    }
    linkS /= brief.links.length;
  }

  // 6 daylight: a gable wall of at least 1 m, a dormer or a window on the room
  const gables = [[0, -0.05, room.width, 0.05], [0, room.depth - 0.05, room.width, room.depth + 0.05]];
  const lightRects = room.dormers.map((d) => dormerRect(room, d));
  let lightS = 0, lightN = 0;
  for (const r of rooms) {
    if (!typeOf(r.type).light) continue;
    lightN += 1;
    const ok = gables.some((g) => { const e = sharedEdge(r.rect, g); return e && e.len >= 1; })
      || lightRects.some((l) => l[0] < r.rect[2] && l[2] > r.rect[0] && l[1] < r.rect[3] && l[3] > r.rect[1]);
    lightS += ok ? 1 : 0;
    if (!ok) findings.push({ room: r.id, severity: 'warn', msg: `${label(r.id)} has no gable wall or dormer for daylight.` });
  }
  lightS = lightN ? lightS / lightN : 1;

  // 7 building code and layout graph (shared/knowledge.js): the height rule of a habitable attic room, wanted and unwelcome neighbours, doors that fight over a corner
  for (const r of rooms) {
    if (!typeOf(r.type).light) continue; // bedroom, child room, living room, kitchen, study
    const sh = shareAbove(room, r.net, LBO.atticHeight);
    if (sh < LBO.atticShare) findings.push({ room: r.id, severity: 'warn', rule: 'lbo-height', msg: `${label(r.id)}: only ${Math.round(sh * 100)} % of the floor is ${LBO.atticHeight.toFixed(2)} m or higher (typical attic rule: ${Math.round(LBO.atticShare * 100)} %; check the Landesbauordnung of your state).` });
  }
  const typed = (t) => ids.filter((id) => kind[id] === t);
  for (const rule of ADJACENCY) {
    const as = typed(rule.a), bs = typed(rule.b);
    if (!as.length || !bs.length) continue;
    if (rule.kind === 'want' && !as.some((x) => bs.some((y) => edge(x, y)))) findings.push({ room: as[0], severity: 'info', rule: 'adjacency', msg: `${label(as[0])} shares no wall with the ${typeOf(rule.b).label.toLowerCase()}: ${rule.why}` });
    if (rule.kind === 'avoid') for (const d of doors) if ((kind[d.a] === rule.a && kind[d.b] === rule.b) || (kind[d.a] === rule.b && kind[d.b] === rule.a)) findings.push({ room: d.b, severity: 'info', rule: 'adjacency', msg: `The door between ${label(d.a)} and ${label(d.b)}: ${rule.why}` });
  }
  for (const [i, j] of swingConflicts({ rooms, doors })) findings.push({ room: doors[j].b, severity: 'warn', rule: 'door-swing', msg: `The doors of ${label(doors[i].b)} and ${label(doors[j].b)} swing into the same corner.` });

  const parts = { area: areaS, shape: shapeS, headroom: headS, access: accessS, links: linkS, light: lightS };
  const W = { area: 0.22, shape: 0.18, headroom: 0.14, access: 0.18, links: 0.18, light: 0.1 };
  // a partition wall that ends on a window cannot be built as drawn: the opening would meet the wall
  const clashes = windowClashes(room, rects);
  for (const c of clashes) findings.push({ room: ids[0], severity: 'warn', rule: 'wall-window', msg: `A partition wall meets the ${c.side} wall at ${c.c.toFixed(2)} m, inside a window.` });
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const score = Math.max(0, Object.keys(W).reduce((s, k) => s + W[k] * parts[k], 0) - 0.03 * warns - 0.06 * narrowN - 0.08 * clashes.length);
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return { score, parts, findings, routes, doors, rooms, narrow: narrowN, clashes: clashes.length };
}

/** What the brief asks for against what the roof can give: counted m2 of the whole floor. */
export function capacity(room, briefIn, rules = DEFAULT_RULES) {
  const brief = sanitizeBrief(briefIn);
  const have = countedArea(room, [0, 0, room.width, room.depth], rules).counted;
  const need = brief.rooms.reduce((s, r) => s + r.area, 0) + HALL.area;
  return { need, have, ok: need <= have };
}

// ---------------------------------------------------------------- search

function place(room, brief, tree, target) {
  const stair = stairRect(room);
  const foot = [0, 0, room.width, room.depth];
  for (let k = 0; k < 4; k++) {
    const rects = layout(tree, foot, target, stair);
    if (!stair) return rects;
    const sc = centre(stair);
    const holder = Object.keys(rects).find((id) => rects[id][0] <= sc[0] && sc[0] <= rects[id][2] && rects[id][1] <= sc[1] && sc[1] <= rects[id][3]);
    const h = rects.hall;
    if (holder === 'hall') return h[0] <= stair[0] + EPS && h[1] <= stair[1] + EPS && h[2] >= stair[2] - EPS && h[3] >= stair[3] - EPS ? rects : null;
    const leaves = leavesOf(tree);
    const a = leaves.find((l) => l.leaf === 'hall'), b = leaves.find((l) => l.leaf === holder);
    if (!a || !b) return null;
    a.leaf = holder; b.leaf = 'hall';
  }
  return null;
}

/**
 * Generate layouts for a brief. Returns the best `keep` different plans, best first:
 * [{ score, parts, findings, routes, rooms }]. Seeded, so the same inputs give the same plans.
 */
/**
 * A partition wall that ends on a window is slid along the outer wall to the nearer edge of the window (plus the wall's half thickness and a clearance), all the rooms on that wall line
 * moving with it, as long as every room stays at least 0.8 m wide and the stair is not cut. Returns the plan scored again (the first one when nothing can be moved).
 */
function repairWindows(room, brief, cur, opts) {
  let rects = Object.fromEntries(cur.rooms.map((r) => [r.id, r.rect.slice()]));
  let res = cur;
  const st = stairRect(room);
  const half = WALLS.inner / 2 + 0.07;
  for (let it = 0; it < 6; it++) {
    const clash = windowClashes(room, rects)[0];
    if (!clash) break;
    const win = (room.windows || []).find((w) => w.wall === clash.side && clash.c + half > w.pos - w.width / 2 && clash.c - half < w.pos + w.width / 2);
    if (!win) break;
    const vertical = clash.side === 'N' || clash.side === 'S'; // the wall line runs along y at x = c (or along x at y = c)
    const [k0, k1] = vertical ? [0, 2] : [1, 3];
    const options = [win.pos - win.width / 2 - half, win.pos + win.width / 2 + half].sort((a, b) => Math.abs(a - clash.c) - Math.abs(b - clash.c));
    let moved = null;
    for (const c2 of options) {
      const next = {};
      let ok = true;
      for (const [id, r] of Object.entries(rects)) {
        const n = r.slice();
        for (const k of [k0, k1]) if (Math.abs(n[k] - clash.c) < 0.011) n[k] = c2;
        if (n[2] - n[0] < 0.8 || n[3] - n[1] < 0.8) ok = false;
        if (st && id !== 'hall' && n[0] < st[2] - EPS && st[0] < n[2] - EPS && n[1] < st[3] - EPS && st[1] < n[3] - EPS) ok = false; // never through the stair
        next[id] = n;
      }
      if (ok) { moved = next; break; }
    }
    if (!moved) break;
    rects = moved;
    res = scorePlan(room, brief, rects, opts);
  }
  return res;
}

/** Sort order of the generator: a layout with no room too small and no wall on a window comes first; among equals the better score. */
const byValidity = (a, b) => (a.narrow > 0 || a.clashes > 0) - (b.narrow > 0 || b.clashes > 0) || b.score - a.score;

// what is dropped first when even the minimum areas do not fit the roof: the least important rooms
const DROP_ORDER = ['storage', 'study', 'wc', 'child', 'kitchen', 'living', 'bath', 'bedroom'];

/**
 * A brief that asks for more than the roof gives is made to fit, so the plan is functional and not only drawn: the wanted areas are scaled down towards the minimum areas of their types; if even
 * the minima do not fit, the least important rooms are dropped one by one. Returns { brief, notes }: a plain sentence for every change, shown to the user. opts.fit === false skips it.
 */
export function fitToRoof(room, briefIn, slack = 0.9) {
  const brief = sanitizeBrief(briefIn);
  const notes = [];
  const have = capacity(room, brief).have;
  const budget = have * slack - HALL.area; // what is left for the rooms: walls, circulation and the hall take the rest
  const minOf = (r) => typeOf(r.type).minArea || 2;
  let rooms = brief.rooms.map((r) => ({ ...r }));
  let links = brief.links;
  while (rooms.length > 1 && rooms.reduce((s, r) => s + minOf(r), 0) > budget) {
    let k = -1, best = 99;
    rooms.forEach((r, i) => { const rank = DROP_ORDER.indexOf(r.type); if (k < 0 || rank < best || (rank === best && r.area < rooms[k].area)) { best = rank; k = i; } });
    const id = rooms[k].id;
    notes.push(`${typeOf(rooms[k].type).label} left out: the roof gives only ${have.toFixed(0)} m² of usable floor.`);
    rooms.splice(k, 1);
    links = links.filter((l) => l[0] !== id && l[1] !== id);
  }
  const want = rooms.reduce((s, r) => s + r.area, 0);
  if (want > budget) {
    const floor = rooms.reduce((s, r) => s + minOf(r), 0), spare = Math.max(1e-9, want - floor);
    const k = Math.max(0, Math.min(1, (budget - floor) / spare));
    rooms = rooms.map((r) => ({ ...r, area: +(minOf(r) + Math.max(0, r.area - minOf(r)) * k).toFixed(1) }));
    notes.push(`The wanted ${want.toFixed(0)} m² were scaled down to ${Math.max(budget, floor).toFixed(0)} m² to fit the roof.`);
  }
  return { brief: { ...brief, rooms, links }, notes };
}

export function generatePlans(room, briefIn, opts = {}) {
  const fit = opts.fit === false ? { brief: sanitizeBrief(briefIn), notes: [] } : fitToRoof(room, briefIn, opts.slack);
  const brief = fit.brief;
  if (!brief.rooms.length) return [];
  const { seed = 1, tries = 300, keep = 3, refine = 40 } = opts;
  const rng = mulberry32(seed);
  const target = { hall: Math.max(HALL.area, (stairRect(room) ? area(stairRect(room)) : 0) + 1.5) };
  for (const r of brief.rooms) target[r.id] = r.area / 0.8; // gross a little above counted
  const ids = ['hall', ...brief.rooms.map((r) => r.id)];
  const pool = [];
  const sample = (n) => {
    for (let i = 0; i < n; i++) {
      const order = [...ids].sort(() => rng() - 0.5);
      const tree = buildTree(order, rng);
      const rects = place(room, brief, tree, target);
      if (!rects) continue;
      pool.push({ tree, ...scorePlan(room, brief, rects, opts) });
    }
  };
  sample(tries);
  // no layout without a too-small room or a wall on a window yet: look harder before giving up (a brief that cannot fit stays flagged: the findings say which room)
  if (!pool.some((p) => !(p.narrow > 0 || p.clashes > 0))) sample(opts.hardTries ?? tries * 4);
  pool.sort(byValidity);
  const best = pool.slice(0, Math.max(keep * 4, 8));
  for (let k = 0; k < best.length; k++) {
    let cur = best[k];
    // a layout that still has a room too small or a wall on a window keeps being nudged, up to six times as long: a valid one is worth the time
    for (let i = 0; i < refine * ((cur.narrow > 0 || cur.clashes > 0) ? 6 : 1); i++) {
      if (i >= refine && !(cur.narrow > 0 || cur.clashes > 0)) break;
      const tree = cloneTree(cur.tree);
      const cuts = cutsOf(tree);
      if (!cuts.length) break;
      const cut = cuts[Math.floor(rng() * cuts.length)];
      cut.t += (rng() - 0.5) * 0.14;
      const rects = place(room, brief, tree, target);
      if (!rects) continue;
      const next = { tree, ...scorePlan(room, brief, rects, opts) };
      if (byValidity(next, cur) < 0) cur = next;
    }
    const fixed = repairWindows(room, brief, cur, opts);
    best[k] = byValidity(fixed, cur) < 0 ? fixed : cur;
  }
  best.sort(byValidity);
  const out = [];
  const sig = (p) => p.rooms.map((r) => centre(r.rect).map((v) => Math.round(v)).join(',')).join('|');
  const seen = new Set();
  for (const p of best) {
    const s = sig(p);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(p);
    if (out.length >= keep) break;
  }
  const bad = (p) => p.narrow > 0 || p.clashes > 0;
  const kept = out.some((p) => !bad(p)) ? out.filter((p) => !bad(p)) : out; // when a functional layout exists, the ones that are not are not offered
  const result = kept.map(({ tree, ...rest }) => ({ ...rest, adjusted: fit.notes })); // eslint-disable-line no-unused-vars
  // still a room too small or a wall on a window after the whole search: a functional plan with a little less is better than a drawn one that is not. First every wanted area 15 % smaller,
  // then the least important room left out, at most three steps; the plan says what was changed. The first valid layout wins; if none is found the best effort stays, with its warnings.
  const depth = opts._depth || 0;
  if (result.length && bad(result[0]) && depth < 3 && opts.degrade !== false) {
    const smaller = { ...brief, rooms: brief.rooms.map((r) => ({ ...r, area: Math.max(typeOf(r.type).minArea || 2, +(r.area * 0.85).toFixed(1)) })) };
    const note = `Every wanted area was reduced by 15 % to get a layout whose rooms are big enough.`;
    let next = smaller, notes = [note];
    if (depth >= 1 || JSON.stringify(smaller.rooms) === JSON.stringify(brief.rooms)) { // the areas are at their minimum already, or this is not the first step: leave the least important room out
      let k = -1, best = 99;
      brief.rooms.forEach((r, i) => { const rank = DROP_ORDER.indexOf(r.type); if (k < 0 || rank < best || (rank === best && r.area < brief.rooms[k].area)) { best = rank; k = i; } });
      if (brief.rooms.length > 1) {
        const id = brief.rooms[k].id;
        next = { ...brief, rooms: brief.rooms.filter((_, i) => i !== k), links: brief.links.filter((l) => l[0] !== id && l[1] !== id) };
        notes = [`${typeOf(brief.rooms[k].type).label} left out: no layout with all the rooms had rooms big enough.`];
      }
    }
    const again = generatePlans(room, next, { ...opts, fit: false, _depth: depth + 1 });
    if (again.length && !bad(again[0])) return again.map((p) => ({ ...p, adjusted: [...fit.notes, ...notes, ...(p.adjusted || [])] }));
  }
  return result;
}

/** Score a layout drawn by hand: `rects` has a rectangle for the hall and for every room of the brief. Returns null until all are placed. */
export function planFromRects(room, briefIn, rects, opts = {}) {
  const brief = sanitizeBrief(briefIn);
  if (!rects.hall || brief.rooms.some((r) => !rects[r.id])) return null;
  return scorePlan(room, brief, rects, opts);
}

/** The fixed hall around the stair opening that the puzzle starts with: the stair plus a landing. */
export function hallRect(room) {
  const s = stairRect(room);
  if (!s) return [0, 0, Math.min(1.6, room.width), Math.min(2, room.depth)];
  return [Math.max(0, s[0] - 0.5), Math.max(0, s[1]), Math.min(room.width, s[2] + 0.5), Math.min(room.depth, s[3] + 1)];
}
