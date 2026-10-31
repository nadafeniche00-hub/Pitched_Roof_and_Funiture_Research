import { useDispatch, useSelector } from 'react-redux';
import { defOf } from '@shared/params.js';
import { uiActions } from '../store/uiSlice.js';
import { itemsActions } from '../store/itemsSlice.js';
import { STATUS_COLOR } from './PlanView.jsx';
import SiteResults from './SiteResults.jsx';
import ItemInspector from './ItemInspector.jsx';
import RulesPanel from './RulesPanel.jsx';
import RegionalCheck from './RegionalCheck.jsx';

const pc = (v) => `${Math.round(v * 100)}%`;
const ICON = { ok: '✓', warn: '!', fail: '✕', unplaced: '–' };

function Bar({ label, value, hint }) {
  return (
    <div className="bar" title={hint}>
      <div className="barhead"><span>{label}</span><b>{pc(value)}</b></div>
      <div className="track"><div style={{ width: pc(Math.min(1, value)), background: value > 0.75 ? '#2f9e5b' : value > 0.4 ? '#d99a1c' : '#d64545' }} /></div>
    </div>
  );
}

export default function ResultsPanel() {
  const dispatch = useDispatch();
  const r = useSelector((s) => s.analysis.result);
  const items = useSelector((s) => s.items);
  const selectedId = useSelector((s) => s.ui.selectedId);
  if (!r) return null;
  const m = r.metrics;
  const idx = Math.round(m.index * 100);
  const col = idx >= 75 ? '#2f9e5b' : idx >= 45 ? '#d99a1c' : '#d64545';

  return (
    <div className="panel">
      <section className="score">
        <div className="ring" style={{ '--p': idx, '--c': col }}><span>{idx}</span></div>
        <div>
          <h3>Usable-Space Index</h3>
          <p className="hint">0.4 furnishability + 0.3 usable area + 0.3 circulation</p>
        </div>
      </section>

      <section>
        <Bar label="Furnishability" value={m.furnish} hint="share of required pieces that fit with their clearances (warnings count half)" />
        <Bar label="Usable area" value={m.usableRatio} hint="floor area counted by height (≥2.0 m: 100 %, 1–2 m: 50 %, <1 m: 0 %) / gross" />
        <Bar label="Circulation" value={m.connectivity} hint="free standing-height floor connected to the stair by ≥ 0.6 m passages" />
      </section>

      <section className="facts">
        <div><b>{m.counted.toFixed(1)}</b> m² counted of <b>{m.gross.toFixed(1)}</b> m² gross</div>
        <div><b>{m.lost.toFixed(1)}</b> m² below 1.0 m</div>
        <div><b>{pc(m.walkableShare)}</b> of the floor is walkable upright ({pc(m.freeWalkableShare)} left free)</div>
        <div className={m.fullStorey.pass ? 'good' : 'bad'}>
          Full-storey test: {pc(m.fullStorey.share)} of the floor ≥ {m.fullStorey.height.toFixed(2)} m → {m.fullStorey.pass ? 'passes' : 'fails'} <small>(needs {pc(m.fullStorey.need)}; placeholder rule - set per local code)</small>
        </div>
      </section>

      <RulesPanel />

      <RegionalCheck />

      <ItemInspector />

      <SiteResults />

      <section>
        <h3>Furniture <span className="count">{m.fits}/{m.total} fit</span></h3>
        {!items.length && <p className="hint">Add pieces on the left, then drag them or press Auto-place.</p>}
        <ul className="items">
          {items.map((it) => {
            const res = r.items.find((x) => x.id === it.id);
            const s = res?.status || 'unplaced';
            return (
              <li key={it.id} className={it.id === selectedId ? 'sel' : ''} onClick={() => dispatch(uiActions.select(it.id))}>
                <span className="badge" style={{ background: STATUS_COLOR[s] }}>{ICON[s]}</span>
                <div>
                  <div className="itname">{defOf(it).label}
                    <button className="mini ghost" title="Remove" onClick={(e) => { e.stopPropagation(); dispatch(itemsActions.removeItem(it.id)); }}>×</button>
                  </div>
                  {s !== 'ok' && res?.issues.map((x, i) => <div key={i} className="issue">{x.msg}</div>)}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
