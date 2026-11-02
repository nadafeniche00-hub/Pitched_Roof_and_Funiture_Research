import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { defOf } from '@shared/params.js';
import { CATALOG } from '@shared/catalog.js';
import { checkLayout, factCheckItem, factCheckRoom } from '@shared/rules.js';
import lod2 from '@shared/lod2Patterns.json';
import { uiActions } from '../store/uiSlice.js';
import { itemsActions } from '../store/itemsSlice.js';
import { STATUS_COLOR } from './PlanView.jsx';
import SiteResults from './SiteResults.jsx';
import ItemInspector from './ItemInspector.jsx';
import RulesPanel from './RulesPanel.jsx';
import RegionalCheck, { percentile } from './RegionalCheck.jsx';
import StateRoofs from './StateRoofs.jsx';
import Pop from './Pop.jsx';
import { Icon } from './Icon.jsx';
import { useCountUp } from '../lib/useCountUp.js';

const pc = (v) => `${Math.round(v * 100)}%`;
const MARK = { ok: '✓', warn: '!', fail: '✕', unplaced: '–' };
// one picture per kind of piece: the group of the catalogue, or the word in the type
const glyph = (type) => (/desk/.test(type) ? 'desk' : { Sleeping: 'bed', Storage: 'wardrobe', Living: 'sofa', Bathroom: 'basin' }[CATALOG[type]?.group] || 'cube');
const tone = (v) => (v > 0.75 ? '#2f9e5b' : v > 0.4 ? '#d99a1c' : '#d64545');

/** One of the three sub-scores: icon, a bar that fills, a number. The explanation opens on hover. */
function Meter({ icon, value, title, children }) {
  const v = useCountUp(value * 100), c = tone(value);
  return (
    <Pop side="left" block trigger={
      <span className="meter">
        <span className="mico" style={{ background: c }}><Icon name={icon} size={20} /></span>
        <span className="track"><div style={{ width: `${Math.min(100, v)}%`, background: c }} /></span>
        <b>{Math.round(v)}</b>
      </span>
    }>
      <p className="ptitle">{title}</p>
      {children}
    </Pop>
  );
}

export default function ResultsPanel() {
  const dispatch = useDispatch();
  const r = useSelector((s) => s.analysis.result);
  const room = useSelector((s) => s.room);
  const items = useSelector((s) => s.items);
  const disabled = useSelector((s) => s.design.disabled);
  const selectedId = useSelector((s) => s.ui.selectedId);
  const m = r?.metrics;
  const idx = m ? Math.round(m.index * 100) : 0;
  const shown = useCountUp(idx, 900);
  const facts = useMemo(() => [...factCheckRoom(room), ...items.flatMap((it) => factCheckItem(it))], [room, items]);
  const findings = useMemo(() => (r ? checkLayout(room, items, r, { disabled }) : []), [room, items, r, disabled]);
  if (!r) return null;
  const col = idx >= 75 ? '#2f9e5b' : idx >= 45 ? '#d99a1c' : '#d64545';
  const warns = findings.filter((f) => f.severity === 'warn').length + facts.length;
  const st = m.fullStorey;
  const rank = percentile(lod2.gabled_pitch, room.pitch);

  return (
    <div className="panel results">
      <section className="hero">
        <Pop side="left" wide trigger={<span className="ring big" style={{ '--p': shown, '--c': col }}><span>{Math.round(shown)}</span></span>}>
          <p className="ptitle">Usable-Space Index</p>
          <p>0.4 furnishability + 0.3 usable area + 0.3 circulation.</p>
          <div className="facts">
            <div><b>{m.counted.toFixed(1)}</b> m² counted of <b>{m.gross.toFixed(1)}</b> m² gross</div>
            <div><b>{m.lost.toFixed(1)}</b> m² below 1.0 m</div>
            <div><b>{pc(m.walkableShare)}</b> of the floor is walkable upright ({pc(m.freeWalkableShare)} left free)</div>
          </div>
        </Pop>
        <div className="meters">
          <Meter icon="sofa" value={m.furnish} title="Furnishability"><p>Share of the required pieces that fit with their clearances; warnings count half.</p><p><b>{m.fits}</b> of <b>{m.total}</b> pieces fit.</p></Meter>
          <Meter icon="roof" value={m.usableRatio} title="Usable area"><p>Floor counted by height: 2.0 m and up 100 %, 1 to 2 m 50 %, under 1 m 0 %, divided by the gross floor.</p></Meter>
          <Meter icon="walk" value={m.connectivity} title="Circulation"><p>Free standing-height floor that the stair reaches through passages of at least 0.6 m.</p></Meter>
        </div>
      </section>

      <section className="chiprow">
        <Pop side="left" wide trigger={<span className={`bigchip ${st.pass ? 'ok' : 'bad'}`}><Icon name="heightRuler" size={26} /><b>{pc(st.share)}</b></span>}>
          <p className="ptitle">Full-storey test</p>
          <p className={st.pass ? 'good' : 'bad'}>{pc(st.share)} of the floor is at least {st.height.toFixed(2)} m high: {st.pass ? 'passes' : 'fails'}.</p>
          <p className="hint">It needs {pc(st.need)}. A placeholder rule: set it per local code.</p>
        </Pop>
        <Pop side="left" wide trigger={<span className={`bigchip ${warns ? 'warn' : 'ok'}`}><Icon name="clipboard" size={26} /><b>{warns || '✓'}</b></span>}>
          <RulesPanel />
        </Pop>
        <Pop side="left" wide trigger={<span className="bigchip"><Icon name="roof" size={26} /><i className="strip"><i style={{ left: `${rank}%` }} /></i></span>}>
          <RegionalCheck />
          <StateRoofs />
        </Pop>
        <Pop side="left" wide trigger={<span className="bigchip"><Icon name="sun" size={26} /><Icon name="wind" size={22} /></span>}>
          <SiteResults />
        </Pop>
      </section>

      <ItemInspector />

      <section className="fgrid" aria-label={`Furniture: ${m.fits} of ${m.total} fit`}>
        {!items.length && <p className="hint">Add pieces on the left, then drag them or press Auto-place.</p>}
        {items.map((it) => {
          const res = r.items.find((x) => x.id === it.id);
          const s = res?.status || 'unplaced', d = defOf(it);
          return (
            <Pop key={it.id} side="left" trigger={
              <button type="button" className={`fchip ${it.id === selectedId ? 'sel' : ''}`} style={{ '--c': d.color || '#14161c', '--s': STATUS_COLOR[s] }} onClick={() => dispatch(uiActions.select(it.id))} aria-label={d.label}>
                <Icon name={glyph(it.type)} size={24} /><i>{MARK[s]}</i>
              </button>
            }>
              <p className="ptitle">{d.label}</p>
              {s !== 'ok' && res?.issues.map((x, i) => <div key={i} className="issue">{x.msg}</div>)}
              {s === 'ok' && <p className="good">fits</p>}
              <button type="button" className="mini" onClick={() => { dispatch(itemsActions.removeItem(it.id)); dispatch(uiActions.select(null)); }}>Remove</button>
            </Pop>
          );
        })}
      </section>
    </div>
  );
}
