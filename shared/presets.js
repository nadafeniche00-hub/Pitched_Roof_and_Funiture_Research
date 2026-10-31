import { DEFAULT_ROOM } from './engine.js';

const program = (types) => types.map((type, i) => ({ id: `p${i}`, type, x: 0, y: 0, rot: 0, placed: false }));
const BEDROOM = ['bed_double', 'wardrobe', 'wardrobe', 'chest', 'desk'];

export const PRESETS = [
  {
    id: 'generous',
    name: 'Steep roof + two dormers',
    note: 'Steep pitch, tall knee wall, dormers on both sides: most of the floor is standing height.',
    room: {
      ...DEFAULT_ROOM, width: 6.0, depth: 7.5, kneeWall: 1.2, pitch: 45, maxHeight: 3.2,
      dormers: [
        { side: 'left', center: 2.6, width: 2.4, depth: 1.5, height: 2.4 },
        { side: 'right', center: 5.2, width: 2.4, depth: 1.5, height: 2.4 },
      ],
      stair: { x: 2.55, y: 0.2, w: 0.9, d: 2.0 },
      windows: [{ wall: 'N', pos: 3, width: 1.2 }, { wall: 'S', pos: 3, width: 1.2 }],
    },
    items: program(BEDROOM),
  },
  {
    id: 'typical',
    name: 'Typical 38° attic, one dormer',
    note: 'A common situation: usable but tight, the dormer buys back some height.',
    room: { ...DEFAULT_ROOM },
    items: program(BEDROOM),
  },
  {
    id: 'shallow',
    name: 'Shallow roof, no dormer',
    note: 'Low pitch and knee wall: the roof never reaches full standing height. Looks like floor area, behaves like a loft.',
    room: {
      ...DEFAULT_ROOM, width: 4.6, depth: 6.0, kneeWall: 0.5, pitch: 28, maxHeight: 3.0, dormers: [],
      stair: { x: 1.85, y: 0.2, w: 0.9, d: 2.0 },
      windows: [{ wall: 'N', pos: 2.3, width: 0.8 }],
    },
    items: program(BEDROOM),
  },
  {
    id: 'median',
    name: 'Median gable house, Detmold centre',
    note: 'Built from the surveyed LoD2 medians: 43° pitch, about 8.9 m outer span and 11.7 m length (minus the walls). The knee wall is an assumption: LoD2 does not record it.',
    room: {
      ...DEFAULT_ROOM, width: 8.0, depth: 10.5, kneeWall: 0.9, pitch: 43, maxHeight: 3.0,
      dormers: [{ side: 'left', center: 5.2, width: 2.4, depth: 1.5, height: 2.4 }],
      stair: { x: 3.55, y: 0.2, w: 0.9, d: 2.0 },
      windows: [{ wall: 'N', pos: 4, width: 1.2 }, { wall: 'S', pos: 4, width: 1.2 }],
    },
    items: program(BEDROOM),
  },
];
