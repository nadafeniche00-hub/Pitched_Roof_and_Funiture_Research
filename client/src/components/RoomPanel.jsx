import { useDispatch, useSelector } from 'react-redux';
import { CATALOG, PROGRAMS } from '@shared/catalog.js';
import { roomActions } from '../store/roomSlice.js';
import { itemsActions } from '../store/itemsSlice.js';

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <label className="row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <output>{(+value).toFixed(step < 0.1 ? 2 : 1)}{unit}</output>
    </label>
  );
}

function Num({ label, value, step = 0.1, onChange }) {
  return (
    <label className="num">
      <span>{label}</span>
      <input type="number" step={step} value={Number(value).toFixed(2)} onChange={(e) => Number.isFinite(+e.target.value) && onChange(+e.target.value)} />
    </label>
  );
}

const WALLS = ['N', 'E', 'S', 'W'];

function Openings({ kind, title }) {
  const dispatch = useDispatch();
  const list = useSelector((s) => s.room[kind]);
  const patch = (i, p) => dispatch(roomActions.patchOpening({ kind, i, patch: p }));
  return (
    <section>
      <h3>{title} <button className="mini" onClick={() => dispatch(roomActions.addOpening(kind))}>+ add</button></h3>
      {list.map((o, i) => (
        <div className="line" key={i}>
          <select value={o.wall} onChange={(e) => patch(i, { wall: e.target.value })}>{WALLS.map((w) => <option key={w}>{w}</option>)}</select>
          <Num label="at" value={o.pos} onChange={(v) => patch(i, { pos: v })} />
          <Num label="w" value={o.width} onChange={(v) => patch(i, { width: v })} />
          <button className="mini" onClick={() => dispatch(roomActions.removeOpening({ kind, i }))}>×</button>
        </div>
      ))}
    </section>
  );
}

export default function RoomPanel() {
  const dispatch = useDispatch();
  const room = useSelector((s) => s.room);
  const items = useSelector((s) => s.items);
  const set = (key) => (value) => dispatch(roomActions.setParam({ key, value }));
  const groups = Object.entries(CATALOG).reduce((a, [k, v]) => { (a[v.group] ||= []).push([k, v]); return a; }, {});

  return (
    <div className="panel">
      <section>
        <h3>Room under the roof</h3>
        <Slider label="Width" unit=" m" min={3} max={10} step={0.1} value={room.width} onChange={set('width')} />
        <Slider label="Depth" unit=" m" min={3} max={12} step={0.1} value={room.depth} onChange={set('depth')} />
        <Slider label="Knee wall" unit=" m" min={0} max={2} step={0.05} value={room.kneeWall} onChange={set('kneeWall')} />
        <Slider label="Roof pitch" unit="°" min={15} max={70} step={1} value={room.pitch} onChange={set('pitch')} />
        <Slider label="Max. height" unit=" m" min={2} max={4.5} step={0.1} value={room.maxHeight} onChange={set('maxHeight')} />
      </section>

      <section>
        <h3>Dormers <button className="mini" onClick={() => dispatch(roomActions.addDormer())}>+ add</button></h3>
        {room.dormers.map((d, i) => {
          const patch = (p) => dispatch(roomActions.patchDormer({ i, patch: p }));
          return (
            <div className="line wrap" key={i}>
              <select value={d.side} onChange={(e) => patch({ side: e.target.value })}><option>left</option><option>right</option></select>
              <Num label="at y" value={d.center} onChange={(v) => patch({ center: v })} />
              <Num label="width" value={d.width} onChange={(v) => patch({ width: v })} />
              <Num label="depth" value={d.depth} onChange={(v) => patch({ depth: v })} />
              <Num label="height" value={d.height} onChange={(v) => patch({ height: v })} />
              <button className="mini" onClick={() => dispatch(roomActions.removeDormer(i))}>×</button>
            </div>
          );
        })}
        {!room.dormers.length && <p className="hint">None - the roof slope runs unbroken.</p>}
      </section>

      <section>
        <h3>Stair opening <button className="mini" onClick={() => dispatch(roomActions.toggleStair())}>{room.stair ? 'remove' : '+ add'}</button></h3>
        {room.stair && (
          <div className="line wrap">
            {['x', 'y', 'w', 'd'].map((k) => <Num key={k} label={k} value={room.stair[k]} onChange={(v) => dispatch(roomActions.patchStair({ [k]: v }))} />)}
          </div>
        )}
        {!room.stair && <p className="hint">No entry defined: circulation is not checked.</p>}
      </section>

      <Openings kind="windows" title="Windows" />
      <Openings kind="doors" title="Doors" />

      <section>
        <h3>Furniture programme</h3>
        <div className="chips">
          {Object.entries(PROGRAMS).map(([k, p]) => (
            <button key={k} className="mini" onClick={() => p.types.forEach((t) => dispatch(itemsActions.addItem(t)))}>+ {p.label}</button>
          ))}
        </div>
        {Object.entries(groups).map(([g, list]) => (
          <div key={g} className="group">
            <span className="glabel">{g}</span>
            <div className="chips">
              {list.map(([k, v]) => (
                <button key={k} className="chip" style={{ '--c': v.color }} title={`${v.w} × ${v.d} m`} onClick={() => dispatch(itemsActions.addItem(k))}>+ {v.label}</button>
              ))}
            </div>
          </div>
        ))}
        <p className="hint">{items.length} pieces · drag on the plan, <kbd>R</kbd> rotates, <kbd>Del</kbd> removes.</p>
      </section>
    </div>
  );
}
