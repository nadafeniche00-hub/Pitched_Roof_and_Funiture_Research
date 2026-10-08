import { createAsyncThunk } from '@reduxjs/toolkit';
import { solve } from '@shared/engine.js';
import { PRESETS } from '@shared/presets.js';
import { loadScenario } from './actions.js';
import { itemsActions } from './itemsSlice.js';
import { uiActions } from './uiSlice.js';

const json = async (url, opts) => {
  const r = await fetch(url, { headers: { 'content-type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.status === 204 ? null : r.json();
};

export const fetchProjects = createAsyncThunk('projects/fetch', () => json('/api/projects'));
export const fetchPresets = createAsyncThunk('projects/presets', async () => {
  try { return await json('/api/presets'); } catch { return PRESETS; } // same data ships with the client
});

export const loadProject = createAsyncThunk('projects/load', async (id, { dispatch }) => {
  dispatch(loadScenario(await json(`/api/projects/${id}`)));
});

export const saveProject = createAsyncThunk('projects/save', async (_, { getState, dispatch }) => {
  const { room, items, ui } = getState();
  const body = JSON.stringify({ name: ui.projectName, room, items });
  const saved = ui.projectId
    ? await json(`/api/projects/${ui.projectId}`, { method: 'PUT', body })
    : await json('/api/projects', { method: 'POST', body });
  dispatch(uiActions.setProjectId(saved.id));
  dispatch(uiActions.setToast('Saved'));
  return saved;
});

export const deleteProject = createAsyncThunk('projects/delete', async (id) => {
  await json(`/api/projects/${id}`, { method: 'DELETE' });
  return id;
});

/** Layout search runs on the server (keeps the UI thread free); falls back to the browser if the API is down. */
export const autoPlace = createAsyncThunk('layout/solve', async (_, { getState, dispatch }) => {
  const { room, items } = getState();
  dispatch(uiActions.setBusy(true));
  const seed = Math.floor(Math.random() * 1e6);
  try {
    let out;
    try {
      out = await json('/api/solve', { method: 'POST', body: JSON.stringify({ room, items, seed }) });
    } catch {
      out = solve(room, items, { seed });
      dispatch(uiActions.setToast('API unreachable - solved in the browser'));
    }
    dispatch(itemsActions.setItems(out.items));
  } finally {
    dispatch(uiActions.setBusy(false));
  }
});
