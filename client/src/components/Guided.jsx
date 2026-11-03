import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { sanitizeRoom } from '@shared/engine.js';
import { furnishPlan } from '@shared/furnish.js';
import { fitBrief } from '@shared/roomTree.js';
import { roomsFromPlanJson } from '@shared/planImport.js';
import { EXAMPLE_BRIEF, capacity, generatePlans, hallRect, planFromRects, sanitizeBrief } from '@shared/plans.js';
import { itemsActions } from '../store/itemsSlice.js';
import { layoutActions } from '../store/layoutSlice.js';
import { uiActions } from '../store/uiSlice.js';
import { Icon, IconBtn } from './Icon.jsx';
import Pop from './Pop.jsx';
import BubbleEditor, { linksFrom, ringPositions } from './BubbleEditor.jsx';
import PuzzleEditor, { initialPieces } from './PuzzleEditor.jsx';
import { Plan } from './PlanBuilder.jsx';
import { askBrief, askSketch } from './AiAssist.jsx';
import { PlanStep, ModelStep, RevitStep, UnrealStep } from './GuidedSteps.jsx';

// The guided view: one step per screen, sized to the window (no scrolling), and a bar at the bottom that says what the next step is.
// describe -> technical plan -> 3D -> Revit -> Unreal. The planner with all its panels stays one click away ("Expert tools").
const STEPS = [
  { id: 'describe', icon: 'bubbles', title: 'Describe', what: 'say which rooms you want, with bubbles, words, a sketch or a puzzle.' },
  { id: 'plan', icon: 'plan', title: 'Technical plan', what: 'your rooms become walls, doors and furniture on a drawing to scale. You can still change them.' },
  { id: '3d', icon: 'cube', title: '3D preview', what: 'the plan is built up under the roof. Orbit it, check the heights, walk inside.' },
  { id: 'revit', icon: 'revit', title: 'Revit', what: 'send the plan to Revit, or take it as DXF for CAD or as a printable A3 sheet.' },
  { id: 'unreal', icon: 'stream', title: 'Unreal', what: 'walk through it in the game engine, streamed to a browser tab.' },
];

const MODES = [
  { id: 'bubbles', icon: 'bubbles', title: 'Bubbles', text: 'Draw each room as a bubble and drag the ones that should touch together.' },
  { id: 'text', icon: 'chat', title: 'Text', text: 'Describe the home in a few words, in English or German.' },
  { id: 'sketch', icon: 'pencil', title: 'Sketch', text: 'Upload a hand drawing or a photo of a plan.' },
  { id: 'puzzle', icon: 'puzzle', title: 'Puzzle', text: 'Fit the rooms into the attic yourself, piece by piece.' },
];

const EXAMPLES = ['2 bedrooms, a bath next to them and a study of 6 m²', 'Wohnzimmer 20 m², Küche, Bad und ein Schlafzimmer', "a kid's room, a bedroom, a kitchen and a bath"];

/** Everything step 1 knows: how the rooms are described, the layouts made from it, and the one that goes on. */
function useDescribe(room) {
  const dispatch = useDispatch();
  const [mode, setMode] = useState(null); // null: the person has not chosen yet
  const [brief, setBrief] = useState(EXAMPLE_BRIEF);
  const [pos, setPos] = useState(() => ringPositions(EXAMPLE_BRIEF.rooms));
  const [pzRaw, setPz] = useState({});
  const [selected, setSelected] = useState(null);
  const [seed, setSeed] = useState(1);
  const [pick, setPick] = useState(0);
  const [read, setRead] = useState(false); // text or sketch: something was read
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState(null);
  const setRooms = (fn) => setBrief((b) => ({ ...b, rooms: typeof fn === 'function' ? fn(b.rooms) : fn }));

  const cleanNow = useMemo(() => sanitizeBrief(mode === 'bubbles' ? { rooms: brief.rooms, links: linksFrom(brief.rooms, pos) } : brief), [brief, mode, pos]);
  const clean = useDeferredValue(cleanNow); // dragging a bubble stays smooth, the layouts catch up
  const generated = mode === 'bubbles' || (mode === 'text' && read);
  const plans = useMemo(() => (generated ? generatePlans(room, clean, { seed }) : []), [generated, room, clean, seed]);
  const cap = useMemo(() => capacity(room, clean), [room, clean]);
  // puzzle pieces follow the rooms of the brief: a room with a new size starts again in the tray
  const pz = useMemo(() => {
    const base = initialPieces(brief.rooms), out = {};
    for (const r of brief.rooms) out[r.id] = pzRaw[r.id] && pzRaw[r.id].area === r.area ? pzRaw[r.id] : { ...base[r.id], area: r.area };
    return out;
  }, [brief.rooms, pzRaw]);
  const pieces = mode === 'puzzle' || (mode === 'sketch' && read);
  const puzzlePlan = useMemo(() => {
    if (!pieces) return null;
    const rects = { hall: hallRect(room) };
    for (const r of brief.rooms) if (pz[r.id].x !== null) rects[r.id] = [pz[r.id].x, pz[r.id].y, pz[r.id].x + pz[r.id].w, pz[r.id].y + pz[r.id].d];
    return planFromRects(room, brief, rects);
  }, [pieces, room, brief, pz]);
  const plan = (pieces ? puzzlePlan : plans[Math.min(pick, plans.length - 1)]) || null;

  const importPlan = (data, name, via) => {
    try {
      const out = roomsFromPlanJson(data, room);
      setBrief(out.brief); setPos(ringPositions(out.brief.rooms)); setPz(out.pieces); setRead(true);
      const unplaced = Object.values(out.pieces).filter((p) => p.x === null).length;
      setSay({ ok: true, text: `${via || name}: ${out.brief.rooms.length} rooms read${out.guessed ? `, ${out.guessed} types guessed from the size` : ''}${unplaced ? `, ${unplaced} waiting in the tray (fine-tune them as a puzzle)` : ''}.` });
    } catch (e) { setSay({ ok: false, text: e.message }); }
  };
  const describe = async () => {
    setBusy(true); setSay(null);
    try {
      const j = await askBrief(text);
      const fitted = fitBrief(j.brief, capacity(room, j.brief).have);
      setBrief(fitted); setPos(ringPositions(fitted.rooms)); setPz({}); setRead(true); setSeed((n) => n + 1); setPick(0);
      setSay({ ok: true, text: `${j.engine === 'llm' ? `Read by ${j.model}` : 'Read by the built-in rules'} in ${(j.ms / 1000).toFixed(1)} s: ${j.understood.join(', ')}.${j.ignored?.length ? ` Not understood: ${j.ignored.join(', ')}.` : ''}` });
    } catch (e) { setSay({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const readSketch = async (f) => {
    if (!f) return;
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(f)); setBusy(true); setSay(null);
    try {
      const j = await askSketch(f);
      importPlan(j.plan, f.name, `Sketch read by ${j.model} in ${(j.ms / 1000).toFixed(1)} s`);
    } catch (e) { setSay({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const sample = async () => {
    try { importPlan(await (await fetch('/samples/sample-plan.json')).json(), 'sample plan'); } catch { setSay({ ok: false, text: 'The sample plan could not be loaded.' }); }
  };
  const solve = () => { // fill the puzzle with the best generated layout; the person can move the pieces afterwards
    const best = generatePlans(room, sanitizeBrief(brief), { seed })[0];
    if (!best) return;
    const keep = new Set(best.rooms.map((r) => r.id));
    const left = brief.rooms.filter((r) => !keep.has(r.id));
    if (left.length) setBrief((b) => ({ rooms: b.rooms.filter((r) => keep.has(r.id)), links: b.links.filter((l) => keep.has(l[0]) && keep.has(l[1])) }));
    setSay(left.length ? { ok: true, text: `Left out so the rest fits the roof: ${left.map((r) => r.type).join(', ')}.` } : null);
    setPz(Object.fromEntries(best.rooms.filter((r) => r.id !== 'hall').map((r) => [r.id, { w: +(r.rect[2] - r.rect[0]).toFixed(2), d: +(r.rect[3] - r.rect[1]).toFixed(2), x: +r.rect[0].toFixed(2), y: +r.rect[1].toFixed(2), area: brief.rooms.find((q) => q.id === r.id)?.area }])));
  };
  const furnish = () => {
    const out = furnishPlan(room, plan, { seed });
    dispatch(itemsActions.setItems(out.items));
    dispatch(layoutActions.setLayout(plan));
    return out;
  };
  const reset = () => {
    if (photo) URL.revokeObjectURL(photo);
    setMode(null); setBrief(EXAMPLE_BRIEF); setPos(ringPositions(EXAMPLE_BRIEF.rooms)); setPz({}); setRead(false); setText(''); setPhoto(null); setSay(null); setSeed(1); setPick(0);
  };

  const blocker = plan ? null
    : !mode ? 'Choose how you want to describe your home.'
    : mode === 'text' ? (read ? 'The description gave no rooms: add more words.' : 'Write a few words about the rooms, then press the button.')
    : mode === 'sketch' ? (read ? 'Some rooms wait in the tray: fine-tune them as a puzzle.' : 'Upload a drawing or a photo of a plan.')
    : mode === 'puzzle' ? 'Place every room in the outline, or press Solve.'
    : 'Add at least one room.';

  return { mode, setMode, brief, pos, setPos, setRooms, selected, setSelected, pz, setPz, text, setText, photo, busy, say, read, cap, plan, plans, pick, setPick, generated, blocker, describe, readSketch, sample, solve, furnish, reset, generate: () => { setSeed((n) => n + 1); setPick(0); } };
}

function Chooser({ onPick }) {
  return (
    <div className="gd-choose">
      <h2>How do you want to describe your home?</h2>
      <div className="gd-modes">
        {MODES.map((m) => (
          <button key={m.id} className="gd-mode" onClick={() => onPick(m.id)}>
            <Icon name={m.icon} size={64} />
            <b>{m.title}</b>
            <span>{m.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Preview({ d, room }) {
  const { plan } = d;
  if (!plan) return <div className="gd-empty"><Icon name="plan" size={56} /><p>{d.blocker}</p></div>;
  const warns = plan.findings.filter((f) => f.severity === 'warn');
  return (
    <>
      <div className="gd-ptop">
        <b className="pb-score" data-tip="How well this layout fits the roof, the headroom, the access and the wishes (0 to 100)">{Math.round(plan.score * 100)}</b>
        <span className="gd-cap">plan score</span>
        {plan.adjusted?.length > 0 && (
          <Pop side="below" wide trigger={<span className="aichip ok">changed to be functional · {plan.adjusted.length}</span>}>
            {plan.adjusted.map((n, i) => <p key={i}>{n}</p>)}
          </Pop>
        )}
        {warns.length === 0
          ? <Pop side="below" trigger={<span className="fdot ok">✓</span>}><p>No warnings for this layout.</p></Pop>
          : warns.slice(0, 5).map((f, i) => <Pop key={i} side="below" wide trigger={<span className="fdot warn">!</span>}><p>{f.msg}</p></Pop>)}
        <span className="spacer" />
        {d.generated && <IconBtn icon="dice" label="Make other layouts from the same rooms" cap="Again" onClick={d.generate} />}
      </div>
      <div className="gd-plan"><Plan room={room} plan={plan} /></div>
      {d.generated && (
        <div className="gd-cands">
          {d.plans.map((p, i) => (
            <button key={i} className={i === d.pick ? 'cand on' : 'cand'} onClick={() => d.setPick(i)} aria-pressed={i === d.pick}>
              <Plan room={room} plan={p} small />
              <span>Option {i + 1} · {Math.round(p.score * 100)}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function Describe({ d, room }) {
  const file = useRef(null);
  if (!d.mode) return <Chooser onPick={d.setMode} />;
  return (
    <div className="gd-split">
      <section className="gd-in">
        <nav className="tabs icontabs" aria-label="How to describe your home">
          {MODES.map((m) => <IconBtn key={m.id} icon={m.icon} label={m.text} cap={m.title} size={22} active={d.mode === m.id} onClick={() => d.setMode(m.id)} />)}
        </nav>
        {d.mode === 'bubbles' && (
          <>
            <BubbleEditor rooms={d.brief.rooms} pos={d.pos} setPos={d.setPos} setRooms={d.setRooms} selected={d.selected} setSelected={d.setSelected} />
            <p className={d.cap.ok ? 'hint' : 'hint bad'}>Wanted {d.cap.need.toFixed(0)} m² (with hall) of {d.cap.have.toFixed(0)} m² usable on this roof.</p>
          </>
        )}
        {d.mode === 'text' && (
          <div className="gd-text">
            <textarea value={d.text} onChange={(e) => d.setText(e.target.value)} aria-label="Describe your home" placeholder="Describe it: 2 bedrooms, a bath next to them, a study of 6 m² (English or German)" />
            <div className="gd-chips">{EXAMPLES.map((e) => <button key={e} className="mini" onClick={() => d.setText(e)}>{e}</button>)}</div>
            <div className="gd-row">
              <IconBtn icon="wand" className="primary" label="Turn the description into rooms" cap={d.busy ? 'Reading…' : 'Make the rooms'} disabled={!d.text.trim() || d.busy} onClick={d.describe} />
              {d.read && <button className="mini" onClick={() => d.setMode('bubbles')}>Adjust as bubbles</button>}
            </div>
          </div>
        )}
        {d.mode === 'sketch' && (
          <div className="gd-sketch">
            <div className="gd-drop" role="button" tabIndex={0} onClick={() => file.current?.click()} onKeyDown={(e) => e.key === 'Enter' && file.current?.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); d.readSketch(e.dataTransfer.files[0]); }}>
              {d.photo ? <img src={d.photo} alt="Your sketch" /> : <><Icon name="upload" size={56} /><b>Drop a drawing or a photo of a plan here</b><span>or click to choose a file</span></>}
            </div>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { d.readSketch(e.target.files[0]); e.target.value = ''; }} />
            <div className="gd-row">
              <button className="mini" onClick={() => file.current?.click()} disabled={d.busy}>{d.busy ? 'Reading…' : 'Choose a file'}</button>
              <button className="mini" onClick={d.sample} disabled={d.busy}>Use the sample plan</button>
              {d.read && <button className="mini" onClick={() => d.setMode('puzzle')}>Fine-tune as a puzzle</button>}
            </div>
          </div>
        )}
        {d.mode === 'puzzle' && (
          <>
            <PuzzleEditor room={room} rooms={d.brief.rooms} pz={d.pz} setPz={d.setPz} />
            <div className="gd-row"><IconBtn icon="wand" label="Fill the puzzle with the best layout; you can move the pieces afterwards" cap="Solve for me" onClick={d.solve} /></div>
          </>
        )}
        {d.say && <p className={d.say.ok ? 'gd-say ok' : 'gd-say bad'} role="status">{d.say.text}</p>}
      </section>
      <section className="gd-out gd-panel" aria-label="The plan so far"><Preview d={d} room={room} /></section>
    </div>
  );
}

export default function Guided() {
  const dispatch = useDispatch();
  const step = useSelector((s) => s.ui.guidedStep);
  const roomRaw = useSelector((s) => s.room);
  const room = useMemo(() => sanitizeRoom(roomRaw), [roomRaw]);
  const d = useDescribe(room);
  const [reached, setReached] = useState(step);
  const last = step === STEPS.length - 1;
  const nextStep = STEPS[step + 1];

  const go = (i) => { setReached((r) => Math.max(r, i)); dispatch(uiActions.setGuidedStep(i)); };
  const goTo = (i) => {
    if (step === 0 && i > 0) { // leaving "describe": the chosen layout becomes the technical plan, furnished
      if (!d.plan) return;
      const out = d.furnish();
      dispatch(uiActions.setToast(`Furnished: ${out.placed} of ${out.total} pieces found a place inside their rooms.`));
    }
    go(i);
  };
  const again = () => { d.reset(); setReached(0); dispatch(uiActions.setGuidedStep(0)); };
  const blocked = step === 0 && !d.plan;

  return (
    <div className="gd">
      <header className="gd-top">
        <h1>Usable Space</h1>
        <ol className="gd-steps" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button className={`gd-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} disabled={i > reached || (step === 0 && i > 0 && !d.plan)} aria-current={i === step ? 'step' : undefined} data-tip={s.what} onClick={() => goTo(i)}>
                <span className="n">{i < step ? '✓' : i + 1}</span><Icon name={s.icon} size={18} /><span className="t">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
        <IconBtn icon="layers" label="Open the planner with all its panels (rooms, roof, site, results)" cap="Expert tools" onClick={() => dispatch(uiActions.setView('planner'))} />
      </header>

      <main className="gd-stage">
        {step === 0 && <Describe d={d} room={room} />}
        {step === 1 && <PlanStep />}
        {step === 2 && <ModelStep />}
        {step === 3 && <RevitStep />}
        {step === 4 && <UnrealStep />}
      </main>

      <footer className="gd-next">
        {step > 0 ? <button className="gd-back" onClick={() => go(step - 1)}><Icon name="back" size={20} /> {STEPS[step - 1].title}</button> : <span />}
        <p className="gd-what" aria-live="polite">
          {last ? <><b>That was the last step.</b> Go back to change anything: Revit and Unreal use the plan as it is now.</>
            : <><b>Next: {nextStep.title}.</b> {blocked ? <span className="gd-block">{d.blocker}</span> : nextStep.what}</>}
        </p>
        {last
          ? <button className="gd-go" onClick={again}>New home <Icon name="reset" size={22} /></button>
          : <button className="gd-go" disabled={blocked} onClick={() => goTo(step + 1)}>{nextStep.title} <Icon name="next" size={22} /></button>}
      </footer>
    </div>
  );
}
