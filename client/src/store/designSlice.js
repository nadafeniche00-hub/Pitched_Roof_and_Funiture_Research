import { createSlice } from '@reduxjs/toolkit';
import { loadScenario } from './actions.js';

// Pattern tree path, loop settings and the loop's history (one frame per pass, replayable with the slider).
const slice = createSlice({
  name: 'design',
  initialState: { path: [], kind: 'repeat', maxIter: 20, tolerance: 0.002, frames: [], frame: 0, running: false, disabled: [] },
  reducers: {
    choose: (s, { payload }) => { s.path.push(payload); },
    rewind: (s, { payload }) => { s.path = s.path.slice(0, payload); },
    setLoop: (s, { payload }) => Object.assign(s, payload),
    startRun: (s) => { s.frames = []; s.frame = 0; s.running = true; },
    pushFrame: (s, { payload }) => { s.frames.push(payload); s.frame = s.frames.length - 1; },
    setFrame: (s, { payload }) => { s.frame = payload; },
    endRun: (s) => { s.running = false; },
    toggleRule: (s, { payload }) => {
      s.disabled = s.disabled.includes(payload) ? s.disabled.filter((r) => r !== payload) : [...s.disabled, payload];
    },
  },
  extraReducers: (b) => { b.addCase(loadScenario, (s) => { s.frames = []; s.frame = 0; }); },
});

export const designActions = slice.actions;
export default slice.reducer;
