// A real storey read from a Revit sample (pipeline/revit/SampleExport) as a template of the app, and the rules of the app held against it: how big are its rooms, how thin, how much of each room
// stands under the roof at what height. Pure functions; pipeline/revit/convert_sample.mjs does the files. Nothing here is invented: a value that Revit did not give is left out and said so in `notes`.
import { DEFAULT_ROOM, DEFAULT_RULES, roofHeight, sanitizeRoom } from './engine.js';
import { ROOM_TYPES, THIN } from './plans.js';

// the type of a real room from its name: German, English and Japanese words of the samples. The first match wins, so the specific words stand before the general ones.
const NAMES = [
  ['wc', /\bwc\b|toilet|toilette|gäste|トイレ|便所/i],
  ['bath', /bad|dusche|bath|shower|浴室|洗面/i],
  ['kitchen', /küche|kueche|kitchen|kochen|キッチン|台所/i],
  ['child', /kind|child|nursery|子供/i],
  ['bedroom', /schlaf|bedroom|bed room|寝室/i],
  ['study', /arbeit|büro|buero|office|study|書斎/i],
  ['storage', /abstell|lager|speicher|stau|storage|closet|ankleide|technik|hwr|倉庫|収納/i],
  ['living', /wohn|living|essen|dining|lounge|リビング|居間|食堂/i],
  ['hall', /flur|diele|gang|korridor|hall|corridor|vorraum|eingang|廊下|玄関/i],
  ['stair', /treppe|stair|aufzug|lift|elevator|階段/i],
];
export const typeFromName = (name = '') => (NAMES.find(([, re]) => re.test(name)) || [null])[0];

export function polyArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; s += x1 * y2 - x2 * y1; }
  return Math.abs(s) / 2;
}

/** The sides of the smallest rectangle around a polygon: the same measure as the oracle's calibration on real plans (pipeline/oracle/msd/loader.py min_rect_sides). */
export function minRect(p) {
  let best = null;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    if (x1 === x2 && y1 === y2) continue;
    const a = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(a), s = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of p) { const u = x * c + y * s, v = -x * s + y * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const w = u1 - u0, h = v1 - v0;
    if (!best || w * h < best.w * best.h) best = { w, h };
  }
  return best ? { long: Math.max(best.w, best.h), short: Math.min(best.w, best.h) } : { long: 0, short: 0 };
}

function inside(p, x, y) {
  let on = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on;
  }
  return on;
}

const bboxOf = (pts) => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const mid = (a, b) => (a + b) / 2;

/**
 * The attic of one exported sample as a room of the app. Revit has x east and y north; the app has x across the roof slope and y along the ridge, so the long side of the footprint becomes y.
 * Returns { pitched, notes, room, frame, rooms } or null when the sample has no attic level. `pitched` is false for a flat roof or when no roof was found above the level.
 */
export function deriveTemplate(sample, others = []) {
  const at = sample.attic;
  if (!at) return null;
  const notes = [];
  const floorZ = at.level.elevation_m;
  const loops = (at.rooms || []).map((r) => r.loops?.[0]).filter((l) => l && l.length >= 3);
  const rbox = loops.length ? bboxOf(loops.flat()) : null;
  // a project holds the walls of all its parts at the same height: only the exterior walls around the rooms of this storey give its footprint
  const near = (p) => !rbox || (p[0] > rbox[0] - 1.5 && p[0] < rbox[2] + 1.5 && p[1] > rbox[1] - 1.5 && p[1] < rbox[3] + 1.5);
  const walls = (at.walls || []).filter((w) => /exterior|au(ss|ß)en/i.test(w.function || '') && near(w.p0) && near(w.p1));
  const wallPts = walls.flatMap((w) => [w.p0.slice(0, 2), w.p1.slice(0, 2)]);
  let foot;
  if (wallPts.length >= 3) foot = bboxOf(wallPts);
  else if (rbox) { foot = [rbox[0] - 0.4, rbox[1] - 0.4, rbox[2] + 0.4, rbox[3] + 0.4]; notes.push('no exterior walls around the rooms: the footprint is the extent of the rooms plus 0.4 m for the walls'); }
  else return { pitched: false, notes: ['no walls and no room boundaries: no footprint'], room: null, frame: null, rooms: [] };
  const [x0, y0, x1, y1] = foot;

  // roofs. `others`: the other storeys of the project as { elev, box: [x0, y0, x1, y1] } of their rooms. A roof belongs to this storey when it overlaps its footprint, has a size (15 m2: not a canopy), starts at most 0.5 m
  // below and 7 m above its floor, and no other storey over the same footprint has its floor below the lowest point of the roof (plus 0.6 m); of those roofs the ones within 3 m of the lowest are taken (one roof system)
  const overlaps = (b) => b[2] > x0 && b[0] < x1 && b[3] > y0 && b[1] < y1;
  const covers = (b) => (Math.max(0, Math.min(b[2], x1) - Math.max(b[0], x0)) * Math.max(0, Math.min(b[3], y1) - Math.max(b[1], y0))) / Math.max(1e-9, (x1 - x0) * (y1 - y0)); // the share of the footprint under the box
  const covered = (zTop) => others.some((o) => o.box && o.elev > floorZ + 0.5 && o.elev < zTop + 0.6 && overlaps(o.box));
  const candidates = (sample.roofs || []).filter((r) => r.box && r.area_m2 >= 15 && covers([r.box.min[0], r.box.min[1], r.box.max[0], r.box.max[1]]) >= 0.4
    && r.box.min[2] >= floorZ - 0.5 && r.box.min[2] <= floorZ + 7 && r.box.max[2] > floorZ + 1.5 && !covered(r.box.min[2]));
  const lowest = candidates.length ? Math.min(...candidates.map((r) => r.box.min[2])) : 0;
  const roofs = candidates.filter((r) => r.box.min[2] <= lowest + 3);
  if (!roofs.length) notes.push('no roof of a size above the level overlaps its footprint');
  // the slope of a footprint roof is the rise over the run of the edges that define it (Revit: slopeAngle, a tangent); where Revit gives none, the ridge above the eave over half the span gives it
  const slopes = roofs.flatMap((r) => (r.profiles || []).filter((p) => p.definesSlope && p.slopeAngle > 0.15).map((p) => p.slopeAngle).concat(r.slopeParam > 0.15 ? [r.slopeParam] : [])).sort((a, b) => a - b);
  const median = slopes.length ? slopes[Math.floor(slopes.length / 2)] : null;

  let ridge = null, eaveZ = null;
  if (roofs.length) { ridge = Math.max(...roofs.map((r) => r.box.max[2])); eaveZ = Math.min(...roofs.map((r) => r.box.min[2])); }
  const tops = walls.map((w) => w.box?.max?.[2]).filter((z) => Number.isFinite(z) && z > floorZ + 0.2);
  // with a slope given by the roof, the roof says where it meets the floor (an exterior wall near the rooms may be something else); without one, the walls do
  let kneeWall = median != null && eaveZ != null ? Math.min(3, Math.max(0, eaveZ - floorZ)) : tops.length ? Math.min(...tops) - floorZ : eaveZ != null ? Math.min(3, Math.max(0, eaveZ - floorZ)) : null;
  if (kneeWall != null && median != null) notes.push(`the knee wall is where the roof meets the floor: its lowest point is ${(eaveZ - floorZ).toFixed(2)} m above it`);

  const ru = roofs.length ? roofs.reduce((u, r) => ({ min: [Math.min(u.min[0], r.box.min[0]), Math.min(u.min[1], r.box.min[1])], max: [Math.max(u.max[0], r.box.max[0]), Math.max(u.max[1], r.box.max[1])] }), { min: [Infinity, Infinity], max: [-Infinity, -Infinity] }) : null;
  const A = x1 - x0, B = y1 - y0;
  const alongX = ru ? ru.max[0] - ru.min[0] >= ru.max[1] - ru.min[1] : A >= B; // the ridge runs along the longer side
  const cPerp = ru ? (alongX ? (ru.min[1] + ru.max[1]) / 2 : (ru.min[0] + ru.max[0]) / 2) : alongX ? (y0 + y1) / 2 : (x0 + x1) / 2;
  const aMin = alongX ? x0 : y0, perpExt = alongX ? B : A;
  let pitch = null, width = perpExt;
  if (median != null) {
    pitch = (Math.atan(median) * 180) / Math.PI;
    // the span of a gabled roof that rises from the eave to the ridge at this slope
    const span = (2 * (ridge - (floorZ + (kneeWall ?? 0)))) / median;
    width = Math.max(perpExt, span);
    notes.push(`pitch from the slope of the roof's own edges (${slopes.length} values, median ${median.toFixed(2)} rise over run)`);
  } else if (roofs.length && roofs.every((r) => r.box.max[2] - r.box.min[2] < 1)) pitch = 0; // roofs that are slabs, and no slope given: flat
  else if (roofs.length) pitch = (Math.atan2(Math.max(0, ridge - (floorZ + (kneeWall ?? 0))), perpExt / 2) * 180) / Math.PI;
  const pitched = pitch != null && pitch >= 8;
  // the roof of the app is one gable: eaves on both sides, a ridge in the middle. A roof that is something else (several roofs, a different slope on every side) does not fit: the ridge of the model must stand where the measured one does
  const modelRidge = pitch != null ? (kneeWall ?? 0) + Math.tan((pitch * Math.PI) / 180) * width / 2 : null;
  const fits = pitched && ridge != null && Math.abs(modelRidge - (ridge - floorZ)) <= 0.6;
  if (pitched && !fits) notes.push(`not one gable: the model of the app puts the ridge ${modelRidge.toFixed(1)} m above the floor, the roofs reach ${(ridge - floorZ).toFixed(1)} m`);
  if (roofs.length && !pitched) notes.push(`flat roof: the slope is ${pitch.toFixed(1)}°`);
  const frame = { alongX, width: +width.toFixed(2), depth: +(alongX ? A : B).toFixed(2) };
  const toApp = ([X, Y]) => { const q = alongX ? Y : X, a = alongX ? X : Y; return [q - cPerp + width / 2, a - aMin]; };

  const room = {
    width: frame.width, depth: frame.depth,
    kneeWall: +(kneeWall ?? DEFAULT_ROOM.kneeWall).toFixed(2), pitch: +(pitch ?? DEFAULT_ROOM.pitch).toFixed(1),
    maxHeight: +((ridge != null ? ridge - floorZ : DEFAULT_ROOM.maxHeight) + 0.3).toFixed(2),
  };
  const stair = (at.stairs || []).map((s) => s.box).find((b) => b && b.max[2] > floorZ - 0.5 && b.min[2] < floorZ + 3);
  if (stair) {
    const [a, b] = [toApp([stair.min[0], stair.min[1]]), toApp([stair.max[0], stair.max[1]])];
    const sx = Math.max(0, Math.min(a[0], b[0])), sy = Math.max(0, Math.min(a[1], b[1]));
    room.stair = { x: +sx.toFixed(2), y: +sy.toFixed(2), w: +Math.min(room.width - sx, Math.abs(a[0] - b[0])).toFixed(2), d: +Math.min(room.depth - sy, Math.abs(a[1] - b[1])).toFixed(2) };
  }
  const side = ([x, y]) => { // nearest outer wall of the app, and the position along it
    const d = [['W', x], ['E', frame.width - x], ['N', y], ['S', frame.depth - y]].sort((p, q) => p[1] - q[1])[0][0];
    return { wall: d, pos: +(d === 'W' || d === 'E' ? y : x).toFixed(2) };
  };
  const windows = (at.windows || []).filter((w) => w.at && near(w.at)).map((w) => ({ ...side(toApp(w.at)), width: +Math.min(3, Math.max(0.6, (w.width_mm || 1200) / 1000)).toFixed(2) }));
  if (windows.length) room.windows = windows;

  const rooms = (at.rooms || []).map((r) => {
    const polygon = (r.loops?.[0] || []).map(toApp);
    return { name: r.name || '', number: r.number || '', type: typeFromName(r.name), area: r.area_m2, polygon };
  }).filter((r) => r.polygon.length >= 3);
  return { pitched, slopeKnown: median != null, fits, notes, room, frame, rooms, roofs: roofs.map((r) => ({ type: r.type, level: r.level, kind: r.kind })) };
}

/** Headroom under the roof of a derived room, over the cells of a polygon: the shares standing 2.0 m and higher, 1 to 2 m, and lower, and the counted area by the rules of the app. */
export function headroom(room, polygon, cell = 0.1) {
  const r = sanitizeRoom({ ...DEFAULT_ROOM, ...room, dormers: [], stair: null, windows: [], doors: [] });
  const [bx0, by0, bx1, by1] = bboxOf(polygon);
  let full = 0, half = 0, low = 0;
  for (let y = by0 + cell / 2; y < by1; y += cell) {
    for (let x = bx0 + cell / 2; x < bx1; x += cell) {
      if (!inside(polygon, x, y)) continue;
      const h = roofHeight(r, Math.min(r.width, Math.max(0, x)), y);
      if (h >= DEFAULT_RULES.fullH) full++; else if (h >= DEFAULT_RULES.halfH) half++; else low++;
    }
  }
  const n = full + half + low || 1, c = cell * cell;
  return { net: +(n * c).toFixed(1), counted: +((full + half * DEFAULT_RULES.halfFactor) * c).toFixed(1), full: +(full / n).toFixed(2), half: +(half / n).toFixed(2), low: +(low / n).toFixed(2) };
}

/**
 * The rules of the app on the real rooms: width and area by room type, proportion, and the share under the roof; and where each real room lies among the real plans of the training data
 * (`bands`: { type: { p5, p95 } } net areas, Modified Swiss Dwellings). Returns one row per room with `flags`.
 */
export function checkRooms(template, bands = {}, opts = {}) { // opts.headroom === false: the storey has no roof the app can model, so there is no headroom to judge
  return template.rooms.map((r) => {
    const t = ROOM_TYPES[r.type], m = minRect(r.polygon), a = polyArea(r.polygon), flags = [];
    const h = opts.headroom === false ? null : headroom(template.room, r.polygon);
    if (t) {
      if (m.short < t.min - 1e-6) flags.push(`narrow: ${m.short.toFixed(2)} m, the rule asks ${t.min} m`);
      if (a < (t.minArea || 0) - 1e-6) flags.push(`small: ${a.toFixed(1)} m², the rule asks ${t.minArea} m²`);
      if (m.long / Math.max(m.short, 1e-9) > t.maxAspect * THIN + 1e-6) flags.push(`thin: ${(m.long / m.short).toFixed(1)}:1, the rule allows ${(t.maxAspect * THIN).toFixed(1)}:1`);
    }
    const band = bands[r.type];
    if (band && (a < band.p5 || a > band.p95)) flags.push(`outside the real plans: ${a.toFixed(1)} m², 90 % of real ${r.type}s are ${band.p5}–${band.p95} m²`);
    if (h && h.low > 0.4) flags.push(`${Math.round(h.low * 100)} % of the room is lower than 1 m under this roof`);
    return { name: r.name, type: r.type, revitArea: r.area, area: +a.toFixed(1), short: +m.short.toFixed(2), long: +m.long.toFixed(2), aspect: +(m.long / Math.max(m.short, 1e-9)).toFixed(2), headroom: h, flags };
  });
}
