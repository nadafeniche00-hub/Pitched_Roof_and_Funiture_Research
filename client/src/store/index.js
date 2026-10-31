import { configureStore, createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { evaluate } from '@shared/engine.js';
import { factCheckItem } from '@shared/rules.js';
import room, { roomActions } from './roomSlice.js';
import items, { itemsActions } from './itemsSlice.js';
import ui, { uiActions } from './uiSlice.js';
import design from './designSlice.js';
import layout from './layoutSlice.js';
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

// Fact check at the door: a piece that is added or resized is checked for believable dimensions right away.
listener.startListening({
  matcher: isAnyOf(itemsActions.addItem, itemsActions.addProduct, itemsActions.setOverride),
  effect: (a, api) => {
    const it = api.getState().items.find((i) => i.id === a.payload.id);
    const issue = it && factCheckItem(it).find((f) => f.severity === 'warn');
    if (issue) api.dispatch(uiActions.setToast(issue.msg));
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
  reducer: { room, items, ui, design, layout, analysis, projects, site, wind, lib, lph },
  middleware: (gdm) => gdm().prepend(listener.middleware),
});

store.dispatch(setResult(evaluate(store.getState().room, store.getState().items)));
