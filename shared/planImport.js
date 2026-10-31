// Turn the output of a plan reader (pipeline/notebooks/01_plan_reading.ipynb, or anyone's floor-plan JSON) into a brief and puzzle pieces.
//
// Format (version 1), metres, origin at the top-left of the floor plan:
//   { "version": 1, "footprint": { "w": 9.0, "d": 7.5 },
//     "rooms": [ { "id": "r1", "type": "bedroom" (optional), "x": 0, "y": 0, "w": 3.2, "d": 4.0 }, ... ] }
// The footprint is stretched onto the footprint of the roof storey in the app. Types that are missing are guessed from the size:
// a guess, marked as such, to be corrected in "Type rooms".
import { countedArea, hallRect, ROOM_TYPES } from './plans.js';

const MAX_ROOMS = 8;
const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);

export function guessType(grossM2) {
  if (grossM2 >= 15) return 'living';
  if (grossM2 >= 9.5) return 'bedroom';
  if (grossM2 >= 6.5) return 'child';
  if (grossM2 >= 4.2) return 'study';
  if (grossM2 >= 2.8) return 'bath';
  return 'wc';
}

/** @returns {{ brief, pieces, guessed, skipped }} or throws an Error with a message for the user. */
export function roomsFromPlanJson(data, room) {
  const fp = data?.footprint, list = data?.rooms;
  if (!fp || !(fp.w > 1) || !(fp.d > 1) || !Array.isArray(list) || !list.length) throw new Error('Not a plan file: it needs a footprint and a list of rooms.');
  const sx = room.width / fp.w, sy = room.depth / fp.d;
  const rects = list
    .map((r, i) => ({ id: String(r.id ?? `r${i + 1}`).slice(0, 12), type: r.type, rect: [r.x * sx, r.y * sy, (r.x + r.w) * sx, (r.y + r.d) * sy] }))
    .filter((r) => r.rect.every(Number.isFinite) && area(r.rect) >= 1.5)
    .sort((a, b) => area(b.rect) - area(a.rect));
  const keep = rects.slice(0, MAX_ROOMS), skipped = rects.length - keep.length;
  const hall = hallRect(room);
  const rooms = [], pieces = {};
  let guessed = 0;
  const used = new Set();
  for (const r of keep) {
    let id = r.id; while (used.has(id) || id === 'hall') id += '_';
    used.add(id);
    let type = ROOM_TYPES[r.type] ? r.type : null;
    if (!type) { type = guessType(area(r.rect)); guessed += 1; }
    const counted = countedArea(room, r.rect).counted;
    rooms.push({ id, type, area: Math.min(40, Math.max(2, +counted.toFixed(1))) });
    const w = +(r.rect[2] - r.rect[0]).toFixed(2), d = +(r.rect[3] - r.rect[1]).toFixed(2);
    const onHall = overlap(r.rect, hall) > 0.3 * area(r.rect);
    const clash = Object.values(pieces).some((p) => p.x !== null && overlap(r.rect, [p.x, p.y, p.x + p.w, p.y + p.d]) > 1e-3);
    pieces[id] = { w, d, area: rooms.at(-1).area, x: onHall || clash ? null : +r.rect[0].toFixed(2), y: onHall || clash ? null : +r.rect[1].toFixed(2) };
  }
  return { brief: { rooms, links: [] }, pieces, guessed, skipped };
}
