import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Toolbar from './components/Toolbar.jsx';
import RoomPanel from './components/RoomPanel.jsx';
import PlanView from './components/PlanView.jsx';
import SectionView from './components/SectionView.jsx';
import Scene3D from './components/Scene3D.jsx';
import MapPanel from './components/MapPanel.jsx';
import PlanBuilder from './components/PlanBuilder.jsx';
import PlanExport from './components/PlanExport.jsx';
import { IconBtn } from './components/Icon.jsx';
import WalkView from './components/WalkView.jsx';
import ResultsPanel from './components/ResultsPanel.jsx';
import LibraryView from './components/LibraryView.jsx';
import IfcViewer from './components/IfcViewer.jsx';
import Lph5View from './components/Lph5View.jsx';
import KnowledgeView from './components/KnowledgeView.jsx';
import Guided from './components/Guided.jsx';
import { fetchPresets, fetchProjects, fetchWind } from './store/thunks.js';
import { itemsActions } from './store/itemsSlice.js';
import { uiActions } from './store/uiSlice.js';

const WORKSPACE = [['plan', 'Plan', 'plan', 'Plan'], ['rooms', 'Rooms', 'rooms', 'Rooms'], ['3d', '3D', 'cube', '3D'], ['walk', 'Walk', 'walk', 'Walk'], ['section', 'Section', 'section', 'Section'], ['site', 'Site: sun & wind', 'sun', 'Site']];

export default function App() {
  const dispatch = useDispatch();
  const centerTab = useSelector((s) => s.ui.centerTab);
  const selectedId = useSelector((s) => s.ui.selectedId);
  const toast = useSelector((s) => s.ui.toast);
  const note = useSelector((s) => s.ui.note);
  const view = useSelector((s) => s.ui.view);

  useEffect(() => {
    dispatch(fetchPresets());
    dispatch(fetchProjects());
  }, [dispatch]);

  // auto-detect wind for the site's 0.1° cell (the server caches per cell); runs whichever workspace tab is open
  const site = useSelector((s) => s.site);
  const cell = `${site.lat.toFixed(1)}:${site.lon.toFixed(1)}`;
  useEffect(() => {
    const t = setTimeout(() => dispatch(fetchWind({ lat: site.lat, lon: site.lon })), 500);
    return () => clearTimeout(t);
  }, [cell]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (!selectedId || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'r' || e.key === 'R') dispatch(itemsActions.rotateItem(selectedId));
      if (e.key === 'Delete' || e.key === 'Backspace') { dispatch(itemsActions.removeItem(selectedId)); dispatch(uiActions.select(null)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, selectedId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dispatch(uiActions.setToast(null)), 4500);
    return () => clearTimeout(t);
  }, [toast, dispatch]);

  if (view === 'guided') return <><Guided />{toast && <div className="toast">{toast}</div>}</>;

  return (
    <div className="app">
      <Toolbar />
      {view === 'planner' && (
        <>
          <aside className="left"><RoomPanel /></aside>
          <main className="center">
            {note && <p className="note">{note}</p>}
            <nav className="tabs workspace-tabs icontabs" aria-label="Workspace">
              {WORKSPACE.map(([id, label, icon, cap]) => (
                <IconBtn key={id} icon={icon} label={label} cap={cap} size={24} active={centerTab === id} onClick={() => dispatch(uiActions.setCenterTab(id))} />
              ))}
            </nav>
            {/* only the active workspace is mounted: the 3D scene and the map size themselves on mount */}
            {centerTab === 'plan' && <PlanView />}
            {centerTab === 'rooms' && <><PlanBuilder /><PlanExport /></>}
            {centerTab === '3d' && <Scene3D />}
            {centerTab === 'walk' && <WalkView />}
            {centerTab === 'section' && <SectionView />}
            {centerTab === 'site' && <MapPanel />}
          </main>
          <aside className="right"><ResultsPanel /></aside>
        </>
      )}
      {view === 'library' && <main className="wide"><LibraryView /></main>}
      {view === 'ifc' && <main className="wide"><IfcViewer /></main>}
      {view === 'lph5' && <main className="wide"><Lph5View /></main>}
      {view === 'knowledge' && <main className="wide"><KnowledgeView /></main>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
