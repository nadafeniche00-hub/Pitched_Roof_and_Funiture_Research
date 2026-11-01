// Data shown at the cursor when the user hovers a part of the house in the walk-through, and the layers drawn in the exploded view.
// Layer thicknesses are typical German build-ups (rules of thumb for the picture), not measurements of this house.
import { roofHeight } from '@shared/engine.js';

export const LAYERS = {
  roof: [
    { name: 'Clay roof tiles', mm: 30, color: 0xa4503a },
    { name: 'Battens and counter-battens', mm: 50, color: 0xb98a55 },
    { name: 'Waterproof membrane', mm: 1, color: 0x2f3a46 },
    { name: 'Rafters with insulation', mm: 200, color: 0xd9c27a },
    { name: 'Vapour barrier', mm: 1, color: 0x6fa3c7 },
    { name: 'Plasterboard', mm: 12.5, color: 0xe8e6df },
  ],
  wall: [
    { name: 'Lime plaster, outside', mm: 20, color: 0xe4e3dc },
    { name: 'Timber frame and infill', mm: 140, color: 0x5a3f2c },
    { name: 'Insulation', mm: 100, color: 0xd9c27a },
    { name: 'Plasterboard, inside', mm: 12.5, color: 0xf0eee8 },
  ],
  floor: [
    { name: 'Oak floor boards', mm: 15, color: 0xb98a55 },
    { name: 'Impact-sound insulation', mm: 30, color: 0x9bb08a },
    { name: 'Screed', mm: 50, color: 0xb6b3aa },
    { name: 'Concrete slab', mm: 180, color: 0x8b8b88 },
  ],
};

const m2 = (v) => `${v.toFixed(1)} m²`;

export function partInfo(part, hit, d) {
  const r = d.room, res = d.result, pt = hit.point;
  if (part === 'roof') {
    const h = r ? roofHeight(r, pt.x, pt.z) : null;
    const rows = [['Pitch', r?.pitch != null ? `${r.pitch}°` : '-'], ['Height here', h != null ? `${h.toFixed(2)} m` : '-']];
    if (res?.summary) rows.push(['Usable floor', m2(res.summary.usableArea ?? 0)]);
    return { title: 'Roof', rows, layers: LAYERS.roof, explode: 'roof' };
  }
  if (part === 'wall') return { title: 'Outer wall', rows: [['Knee wall', r?.kneeWall != null ? `${r.kneeWall} m` : '-']], layers: LAYERS.wall, explode: 'wall' };
  if (part === 'partition') return { title: 'Inner wall', rows: [['Thickness', '10 cm']], explode: null };
  if (part === 'floor') return { title: 'Floor', rows: [['Room', r ? `${r.width} × ${r.depth} m` : '-']], layers: LAYERS.floor, explode: 'floor' };
  if (part === 'window') return { title: 'Window', rows: [['Size', '1.1 × 1.3 m']], explode: null };
  if (part === 'furniture') {
    const it = (d.items || []).find((i) => i.id === hit.object.userData.itemId);
    return { title: it?.name || 'Furniture', rows: it ? [['Size', `${it.w} × ${it.d} × ${it.h} m`]] : [], explode: null };
  }
  return { title: part, rows: [], explode: null };
}
