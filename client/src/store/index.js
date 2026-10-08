import { configureStore, createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { evaluate } from '@shared/engine.js';
import room, { roomActions } from './roomSlice.js';
import items, { itemsActions } from './itemsSlice.js';
import ui from './uiSlice.js';
import analysis, { setResult } from './analysisSlice.js';
import projects from './projectsSlice.js';
import site from './siteSlice.js';
import wind from './windSlice.js';
import { loadScenario } from './actions.js';

// Event management: every action that can change the geometry or the furniture re-runs the evaluation.
const listener = createListenerMiddleware();
listener.startListening({
  matcher: isAnyOf(...Object.values(roomActions), ...Object.values(itemsActions), loadScenario),
  effect: (_a, api) => {
    const { room, items } = api.getState();
    api.dispatch(setResult(evaluate(room, items)));
  },
});

export const store = configureStore({
  reducer: { room, items, ui, analysis, projects, site, wind },
  middleware: (gdm) => gdm().prepend(listener.middleware),
});

store.dispatch(setResult(evaluate(store.getState().room, store.getState().items)));
