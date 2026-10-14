import { createSlice, nanoid } from '@reduxjs/toolkit';
import { defOf } from '@shared/params.js';
import { bodySize, sanitizeItems } from '@shared/engine.js';
import { loadScenario } from './actions.js';

const slice = createSlice({
  name: 'items',
  initialState: [],
  reducers: {
    addItem: {
      reducer: (s, { payload }) => { s.push(payload); },
      prepare: (type) => ({ payload: { id: nanoid(6), type, x: 0, y: 0, rot: 0, placed: false } }),
    },
    addProduct: {
      reducer: (s, { payload }) => { s.push(payload); },
      prepare: (p, type) => ({
        payload: {
          id: nanoid(6), type: type || p.type || 'chest', x: 0, y: 0, rot: 0, placed: false,
          product: { id: p.id, name: p.name, name_de: p.name_de || undefined, name_en: p.name_en || undefined, brand: p.brand || undefined, url: p.url || undefined, image: p.image || undefined, w: p.w || undefined, d: p.d || undefined, h: p.h || undefined },
        },
      }),
    },
    setOverride: (s, { payload: { id, key, value } }) => {
      const it = s.find((i) => i.id === id);
      if (it) it.overrides = { ...(it.overrides || {}), [key]: value };
    },
    resetOverride: (s, { payload: { id, key } }) => {
      const it = s.find((i) => i.id === id);
      if (it?.overrides) { delete it.overrides[key]; if (!Object.keys(it.overrides).length) delete it.overrides; }
    },
    setType: (s, { payload: { id, type } }) => {
      const it = s.find((i) => i.id === id);
      if (it) it.type = type;
    },
    removeItem: (s, { payload }) => s.filter((i) => i.id !== payload),
    moveItem: (s, { payload: { id, x, y } }) => {
      const it = s.find((i) => i.id === id);
      if (it) { it.x = x; it.y = y; it.placed = true; }
    },
    rotateItem: (s, { payload }) => {
      const it = s.find((i) => i.id === payload);
      if (!it) return;
      const def = defOf(it);
      const a = bodySize(def, it.rot);
      it.rot = (it.rot + 1) % 4;
      const b = bodySize(def, it.rot);
      const snap = (v) => Math.round(v / 0.05) * 0.05;
      it.x = snap(it.x + a.w / 2 - b.w / 2);
      it.y = snap(it.y + a.d / 2 - b.d / 2);
    },
    placeAt: (s, { payload: { id, x, y } }) => {
      const it = s.find((i) => i.id === id);
      if (it) { it.x = x; it.y = y; it.placed = true; }
    },
    setItems: (_s, { payload }) => payload,
    unplaceAll: (s) => { s.forEach((i) => { i.placed = false; }); },
  },
  extraReducers: (b) => { b.addCase(loadScenario, (_s, { payload }) => sanitizeItems(payload.items)); },
});

export const itemsActions = slice.actions;
export default slice.reducer;
