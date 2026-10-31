import { useRef, useState } from 'react';
import { HALL, hallRect, typeOf } from '@shared/plans.js';

// Room puzzle: every room is a piece sized by its wanted area. Drag pieces from the tray into the attic outline;
// they snap to a 10 cm grid and to walls and each other. Click a piece to turn it. Pieces never overlap.
const COLOR = { hall: '#14161c', bedroom: '#1f4e8c', child: '#2b63a8', living: '#7a2f6b', kitchen: '#8a6038', study: '#1f6b45', bath: '#1d5c70', wc: '#144a5c', storage: '#5a3d22' };
const TRAY = 4.4; // metres of tray to the right of the outline
const SNAP = 0.3;

const snap10 = (v) => Math.round(v * 10) / 10;
const overlaps = (a, b) => a[0] < b[2] - 1e-6 && b[0] < a[2] - 1e-6 && a[1] < b[3] - 1e-6 && b[1] < a[3] - 1e-6;

/** Default piece size for a wanted counted area: roughly 1.4 : 1, a little larger than counted because slopes lose area. */
export function pieceSize(area) {
  const gross = area / 0.8, d = Math.max(1.2, snap10(Math.sqrt(gross / 1.4)));
  return [snap10(gross / d), d];
}

export function initialPieces(rooms) {
  const pz = {};
  for (const r of rooms) { const [w, d] = pieceSize(r.area); pz[r.id] = { w, d, x: null, y: null }; }
  return pz;
}

export default function PuzzleEditor({ room, rooms, pz, setPz }) {
  const svg = useRef(null);
  const [drag, setDrag] = useState(null); // { id, x, y, dx, dy, moved, bad }
  const W = room.width, D = room.depth, hall = hallRect(room);
  const placed = (id) => pz[id] && pz[id].x !== null;
  const rectOf = (id, p = pz[id]) => [p.x, p.y, p.x + p.w, p.y + p.d];

  const toSvg = (e) => {
    const p = svg.current.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.current.getScreenCTM().inverse());
    return [q.x, q.y];
  };

  const solidOthers = (id) => [hall, ...rooms.filter((r) => r.id !== id && placed(r.id)).map((r) => rectOf(r.id))];

  const fit = (id, x, y, w, d) => {
    let nx = Math.min(W - w, Math.max(0, x)), ny = Math.min(D - d, Math.max(0, y));
    for (const o of solidOthers(id)) { // magnetic edges
      if (Math.abs(nx - o[2]) < SNAP) nx = o[2];
      else if (Math.abs(nx + w - o[0]) < SNAP) nx = o[0] - w;
      if (Math.abs(ny - o[3]) < SNAP) ny = o[3];
      else if (Math.abs(ny + d - o[1]) < SNAP) ny = o[1] - d;
    }
    if (Math.abs(nx) < SNAP) nx = 0;
    if (Math.abs(nx + w - W) < SNAP) nx = W - w;
    if (Math.abs(ny) < SNAP) ny = 0;
    if (Math.abs(ny + d - D) < SNAP) ny = D - d;
    nx = snap10(nx); ny = snap10(ny);
    const r = [nx, ny, nx + w, ny + d];
    return { x: nx, y: ny, bad: solidOthers(id).some((o) => overlaps(r, o)) || nx < -1e-6 || ny < -1e-6 || nx + w > W + 1e-6 || ny + d > D + 1e-6 };
  };

  const down = (e, id) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toSvg(e), p = pz[id];
    const cur = placed(id) ? [p.x, p.y] : trayPos(id);
    setDrag({ id, x: cur[0], y: cur[1], dx: x - cur[0], dy: y - cur[1], moved: false, bad: false, sx: x, sy: y });
  };
  const move = (e) => {
    if (!drag) return;
    const [x, y] = toSvg(e), p = pz[drag.id];
    const nx = x - drag.dx, ny = y - drag.dy;
    const inside = x < W + 0.2;
    const f = inside ? fit(drag.id, nx, ny, p.w, p.d) : { x: nx, y: ny, bad: false };
    setDrag({ ...drag, x: inside ? f.x : nx, y: inside ? f.y : ny, bad: f.bad, moved: drag.moved || Math.hypot(x - drag.sx, y - drag.sy) > 0.08 });
  };
  const up = () => {
    if (!drag) return;
    const p = pz[drag.id];
    if (!drag.moved) { // a click turns the piece if it still fits
      const t = { ...p, w: p.d, d: p.w };
      if (!placed(drag.id) || !fit(drag.id, p.x, p.y, t.w, t.d).bad) setPz((s) => ({ ...s, [drag.id]: { ...t, x: p.x, y: p.y } }));
    } else if (drag.x + p.w / 2 > W + 0.1) setPz((s) => ({ ...s, [drag.id]: { ...p, x: null, y: null } })); // dropped back in the tray
    else if (!drag.bad) setPz((s) => ({ ...s, [drag.id]: { ...p, x: drag.x, y: drag.y } }));
    setDrag(null);
  };

  const unplaced = rooms.filter((r) => !placed(r.id));
  const trayPos = (id) => {
    let y = 0;
    for (const r of rooms.filter((q) => !placed(q.id))) {
      if (r.id === id) return [W + 0.9, y];
      y += pz[r.id].d + 0.25;
    }
    return [W + 0.9, 0];
  };
  const H = Math.max(D, unplaced.reduce((s, r) => s + pz[r.id].d + 0.25, 0));

  const piece = (r) => {
    const p = pz[r.id], isDrag = drag?.id === r.id;
    const [x, y] = isDrag ? [drag.x, drag.y] : placed(r.id) ? [p.x, p.y] : trayPos(r.id);
    return (
      <g key={r.id} className={`pz-piece ${isDrag ? 'drag' : ''} ${isDrag && drag.bad ? 'bad' : ''}`} transform={`translate(${x}, ${y})`} onPointerDown={(e) => down(e, r.id)}>
        <rect width={p.w} height={p.d} fill={COLOR[r.type] || '#333'} />
        <text x={p.w / 2} y={p.d / 2 - 0.02} textAnchor="middle" className="pz-t">{typeOf(r.type).label}</text>
        <text x={p.w / 2} y={p.d / 2 + 0.28} textAnchor="middle" className="pz-s">{p.w.toFixed(1)} × {p.d.toFixed(1)} m</text>
      </g>
    );
  };

  return (
    <div className="puzzle">
      <svg ref={svg} viewBox={`-0.3 -0.3 ${W + 0.6 + TRAY} ${H + 0.6}`} className="pz-svg" role="group" aria-label="Room puzzle: drag rooms into the attic"
        onPointerMove={move} onPointerUp={up}>
        <rect x="0" y="0" width={W} height={D} fill="#fff" />
        <rect className="pz-hall" x={hall[0]} y={hall[1]} width={hall[2] - hall[0]} height={hall[3] - hall[1]} fill={COLOR.hall} />
        <text x={(hall[0] + hall[2]) / 2} y={(hall[1] + hall[3]) / 2} textAnchor="middle" className="pz-t">{HALL.label}</text>
        {Array.from({ length: Math.floor(W) }, (_, i) => <line key={`gx${i}`} x1={i + 1} y1="0" x2={i + 1} y2={D} className="pz-grid" />)}
        {Array.from({ length: Math.floor(D) }, (_, i) => <line key={`gy${i}`} x1="0" y1={i + 1} x2={W} y2={i + 1} className="pz-grid" />)}
        <rect x="0" y="0" width={W} height={D} fill="none" stroke="#14161c" strokeWidth="0.1" />
        <text x={W + 0.9} y="-0.05" className="pz-tray">tray</text>
        {rooms.map(piece)}
        {!unplaced.length && <text x={W + 0.9 + 1.5} y={1} textAnchor="middle" className="pz-done">all placed ✓</text>}
      </svg>
      <p className="hint">Drag rooms into the outline. Click a room to turn it. The black block is the stair hall.</p>
    </div>
  );
}
