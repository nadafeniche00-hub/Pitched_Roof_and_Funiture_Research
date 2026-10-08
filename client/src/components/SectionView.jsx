import { useDispatch, useSelector } from 'react-redux';
import { CATALOG } from '@shared/catalog.js';
import { itemRects, roofHeight, DEFAULT_RULES } from '@shared/engine.js';
import { uiActions } from '../store/uiSlice.js';
import { STATUS_COLOR } from './PlanView.jsx';

export default function SectionView() {
  const dispatch = useDispatch();
  const room = useSelector((s) => s.room);
  const items = useSelector((s) => s.items);
  const result = useSelector((s) => s.analysis.result);
  const y = Math.min(useSelector((s) => s.ui.sectionY), room.depth);
  const W = room.width;
  const top = Math.max(room.maxHeight, ...room.dormers.map((d) => d.height)) + 0.4;
  const Y = (h) => top - h; // svg y for a height

  const pts = [];
  for (let x = 0; x <= W + 1e-9; x += 0.05) pts.push([x, roofHeight(room, Math.min(x, W), y)]);
  const profile = pts.map(([x, h]) => `${x.toFixed(2)},${Y(h).toFixed(2)}`).join(' ');
  const byId = Object.fromEntries((result?.items || []).map((r) => [r.id, r]));
  const lines = [[1.0, 'rgb(201,106,92)'], [DEFAULT_RULES.walkH, 'var(--accent)'], [2.0, 'rgb(90,170,110)']];

  return (
    <div className="card">
      <div className="cardhead">
        <h2>Section A <small>what the roof leaves at y = {y.toFixed(2)} m</small></h2>
        <input type="range" min="0" max={room.depth} step="0.05" value={y} onChange={(e) => dispatch(uiActions.setSectionY(+e.target.value))} aria-label="Section position" />
      </div>
      <svg viewBox={`-0.5 -0.1 ${W + 1} ${top + 0.5}`} className="sectionSvg" role="img" aria-label="Cross section through the roof storey">
        <polygon points={`0,${Y(0)} ${profile} ${W},${Y(0)}`} fill="var(--paper)" stroke="var(--ink)" strokeWidth="0.04" />
        {lines.map(([h, c]) => h <= top && (
          <g key={h}><line x1="-0.3" x2={W + 0.3} y1={Y(h)} y2={Y(h)} stroke={c} strokeWidth="0.015" strokeDasharray="0.08 0.06" /><text x={W + 0.32} y={Y(h) + 0.04} className="dim small">{h.toFixed(1)}</text></g>
        ))}
        <line x1="-0.3" x2={W + 0.3} y1={Y(0)} y2={Y(0)} stroke="var(--ink)" strokeWidth="0.05" />
        {items.filter((i) => i.placed).map((it) => {
          const b = itemRects(CATALOG[it.type], it).body;
          if (y < b[1] || y > b[3]) return null;
          const def = CATALOG[it.type];
          return <rect key={it.id} x={b[0]} y={Y(def.h)} width={b[2] - b[0]} height={def.h} fill={def.color} stroke={STATUS_COLOR[byId[it.id]?.status || 'ok']} strokeWidth="0.04" />;
        })}
        <g transform={`translate(${W / 2} 0)`} opacity="0.75">
          <circle cx="0" cy={Y(1.66)} r="0.11" fill="var(--ink)" />
          <rect x="-0.14" y={Y(1.5)} width="0.28" height="0.75" rx="0.1" fill="var(--ink)" />
          <rect x="-0.1" y={Y(0.75)} width="0.2" height="0.75" fill="var(--ink)" />
        </g>
      </svg>
      <p className="hint">Person = 1.75 m. Dashed: 1.0 m (below: not counted) · 1.9 m (walking upright) · 2.0 m (full height).</p>
    </div>
  );
}
