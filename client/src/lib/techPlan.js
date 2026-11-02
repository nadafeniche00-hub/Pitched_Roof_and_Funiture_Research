// A technical floor plan of the layout: walls (outer 36.5 cm, inner 11.5 cm) with door and window openings, door swings, stair, room stamps with
// areas, furniture, dimension chains and a title block (Schriftfeld). One list of drawing primitives, written either as a DXF (R12, metres x 1000 = mm,
// German layer names) for CAD and Revit, or as a printable A3 sheet at 1:50 (SVG). Plan coordinates: x right, y down, metres.
import { defOf } from '@shared/params.js';
import { itemRects, stairRect } from '@shared/engine.js';
import { wallsOf } from './walls.js';

export const LAYERS = {
  WAENDE: { color: 7, w: 0.5, name: 'Waende' },
  TUEREN: { color: 3, w: 0.25, name: 'Tueren' },
  FENSTER: { color: 5, w: 0.25, name: 'Fenster' },
  TREPPE: { color: 1, w: 0.25, name: 'Treppe' },
  MOEBEL: { color: 8, w: 0.13, name: 'Moebel' },
  RAUMSTEMPEL: { color: 2, w: 0.18, name: 'Raumstempel' },
  BEMASSUNG: { color: 4, w: 0.18, name: 'Bemassung' },
  RAHMEN: { color: 7, w: 0.35, name: 'Rahmen und Schriftfeld' },
};
const T_OUT = 0.365, T_IN = 0.115;
const DE = { bedroom: 'Schlafen', child: 'Kind', living: 'Wohnen', kitchen: 'Kueche', study: 'Arbeiten', bath: 'Bad', wc: 'WC', storage: 'Abstellraum', hall: 'Flur', room: 'Raum' };
const num = (v, d = 2) => v.toFixed(d).replace('.', ',');

/** Everything to draw, as primitives: line, arc, text (layer, geometry). */
export function techPrimitives(room, layout, items, meta = {}) {
  const W = room.width, D = room.depth, P = [];
  const line = (layer, a, b) => P.push({ k: 'line', layer, a, b });
  const text = (layer, p, h, s, align = 'c') => P.push({ k: 'text', layer, p, h, s, align });
  const arc = (layer, c, r, a0, a1) => P.push({ k: 'arc', layer, c, r, a0, a1 });

  /** one straight wall from p0 to p1: two face lines, end caps at the openings; the openings get their own symbols */
  const wall = (p0, p1, t, openings, kind) => {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy);
    if (len < 0.05) return;
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, at = (s, o) => [p0[0] + ux * s + nx * o, p0[1] + uy * s + ny * o];
    const ops = [...openings].sort((a, b) => a[0] - b[0]);
    let from = 0;
    const solid = (a, b) => { if (b - a < 0.02) return; line('WAENDE', at(a, -t / 2), at(b, -t / 2)); line('WAENDE', at(a, t / 2), at(b, t / 2)); line('WAENDE', at(a, -t / 2), at(a, t / 2)); line('WAENDE', at(b, -t / 2), at(b, t / 2)); };
    for (const [a, b] of ops) { solid(from, Math.max(from, a)); from = Math.max(from, b); }
    solid(from, len);
    for (const o of ops) {
      const a = Math.max(0, o[0]), b = Math.min(len, o[1]);
      if (kind.type === 'window') { for (const off of [-t / 2, 0, t / 2]) line('FENSTER', at(a, off), at(b, off)); line('FENSTER', at(a, -t / 2), at(a, t / 2)); line('FENSTER', at(b, -t / 2), at(b, t / 2)); }
      else { // door: the open leaf at the hinge and the quarter-circle swing; side and hinge come from shared/doors.js (into the room behind, hinged near a wall end)
        const w = b - a, ang = (Math.atan2(dy, dx) * 180) / Math.PI, side = o[2] ?? 1, hinge = o[3] ?? 0;
        const c = at(hinge ? b : a, 0), closed = hinge ? ang + 180 : ang, open = ang + 90 * side, rad = (v) => (v * Math.PI) / 180;
        line('TUEREN', c, [c[0] + Math.cos(rad(open)) * w, c[1] + Math.sin(rad(open)) * w]);
        const turn = ((open - closed + 540) % 360) - 180; // +90 or -90: which way the leaf turns from closed to open
        if (turn > 0) arc('TUEREN', c, w, closed, closed + 90); else arc('TUEREN', c, w, closed - 90, closed);
        line('TUEREN', at(a, -t / 2), at(a, t / 2)); line('TUEREN', at(b, -t / 2), at(b, t / 2));
      }
    }
  };

  // outer walls: horizontal ones full length, vertical ones between them, so the corners are clean
  const ow = (wallId) => room.windows.filter((o) => o.wall === wallId).map((o) => ({ ...o, type: 'window' })).concat(room.doors.filter((o) => o.wall === wallId).map((o) => ({ ...o, type: 'door' })));
  const opn = (list, shift) => list.map((o) => [o.pos - o.width / 2 - shift, o.pos + o.width / 2 - shift, o.type]);
  const drawSide = (p0, p1, list, shift) => {
    const ops = opn(list, shift);
    wall(p0, p1, T_OUT, ops.filter((o) => o[2] === 'window').map((o) => [o[0], o[1]]), { type: 'window' });
    // doors in outer walls: gap plus swing, drawn on top of the (gap-less) wall run
    for (const o of ops.filter((q) => q[2] === 'door')) wall(p0, p1, T_OUT, [[o[0], o[1]]], { type: 'door' });
  };
  drawSide([0, T_OUT / 2], [W, T_OUT / 2], ow('N'), 0);
  drawSide([0, D - T_OUT / 2], [W, D - T_OUT / 2], ow('S'), 0);
  drawSide([T_OUT / 2, T_OUT], [T_OUT / 2, D - T_OUT], ow('W'), T_OUT);
  drawSide([W - T_OUT / 2, T_OUT], [W - T_OUT / 2, D - T_OUT], ow('E'), T_OUT);

  // partition walls from the layout (doors where the layout has them, a door in the middle of every long wall otherwise)
  const rooms = layout?.rooms || [{ id: 'room', type: 'room', rect: [0, 0, W, D], counted: 0 }];
  const { walls } = wallsOf(room, layout ? { rooms, doors: layout.doors || [] } : { rooms: [], doors: [] }, { autoDoors: !layout?.doors?.length });
  for (const w of walls) wall(w.p0, w.p1, T_IN, w.op, { type: 'door' });

  // stair
  const sr = stairRect(room);
  if (sr) {
    line('TREPPE', [sr[0], sr[1]], [sr[2], sr[1]]); line('TREPPE', [sr[2], sr[1]], [sr[2], sr[3]]); line('TREPPE', [sr[2], sr[3]], [sr[0], sr[3]]); line('TREPPE', [sr[0], sr[3]], [sr[0], sr[1]]);
    const steps = Math.max(3, Math.round((sr[3] - sr[1]) / 0.27));
    for (let i = 1; i < steps; i++) line('TREPPE', [sr[0], sr[1] + ((sr[3] - sr[1]) * i) / steps], [sr[2], sr[1] + ((sr[3] - sr[1]) * i) / steps]);
    text('TREPPE', [(sr[0] + sr[2]) / 2, sr[1] - 0.12], 0.14, 'Treppe');
  }

  // furniture
  for (const it of items || []) {
    if (!it.placed) continue;
    const b = itemRects(defOf(it), it).body;
    line('MOEBEL', [b[0], b[1]], [b[2], b[1]]); line('MOEBEL', [b[2], b[1]], [b[2], b[3]]); line('MOEBEL', [b[2], b[3]], [b[0], b[3]]); line('MOEBEL', [b[0], b[3]], [b[0], b[1]]);
    line('MOEBEL', [b[0], b[1]], [b[2], b[3]]);
    text('MOEBEL', [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2 + 0.05], 0.1, String(defOf(it).name || it.type).slice(0, 18));
  }

  // room stamps: name, gross area and the area that counts under the roof (WoFlV: 100 % from 2 m, 50 % from 1 m)
  for (const r of rooms) {
    const [x0, y0, x1, y1] = r.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    text('RAUMSTEMPEL', [cx, cy - 0.12], 0.2, DE[r.type] || String(r.type || r.id));
    text('RAUMSTEMPEL', [cx, cy + 0.14], 0.15, `A = ${num((x1 - x0) * (y1 - y0))} m2`);
    if (r.counted) text('RAUMSTEMPEL', [cx, cy + 0.34], 0.13, `anrechenbar ${num(r.counted)} m2`);
  }

  // dimension chains: overall and by room breaks along the bottom, overall on the right
  const xs = [...new Set([0, W, ...rooms.flatMap((r) => [r.rect[0], r.rect[2]])].map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
  const ys = [...new Set([0, D, ...rooms.flatMap((r) => [r.rect[1], r.rect[3]])].map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
  const tick = (a, b) => { line('BEMASSUNG', a, b); };
  const chain = (vals, horizontal, off) => {
    const pos = (v) => (horizontal ? [v, D + off] : [W + off, v]);
    line('BEMASSUNG', pos(vals[0]), pos(vals[vals.length - 1]));
    vals.forEach((v, i) => {
      const p = pos(v);
      tick(horizontal ? [p[0] - 0.06, p[1] + 0.06] : [p[0] - 0.06, p[1] - 0.06], horizontal ? [p[0] + 0.06, p[1] - 0.06] : [p[0] + 0.06, p[1] + 0.06]);
      line('BEMASSUNG', horizontal ? [p[0], D + 0.03] : [W + 0.03, p[1]], horizontal ? [p[0], p[1] + 0.1] : [p[0] + 0.1, p[1]]);
      if (i) text('BEMASSUNG', horizontal ? [(vals[i - 1] + v) / 2, p[1] - 0.1] : [p[0] + 0.12, (vals[i - 1] + v) / 2], 0.13, num(v - vals[i - 1]), horizontal ? 'c' : 'l');
    });
  };
  if (xs.length > 2) chain(xs, true, 0.55);
  chain([0, W], true, xs.length > 2 ? 1.0 : 0.55);
  if (ys.length > 2) chain(ys, false, 0.55);
  chain([0, D], false, ys.length > 2 ? 1.0 : 0.55);

  // title block (Schriftfeld) below the plan, 180 x 44 mm of paper at 1:50 = 9 x 2.2 m
  const bx = Math.max(0, W - 9), by = D + 1.5, bw = 9, bh = 2.2;
  const box = (x, y, w, h) => { line('RAHMEN', [x, y], [x + w, y]); line('RAHMEN', [x + w, y], [x + w, y + h]); line('RAHMEN', [x + w, y + h], [x, y + h]); line('RAHMEN', [x, y + h], [x, y]); };
  box(bx, by, bw, bh); line('RAHMEN', [bx, by + 0.7], [bx + bw, by + 0.7]); line('RAHMEN', [bx + 5.4, by + 0.7], [bx + 5.4, by + bh]);
  text('RAHMEN', [bx + 0.15, by + 0.5], 0.3, meta.title || 'Dachgeschoss, Grundriss', 'l');
  text('RAHMEN', [bx + 0.15, by + 1.1], 0.14, `Projekt: ${meta.project || 'Usable Space'}`, 'l');
  text('RAHMEN', [bx + 0.15, by + 1.45], 0.14, `Breite x Tiefe: ${num(W)} x ${num(D)} m, Kniestock ${num(room.kneeWall)} m, Neigung ${room.pitch} Grad`, 'l');
  text('RAHMEN', [bx + 0.15, by + 1.8], 0.14, 'Wohnflaeche nach WoFlV: 100 % ab 2,00 m, 50 % von 1,00 bis 2,00 m', 'l');
  text('RAHMEN', [bx + 5.55, by + 1.1], 0.14, 'Massstab 1:50', 'l');
  text('RAHMEN', [bx + 5.55, by + 1.45], 0.14, `Datum: ${meta.date || new Date().toISOString().slice(0, 10)}`, 'l');
  text('RAHMEN', [bx + 5.55, by + 1.8], 0.14, 'Maße in m, Entwurf', 'l');
  return { prims: P, W, D, extent: [Math.min(0, bx), -0.2, Math.max(W + 1.6, bx + bw), by + bh] };
}

// ---------------------------------------------------------------- DXF (R12, ASCII, millimetres, y up)
export function toDxf({ prims, D, extent }) {
  const out = [];
  const g = (code, v) => out.push(String(code), String(v));
  const X = (x) => Math.round(x * 1000), Y = (y) => Math.round((D + 1.5 + 2.2 - y) * 1000); // y flipped, origin kept positive
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1); g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0); g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, Object.keys(LAYERS).length);
  for (const [name, l] of Object.entries(LAYERS)) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, l.color); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1); g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, 'txt'); g(4, ''); g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const p of prims) {
    if (p.k === 'line') { g(0, 'LINE'); g(8, p.layer); g(10, X(p.a[0])); g(20, Y(p.a[1])); g(30, 0); g(11, X(p.b[0])); g(21, Y(p.b[1])); g(31, 0); }
    else if (p.k === 'arc') { g(0, 'ARC'); g(8, p.layer); g(10, X(p.c[0])); g(20, Y(p.c[1])); g(30, 0); g(40, Math.round(p.r * 1000)); g(50, ((-p.a1 % 360) + 360) % 360); g(51, ((-p.a0 % 360) + 360) % 360); } // y flip reverses the sweep
    else if (p.k === 'text') {
      g(0, 'TEXT'); g(8, p.layer); g(10, X(p.p[0])); g(20, Y(p.p[1])); g(30, 0); g(40, Math.round(p.h * 1000)); g(1, p.s.replace(/[^\x20-\x7E]/g, '?'));
      if (p.align !== 'l') { g(72, p.align === 'c' ? 1 : 2); g(11, X(p.p[0])); g(21, Y(p.p[1])); g(31, 0); }
    }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return out.join('\r\n');
}

// ---------------------------------------------------------------- printable sheet: A3 landscape, 1:50 (1 m of plan = 20 mm of paper)
export function toSheetSvg({ prims, extent }) {
  const S = 20, pw = (extent[2] - extent[0]) * S, ph = (extent[3] - extent[1]) * S, SW = 420, SH = 297;
  const ox = Math.max(20, (SW - pw) / 2) - extent[0] * S, oy = Math.max(25, (SH - ph) / 2) - extent[1] * S;
  const X = (x) => (ox + x * S).toFixed(2), Y = (y) => (oy + y * S).toFixed(2), esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sw = (l) => LAYERS[l].w, col = (l) => (l === 'MOEBEL' ? '#7a7f88' : l === 'FENSTER' ? '#1f5fa8' : l === 'TUEREN' ? '#14161c' : l === 'TREPPE' ? '#c0392b' : l === 'BEMASSUNG' ? '#14161c' : '#14161c');
  const body = prims.map((p) => {
    if (p.k === 'line') return `<line x1="${X(p.a[0])}" y1="${Y(p.a[1])}" x2="${X(p.b[0])}" y2="${Y(p.b[1])}" stroke="${col(p.layer)}" stroke-width="${sw(p.layer)}" stroke-linecap="square"/>`;
    if (p.k === 'arc') {
      const r = p.r * S, a0 = (p.a0 * Math.PI) / 180, a1 = (p.a1 * Math.PI) / 180;
      return `<path d="M${X(p.c[0] + p.r * Math.cos(a0))} ${Y(p.c[1] + p.r * Math.sin(a0))} A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${X(p.c[0] + p.r * Math.cos(a1))} ${Y(p.c[1] + p.r * Math.sin(a1))}" fill="none" stroke="${col(p.layer)}" stroke-width="${sw(p.layer)}"/>`;
    }
    const size = Math.max(1.6, p.h * S * 1.0), anchor = p.align === 'c' ? 'middle' : p.align === 'r' ? 'end' : 'start';
    return `<text x="${X(p.p[0])}" y="${Y(p.p[1])}" font-size="${size.toFixed(2)}" text-anchor="${anchor}" font-family="Arial, sans-serif" fill="${col(p.layer)}">${esc(p.s)}</text>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}mm" height="${SH}mm" viewBox="0 0 ${SW} ${SH}">
<rect width="${SW}" height="${SH}" fill="#fff"/><rect x="10" y="10" width="${SW - 20}" height="${SH - 20}" fill="none" stroke="#14161c" stroke-width="0.5"/>
${body}
</svg>`;
}
