import { useRef, useState } from 'react';
import { ROOM_TYPES, typeOf } from '@shared/plans.js';

// A bubble diagram you draw: every bubble is a room, its size is the wanted area, and bubbles that touch want to share a wall.
export const BW = 640, BH = 330;
const COLOR = { bedroom: '#1f4e8c', child: '#2b63a8', living: '#7a2f6b', kitchen: '#8a6038', study: '#1f6b45', bath: '#1d5c70', wc: '#144a5c', storage: '#5a3d22' };
const SNAP = 14;

export const radiusOf = (area) => 20 + 11 * Math.sqrt(area);

/** Pairs of rooms whose bubbles touch. */
export function linksFrom(rooms, pos) {
  const out = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = pos[rooms[i].id], b = pos[rooms[j].id];
    if (!a || !b) continue;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= radiusOf(rooms[i].area) + radiusOf(rooms[j].area) + 3) out.push([rooms[i].id, rooms[j].id, 'near']);
  }
  return out;
}

/** Initial positions on a ring, bubbles of neighbours in the list touching. */
export function ringPositions(rooms) {
  const pos = {};
  rooms.forEach((r, i) => {
    const a = (i / Math.max(1, rooms.length)) * Math.PI * 2 - Math.PI / 2;
    pos[r.id] = [BW / 2 + Math.cos(a) * 130, BH / 2 + Math.sin(a) * 90];
  });
  return pos;
}

export default function BubbleEditor({ rooms, pos, setPos, setRooms, selected, setSelected }) {
  const svg = useRef(null);
  const drag = useRef(null);
  const [fresh, setFresh] = useState(null);
  const links = linksFrom(rooms, pos);

  const toSvg = (e) => {
    const p = svg.current.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.current.getScreenCTM().inverse());
    return [q.x, q.y];
  };

  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = toSvg(e);
    const r = radiusOf(rooms.find((q) => q.id === d.id).area);
    let nx = Math.min(BW - r, Math.max(r, x - d.dx)), ny = Math.min(BH - r, Math.max(r, y - d.dy));
    for (const o of rooms) { // bubbles never overlap; close ones snap to touching
      if (o.id === d.id) continue;
      const p = pos[o.id], need = r + radiusOf(o.area), dist = Math.hypot(nx - p[0], ny - p[1]);
      if (dist < need + SNAP) { const k = need / Math.max(dist, 0.01); nx = p[0] + (nx - p[0]) * k; ny = p[1] + (ny - p[1]) * k; }
    }
    setPos((s) => ({ ...s, [d.id]: [nx, ny] }));
  };

  const down = (e, id) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = toSvg(e), p = pos[id];
    drag.current = { id, dx: x - p[0], dy: y - p[1] };
    setSelected(id);
  };

  const add = (type) => {
    const id = `${type.slice(0, 3)}${Date.now() % 10000}`;
    setRooms((rs) => (rs.length >= 8 ? rs : [...rs, { id, type, area: ROOM_TYPES[type].area }]));
    setPos((s) => ({ ...s, [id]: [60 + Math.random() * (BW - 120), 50 + Math.random() * (BH - 100)] }));
    setFresh(id); setSelected(id);
  };

  const sel = rooms.find((r) => r.id === selected);
  const setArea = (d) => sel && setRooms((rs) => rs.map((r) => (r.id === sel.id ? { ...r, area: Math.min(30, Math.max(2, r.area + d)) } : r)));
  const remove = () => { if (!sel) return; setRooms((rs) => rs.filter((r) => r.id !== sel.id)); setSelected(null); };

  return (
    <div className="bubbles">
      <div className="bub-palette" role="group" aria-label="Add a room">
        {Object.entries(ROOM_TYPES).map(([k, t]) => <button key={k} className="chip-add" style={{ '--c': COLOR[k] }} onClick={() => add(k)}>+ {t.label}</button>)}
      </div>
      <svg ref={svg} viewBox={`0 0 ${BW} ${BH}`} className="bub-svg" role="img" aria-label="Bubble diagram: drag rooms, bubbles that touch share a wall"
        onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
        <defs><pattern id="bubgrid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#14161c" opacity="0.18" /></pattern></defs>
        <rect width={BW} height={BH} fill="url(#bubgrid)" />
        {links.map(([a, b]) => <line key={a + b} className="bub-link" x1={pos[a][0]} y1={pos[a][1]} x2={pos[b][0]} y2={pos[b][1]} />)}
        {rooms.map((r) => {
          const p = pos[r.id];
          if (!p) return null;
          const R = radiusOf(r.area);
          return (
            <g key={r.id} className={`bub ${fresh === r.id ? 'pop' : ''} ${selected === r.id ? 'on' : ''}`} style={{ transform: `translate(${p[0]}px, ${p[1]}px)` }}
              onPointerDown={(e) => down(e, r.id)} onAnimationEnd={() => setFresh(null)}>
              <circle r={R} fill={COLOR[r.type] || '#333'} />
              <text y="-3" textAnchor="middle" className="bub-t">{typeOf(r.type).label}</text>
              <text y="14" textAnchor="middle" className="bub-s">{r.area.toFixed(1)} m²</text>
            </g>
          );
        })}
        {!rooms.length && <text x={BW / 2} y={BH / 2} textAnchor="middle" className="bub-empty">Add rooms above, drag them together</text>}
      </svg>
      <div className="bub-bar">
        {sel ? (
          <>
            <b>{typeOf(sel.type).label}</b>
            <button className="mini" onClick={() => setArea(-1)} aria-label="Smaller">−</button>
            <span>{sel.area.toFixed(1)} m²</span>
            <button className="mini" onClick={() => setArea(1)} aria-label="Bigger">+</button>
            <button className="mini ghost" onClick={remove}>remove</button>
          </>
        ) : <span className="hint">Click a bubble to resize it. Bubbles that touch want to share a wall.</span>}
      </div>
    </div>
  );
}
