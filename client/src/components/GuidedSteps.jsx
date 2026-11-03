import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import PlanView from './PlanView.jsx';
import Scene3D from './Scene3D.jsx';
import { Icon } from './Icon.jsx';
import { save } from './PlanExport.jsx';
import { demoJson } from '../lib/revitExport.js';
import { techPrimitives, toDxf, toSheetSvg } from '../lib/techPlan.js';

// The steps after "describe" of the guided view (Guided.jsx). The first two reuse the planner's own views, sized to the window; the last two are the way out of the app.

export const PlanStep = () => <div className="gd-fill"><PlanView /></div>;
export const ModelStep = () => <div className="gd-fill"><Scene3D /></div>;

const Tick = ({ on, children }) => <li className={on ? 'on' : ''}><i>{on ? '✓' : ''}</i>{children}</li>;

/** Revit needs an Autodesk licence and someone at the keyboard: the plan goes to the local server (or to a file), the person runs the demo builder (pipeline/revit/DemoBuild). */
export function RevitStep() {
  const room = useSelector((s) => s.room);
  const items = useSelector((s) => s.items);
  const layout = useSelector((s) => s.layout.plan);
  const [server, setServer] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let on = true;
    const ask = () => fetch('/api/dev/demo').then((r) => (r.ok ? r.json() : null)).then((j) => on && setServer(j)).catch(() => on && setServer(null));
    ask();
    const t = setInterval(ask, 3000);
    return () => { on = false; clearInterval(t); };
  }, []);
  const drawing = useMemo(() => techPrimitives(room, layout, items, { project: 'Usable Space' }), [room, layout, items]);
  const svg = useMemo(() => toSheetSvg(drawing), [drawing]);
  const stamp = new Date().toISOString().slice(0, 10);
  const send = async () => {
    const body = JSON.stringify(demoJson(room, layout));
    try {
      const r = await fetch('/api/dev/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!r.ok) throw new Error(String(r.status));
      setMsg('Plan sent. Now run pipeline\\revit\\DemoBuild\\run_demo.ps1: Revit starts and builds DEMO.rvt ("Load Once" when it asks).');
    } catch { // a server that is not this computer cannot start Revit here: hand over the plan as a file
      save('demo.json', body, 'application/json');
      setMsg('This server cannot reach Revit, so the plan was saved as demo.json. Put it in pipeline\\data\\revit_demo, then run pipeline\\revit\\DemoBuild\\run_demo.ps1.');
    }
  };
  return (
    <div className="gd-two">
      <section className="gd-panel gd-actions">
        <h2>Take the plan out of the app</h2>
        <button className="gd-action hot" onClick={send}><Icon name="revit" size={40} /><span><b>Send to Revit</b>Revit builds its own walls, floors and roof from the numbers of this plan.</span></button>
        <button className="gd-action" onClick={() => save(`grundriss-${stamp}.dxf`, toDxf(drawing), 'application/dxf')}><Icon name="download" size={40} /><span><b>DXF for CAD</b>Millimetres, German layers (Waende, Tueren, Fenster, Treppe, Moebel, Raumstempel, Bemassung).</span></button>
        <button className="gd-action" onClick={() => save(`grundriss-A3-${stamp}.svg`, svg, 'image/svg+xml')}><Icon name="plan" size={40} /><span><b>A3 sheet 1:50</b>Opens in any browser or Inkscape, prints to PDF.</span></button>
        <ul className="gd-ticks" aria-label="Revit demo progress">
          <Tick on={!!server?.plan}>a plan is waiting on this computer</Tick>
          <Tick on={!!(server?.project || server?.done)}>Revit has built DEMO.rvt</Tick>
          {server?.failed && <li className="bad"><i>!</i>the demo builder reported an error</li>}
        </ul>
        {msg && <p className="gd-say ok" role="status">{msg}</p>}
      </section>
      <section className="gd-panel gd-sheet" aria-label="The plan as a sheet">
        <div className="sheetprev" dangerouslySetInnerHTML={{ __html: svg }} />
      </section>
    </div>
  );
}

/** Pixel Streaming of the Unreal level: the button opens the page that starts the stream on this computer and shows its progress (client/public/stream-wait.html). */
export function UnrealStep() {
  return (
    <section className="gd-panel gd-unreal">
      <Icon name="stream" size={72} />
      <h2>Walk through it in Unreal</h2>
      <p>The Unreal level runs on this computer and is sent to a browser tab as video. If it is not running yet, the button starts it and shows what is happening. The first start takes a few minutes.</p>
      <button className="gd-go" onClick={() => window.open('/stream-wait.html', '_blank')}>Open the Unreal stream <Icon name="next" size={22} /></button>
      <ol className="gd-ticks" aria-label="What happens">
        <li><i>1</i>the stream server starts</li>
        <li><i>2</i>Unreal loads the level</li>
        <li><i>3</i>the picture connects to the tab</li>
      </ol>
    </section>
  );
}
