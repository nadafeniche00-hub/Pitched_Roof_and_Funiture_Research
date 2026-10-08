import { createAction } from '@reduxjs/toolkit';

// Replace the whole scenario (room + furniture program). Used by presets and saved projects.
export const loadScenario = createAction('scenario/load');
