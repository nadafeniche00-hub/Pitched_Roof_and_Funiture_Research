import { createSlice, nanoid } from '@reduxjs/toolkit';
import { CATALOG } from '@shared/catalog.js';
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
    removeItem: (s, { payload }) => s.filter((i) => i.id !== payload),
    moveItem: (s, { payload: { id, x, y } }) => {
      const it = s.find((i) => i.id === id);
      if (it) { it.x = x; it.y = y; it.placed = true; }
    },
    rotateItem: (s, { payload }) => {
      const it = s.find((i) => i.id === payload);
      if (!it) return;
      const def = CATALOG[it.type];
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
