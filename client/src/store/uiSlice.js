import { createSlice } from '@reduxjs/toolkit';
import { loadScenario } from './actions.js';

const slice = createSlice({
  name: 'ui',
  initialState: {
    view: 'guided', // guided | planner | library | ifc | lph5 | knowledge
    guidedStep: 0, // 0 describe | 1 technical plan | 2 3D | 3 Revit | 4 Unreal (the guided view)
    centerTab: 'plan', // plan | 3d | section | site (workspace in the planner view)
    lang: 'en', // en | de
    selectedId: null,
    sectionY: 3.5,
    showClearances: true,
    showHeat: true,
    projectName: 'Untitled',
    projectId: null,
    note: '',
    toast: null,
    busy: false,
  },
  reducers: {
    select: (s, { payload }) => { s.selectedId = payload; },
    setView: (s, { payload }) => { s.view = payload; },
    setCenterTab: (s, { payload }) => { s.centerTab = payload; },
    setGuidedStep: (s, { payload }) => { s.guidedStep = payload; },
    setLang: (s, { payload }) => { s.lang = payload; },
    setSectionY: (s, { payload }) => { s.sectionY = payload; },
    toggle: (s, { payload }) => { s[payload] = !s[payload]; },
    setName: (s, { payload }) => { s.projectName = payload; },
    setToast: (s, { payload }) => { s.toast = payload; },
    setBusy: (s, { payload }) => { s.busy = payload; },
    setProjectId: (s, { payload }) => { s.projectId = payload; },
  },
  extraReducers: (b) => {
    b.addCase(loadScenario, (s, { payload }) => {
      s.selectedId = null;
      s.projectName = payload.name || 'Untitled';
      s.projectId = payload.id || null;
      s.note = payload.note || '';
      s.sectionY = Math.min(s.sectionY, payload.room?.depth ?? 7) || 3.5;
    });
  },
});

export const uiActions = slice.actions;
export default slice.reducer;
