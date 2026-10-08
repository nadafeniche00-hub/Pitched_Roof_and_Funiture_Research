import { createSlice } from '@reduxjs/toolkit';

const slice = createSlice({
  name: 'analysis',
  initialState: { result: null },
  reducers: { setResult: (s, { payload }) => { s.result = payload; } },
});

export const { setResult } = slice.actions;
export default slice.reducer;
