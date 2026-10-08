import { createSlice } from '@reduxjs/toolkit';
import { DEFAULT_SITE, sanitizeSite } from '@shared/site.js';
import { loadScenario } from './actions.js';

const slice = createSlice({
  name: 'site',
  initialState: DEFAULT_SITE,
  reducers: { setSite: (s, { payload }) => ({ ...s, ...payload }) },
  extraReducers: (b) => { b.addCase(loadScenario, (s, { payload }) => (payload.site ? sanitizeSite(payload.site) : s)); },
});

export const { setSite } = slice.actions;
export default slice.reducer;
