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

const EPS = 1e-6;
const RES = 0.1;

// min = narrowest clear width (m), area = default counted area (m2), share = needed counted/gross share, light = needs daylight, sleep = a pass-through is unwelcome
export const ROOM_TYPES = {
  bedroom: { label: 'Bedroom', min: 2.4, area: 12, share: 0.6, light: true, sleep: true },
  child: { label: 'Child room', min: 2.4, area: 10, share: 0.6, light: true, sleep: true },
  living: { label: 'Living room', min: 3.0, area: 18, share: 0.6, light: true, sleep: false },
  kitchen: { label: 'Kitchen', min: 2.2, area: 9, share: 0.6, light: true, sleep: false },
  study: { label: 'Study', min: 2.0, area: 8, share: 0.55, light: true, sleep: false },
  bath: { label: 'Bathroom', min: 1.5, area: 5, share: 0.5, light: false, sleep: false },
  wc: { label: 'WC', min: 0.9, area: 2.5, share: 0.5, light: false, sleep: false },
  storage: { label: 'Storage', min: 1.2, area: 4, share: 0, light: false, sleep: false },
};
export const HALL = { label: 'Stair hall', min: 1.2, area: 4, share: 0.4, light: false, sleep: false };

export const typeOf = (t) => (t === 'hall' ? HALL : ROOM_TYPES[t] || ROOM_TYPES.storage);

export const EXAMPLE_BRIEF = {
  rooms: [
    { id: 'bed', type: 'bedroom', area: 8 },
    { id: 'kid', type: 'child', area: 5 },
    { id: 'bath', type: 'bath', area: 3 },
    { id: 'study', type: 'study', area: 4 },
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

/** Counted and gross area of a rectangle, by roof height (same rule as the furniture engine). */
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
    const rect = rects[id];
    const { counted, gross } = countedArea(room, rect, rules);
    return { id, type: kind[id], rect, counted, gross, share: gross > 0 ? counted / gross : 0, w: rect[2] - rect[0], d: rect[3] - rect[1] };
  });

  // 1 area: counted against wanted
  let areaS = 0;
  for (const r of rooms) {
    const err = Math.abs(r.counted - want[r.id]) / want[r.id];
    areaS += Math.max(0, 1 - err);
    if (err > 0.3 && r.id !== 'hall') findings.push({ room: r.id, severity: 'warn', msg: `${label(r.id)}: ${r.counted.toFixed(1)} m² counted, wanted ${want[r.id].toFixed(0)} m².` });
  }
  areaS /= rooms.length;

  // 2 shape: not too narrow, not a corridor
  let shapeS = 0;
  for (const r of rooms) {
    const t = typeOf(r.type), lo = Math.min(r.w, r.d), hi = Math.max(r.w, r.d);
    const narrow = Math.min(1, lo / t.min), aspect = hi / lo <= 2.5 ? 1 : Math.max(0, 1 - (hi / lo - 2.5) / 2.5);
    shapeS += narrow * narrow * 0.6 + aspect * 0.4;
    if (lo < t.min * 0.9) findings.push({ room: r.id, severity: 'warn', msg: `${label(r.id)} is only ${lo.toFixed(2)} m wide (rule of thumb: at least ${t.min} m).` });
    else if (hi / lo > 3) findings.push({ room: r.id, severity: 'info', msg: `${label(r.id)} is long and thin (${hi.toFixed(1)} × ${lo.toFixed(1)} m).` });
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
  const doors = Object.keys(parent).map((id) => { const e = edge(parent[id], id); return { a: parent[id], b: id, mid: e.mid, vertical: e.vertical, width: Math.min(0.9, e.len) }; });
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

  const parts = { area: areaS, shape: shapeS, headroom: headS, access: accessS, links: linkS, light: lightS };
  const W = { area: 0.22, shape: 0.18, headroom: 0.14, access: 0.18, links: 0.18, light: 0.1 };
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const score = Math.max(0, Object.keys(W).reduce((s, k) => s + W[k] * parts[k], 0) - 0.03 * warns);
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return { score, parts, findings, routes, doors, rooms };
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
export function generatePlans(room, briefIn, opts = {}) {
  const brief = sanitizeBrief(briefIn);
  if (!brief.rooms.length) return [];
  const { seed = 1, tries = 300, keep = 3, refine = 40 } = opts;
  const rng = mulberry32(seed);
  const target = { hall: Math.max(HALL.area, (stairRect(room) ? area(stairRect(room)) : 0) + 1.5) };
  for (const r of brief.rooms) target[r.id] = r.area / 0.8; // gross a little above counted
  const ids = ['hall', ...brief.rooms.map((r) => r.id)];
  const pool = [];
  for (let i = 0; i < tries; i++) {
    const order = [...ids].sort(() => rng() - 0.5);
    const tree = buildTree(order, rng);
    const rects = place(room, brief, tree, target);
    if (!rects) continue;
    pool.push({ tree, ...scorePlan(room, brief, rects, opts) });
  }
  pool.sort((a, b) => b.score - a.score);
  const best = pool.slice(0, Math.max(keep * 4, 8));
  for (let k = 0; k < best.length; k++) {
    let cur = best[k];
    for (let i = 0; i < refine; i++) {
      const tree = cloneTree(cur.tree);
      const cuts = cutsOf(tree);
      if (!cuts.length) break;
      const cut = cuts[Math.floor(rng() * cuts.length)];
      cut.t += (rng() - 0.5) * 0.14;
      const rects = place(room, brief, tree, target);
      if (!rects) continue;
      const next = { tree, ...scorePlan(room, brief, rects, opts) };
      if (next.score > cur.score) cur = next;
    }
    best[k] = cur;
  }
  best.sort((a, b) => b.score - a.score);
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
  return out.map(({ tree, ...rest }) => rest); // eslint-disable-line no-unused-vars
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
