import { useSelector } from 'react-redux';
import patterns from '@shared/roofPatterns.json';

const share = (k) => patterns.dwelling_shape_share?.[k] ?? 0;

/** How the user's roof compares with the roofs of the region (mined from OpenStreetMap tags, see docs/ROOF_PATTERNS.md). */
export default function RegionalCheck() {
  const room = useSelector((s) => s.room);
  const gabled = share('gabled'), hip = +(share('hipped') + share('half-hipped')).toFixed(1);
  const two = patterns.roof_level_by_shape?.gabled?.two_or_more_pct;
  return (
    <section>
      <h3>Roofs in the region <small className="count">{patterns.dwellings_n.toLocaleString('en')} dwellings</small></h3>
      <p className="hint" style={{ marginTop: 0 }}>Your roof is a gable roof{room.dormers.length ? ' with dormers' : ''}: <b>{gabled} %</b> of the tagged dwellings in Kreis Lippe are gabled, <b>{hip} %</b> hipped or half-hipped (not modelled here yet), <b>{share('flat')} %</b> flat. Flat roofs are mostly outbuildings (garages, sheds).</p>
      {two != null && <p className="hint">About <b>{two} %</b> of the gabled dwellings that give their roof levels have two or more: a split attic is a real pattern, not an exception.</p>}
      <p className="hint">Volunteered OpenStreetMap tags: good for the shape shares, weak for attics and materials (mappers tag those where they exist), and the roof angle is almost never tagged ({patterns.roof_angle.n} buildings). Orientation only.</p>
    </section>
  );
}
