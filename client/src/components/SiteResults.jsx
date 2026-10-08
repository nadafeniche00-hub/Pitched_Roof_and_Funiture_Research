import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setSite } from '../store/siteSlice.js';
import { daylight, compass } from '../lib/solar.js';
import { ZONE_COLOR } from './MapPanel.jsx';

const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

export default function SiteResults() {
  const dispatch = useDispatch();
  const site = useSelector((s) => s.site);
  const room = useSelector((s) => s.room);
  const gross = useSelector((s) => s.analysis.result?.metrics.gross ?? 0);
  const wind = useSelector((s) => s.wind);
  const day = useMemo(() => daylight(room, site, gross), [room, site, gross]);

  const w = wind.data;
  const zone = site.windZone ?? w?.zone;
  const cls = wind.zones.find((z) => z.zone === zone);
  const windward = w?.stormDir != null ? day.rows.filter((o) => angDiff(o.bearing, w.stormDir) < 60) : [];

  return (
    <>
      <section>
        <h3>Daylight <span className="count">{(day.ratio * 100).toFixed(0)}% glazed</span></h3>
        <p className="hint" style={{ marginTop: 0 }}>
          {day.glazed.toFixed(1)} m² of openings on {gross.toFixed(1)} m² floor{' '}
          <b className={day.ratio >= 0.125 ? 'good' : 'bad'}>{day.ratio >= 0.125 ? '≥' : '<'} 1/8</b> (common rule of thumb).
        </p>
        <table className="sun">
          <thead><tr><th>Opening</th><th>faces</th>{day.days.map((d) => <th key={d.label} title={`${d.label}: ${d.dayLen.toFixed(1)} h of daylight`}>{d.label.split(' ')[0]}</th>)}</tr></thead>
          <tbody>
            {day.rows.map((o) => (
              <tr key={o.label}><td>{o.label}</td><td>{compass(o.bearing)}</td>{o.hours.map((h, i) => <td key={i}>{h.toFixed(1)} h</td>)}</tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Direct-sun hours, clear sky, no shading from neighbours or trees. Dormer fronts count as {day.rows.filter((r) => r.label.startsWith('Dormer')).length} openings.</p>
      </section>

      <section>
        <h3>Wind {zone && <span className="count" style={{ color: ZONE_COLOR[zone] }}>zone {zone}{site.windZone ? ' (manual)' : ''}</span>}</h3>
        {wind.status === 'loading' && <p className="hint">Detecting wind climate for this plot…</p>}
        {wind.status === 'error' && <p className="issue bad">{wind.error}</p>}
        {w && cls && (
          <div className="facts">
            <div>Estimated basic wind velocity <b>{w.vbEst.toFixed(1)} m/s</b> (50-yr gust {w.v50Gust.toFixed(1)} m/s)</div>
            <div>Class {zone}: v<sub>b,0</sub> {cls.vb0} m/s → q<sub>b</sub> ≈ <b>{(cls.qb / 1000).toFixed(2)} kN/m²</b></div>
            {w.stormDir != null && <div>Storms mostly from <b>{compass(w.stormDir)}</b> ({w.stormDir.toFixed(0)}°)</div>}
            {windward.length > 0 && <div>Facing the storm side: <b>{windward.map((o) => o.label).join(', ')}</b> - check anchoring of dormer cheeks and roof edges there.</div>}
            <small>{w.cached ? 'from the SQL cache' : 'freshly fetched'} · ERA5 {w.period}, ~25 km grid. Indicative only - take the official zone for the municipality from the building code.</small>
          </div>
        )}
        <label className="inline" style={{ marginTop: 8 }}>Override zone
          <select value={site.windZone ?? ''} onChange={(e) => dispatch(setSite({ windZone: e.target.value ? +e.target.value : null }))}>
            <option value="">use detected</option>
            {[1, 2, 3, 4].map((z) => <option key={z} value={z}>Zone {z}</option>)}
          </select>
        </label>
      </section>
    </>
  );
}
