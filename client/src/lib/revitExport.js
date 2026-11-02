// The plan as the Revit demo builder reads it (pipeline/revit/DemoBuild): a small JSON of numbers and no geometry - Revit builds its own walls, floors and roof from them,
// with the wall thicknesses of the technical plan (lib/techPlan.js) and the partition walls of the layout (lib/walls.js), so the model in Revit is the plan of the app.
import { stairRect } from '@shared/engine.js';
import { wallsOf, T_IN } from './walls.js';
import { T_OUT } from './techPlan.js';
import { mergeWalls } from './mergeWalls.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * @param room    the room of the store (width, depth, kneeWall, pitch, maxHeight, windows, stair)
 * @param layout  the generated layout (rooms with rects, doors); without it the demo has no partition walls
 * @param opts    name of the Revit project (DEMO.rvt), storey height (m, the plan below the attic)
 */
export function demoJson(room, layout, { name = 'DEMO', storey = 3 } = {}) {
  const walls = mergeWalls(wallsOf(room, layout).walls);
  return {
    name,
    storey,
    walls: { outer: T_OUT, inner: T_IN },
    room: {
      width: r3(room.width), depth: r3(room.depth), kneeWall: r3(room.kneeWall), pitch: r3(room.pitch), maxHeight: r3(room.maxHeight),
      stair: stairRect(room)?.map(r3) ?? null,
      windows: (room.windows || []).map((w) => ({ wall: w.wall, pos: r3(w.pos), width: r3(w.width) })),
    },
    // [start, end] along the wall, in metres: where a door is cut into it
    partitions: walls.map((w) => ({ p0: w.p0.map(r3), p1: w.p1.map(r3), op: w.op.map((o) => [r3(o[0]), r3(o[1])]) })),
  };
}
