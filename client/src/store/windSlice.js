import { createSlice } from '@reduxjs/toolkit';
import { fetchWind, fetchWindMeta } from './thunks.js';

const slice = createSlice({
  name: 'wind',
  initialState: { status: 'idle', data: null, error: '', zones: [], cells: [] },
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchWind.pending, (s) => { s.status = 'loading'; s.error = ''; });
    b.addCase(fetchWind.fulfilled, (s, { payload }) => { s.status = 'ok'; s.data = payload; });
    b.addCase(fetchWind.rejected, (s, { error }) => { s.status = 'error'; s.error = error.message; s.data = null; });
    b.addCase(fetchWindMeta.fulfilled, (s, { payload }) => { s.zones = payload.zones; s.cells = payload.cells; });
  },
});

export default slice.reducer;
