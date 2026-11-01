// What the databases say about roof patterns: how common each one is among the tagged homes of Germany (OpenStreetMap, Geofabrik, 16 states)
// and where a pitch sits among the surveyed gabled roofs of Detmold (NRW LoD2).
import states from '@shared/statePatterns.json';
import lod from '@shared/lod2Patterns.json';

const all = Object.values(states.states);
export const TOTAL = all.reduce((a, s) => a + s.n, 0);
const count = (k) => all.reduce((a, s) => a + (s.counts[k] || 0), 0);

/** share of the tagged homes of Germany with this roof shape (percent), by the OSM tag name */
export const nationalShare = (osmKey) => (100 * count(osmKey)) / TOTAL;
/** share of tagged homes the seven library patterns describe (everything but the 'other' tag) */
export const coverage = () => 100 - nationalShare('other');

/** percentile of a pitch among the 1,379 surveyed gabled roofs of Detmold (interpolated between the stored 10/25/50/75/90 % points) */
export function pitchPercentile(deg) {
  const p = lod.gabled_pitch, pts = [[0, 10], [p.p10, 10], [p.p25, 25], [p.median, 50], [p.p75, 75], [p.p90, 90], [75, 100]];
  for (let i = 1; i < pts.length; i++) if (deg <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return Math.round(y0 + ((y1 - y0) * (deg - x0)) / Math.max(1e-9, x1 - x0)); }
  return 100;
}
export const SURVEYED = { n: lod.gabled_n, city: 'Detmold' };
