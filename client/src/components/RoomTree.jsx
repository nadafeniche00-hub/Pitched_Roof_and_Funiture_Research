import { useMemo } from 'react';
import { TREE, ROOT, briefFromPath, walkTree } from '@shared/roomTree.js';
import { typeOf } from '@shared/plans.js';

// The decision tree drawn as nodes: each answer opens the next question to its right, the chosen branch is highlighted.
const COL = 210, ROW = 52, TOP = 54, NW = 170, NH = 40;

export default function RoomTree({ path, setPath, onUse }) {
  const { chosen, node } = useMemo(() => walkTree(path), [path]);
  const brief = useMemo(() => briefFromPath(path), [path]);

  // one column per question asked so far (plus the open one), left to right
  const cols = [];
  let q = ROOT;
  for (let i = 0; i <= path.length && q; i++) {
    cols.push({ i, q, options: TREE[q].options, picked: path[i] });
    q = chosen[i]?.next ?? null;
  }
  const H = TOP + Math.max(...cols.map((c) => c.options.length)) * ROW + 10;
  const W = (cols.length + (brief ? 1 : 0)) * COL + 20;
  const optY = (k) => TOP + k * ROW;

  return (
    <div className="rtree">
      <div className="rtree-scroll">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Decision tree: answer the questions to get a room list">
          {cols.map((c) => {
            const x = 10 + c.i * COL;
            const pi = c.picked ? c.options.findIndex((o) => o.id === c.picked) : -1;
            const next = cols[c.i + 1];
            return (
              <g key={c.q} className="rt-col" style={{ animationDelay: '0s' }}>
                <text x={x} y={24} className="rt-q">{TREE[c.q].q}</text>
                {pi >= 0 && (next || brief) && (
                  <path className="rt-edge" d={`M ${x + NW} ${optY(pi) + NH / 2} C ${x + NW + 24} ${optY(pi) + NH / 2}, ${x + COL - 24} ${next ? 32 : optY(0) + NH / 2}, ${x + COL} ${next ? 32 : optY(0) + NH / 2}`} />
                )}
                {c.options.map((o, k) => (
                  <g key={o.id} className={`rt-node ${c.picked === o.id ? 'on' : c.picked ? 'dim' : ''}`} transform={`translate(${x}, ${optY(k)})`}
                    onClick={() => setPath([...path.slice(0, c.i), o.id])} role="button" tabIndex={0}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPath([...path.slice(0, c.i), o.id])}>
                    <rect width={NW} height={NH} />
                    <text x={NW / 2} y={NH / 2 + 4} textAnchor="middle">{o.label}</text>
                  </g>
                ))}
              </g>
            );
          })}
          {brief && (
            <g className="rt-col rt-leaf" transform={`translate(${10 + cols.length * COL}, ${TOP - 20})`}>
              <rect width={NW + 20} height={34 + brief.rooms.length * 22} />
              <text x={10} y={20} className="rt-q">Rooms</text>
              {brief.rooms.map((r, i) => <text key={r.id} x={10} y={42 + i * 22} className="rt-room">{typeOf(r.type).label} · {r.area} m²</text>)}
            </g>
          )}
        </svg>
      </div>
      <div className="rtree-bar">
        <button disabled={!path.length} onClick={() => setPath([])}>Start over</button>
        <button className="primary" disabled={!brief || node !== null} onClick={() => onUse(brief)}>Use these rooms</button>
        {!brief && <span className="hint">Answer the {Math.max(0, 4 - path.length)} remaining question{path.length === 3 ? '' : 's'}.</span>}
      </div>
    </div>
  );
}
