// Evaluation engine: usable height of a roof storey + furniture fit.
// Pure JS, no dependencies, runs identically in the browser (live feedback) and in Node (API, tests).
//
// Plan coordinates: x to the right, y downwards, metres. Room = [0,W] x [0,D].
// Gable roof, ridge parallel to y at x = W/2, eaves (knee walls) on x = 0 and x = W.
import { CATALOG } from './catalog.js';
import { defOf, resolveDormer, DORMER_DEFAULTS, DORMER_FIELDS } from './params.js';

import { meshHeight, sanitizeMesh } from './roofMesh.js';
const EPS = 1e-6;

export const DEFAULT_RULES = {
  fullH: 2.0, // floor with >= this height counts 100 %   (WoFlV-style area counting)
  halfH: 1.0, // floor with >= this height counts 50 %, below it 0 %
  halfFactor: 0.5,
  walkH: 1.9, // height needed to walk upright
  passage: 0.6, // minimum clear passage width
  fitTolerance: 0.9, // share of a clearance zone that must be usable -> "ok"
  warnTolerance: 0.6, // ... -> "warn", below that "fail"
  fullStorey: { height: 2.3, share: 2 / 3 }, // placeholder - differs per building code, configurable
  weights: { furnish: 0.4, usable: 0.3, circulation: 0.3 },
};

export const DEFAULT_ROOM = {
  width: 8.0, // a human-sized attic: ridge 5 m above the attic floor (1.0 m knee wall + 45 degrees over half the width)
  depth: 10.0,
  kneeWall: 1.0,
  pitch: 45,
  maxHeight: 5.5, // flat collar-tie ceiling, above the ridge so it does not clip the sample roof
  dormerDefaults: { ...DORMER_DEFAULTS }, // inherited by every dormer that does not set its own value
  dormers: [{ side: 'left', center: 5 }],
  stair: { x: 3.55, y: 0.3, w: 0.9, d: 2.4 },
  doors: [],
  windows: [{ wall: 'N', pos: 4, width: 1.2 }, { wall: 'S', pos: 4, width: 1.2 }],
};

// where the back of a piece may stand: against the slope side (x = 0 / W), a gable wall (y = 0 / D), any wall, or free-standing
export const BACK_TO = ['slope', 'gable', 'wall', 'free'];

const clamp = (v, lo, hi, dflt) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : dflt);

export function sanitizeRoom(r = {}) {
  const D = DEFAULT_ROOM;
  const width = clamp(r.width, 2, 12, D.width);
  const depth = clamp(r.depth, 2, 14, D.depth);
  const wall = (w) => (['N', 'S', 'E', 'W'].includes(w) ? w : 'N');
  const roof = sanitizeMesh(r.roof, width, depth); // an edited roof mesh, if any
  return {
    ...(roof ? { roof } : {}),
    width,
    depth,
    kneeWall: clamp(r.kneeWall, 0, 2.5, D.kneeWall),
    pitch: clamp(r.pitch, 5, 75, D.pitch),
    maxHeight: clamp(r.maxHeight, 1, 6, D.maxHeight),
    dormerDefaults: {
      width: clamp(r.dormerDefaults?.width, 0.5, depth, DORMER_DEFAULTS.width),
      depth: clamp(r.dormerDefaults?.depth, 0.3, width, DORMER_DEFAULTS.depth),
      height: clamp(r.dormerDefaults?.height, 1, 6, DORMER_DEFAULTS.height),
    },
    // dormers keep only the values they override; the rest is inherited (see params.js)
    dormers: (Array.isArray(r.dormers) ? r.dormers : []).slice(0, 6).map((d) => {
      const o = { side: d.side === 'right' ? 'right' : 'left', center: clamp(d.center, 0, depth, depth / 2) };
      const lim = { width: [0.5, depth], depth: [0.3, width], height: [1, 6] };
      for (const k of DORMER_FIELDS) if (d[k] !== undefined && d[k] !== null && Number.isFinite(+d[k])) o[k] = clamp(d[k], ...lim[k], DORMER_DEFAULTS[k]);
      return o;
    }),
    stair: r.stair
      ? { x: clamp(r.stair.x, 0, width, 2), y: clamp(r.stair.y, 0, depth, 0.2), w: clamp(r.stair.w, 0.5, 3, 0.9), d: clamp(r.stair.d, 0.5, 5, 2) }
      : null,
    doors: (Array.isArray(r.doors) ? r.doors : []).slice(0, 6).map((d) => ({ wall: wall(d.wall), pos: clamp(d.pos, 0, 14, 1), width: clamp(d.width, 0.6, 1.5, 0.9) })),
    windows: (Array.isArray(r.windows) ? r.windows : []).slice(0, 8).map((d) => ({ wall: wall(d.wall), pos: clamp(d.pos, 0, 14, 1), width: clamp(d.width, 0.4, 4, 1) })),
  };
}

export function sanitizeItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && CATALOG[it.type])
    .slice(0, 40)
    .map((it, i) => {
      const out = {
        id: String(it.id ?? `i${i}`).slice(0, 40),
        type: it.type,
        x: clamp(it.x, -20, 40, 0),
        y: clamp(it.y, -20, 40, 0),
        rot: [0, 1, 2, 3].includes(it.rot) ? it.rot : 0,
        placed: !!it.placed,
      };
      if (it.product && typeof it.product === 'object') {
        const p = it.product;
        const dim = (v) => (Number.isFinite(+v) && +v > 0.05 && +v < 6 ? +(+v).toFixed(3) : undefined);
        out.product = {
          id: p.id != null ? String(p.id).slice(0, 40) : undefined,
          name: String(p.name || '').slice(0, 120),
          name_de: p.name_de ? String(p.name_de).slice(0, 120) : undefined,
          name_en: p.name_en ? String(p.name_en).slice(0, 120) : undefined,
          brand: String(p.brand || '').slice(0, 60),
          url: /^https?:\/\//.test(p.url) ? String(p.url).slice(0, 500) : undefined,
          image: /^https?:\/\//.test(p.image) ? String(p.image).slice(0, 500) : undefined,
          w: dim(p.w), d: dim(p.d), h: dim(p.h),
        };
      }
      if (it.spec && typeof it.spec === 'object') {
        // pattern anchor chosen in the design tree (shared/patterns.js); unknown values are dropped
        const spec = {};
        if (BACK_TO.includes(it.spec.backTo)) spec.backTo = it.spec.backTo;
        if (it.spec.near === 'light') spec.near = 'light';
        if (Array.isArray(it.spec.within) && it.spec.within.length === 4 && it.spec.within.every(Number.isFinite)) spec.within = it.spec.within.map((v) => +(+v).toFixed(3));
        if (typeof it.spec.room === 'string') spec.room = it.spec.room.slice(0, 16);
        if (Object.keys(spec).length) out.spec = spec;
      }
      if (it.overrides && typeof it.overrides === 'object') {
        const o = {};
        for (const k of ['w', 'd', 'h', 'bodyH', 'useH', 'front', 'back', 'side'])
          if (it.overrides[k] !== undefined && Number.isFinite(+it.overrides[k])) o[k] = clamp(it.overrides[k], 0, 6, 0);
        if (Object.keys(o).length) out.overrides = o;
      }
      return out;
    });
}

// ---------------------------------------------------------------- geometry

function rotPt(px, py, rot) {
  switch (rot) {
    case 0: return [px, py];
    case 1: return [-py, px];
    case 2: return [-px, -py];
    default: return [py, -px];
  }
}

export const FRONT = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // direction the front faces, per rotation (clockwise)

export function bodySize(def, rot) {
  return rot % 2 ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
}

/** Absolute rectangles [x0,y0,x1,y1] of body + clearance zones for a placed item. */
export function itemRects(def, item) {
  const { w, d } = def;
  const c = def.clear || {};
  const local = { body: [0, 0, w, d] };
  if (c.front > 0) local.front = [0, d, w, d + c.front];
  if (c.back > 0) local.back = [0, -c.back, w, 0];
  if (c.side > 0) {
    local.sideA = [-c.side, 0, 0, d];
    local.sideB = [w, 0, w + c.side, d];
  }
  const rot = item.rot || 0;
  const [sx, sy] = [[0, 0], [d, 0], [w, d], [0, w]][rot];
  const out = {};
  for (const [k, r] of Object.entries(local)) {
    const a = rotPt(r[0], r[1], rot);
    const b = rotPt(r[2], r[3], rot);
    out[k] = [
      Math.min(a[0], b[0]) + sx + item.x,
      Math.min(a[1], b[1]) + sy + item.y,
      Math.max(a[0], b[0]) + sx + item.x,
      Math.max(a[1], b[1]) + sy + item.y,
    ];
  }
  return out;
}

export function dormerRect(room, dormer) {
  const d = resolveDormer(room, dormer);
  const x0 = d.side === 'left' ? 0 : room.width - d.depth;
  return [x0, d.center - d.width / 2, x0 + d.depth, d.center + d.width / 2];
}

export function doorRect(room, d) {
  const { width: W, depth: D } = room;
  const h = d.width / 2;
  switch (d.wall) {
    case 'N': return [d.pos - h, 0, d.pos + h, d.width];
    case 'S': return [d.pos - h, D - d.width, d.pos + h, D];
    case 'W': return [0, d.pos - h, d.width, d.pos + h];
    default: return [W - d.width, d.pos - h, W, d.pos + h];
  }
}

export function windowRect(room, d) {
  const { width: W, depth: D } = room;
  const h = d.width / 2;
  const t = 0.3; // strip in front of the window that tall furniture must not block
  switch (d.wall) {
    case 'N': return [d.pos - h, 0, d.pos + h, t];
    case 'S': return [d.pos - h, D - t, d.pos + h, D];
    case 'W': return [0, d.pos - h, t, d.pos + h];
    default: return [W - t, d.pos - h, W, d.pos + h];
  }
}

export function stairRect(room) {
  const s = room.stair;
  return s ? [s.x, s.y, s.x + s.w, s.y + s.d] : null;
}

/** Roof height at (x, y) - analytic, used for the section view and tests. */
export function roofHeight(room, x, y) {
  const tan = Math.tan((room.pitch * Math.PI) / 180);
  let hh = room.roof ? meshHeight(room.roof, x, y) : room.kneeWall + tan * Math.min(x, room.width - x); // a sculpted roof mesh overrides the pitch
  for (const d of room.dormers) {
    const r = dormerRect(room, d);
    if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) hh = Math.max(hh, resolveDormer(room, d).height);
  }
  return Math.min(hh, room.maxHeight);
}

export function cellRange(r, res) {
  return [
    Math.ceil(r[0] / res - 0.5 - EPS),
    Math.floor(r[2] / res - 0.5 + EPS),
    Math.ceil(r[1] / res - 0.5 - EPS),
    Math.floor(r[3] / res - 0.5 + EPS),
  ];
}

function markRect(arr, g, r) {
  const [i0, i1, j0, j1] = cellRange(r, g.res);
  for (let j = Math.max(0, j0); j <= Math.min(g.ny - 1, j1); j++)
    for (let i = Math.max(0, i0); i <= Math.min(g.nx - 1, i1); i++) arr[j * g.nx + i] = 1;
}

// ---------------------------------------------------------------- grid

const gridCache = new Map();

export function buildGrid(room, res = 0.05) {
  const nx = Math.round(room.width / res);
  const ny = Math.round(room.depth / res);
  const n = nx * ny;
  const g = { nx, ny, res, h: new Float32Array(n), stair: new Uint8Array(n), door: new Uint8Array(n), win: new Uint8Array(n) };
  const tan = Math.tan((room.pitch * Math.PI) / 180);
  const dorms = room.dormers.map((d) => ({ r: dormerRect(room, d), h: resolveDormer(room, d).height }));
  const custom = room.roof || null;
  for (let j = 0; j < ny; j++) {
    const y = (j + 0.5) * res;
    for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * res;
      let hh = custom ? meshHeight(custom, x, y) : room.kneeWall + tan * Math.min(x, room.width - x);
      for (const d of dorms) if (x >= d.r[0] && x <= d.r[2] && y >= d.r[1] && y <= d.r[3]) hh = Math.max(hh, d.h);
      g.h[j * nx + i] = Math.min(hh, room.maxHeight);
    }
  }
  const sr = stairRect(room);
  if (sr) markRect(g.stair, g, sr);
  for (const d of room.doors) markRect(g.door, g, doorRect(room, d));
  for (const r of room.swings || []) markRect(g.door, g, r); // the swing of the doors of a layout (shared/doors.js): kept free of furniture
  for (const d of room.windows) markRect(g.win, g, windowRect(room, d));
  return g;
}

export function getGrid(room, res = 0.05) {
  const key = res + JSON.stringify(room);
  let g = gridCache.get(key);
  if (!g) {
    g = buildGrid(room, res);
    gridCache.set(key, g);
    if (gridCache.size > 6) gridCache.delete(gridCache.keys().next().value);
  }
  return g;
}

// ---------------------------------------------------------------- per-item check

const pct = (a, b) => Math.round((100 * a) / Math.max(1, b));

/** The part of a body rectangle [x0,y0,x1,y1] that lies at its back (the side the rotation turns away from the front), `len` metres deep. */
export function headStrip(b, rot, len) {
  switch (rot) {
    case 0: return [b[0], b[1], b[2], Math.min(b[3], b[1] + len)];
    case 1: return [Math.max(b[0], b[2] - len), b[1], b[2], b[3]];
    case 2: return [b[0], Math.max(b[1], b[3] - len), b[2], b[3]];
    default: return [b[0], b[1], Math.min(b[2], b[0] + len), b[3]];
  }
}

function evalOne(g, occ, selfMarked, def, item, rules, wantAccess) {
  const rects = itemRects(def, item);
  const { nx, ny, res, h, stair, door, win } = g;
  const occLimit = selfMarked ? 1 : 0; // occ > occLimit  => someone else is there too
  const issues = [];

  const [i0, i1, j0, j1] = cellRange(rects.body, res);
  const total = Math.max(0, (i1 - i0 + 1) * (j1 - j0 + 1));
  let out = 0, low = 0, st = 0, dr = 0, wn = 0, ov = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (i < 0 || j < 0 || i >= nx || j >= ny) { out++; continue; }
      const k = j * nx + i;
      if (h[k] < def.bodyH - EPS) low++;
      if (stair[k]) st++;
      if (door[k]) dr++;
      if (win[k] && def.h > 0.9) wn++;
      if (occ[k] > occLimit) ov++;
    }
  }
  if (out) issues.push({ code: 'outside', msg: 'Sticks out of the room' });
  if (low) issues.push({ code: 'headroom', msg: `Roof too low over ${pct(low, total)}% of it (needs ${def.bodyH.toFixed(2)} m)` });
  if (def.headH > 0 && def.headLen > 0) { // a person sits up at the head end of a bed (the back of the piece): the whole width of it needs the height, not just most of it
    const [hi0, hi1, hj0, hj1] = cellRange(headStrip(rects.body, item.rot || 0, def.headLen), res);
    let tooLow = 0;
    for (let j = hj0; j <= hj1; j++) for (let i = hi0; i <= hi1; i++) if (i >= 0 && j >= 0 && i < nx && j < ny && h[j * nx + i] < def.headH - EPS) tooLow++;
    if (tooLow) issues.push({ code: 'head', msg: `Too low to sit up: the head end needs ${def.headH.toFixed(2)} m over its first ${def.headLen.toFixed(1)} m` });
  }
  if (st) issues.push({ code: 'stair', msg: 'Blocks the stair opening' });
  if (dr) issues.push({ code: 'door', msg: 'Blocks a door swing' });
  if (wn) issues.push({ code: 'window', msg: 'Blocks a window' });
  if (ov) issues.push({ code: 'overlap', msg: 'Overlaps other furniture' });
  const hard = issues.length > 0;

  const zones = {};
  const access = wantAccess ? [] : null;
  let limiting = null;
  if (!hard || wantAccess) {
    for (const name of ['front', 'back', 'sideA', 'sideB']) {
      const r = rects[name];
      if (!r) continue;
      const [a0, a1, b0, b1] = cellRange(r, res);
      const zt = Math.max(1, (a1 - a0 + 1) * (b1 - b0 + 1));
      let ok = 0;
      for (let j = b0; j <= b1; j++) {
        for (let i = a0; i <= a1; i++) {
          if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
          const k = j * nx + i;
          if (occ[k] === 0 && !stair[k] && h[k] >= def.useH - EPS) {
            ok++;
            if (access) access.push(k);
          }
        }
      }
      zones[name] = ok / zt;
    }
  }
  const c = def.clear || {};
  const parts = [];
  if (c.front > 0) parts.push(['front', zones.front ?? 0]);
  if (c.back > 0) parts.push(['back', zones.back ?? 0]);
  if (c.side > 0) {
    const a = zones.sideA ?? 0, b = zones.sideB ?? 0;
    parts.push(['side', c.sideRule === 'both' ? Math.min(a, b) : Math.max(a, b)]);
  }
  let ratio = 1;
  for (const [n, v] of parts) if (v < ratio) { ratio = v; limiting = n; }

  let status;
  if (hard) status = 'fail';
  else if (ratio >= rules.fitTolerance) status = 'ok';
  else if (ratio >= rules.warnTolerance) status = 'warn';
  else status = 'fail';
  if (!hard && ratio < rules.fitTolerance) {
    issues.push({ code: 'clearance', msg: `Only ${pct(ratio, 1)}% of the ${limiting} clearance (${(c[limiting] ?? c.side).toFixed(1)} m, ${def.useH.toFixed(1)} m high) is usable` });
  }
  return { status, ratio, zones, issues, rects, access, hard };
}

// ---------------------------------------------------------------- summed-area helpers

function sat(nx, ny, f) {
  const w = nx + 1;
  const s = new Int32Array(w * (ny + 1));
  for (let j = 0; j < ny; j++) {
    let row = 0;
    for (let i = 0; i < nx; i++) {
      row += f(j * nx + i) ? 1 : 0;
      s[(j + 1) * w + i + 1] = s[j * w + i + 1] + row;
    }
  }
  return s;
}

function winSum(s, nx, ny, i0, j0, i1, j1) {
  i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(nx - 1, i1); j1 = Math.min(ny - 1, j1);
  if (i1 < i0 || j1 < j0) return 0;
  const w = nx + 1;
  return s[(j1 + 1) * w + i1 + 1] - s[j0 * w + i1 + 1] - s[(j1 + 1) * w + i0] + s[j0 * w + i0];
}

// ---------------------------------------------------------------- full evaluation

export function evaluate(room, items, opts = {}) {
  const rules = { ...DEFAULT_RULES, ...(opts.rules || {}) };
  const res = opts.res ?? 0.05;
  const g = getGrid(room, res);
  const { nx, ny, h, stair } = g;
  const n = nx * ny;
  const occ = new Uint8Array(n);

  for (const it of items) {
    const def = CATALOG[it.type] ? defOf(it) : null;
    if (!it.placed || !def) continue;
    const [i0, i1, j0, j1] = cellRange(itemRects(def, it).body, res);
    for (let j = Math.max(0, j0); j <= Math.min(ny - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) occ[j * nx + i]++;
  }

  // per-item geometry checks
  const per = items.map((it) => {
    const def = CATALOG[it.type] ? defOf(it) : null;
    if (!def) return { id: it.id, status: 'fail', ratio: 0, zones: {}, issues: [{ code: 'type', msg: 'Unknown furniture type' }], reachable: false };
    if (!it.placed) return { id: it.id, status: 'unplaced', ratio: 0, zones: {}, issues: [{ code: 'unplaced', msg: 'Not placed' }], reachable: false };
    return { id: it.id, ...evalOne(g, occ, true, def, it, rules, true) };
  });

  // circulation: walkable cells, eroded by half the passage width, flood-filled from the entries
  const rr = Math.max(1, Math.round(rules.passage / 2 / res));
  const blocked = (k) => h[k] < rules.walkH - EPS || occ[k] > 0 || stair[k] === 1;
  const sBlocked = sat(nx, ny, blocked);
  const E = new Uint8Array(n);
  for (let j = rr; j < ny - rr; j++)
    for (let i = rr; i < nx - rr; i++)
      if (winSum(sBlocked, nx, ny, i - rr, j - rr, i + rr, j + rr) === 0) E[j * nx + i] = 1;

  const seeds = [];
  const entries = [];
  const sr = stairRect(room);
  const grow = rules.passage + 0.3;
  if (sr) entries.push([sr[0] - grow, sr[1] - grow, sr[2] + grow, sr[3] + grow]);
  for (const d of room.doors) { const r = doorRect(room, d); entries.push([r[0] - 0.3, r[1] - 0.3, r[2] + 0.3, r[3] + 0.3]); }
  for (const r of entries) {
    const [i0, i1, j0, j1] = cellRange(r, res);
    for (let j = Math.max(0, j0); j <= Math.min(ny - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) if (E[j * nx + i]) seeds.push(j * nx + i);
  }
  const R = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  const push = (k) => { if (E[k] && !R[k]) { R[k] = 1; queue[qt++] = k; } };
  if (entries.length) seeds.forEach(push);
  else for (let k = 0; k < n; k++) push(k); // no entry defined: do not penalise
  while (qh < qt) {
    const k = queue[qh++];
    const i = k % nx, j = (k - i) / nx;
    if (i > 0) push(k - 1);
    if (i < nx - 1) push(k + 1);
    if (j > 0) push(k - nx);
    if (j < ny - 1) push(k + nx);
  }
  const sR = sat(nx, ny, (k) => R[k] === 1);
  const touched = (k) => {
    const i = k % nx, j = (k - i) / nx;
    return winSum(sR, nx, ny, i - rr, j - rr, i + rr, j + rr) > 0;
  };

  for (const p of per) {
    if (p.status === 'unplaced' || p.hard) continue;
    if (p.access.length === 0) { const c = defOf(items.find((i) => i.id === p.id)).clear; p.reachable = !(c.front > 0 || c.back > 0 || c.side > 0); }
    else {
      let hit = 0;
      for (const k of p.access) if (touched(k)) hit++;
      p.reachable = hit / p.access.length >= 0.25;
    }
    if (!p.reachable && p.status !== 'fail') {
      p.status = 'fail';
      p.issues.push({ code: 'unreachable', msg: `No ${rules.passage} m wide passage leads to it` });
    }
  }
  for (const p of per) { delete p.access; if (p.reachable === undefined) p.reachable = false; }

  // area metrics
  const cell = res * res;
  let nStair = 0, counted = 0, walkBase = 0, freeWalk = 0, freeReach = 0, tall = 0, noCount = 0;
  for (let k = 0; k < n; k++) {
    if (stair[k]) { nStair++; continue; }
    const hh = h[k];
    counted += hh >= rules.fullH - EPS ? 1 : hh >= rules.halfH - EPS ? rules.halfFactor : 0;
    if (hh < rules.halfH - EPS) noCount++;
    if (hh >= rules.fullStorey.height - EPS) tall++;
    if (hh >= rules.walkH - EPS) {
      walkBase++;
      if (occ[k] === 0) { freeWalk++; if (touched(k)) freeReach++; }
    }
  }
  const gross = (n - nStair) * cell;
  const countedArea = counted * cell;
  const usableRatio = gross > 0 ? countedArea / gross : 0;
  const connectivity = freeWalk > 0 ? freeReach / freeWalk : 0;
  const tallShare = n - nStair > 0 ? tall / (n - nStair) : 0;

  const score = { ok: 1, warn: 0.5, fail: 0, unplaced: 0 };
  const furnish = per.length ? per.reduce((a, p) => a + score[p.status], 0) / per.length : 1;
  const w = rules.weights;
  const index = (w.furnish * furnish + w.usable * usableRatio + w.circulation * connectivity) / (w.furnish + w.usable + w.circulation);

  return {
    metrics: {
      gross,
      counted: countedArea,
      lost: noCount * cell,
      usableRatio,
      walkable: walkBase * cell,
      walkableShare: gross > 0 ? (walkBase * cell) / gross : 0,
      freeWalkableShare: walkBase > 0 ? freeWalk / walkBase : 0,
      connectivity,
      furnish,
      placed: per.filter((p) => p.status !== 'unplaced').length,
      fits: per.filter((p) => p.status === 'ok').length,
      total: per.length,
      fullStorey: { share: tallShare, pass: tallShare >= rules.fullStorey.share, height: rules.fullStorey.height, need: rules.fullStorey.share },
      index,
    },
    items: per.map(({ rects, hard, ...rest }) => rest),
  };
}

// ---------------------------------------------------------------- automatic layout

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every valid position of one piece (all four rotations, 10 cm lattice): no hard issue, clearances >= minRatio.
 * Cheapest first - low headroom, wall contact and little lost walkable floor are cheap.
 * `opts.filter(cand, body, rot)` rejects positions (pattern anchors), `opts.jitter()` adds noise to the cost.
 */
export function candidatesFor(g, occ, room, it, rules, opts = {}) {
  const def = defOf(it);
  const step = 0.1;
  const cands = [];
  for (let rot = 0; rot < 4; rot++) {
    const { w, d } = bodySize(def, rot);
    for (let y = 0; y <= room.depth - d + EPS; y += step) {
      for (let x = 0; x <= room.width - w + EPS; x += step) {
        const cand = { ...it, x: Math.round(x * 20) / 20, y: Math.round(y * 20) / 20, rot };
        const r = evalOne(g, occ, false, def, cand, rules, false);
        if (r.hard || r.ratio < (opts.minRatio ?? 0.95)) continue;
        const b = r.rects.body;
        if (opts.filter && !opts.filter(cand, b, rot)) continue;
        const [i0, i1, j0, j1] = cellRange(b, g.res);
        let sum = 0, cnt = 0, walk = 0;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const hh = g.h[j * g.nx + i]; sum += hh; cnt++; if (hh >= rules.walkH) walk++; }
        const touch = (b[0] < 0.06) + (b[1] < 0.06) + (b[2] > room.width - 0.06) + (b[3] > room.depth - 0.06);
        const cost = 0.4 * (sum / cnt) + walk / cnt - 0.3 * Math.min(touch, 2) + (opts.jitter ? opts.jitter() : 0);
        cands.push({ cost, cand });
      }
    }
  }
  return cands.sort((a, b) => a.cost - b.cost);
}

/** Grid + body occupancy of every placed piece except `skipId` (10 cm lattice, as candidatesFor expects). */
export function occupancy(room, items, skipId) {
  const g = getGrid(room, 0.1);
  const occ = new Uint8Array(g.nx * g.ny);
  for (const it of items) {
    if (!it.placed || it.id === skipId || !CATALOG[it.type]) continue;
    const [i0, i1, j0, j1] = cellRange(itemRects(defOf(it), it).body, g.res);
    for (let j = Math.max(0, j0); j <= Math.min(g.ny - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(g.nx - 1, i1); i++) occ[j * g.nx + i]++;
  }
  return { g, occ };
}

/**
 * Greedy randomised search: furniture is placed one piece at a time on a 10 cm lattice in all four
 * rotations. A candidate must pass the hard checks (headroom, overlap, openings) and a stricter
 * clearance threshold; among the survivors we prefer low-headroom cells (keep the tall space free),
 * wall contact and little loss of walkable floor. Several randomised runs, best Usable-Space Index wins.
 */
export function solve(room, items, opts = {}) {
  const rules = { ...DEFAULT_RULES, ...(opts.rules || {}) };
  const rng = mulberry32(opts.seed ?? 1);
  const tries = opts.tries ?? 10;
  const g = getGrid(room, 0.1);
  const base = items.map((it) => ({ ...it, placed: false }));
  const difficulty = (it) => { const d = defOf(it); return d.bodyH * 10 + d.w * d.d; };
  const baseOrder = base.map((_, i) => i).sort((a, b) => difficulty(base[b]) - difficulty(base[a]));

  let best = null;
  for (let t = 0; t < tries; t++) {
    const order = baseOrder.slice();
    if (t > 0) for (let i = 0; i < order.length - 1; i++) if (rng() < 0.3) [order[i], order[i + 1]] = [order[i + 1], order[i]];
    const occ = new Uint8Array(g.nx * g.ny);
    const cur = base.map((it) => ({ ...it }));

    for (const idx of order) {
      const it = cur[idx];
      const def = defOf(it);
      const cands = candidatesFor(g, occ, room, it, rules, { jitter: t > 0 ? () => rng() * 0.5 : null });
      if (!cands.length) continue;
      const pick = cands[t === 0 ? 0 : Math.floor(rng() * Math.min(3, cands.length))].cand;
      cur[idx] = { ...pick, placed: true };
      const [i0, i1, j0, j1] = cellRange(itemRects(def, pick).body, g.res);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) occ[j * g.nx + i]++;
    }
    const result = evaluate(room, cur, { rules });
    if (!best || result.metrics.index > best.result.metrics.index) best = { items: cur, result };
  }
  return best;
}
