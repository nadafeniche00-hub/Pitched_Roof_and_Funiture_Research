// The gate in front of a floor plan that a model wrote: rooms as rectangles in metres. Pure functions of plain data (browser, Node, tests), no model and no network.
//
// A vision or language model is good at what a plan means and bad at its geometry: it draws rooms that overlap, leave holes in the outline, or stick out of it. The numbers below are
// arithmetic, so they are checked by code. The same findings go back to the model as the reason to try again (server/ai.js), and to the user as the reason a plan was not believed.
//
// Input  { version: 1, footprint: { w, d }, rooms: [ { id, type?, x, y, w, d } ] }   (origin top-left, x right, y down: the format of planImport.js and of the sketch prompt)
// Output { ok, findings: [ { code, severity: 'error' | 'warn' | 'info', room?, msg } ], stats }   ok = no error
import { ROOM_TYPES, typeOf, countedArea } from './plans.js';

const OUTSIDE = 0.15; // m a room may stick out of the outline (drawing line widths, rounding)
const OVERLAP_M2 = 0.1; // m2 of shared area that counts as an overlap
const COVER_ERROR = 0.85; // the rooms must cover at least this share of the outline
const COVER_WARN = 0.95;
const MIN_SIDE = 0.8; // m: no room is narrower than this, whatever its type
const STEP = 0.1; // m, grid of the coverage count
export const MAX_ROOMS = 8;

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const m2 = (v) => `${v.toFixed(1)} m²`;

/** @param opts { room } the roof storey (sanitizeRoom): with it the headroom of every room is checked as well */
export function checkSketchPlan(data, opts = {}) {
  const findings = [];
  const add = (code, severity, msg, room) => findings.push(room ? { code, severity, room, msg } : { code, severity, msg });
  const fp = data?.footprint;
  const list = Array.isArray(data?.rooms) ? data.rooms : null;
  if (!fp || !(fp.w > 1) || !(fp.d > 1) || !list || !list.length) {
    add('format', 'error', 'The plan needs a footprint (w and d in metres) and a list of rooms.');
    return { ok: false, findings, stats: { rooms: 0, coverage: 0, overlaps: 0 } };
  }
  const rooms = [];
  list.forEach((r, i) => {
    const id = String(r?.id ?? `r${i + 1}`);
    if (![r?.x, r?.y, r?.w, r?.d].every(num) || r.w <= 0 || r.d <= 0) { add('format', 'error', `Room ${id} has no usable x, y, w, d (numbers in metres, w and d above zero).`, id); return; }
    rooms.push({ id, type: r.type, x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.d, w: r.w, d: r.d });
  });

  // 1 inside the outline
  for (const r of rooms) {
    const out = Math.max(0 - r.x0, 0 - r.y0, r.x1 - fp.w, r.y1 - fp.d);
    if (out > OUTSIDE) add('outside', 'error', `Room ${r.id} sticks out of the outline by ${out.toFixed(2)} m (the outline is ${fp.w} x ${fp.d} m).`, r.id);
  }

  // 2 no two rooms overlap
  let overlaps = 0;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 0 && oy > 0 && ox * oy > OVERLAP_M2) { overlaps += 1; add('overlap', 'error', `Rooms ${a.id} and ${b.id} overlap by ${m2(ox * oy)}.`, a.id); }
    }
  }

  // 3 the rooms tile the outline: how much of it is covered
  let cells = 0, covered = 0;
  for (let x = STEP / 2; x < fp.w; x += STEP) {
    for (let y = STEP / 2; y < fp.d; y += STEP) {
      cells += 1;
      if (rooms.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) covered += 1;
    }
  }
  const coverage = cells ? covered / cells : 0;
  if (coverage < COVER_ERROR) add('gaps', 'error', `The rooms cover only ${Math.round(coverage * 100)} % of the outline: they should tile it, with no empty ground.`);
  else if (coverage < COVER_WARN) add('gaps', 'warn', `The rooms cover ${Math.round(coverage * 100)} % of the outline: there are small gaps.`);

  // 4 each room: width, size, type
  if (rooms.length > MAX_ROOMS) add('too-many', 'warn', `${rooms.length} rooms: the plan builder takes at most ${MAX_ROOMS}.`);
  for (const r of rooms) {
    const lo = Math.min(r.w, r.d), t = typeOf(r.type);
    if (lo < MIN_SIDE) add('narrow', 'error', `Room ${r.id} is only ${lo.toFixed(2)} m wide: that is a wall, not a room.`, r.id);
    else if (ROOM_TYPES[r.type] && lo < t.min * 0.7) add('narrow', 'warn', `${t.label} ${r.id} is ${lo.toFixed(2)} m wide (rule of thumb: at least ${t.min} m).`, r.id);
    if (!ROOM_TYPES[r.type] && r.type !== 'hall') add('type-guess', 'info', `Room ${r.id} has no known type: it will be guessed from its size.`, r.id);
  }

  // 5 with a roof: how much of each room has usable height (WoFlV counting; the plan is stretched onto the storey, as planImport.js does)
  if (opts.room) {
    const sx = opts.room.width / fp.w, sy = opts.room.depth / fp.d;
    for (const r of rooms) {
      const need = typeOf(r.type).share;
      if (!(need > 0)) continue;
      const { counted, gross } = countedArea(opts.room, [r.x0 * sx, r.y0 * sy, r.x1 * sx, r.y1 * sy]);
      const share = gross > 0 ? counted / gross : 0;
      if (share < need * 0.8) add('headroom', 'warn', `${typeOf(r.type).label} ${r.id}: only ${Math.round(share * 100)} % of the floor has usable height under the roof (wanted ${Math.round(need * 100)} %).`, r.id);
    }
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  return { ok: errors === 0, findings, stats: { rooms: rooms.length, coverage: +coverage.toFixed(3), overlaps, errors, warns: findings.filter((f) => f.severity === 'warn').length } };
}

/** The findings as the text a model reads when it is asked to correct its plan (errors first, warnings after; info is left out). */
export function findingsText(findings, max = 12) {
  const rank = { error: 0, warn: 1 };
  return findings.filter((f) => f.severity in rank).sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, max).map((f) => `- ${f.severity === 'error' ? 'ERROR' : 'warning'}: ${f.msg}`).join('\n');
}
