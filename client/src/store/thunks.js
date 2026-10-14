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
  const { room, items, ui, site, lph } = getState();
  const body = JSON.stringify({ name: ui.projectName, room, items, site, lph });
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

export const fetchWind = createAsyncThunk('wind/fetch', async ({ lat, lon }, { dispatch }) => {
  const r = await fetch(`/api/wind?lat=${lat}&lon=${lon}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `wind ${r.status}`);
  dispatch(fetchWindMeta()); // refresh the cached-cells overlay
  return j;
});

export const searchProducts = createAsyncThunk('lib/search', async (_, { getState }) => {
  const { q, type, source, project } = getState().lib;
  const p = new URLSearchParams({ limit: '60' });
  if (q) p.set('q', q);
  if (type) p.set('type', type);
  if (source) p.set('source', source);
  if (project) p.set('project', project);
  return json(`/api/products/search?${p}`);
});

export const fetchFacets = createAsyncThunk('lib/facets', () => json('/api/products/facets'));

export const fetchGlossary = createAsyncThunk('lib/glossary', async (kind) => json(`/api/glossary?kind=${kind}&limit=500`));

export const scrapeUrls = createAsyncThunk('lib/scrape', async (urls, { dispatch }) => {
  const r = await json('/api/scrape', { method: 'POST', body: JSON.stringify({ urls }) });
  dispatch(searchProducts());
  dispatch(fetchFacets());
  return r.results;
});

export const fetchWindMeta = createAsyncThunk('wind/meta', async () => {
  const [zones, cells] = await Promise.all([json('/api/wind/zones'), json('/api/wind/cells')]);
  return { zones, cells };
});
