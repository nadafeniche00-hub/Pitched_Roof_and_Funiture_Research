import { createSlice } from '@reduxjs/toolkit';
import { DEFAULT_ROOM, sanitizeRoom } from '@shared/engine.js';
import { loadScenario } from './actions.js';

const slice = createSlice({
  name: 'room',
  initialState: DEFAULT_ROOM,
  reducers: {
    setParam: (s, { payload: { key, value } }) => { s[key] = value; },
    patchDormer: (s, { payload: { i, patch } }) => { Object.assign(s.dormers[i], patch); },
    addDormer: (s) => { s.dormers.push({ side: 'right', center: s.depth / 2 }); }, // inherits width / depth / height
    resetDormerField: (s, { payload: { i, key } }) => { delete s.dormers[i][key]; },
    setDormerDefault: (s, { payload: { key, value } }) => { s.dormerDefaults[key] = value; },
    removeDormer: (s, { payload }) => { s.dormers.splice(payload, 1); },
    toggleStair: (s) => { s.stair = s.stair ? null : { x: s.width / 2 - 0.45, y: 0.2, w: 0.9, d: 2 }; },
    patchStair: (s, { payload }) => { if (s.stair) Object.assign(s.stair, payload); },
    addOpening: (s, { payload: kind }) => { s[kind].push(kind === 'doors' ? { wall: 'S', pos: s.width / 2, width: 0.9 } : { wall: 'N', pos: s.width / 2, width: 1 }); },
    removeOpening: (s, { payload: { kind, i } }) => { s[kind].splice(i, 1); },
    patchOpening: (s, { payload: { kind, i, patch } }) => { Object.assign(s[kind][i], patch); },
  },
  extraReducers: (b) => { b.addCase(loadScenario, (_s, { payload }) => sanitizeRoom(payload.room)); },
});

export const roomActions = slice.actions;
export default slice.reducer;
