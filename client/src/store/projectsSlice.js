import { createSlice } from '@reduxjs/toolkit';
import { fetchProjects, fetchPresets, saveProject, deleteProject } from './thunks.js';

const slice = createSlice({
  name: 'projects',
  initialState: { list: [], presets: [], serverUp: true },
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchProjects.fulfilled, (s, { payload }) => { s.list = payload; s.serverUp = true; });
    b.addCase(fetchProjects.rejected, (s) => { s.serverUp = false; });
    b.addCase(fetchPresets.fulfilled, (s, { payload }) => { s.presets = payload; });
    b.addCase(saveProject.fulfilled, (s, { payload }) => {
      const i = s.list.findIndex((p) => p.id === payload.id);
      const row = { id: payload.id, name: payload.name, updatedAt: payload.updatedAt };
      if (i >= 0) s.list[i] = row; else s.list.unshift(row);
    });
    b.addCase(deleteProject.fulfilled, (s, { payload }) => { s.list = s.list.filter((p) => p.id !== payload); });
  },
});

export default slice.reducer;
