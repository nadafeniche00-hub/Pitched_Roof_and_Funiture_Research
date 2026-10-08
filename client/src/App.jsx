import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Toolbar from './components/Toolbar.jsx';
import RoomPanel from './components/RoomPanel.jsx';
import PlanView from './components/PlanView.jsx';
import SectionView from './components/SectionView.jsx';
import Scene3D from './components/Scene3D.jsx';
import MapPanel from './components/MapPanel.jsx';
import ResultsPanel from './components/ResultsPanel.jsx';
import { fetchPresets, fetchProjects } from './store/thunks.js';
import { itemsActions } from './store/itemsSlice.js';
import { uiActions } from './store/uiSlice.js';

export default function App() {
  const dispatch = useDispatch();
  const selectedId = useSelector((s) => s.ui.selectedId);
  const toast = useSelector((s) => s.ui.toast);
  const note = useSelector((s) => s.ui.note);

  useEffect(() => {
    dispatch(fetchPresets());
    dispatch(fetchProjects());
  }, [dispatch]);

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
    const t = setTimeout(() => dispatch(uiActions.setToast(null)), 2500);
    return () => clearTimeout(t);
  }, [toast, dispatch]);

  return (
    <div className="app">
      <Toolbar />
      <aside className="left"><RoomPanel /></aside>
      <main className="center">
        {note && <p className="note">{note}</p>}
        <PlanView />
        <Scene3D />
        <MapPanel />
        <SectionView />
      </main>
      <aside className="right"><ResultsPanel /></aside>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
