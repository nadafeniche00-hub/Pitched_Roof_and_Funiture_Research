import { createSlice } from '@reduxjs/toolkit';

// The room layout chosen in the Rooms tab (rooms with rectangles, doors on the access tree): the walk-through builds its walls from it.
const slice = createSlice({
  name: 'layout',
  initialState: { plan: null },
  reducers: {
    setLayout: (s, { payload }) => { s.plan = payload && { rooms: payload.rooms.map((r) => ({ id: r.id, type: r.type, rect: r.rect, counted: r.counted })), doors: payload.doors }; },
  },
});
export const layoutActions = slice.actions;
export default slice.reducer;
