import { useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CATALOG } from '@shared/catalog.js';
import { FRONT, bodySize, doorRect, dormerRect, getGrid, itemRects, stairRect, windowRect } from '@shared/engine.js';
import { itemsActions } from '../store/itemsSlice.js';
import { uiActions } from '../store/uiSlice.js';

export const STATUS_COLOR = { ok: '#2f9e5b', warn: '#d99a1c', fail: '#d64545', unplaced: '#8a8f98' };
const PAD = 0.7;
const snap = (v) => Math.round(v / 0.05) * 0.05;

function heatColor(h) {
  if (h < 1.0) return [201, 106, 92];
  if (h < 2.0) { const t = h - 1.0; return [226 + 14 * t, 172 + 40 * t, 96 + 40 * t]; }
  const t = Math.min(1, (h - 2.0) / 1.2);
  return [150 + 50 * t, 200 + 30 * t, 162 + 43 * t];
}

function useHeatImage(room) {
  return useMemo(() => {
    const g = getGrid(room, 0.05);
    const c = document.createElement('canvas');
    c.width = g.nx; c.height = g.ny;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(g.nx, g.ny);
    for (let k = 0; k < g.nx * g.ny; k++) {
      const [r, gg, b] = heatColor(g.h[k]);
      img.data.set([r, gg, b, 255], k * 4);
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }, [room]);
}

export default function PlanView() {
  const dispatch = useDispatch();
  const room = useSelector((s) => s.room);
  const items = useSelector((s) => s.items);
  const result = useSelector((s) => s.analysis.result);
  const { selectedId, showClearances, showHeat, sectionY } = useSelector((s) => s.ui);
  const heat = useHeatImage(room);
  const svgRef = useRef(null);
  const drag = useRef(null);
  const raf = useRef(0);

  const W = room.width, D = room.depth;
  const byId = Object.fromEntries((result?.items || []).map((r) => [r.id, r]));
  const sr = stairRect(room);

  const toPlan = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };

  const down = (it, e) => {
    e.stopPropagation();
    dispatch(uiActions.select(it.id));
    const p = toPlan(e);
    drag.current = { id: it.id, dx: p.x - it.x, dy: p.y - it.y };
    svgRef.current.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const dr = drag.current;
    if (!dr) return;
    const p = toPlan(e);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => dispatch(itemsActions.moveItem({ id: dr.id, x: snap(p.x - dr.dx), y: snap(p.y - dr.dy) })));
  };
  const up = () => { drag.current = null; };

  const unplaced = items.filter((i) => !i.placed);

  return (
    <div className="card plan">
      <div className="cardhead">
        <h2>Plan <small>standing height across the floor</small></h2>
        <label><input type="checkbox" checked={showHeat} onChange={() => dispatch(uiActions.toggle('showHeat'))} /> height map</label>
        <label><input type="checkbox" checked={showClearances} onChange={() => dispatch(uiActions.toggle('showClearances'))} /> clearances</label>
      </div>

      <svg ref={svgRef} viewBox={`${-PAD} ${-PAD} ${W + 2 * PAD} ${D + 2 * PAD}`} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onPointerDown={() => dispatch(uiActions.select(null))} className="planSvg" role="img" aria-label="Floor plan with height map and furniture">
        <defs>
          <pattern id="hatch" width="0.12" height="0.12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="0.12" stroke="var(--ink)" strokeWidth="0.02" opacity="0.5" />
          </pattern>
        </defs>

        <rect x="0" y="0" width={W} height={D} fill="var(--paper)" />
        {showHeat && <image href={heat} x="0" y="0" width={W} height={D} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }} />}

        {room.dormers.map((d, i) => { const r = dormerRect(room, d); return <rect key={i} x={r[0]} y={r[1]} width={r[2] - r[0]} height={r[3] - r[1]} fill="none" stroke="var(--ink)" strokeWidth="0.03" strokeDasharray="0.12 0.08" />; })}
        {room.windows.map((w, i) => { const r = windowRect(room, w); return <rect key={i} x={r[0]} y={r[1]} width={r[2] - r[0]} height={r[3] - r[1]} fill="#6aa9e0" opacity="0.55" />; })}
        {room.doors.map((w, i) => { const r = doorRect(room, w); return <rect key={i} x={r[0]} y={r[1]} width={r[2] - r[0]} height={r[3] - r[1]} fill="none" stroke="var(--ink)" strokeWidth="0.03" strokeDasharray="0.05" />; })}
        {sr && (
          <g>
            <rect x={sr[0]} y={sr[1]} width={sr[2] - sr[0]} height={sr[3] - sr[1]} fill="url(#hatch)" stroke="var(--ink)" strokeWidth="0.04" />
            <text x={(sr[0] + sr[2]) / 2} y={(sr[1] + sr[3]) / 2} className="lbl" textAnchor="middle">stair</text>
          </g>
        )}

        <rect x="0" y="0" width={W} height={D} fill="none" stroke="var(--ink)" strokeWidth="0.08" />
        <line x1="0" x2={W} y1={sectionY} y2={sectionY} stroke="var(--accent)" strokeWidth="0.03" strokeDasharray="0.15 0.1" />
        <text x={W + 0.1} y={sectionY + 0.05} className="lbl" fill="var(--accent)">A</text>
        <text x={W / 2} y={-0.25} textAnchor="middle" className="dim">{W.toFixed(1)} m</text>
        <text x={-0.25} y={D / 2} textAnchor="middle" className="dim" transform={`rotate(-90 ${-0.25} ${D / 2})`}>{D.toFixed(1)} m</text>

        {items.filter((i) => i.placed).map((it) => {
          const def = CATALOG[it.type];
          const res = byId[it.id];
          const rects = itemRects(def, it);
          const b = rects.body;
          const color = STATUS_COLOR[res?.status || 'ok'];
          const sel = it.id === selectedId;
          const f = FRONT[it.rot];
          const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
          const { w, d } = bodySize(def, it.rot);
          const ax = cx + f[0] * (Math.min(w, d) * 0.28), ay = cy + f[1] * (Math.min(w, d) * 0.28);
          return (
            <g key={it.id} onPointerDown={(e) => down(it, e)} style={{ cursor: 'grab' }}>
              {(showClearances || sel) && Object.entries(rects).filter(([k]) => k !== 'body').map(([k, r]) => {
                const z = res?.zones?.[k === 'sideA' || k === 'sideB' ? k : k] ?? 1;
                return <rect key={k} x={r[0]} y={r[1]} width={r[2] - r[0]} height={r[3] - r[1]} fill={z >= 0.9 ? '#2f9e5b' : '#d64545'} opacity={sel ? 0.28 : 0.15} stroke={z >= 0.9 ? '#2f9e5b' : '#d64545'} strokeWidth="0.015" strokeDasharray="0.06" pointerEvents="none" />;
              })}
              <rect x={b[0]} y={b[1]} width={b[2] - b[0]} height={b[3] - b[1]} rx="0.03" fill={def.color} fillOpacity="0.92" stroke={color} strokeWidth={sel ? 0.1 : 0.06} />
              <line x1={cx} y1={cy} x2={ax} y2={ay} stroke="var(--ink)" strokeWidth="0.03" markerEnd="url(#none)" />
              <circle cx={ax} cy={ay} r="0.05" fill="var(--ink)" />
              <text x={cx} y={cy - 0.06} textAnchor="middle" className="lbl small" pointerEvents="none">{def.label}</text>
            </g>
          );
        })}
      </svg>

      <div className="legend">
        <i style={{ background: 'rgb(201,106,92)' }} /> &lt; 1.0 m (not counted)
        <i style={{ background: 'rgb(232,190,110)' }} /> 1.0–2.0 m (counts 50 %)
        <i style={{ background: 'rgb(165,212,175)' }} /> ≥ 2.0 m (counts fully)
        <i className="dash" /> dormer
        <i className="hatch" /> stair
      </div>

      {unplaced.length > 0 && (
        <div className="unplaced">
          <strong>Not on the plan:</strong>
          {unplaced.map((i) => (
            <button key={i.id} className="mini" onClick={() => dispatch(itemsActions.placeAt({ id: i.id, x: snap(W / 2 - 0.5), y: snap(D / 2) }))}>
              {CATALOG[i.type].label} ↳ place
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
