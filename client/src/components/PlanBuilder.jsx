import { useDeferredValue, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { sanitizeRoom, dormerRect, stairRect } from '@shared/engine.js';
import { furnishPlan } from '@shared/furnish.js';
import { itemsActions } from '../store/itemsSlice.js';
import { uiActions } from '../store/uiSlice.js';
import { layoutActions } from '../store/layoutSlice.js';
import RoomTree from './RoomTree.jsx';
import AiAssist from './AiAssist.jsx';
import { Icon, IconBtn } from './Icon.jsx';
import PuzzleEditor, { initialPieces } from './PuzzleEditor.jsx';
import { fitBrief } from '@shared/roomTree.js';
import { roomsFromPlanJson } from '@shared/planImport.js';
import BubbleEditor, { linksFrom, ringPositions } from './BubbleEditor.jsx';
import { EXAMPLE_BRIEF, ROOM_TYPES, capacity, generatePlans, hallRect, planFromRects, sanitizeBrief, typeOf } from '@shared/plans.js';

const COLOR = { hall: '#14161c', bedroom: '#1f4e8c', child: '#2b63a8', living: '#7a2f6b', kitchen: '#8a6038', study: '#1f6b45', bath: '#1d5c70', wc: '#144a5c', storage: '#5a3d22' };
const pct = (v) => `${Math.round(v * 100)}`;

function Plan({ room, plan, routes, small, onPick, picked }) {
  const W = room.width, D = room.depth, sr = stairRect(room);
  return (
    <svg className={small ? 'pb-svg small' : 'pb-svg'} viewBox={`-0.3 -0.3 ${W + 0.6} ${D + 0.6}`} role="img" aria-label="Room layout under the roof">
      <rect x="0" y="0" width={W} height={D} fill="#fff" />
      {plan.rooms.map((r) => (
        <g key={r.id} onClick={onPick ? () => onPick(r.id) : undefined} style={onPick ? { cursor: 'pointer' } : undefined}>
          <rect x={r.rect[0]} y={r.rect[1]} width={r.w} height={r.d} fill={COLOR[r.type] || '#333'} stroke="#fff" strokeWidth="0.06" opacity={picked && picked !== r.id ? 0.55 : 1} />
          {!small && <text x={r.rect[0] + r.w / 2} y={r.rect[1] + r.d / 2 - 0.05} textAnchor="middle" className="pb-lbl">{r.id === 'hall' ? 'hall' : typeOf(r.type).label}</text>}
          {!small && <text x={r.rect[0] + r.w / 2} y={r.rect[1] + r.d / 2 + 0.3} textAnchor="middle" className="pb-sub">{r.counted.toFixed(1)} m²</text>}
        </g>
      ))}
      {room.dormers.map((d, i) => { const r = dormerRect(room, d); return <rect key={i} x={r[0]} y={r[1]} width={r[2] - r[0]} height={r[3] - r[1]} fill="none" stroke="#fff" strokeWidth="0.05" strokeDasharray="0.12 0.08" pointerEvents="none" />; })}
      {sr && <rect x={sr[0]} y={sr[1]} width={sr[2] - sr[0]} height={sr[3] - sr[1]} fill="none" stroke="#e8452c" strokeWidth="0.07" pointerEvents="none" />}
      {routes && Object.entries(plan.routes).map(([id, pts]) => (!picked || picked === id) && (
        <polyline key={id} points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#e8452c" strokeWidth="0.07" strokeDasharray="0.15 0.1" pointerEvents="none" />
      ))}
      <rect x="0" y="0" width={W} height={D} fill="none" stroke="#14161c" strokeWidth="0.1" pointerEvents="none" />
    </svg>
  );
}

/** Bubble-diagram brief -> room layouts under the current roof. */
export default function PlanBuilder() {
  const dispatch = useDispatch();
  const roomRaw = useSelector((s) => s.room);
  const room = useMemo(() => sanitizeRoom(roomRaw), [roomRaw]);
  const [brief, setBrief] = useState(EXAMPLE_BRIEF);
  const [seed, setSeed] = useState(1);
  const [pick, setPick] = useState(0);
  const [focus, setFocus] = useState(null);
  const [routes, setRoutes] = useState(true);
  const [mode, setMode] = useState('bubbles');
  const [pos, setPos] = useState(() => ringPositions(EXAMPLE_BRIEF.rooms));
  const [selected, setSelected] = useState(null);
  const [treePath, setTreePath] = useState([]);
  const [pzRaw, setPz] = useState({});
  const setRooms = (fn) => setBrief((b) => ({ ...b, rooms: typeof fn === 'function' ? fn(b.rooms) : fn }));
  const cleanNow = useMemo(() => sanitizeBrief(mode === 'bubbles' ? { rooms: brief.rooms, links: linksFrom(brief.rooms, pos) } : brief), [brief, mode, pos]);
  const clean = useDeferredValue(cleanNow); // dragging a bubble stays smooth, the layouts catch up
  const plans = useMemo(() => generatePlans(room, clean, { seed }), [room, clean, seed]);
  const cap = useMemo(() => capacity(room, clean), [room, clean]);
  // puzzle pieces follow the rooms of the brief: a room with a new size starts again in the tray
  const pz = useMemo(() => {
    const base = initialPieces(brief.rooms), out = {};
    for (const r of brief.rooms) out[r.id] = pzRaw[r.id] && pzRaw[r.id].area === r.area ? pzRaw[r.id] : { ...base[r.id], area: r.area };
    return out;
  }, [brief.rooms, pzRaw]);
  const puzzlePlan = useMemo(() => {
    if (mode !== 'puzzle') return null;
    const rects = { hall: hallRect(room) };
    for (const r of brief.rooms) if (pz[r.id].x !== null) rects[r.id] = [pz[r.id].x, pz[r.id].y, pz[r.id].x + pz[r.id].w, pz[r.id].y + pz[r.id].d];
    return planFromRects(room, brief, rects);
  }, [mode, room, brief, pz]);
  const plan = mode === 'puzzle' ? puzzlePlan : plans[Math.min(pick, plans.length - 1)];
  const solve = () => { // fill the puzzle with the best generated layout, then the user can move pieces
    const best = plans[0];
    if (!best) return;
    setPz(Object.fromEntries(best.rooms.filter((r) => r.id !== 'hall').map((r) => [r.id, { w: +(r.rect[2] - r.rect[0]).toFixed(2), d: +(r.rect[3] - r.rect[1]).toFixed(2), x: +r.rect[0].toFixed(2), y: +r.rect[1].toFixed(2), area: brief.rooms.find((q) => q.id === r.id)?.area }])));
  };
  const importPlan = (data, name) => {
    try {
      const out = roomsFromPlanJson(data, room);
      setBrief(out.brief); setPos(ringPositions(out.brief.rooms)); setPz(out.pieces); setMode('puzzle');
      const unplaced = Object.values(out.pieces).filter((p) => p.x === null).length;
      dispatch(uiActions.setToast(`${name}: ${out.brief.rooms.length} rooms read${out.guessed ? `, ${out.guessed} types guessed from the size (check them in "Type rooms")` : ''}${unplaced ? `, ${unplaced} waiting in the tray` : ''}.`));
    } catch (e) { dispatch(uiActions.setToast(e.message)); }
  };
  const openPlanFile = async (file) => { try { importPlan(JSON.parse(await file.text()), file.name); } catch { dispatch(uiActions.setToast('That file is not valid JSON.')); } };
  const useTreeBrief = (b) => {
    const fitted = fitBrief(b, capacity(room, b).have);
    setBrief(fitted); setPos(ringPositions(fitted.rooms)); setPz({}); setMode('bubbles');
    dispatch(uiActions.setToast(`${fitted.rooms.length} rooms ready: drag the bubbles together or press Generate.`));
  };

  const setRoom = (i, patch) => setBrief((b) => ({ ...b, rooms: b.rooms.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const addRoom = () => setBrief((b) => ({ ...b, rooms: [...b.rooms, { id: `r${Date.now() % 1000}`, type: 'bedroom', area: ROOM_TYPES.bedroom.area }] }));
  const removeRoom = (i) => setBrief((b) => { const id = b.rooms[i].id; return { rooms: b.rooms.filter((_, k) => k !== i), links: b.links.filter((l) => l[0] !== id && l[1] !== id) }; });
  const hasLink = (a, b) => brief.links.find((l) => (l[0] === a && l[1] === b) || (l[0] === b && l[1] === a));
  const toggleLink = (a, b) => setBrief((s) => (hasLink(a, b)
    ? { ...s, links: s.links.filter((l) => !((l[0] === a && l[1] === b) || (l[0] === b && l[1] === a))) }
    : { ...s, links: [...s.links, [a, b, 'near']] }));
  const furnish = () => {
    const out = furnishPlan(room, plan, { seed });
    dispatch(itemsActions.setItems(out.items));
    dispatch(layoutActions.setLayout(plan));
    dispatch(uiActions.setToast(`Furnished: ${out.placed} of ${out.total} pieces found a place inside their rooms.`));
    dispatch(uiActions.setCenterTab('plan'));
  };
  const generate = () => { setSeed((n) => n + 1); setPick(0); setFocus(null); };

  return (
    <div className="card pb">
      <div className="cardhead">
        <h2>Room layout</h2>
        <nav className="tabs icontabs" aria-label="How to describe the rooms">
          <IconBtn icon="bubbles" label="Draw bubbles" cap="Bubbles" size={22} active={mode === 'bubbles'} onClick={() => setMode('bubbles')} />
          <IconBtn icon="tree" label="Answer a few questions" cap="Questions" size={22} active={mode === 'tree'} onClick={() => setMode('tree')} />
          <IconBtn icon="puzzle" label="Assemble the rooms like a puzzle" cap="Puzzle" size={22} active={mode === 'puzzle'} onClick={() => setMode('puzzle')} />
          <IconBtn icon="list" label="Type the rooms" cap="List" size={22} active={mode === 'form'} onClick={() => setMode('form')} />
        </nav>
        <IconBtn icon="file" label="Load the sample plan" onClick={async () => importPlan(await (await fetch('/samples/sample-plan.json')).json(), 'sample plan')} />
        <label className="ib filebtn" data-tip="Import a plan file (JSON)"><Icon name="upload" size={20} /><input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files[0] && openPlanFile(e.target.files[0])} /></label>
        {mode === 'puzzle' ? <IconBtn icon="wand" label="Solve the puzzle for me" onClick={solve} /> : <IconBtn icon="dice" label="Generate again" onClick={generate} />}
        <IconBtn icon="sofa" className="primary" label="Furnish this layout" cap="Furnish" disabled={!plan} onClick={furnish} />
      </div>
      <AiAssist onBrief={useTreeBrief} onPlan={importPlan} />
      {mode === 'tree' && <RoomTree path={treePath} setPath={setTreePath} onUse={useTreeBrief} />}
      {mode === 'puzzle' && <PuzzleEditor room={room} rooms={brief.rooms} pz={pz} setPz={setPz} />}
      {mode === 'bubbles' && <BubbleEditor rooms={brief.rooms} pos={pos} setPos={setPos} setRooms={setRooms} selected={selected} setSelected={setSelected} />}
      <div className="pb-grid">
        <div className="pb-brief">
          {mode !== 'form' && <p className={cap.ok ? 'hint' : 'hint bad'}>Wanted {cap.need.toFixed(0)} m² (with hall) of {cap.have.toFixed(0)} m² usable on this roof.</p>}
          {mode === 'form' && <><h3>Brief</h3>
          {brief.rooms.map((r, i) => (
            <div className="pb-row" key={i}>
              <select value={r.type} onChange={(e) => setRoom(i, { type: e.target.value, area: ROOM_TYPES[e.target.value].area })} aria-label="Room type">
                {Object.entries(ROOM_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>
              <input type="number" min="2" max="40" step="0.5" value={r.area} onChange={(e) => setRoom(i, { area: +e.target.value })} aria-label="Wanted usable area in square metres" />
              <span className="unit">m²</span>
              <button className="mini ghost" title="Remove room" onClick={() => removeRoom(i)}>×</button>
            </div>
          ))}
          <button className="mini" onClick={addRoom} disabled={brief.rooms.length >= 8}>+ room</button>
          <p className={cap.ok ? 'hint' : 'hint bad'}>Wanted {cap.need.toFixed(0)} m² (with hall) of {cap.have.toFixed(0)} m² usable on this roof.</p>
          <h3>Rooms that should touch</h3>
          <div className="pb-links">
            {clean.rooms.map((a, i) => clean.rooms.slice(i + 1).map((b) => (
              <label key={a.id + b.id} className="pb-link"><input type="checkbox" checked={!!hasLink(a.id, b.id)} onChange={() => toggleLink(a.id, b.id)} />{typeOf(a.type).label} – {typeOf(b.type).label}</label>
            )))}
          </div>
          <p className="hint">The roof comes from the Room panel. The usable area counts height: ≥ 2.0 m fully, 1–2 m half.</p></>}
        </div>

        <div className="pb-main">
          {!plan && <p className="hint">{mode === 'puzzle' ? 'Place every room to see the score.' : 'Add at least one room.'}</p>}
          {plan && (
            <>
              <div className="pb-top">
                <b className="pb-score">{pct(plan.score)}</b>
                <label className="inline"><input type="checkbox" checked={routes} onChange={(e) => setRoutes(e.target.checked)} /> escape routes to the stair</label>
              </div>
              <Plan room={room} plan={plan} routes={routes} onPick={(id) => setFocus(focus === id ? null : id)} picked={focus} />
              {mode !== 'puzzle' && <div className="pb-cands">
                {plans.map((p, i) => (
                  <button key={i} className={i === pick ? 'cand on' : 'cand'} onClick={() => { setPick(i); setFocus(null); }} aria-pressed={i === pick}>
                    <Plan room={room} plan={p} small />
                    <span>Option {i + 1} · {pct(p.score)}</span>
                  </button>
                ))}
              </div>}
              <ul className="findings">
                {plan.findings.length === 0 && <li className="finding info"><span className="mark">i</span><span>No findings for this layout.</span></li>}
                {plan.findings.slice(0, 8).map((f, i) => (
                  <li key={i} className={`finding ${f.severity}`} onClick={() => setFocus(f.room)}><span className="mark">{f.severity === 'warn' ? '!' : 'i'}</span><span>{f.msg}</span></li>
                ))}
              </ul>
              <p className="hint">Score = area fit 22 % · shape 18 % · headroom 14 % · access 18 % · wanted links 18 % · daylight 10 %, minus 0.03 per warning. Rule-of-thumb thresholds, for exploration.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
