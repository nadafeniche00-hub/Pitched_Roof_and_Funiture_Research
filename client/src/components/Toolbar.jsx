import { useDispatch, useSelector } from 'react-redux';
import { loadScenario } from '../store/actions.js';
import { uiActions } from '../store/uiSlice.js';
import { itemsActions } from '../store/itemsSlice.js';
import { autoPlace, saveProject, loadProject, deleteProject } from '../store/thunks.js';
import { useT, useLang } from '../lib/i18n.js';
import { IconBtn } from './Icon.jsx';

const VIEW_ICON = { planner: 'house', library: 'library', ifc: 'cube', lph5: 'clipboard', knowledge: 'book' };

// The Unreal level in the browser (Pixel Streaming, pipeline/render/unreal/pixelstreaming). The button opens a page of this app at once (no blank tab, no popup blocked): that page asks the local
// server to start the stream, shows what is happening (stream server, Unreal loading, picture connected) and opens the picture when a streamer has really joined. Local server only.
function StreamButton() {
  const go = () => window.open('/stream-wait.html', '_blank');
  return <IconBtn icon="stream" label="Walk the house in Unreal in a browser tab (Pixel Streaming). Starts it when it is not running and shows the progress." cap="Stream" onClick={go} />;
}

export default function Toolbar() {
  const dispatch = useDispatch();
  const { projectName, busy, view } = useSelector((s) => s.ui);
  const t = useT();
  const lang = useLang();
  const { list, presets, serverUp } = useSelector((s) => s.projects);

  return (
    <header className="toolbar">
      <div className="brand">
        <h1>Usable Space</h1>
      </div>

      <nav className="tabs icontabs" aria-label="Views">
        {['planner', 'library', 'ifc', 'lph5', 'knowledge'].map((v) => (
          <IconBtn key={v} icon={VIEW_ICON[v]} label={t(`tab_${v}`)} cap={t(`tab_${v}`)} size={22} active={view === v} onClick={() => dispatch(uiActions.setView(v))} />
        ))}
      </nav>

      {view === 'planner' && (
        <div className="tgroup" role="group" aria-label="Layout">
          <select aria-label="Load an example" value="" onChange={(e) => {
            const p = presets.find((x) => x.id === e.target.value);
            if (p) dispatch(loadScenario({ name: p.name, note: p.note, room: p.room, items: p.items }));
          }}>
            <option value="">Examples…</option>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <IconBtn icon="wand" className="primary" label="Auto-place the furniture" cap={busy ? 'Searching…' : 'Auto-place'} disabled={busy} onClick={() => dispatch(autoPlace())} />
          <IconBtn icon="remove" label="Clear the layout" onClick={() => dispatch(itemsActions.unplaceAll())} />
        </div>
      )}

      <span className="spacer" />

      <div className="tgroup" role="group" aria-label="Project">
        <input className="name" value={projectName} onChange={(e) => dispatch(uiActions.setName(e.target.value))} aria-label="Project name" />
        <IconBtn icon="save" label="Save the project" disabled={!serverUp} onClick={() => dispatch(saveProject()).unwrap().catch(() => dispatch(uiActions.setToast('Save failed')))} />
        <select aria-label="Open a saved project" value="" disabled={!serverUp || !list.length} onChange={(e) => e.target.value && dispatch(loadProject(e.target.value))}>
          <option value="">{serverUp ? (list.length ? 'Open…' : 'Nothing saved') : 'Offline'}</option>
          {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {list.some((p) => p.name === projectName) && (
          <IconBtn icon="remove" className="ghost" label="Delete the saved project with this name"
            onClick={() => { const p = list.find((x) => x.name === projectName); if (p && confirm(`Delete saved project “${p.name}”?`)) dispatch(deleteProject(p.id)); }} />
        )}
      </div>

      <StreamButton />

      <div className="langsw" role="group" aria-label="Language">
        {['en', 'de'].map((l) => <button key={l} className={lang === l ? 'on' : ''} onClick={() => dispatch(uiActions.setLang(l))}>{l.toUpperCase()}</button>)}
      </div>
    </header>
  );
}
