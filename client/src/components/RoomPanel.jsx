import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CATALOG, PROGRAMS } from '@shared/catalog.js';
import { roofTemplates, selectedRoofTemplate, setRoofTemplate } from '../lib/roofTemplates.js';
import { roomActions } from '../store/roomSlice.js';
import { itemsActions } from '../store/itemsSlice.js';
import { resolveDormer } from '@shared/params.js';
import DesignPanel from './DesignPanel.jsx';
import Pop from './Pop.jsx';
import { Icon, IconBtn } from './Icon.jsx';

/** A row of the left panel: icon, name, a count. The form behind it opens to the right on hover or focus; the + button stays on the row. */
function Drawer({ icon, title, count, action, children }) {
  return (
    <section className="drawer">
      <Pop side="right" wide block trigger={<span className="drow"><Icon name={icon} size={20} /><span className="dt">{title}</span>{count != null && <b className="dc">{count}</b>}</span>}>
        {children}
      </Pop>
      {action}
    </section>
  );
}

function Slider({ label, icon, value, min, max, step, unit, onChange }) {
  return (
    <label className="row">
      <span className="rl">{icon && <Icon name={icon} size={18} />}{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <output>{(+value).toFixed(step < 0.1 ? 2 : 1)}{unit}</output>
    </label>
  );
}

// `source` = name of the inheritance layer the value comes from; `onReset` clears an override.
function Num({ label, value, step = 0.1, onChange, source, onReset }) {
  const inherited = source && source !== 'This dormer';
  return (
    <label className={`num ${inherited ? 'inherited' : ''}`} title={source ? `from: ${source}` : undefined}>
      <span>{label}{source && !inherited && <button type="button" className="reset" title="Back to the inherited value" onClick={(e) => { e.preventDefault(); onReset?.(); }}>↺</button>}</span>
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
    <Drawer icon={kind === 'doors' ? 'door' : 'window'} title={title} count={list.length}
      action={<IconBtn icon="plus" size={16} className="mini" label={`Add a ${kind === 'doors' ? 'door' : 'window'}`} onClick={() => dispatch(roomActions.addOpening(kind))} />}>
      {list.map((o, i) => (
        <div className="line" key={i}>
          <select value={o.wall} onChange={(e) => patch(i, { wall: e.target.value })}>{WALLS.map((w) => <option key={w}>{w}</option>)}</select>
          <Num label="at" value={o.pos} onChange={(v) => patch(i, { pos: v })} />
          <Num label="w" value={o.width} onChange={(v) => patch(i, { width: v })} />
          <IconBtn icon="close" size={16} className="mini" label="Remove" onClick={() => dispatch(roomActions.removeOpening({ kind, i }))} />
        </div>
      ))}
      {!list.length && <p className="hint">None yet: press + on the row.</p>}
    </Drawer>
  );
}

export default function RoomPanel() {
  const dispatch = useDispatch();
  const room = useSelector((s) => s.room);
  const items = useSelector((s) => s.items);
  const set = (key) => (value) => dispatch(roomActions.setParam({ key, value }));
  const [tpl, setTpl] = useState(() => selectedRoofTemplate().id);
  const groups = Object.entries(CATALOG).reduce((a, [k, v]) => { (a[v.group] ||= []).push([k, v]); return a; }, {});

  return (
    <div className="panel">
      <section>
        <h3><span className="h3t"><Icon name="roof" size={18} /> Room under the roof</span></h3>
        <Slider label="Width" icon="width" unit=" m" min={3} max={10} step={0.1} value={room.width} onChange={set('width')} />
        <Slider label="Depth" icon="depth" unit=" m" min={3} max={12} step={0.1} value={room.depth} onChange={set('depth')} />
        <Slider label="Knee wall" icon="kneewall" unit=" m" min={0} max={2} step={0.05} value={room.kneeWall} onChange={set('kneeWall')} />
        <Slider label="Roof pitch" icon="pitch" unit="°" min={15} max={70} step={1} value={room.pitch} onChange={set('pitch')} />
        <Slider label="Max. height" icon="heightRuler" unit=" m" min={2} max={4.5} step={0.1} value={room.maxHeight} onChange={set('maxHeight')} />
        {roofTemplates.length > 1 && ( // only once the Revit export has been converted (pipeline/revit/convert_templates.mjs)
          <label className="row" title="The layers shown when you hover the roof in the walk view">
            <span className="rl"><Icon name="layers" size={18} />Roof build-up</span>
            <select value={tpl} onChange={(e) => { setTpl(e.target.value); setRoofTemplate(e.target.value); }}>
              {roofTemplates.map((t) => <option key={t.id} value={t.id}>{t.source === 'revit' ? `${t.name} · ${t.totalMm} mm` : t.name}</option>)}
            </select>
            <output />
          </label>
        )}
      </section>

      <Drawer icon="dormer" title="Dormers" count={room.dormers.length} action={<IconBtn icon="plus" size={16} className="mini" label="Add a dormer" onClick={() => dispatch(roomActions.addDormer())} />}>
        <p className="hint" style={{ margin: '0 0 6px' }}>Defaults for every dormer:</p>
        <div className="line wrap">
          {['width', 'depth', 'height'].map((k) => (
            <Num key={k} label={k} value={room.dormerDefaults[k]} onChange={(v) => dispatch(roomActions.setDormerDefault({ key: k, value: v }))} />
          ))}
        </div>
        {room.dormers.map((raw, i) => {
          const d = resolveDormer(room, raw);
          const patch = (p) => dispatch(roomActions.patchDormer({ i, patch: p }));
          const field = (k, label) => (
            <Num label={label} value={d[k]} source={d.source[k]} onChange={(v) => patch({ [k]: v })}
              onReset={() => dispatch(roomActions.resetDormerField({ i, key: k }))} />
          );
          return (
            <div className="line wrap" key={i}>
              <select value={d.side} onChange={(e) => patch({ side: e.target.value })}><option>left</option><option>right</option></select>
              <Num label="at y" value={d.center} onChange={(v) => patch({ center: v })} />
              {field('width', 'width')}
              {field('depth', 'depth')}
              {field('height', 'height')}
              <IconBtn icon="close" size={16} className="mini" label="Remove this dormer" onClick={() => dispatch(roomActions.removeDormer(i))} />
            </div>
          );
        })}
        {!room.dormers.length && <p className="hint">No dormers</p>}
      </Drawer>

      <Drawer icon="stair" title="Stair" count={room.stair ? '✓' : '–'} action={<IconBtn icon={room.stair ? 'remove' : 'plus'} size={16} className="mini" label={room.stair ? 'Remove the stair opening' : 'Add a stair opening'} onClick={() => dispatch(roomActions.toggleStair())} />}>
        {room.stair && (
          <div className="line wrap">
            {['x', 'y', 'w', 'd'].map((k) => <Num key={k} label={k} value={room.stair[k]} onChange={(v) => dispatch(roomActions.patchStair({ [k]: v }))} />)}
          </div>
        )}
        {!room.stair && <p className="hint">No stair: circulation is not checked.</p>}
      </Drawer>

      <Openings kind="windows" title="Windows" />
      <Openings kind="doors" title="Doors" />

      <Drawer icon="wand" title="Design loop"><DesignPanel /></Drawer>

      <Drawer icon="sofa" title="Furniture" count={items.length}>
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
      </Drawer>
    </div>
  );
}
