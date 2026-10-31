import { useSelector } from 'react-redux';
import patterns from '@shared/roofPatterns.json';
import lod2 from '@shared/lod2Patterns.json';

const share = (k) => patterns.dwelling_shape_share?.[k] ?? 0;

/** Percentile of a value among the five quantiles (p10..p90) of a distribution: a coarse linear interpolation, clamped to 5..95. */
function percentile(q, v) {
  const pts = [[q.p10, 10], [q.p25, 25], [q.median, 50], [q.p75, 75], [q.p90, 90]];
  if (v <= pts[0][0]) return 5;
  if (v >= pts[4][0]) return 95;
  for (let i = 1; i < pts.length; i++) {
    if (v <= pts[i][0]) { const [a, pa] = pts[i - 1], [b, pb] = pts[i]; return Math.round(pa + ((v - a) / (b - a)) * (pb - pa)); }
  }
  return 50;
}

/** How the user's roof compares with the roofs of the region: OpenStreetMap tags (shapes) and surveyed LoD2 (pitch, span, usable share). */
export default function RegionalCheck() {
  const room = useSelector((s) => s.room);
  const metrics = useSelector((s) => s.analysis.result?.metrics);
  const gabled = share('gabled'), hip = +(share('hipped') + share('half-hipped')).toFixed(1);
  const outerSpan = room.width + 0.9; // the attic floor is narrower than the outer footprint: walls and insulation
  const counted = lod2.counted_share_by_knee_wall_m['0.9'];
  return (
    <section>
      <h3>Roofs in the region <small className="count">{lod2.gabled_n.toLocaleString('en')} surveyed gables</small></h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Surveyed (NRW LoD2, {lod2.tiles} tiles around Detmold): gable dwellings have a median pitch of <b>{lod2.gabled_pitch.median}°</b> (10 to 90 %: {lod2.gabled_pitch.p10}° to {lod2.gabled_pitch.p90}°); {lod2.zones.centre.pitch.median}° in the old centre, {lod2.zones.outskirts.pitch.median}° in the outskirts. Yours is {room.pitch}°, steeper than about <b>{percentile(lod2.gabled_pitch, room.pitch)} %</b> of them.
      </p>
      <p className="hint">Median outer span {lod2.gabled_span_m.median} m (middle half {lod2.gabled_span_m.p25} to {lod2.gabled_span_m.p75} m). Your attic is about {outerSpan.toFixed(1)} m outside: wider than about <b>{percentile(lod2.gabled_span_m, outerSpan)} %</b>.</p>
      {metrics && <p className="hint">Usable share of the floor under the slope: yours <b>{Math.round(metrics.usableRatio * 100)} %</b>, the real roofs {counted.median_counted_pct} % at the median ({counted.p10} to {counted.p90} %), assuming a {0.9} m knee wall that LoD2 does not record.</p>}
      <p className="hint">Tagged shapes (OpenStreetMap, {patterns.dwellings_n.toLocaleString('en')} dwellings in Kreis Lippe): {gabled} % gabled, {hip} % hipped or half-hipped (not modelled here yet), {share('flat')} % flat, mostly outbuildings. LoD2 codes about a third of the dwellings as mixed forms, so its gabled share is lower than the tags'.</p>
    </section>
  );
}
