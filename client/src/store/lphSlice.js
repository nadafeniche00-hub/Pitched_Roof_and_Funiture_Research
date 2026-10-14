import { createSlice } from '@reduxjs/toolkit';
import { DEFAULT_LPH, sanitizeLph } from '@shared/lph.js';
import { loadScenario } from './actions.js';

const slice = createSlice({
  name: 'lph',
  initialState: DEFAULT_LPH,
  reducers: {
    setField: (s, { payload: { group, key, value } }) => { s[group][key] = value; },
  },
  extraReducers: (b) => { b.addCase(loadScenario, (s, { payload }) => (payload.lph ? sanitizeLph(payload.lph) : s)); },
});

export const lphActions = slice.actions;
export default slice.reducer;
