import { configureStore, createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { evaluate } from '@shared/engine.js';
import room, { roomActions } from './roomSlice.js';
import items, { itemsActions } from './itemsSlice.js';
import ui from './uiSlice.js';
import analysis, { setResult } from './analysisSlice.js';
import projects from './projectsSlice.js';
import site from './siteSlice.js';
import wind from './windSlice.js';
import lib, { libActions } from './libSlice.js';
import lph from './lphSlice.js';
import { searchProducts } from './thunks.js';
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

// live search: debounce typing / filter changes, a newer keystroke cancels the pending request
listener.startListening({
  matcher: isAnyOf(libActions.setQuery, libActions.setFilter),
  effect: async (_a, api) => {
    api.cancelActiveListeners();
    await api.delay(160);
    api.dispatch(searchProducts());
  },
});

export const store = configureStore({
  reducer: { room, items, ui, analysis, projects, site, wind, lib, lph },
  middleware: (gdm) => gdm().prepend(listener.middleware),
});

store.dispatch(setResult(evaluate(store.getState().room, store.getState().items)));
