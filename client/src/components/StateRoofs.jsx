import { useState } from 'react';
import states from '@shared/statePatterns.json';
import sources from '@shared/stateSources.json';

const ORDER = ['gabled', 'hipped', 'half-hipped', 'flat', 'mansard', 'pyramidal', 'skillion'];

/** Roof shapes of dwellings by federal state (OpenStreetMap tags): pick a state, see its shares next to the national picture. */
export default function StateRoofs() {
  const list = Object.entries(states.states).sort((a, b) => a[1].name.localeCompare(b[1].name, 'de'));
  const [iso, setIso] = useState(list.find(([k]) => k === 'DE-NW')?.[0] || list[0]?.[0]);
  if (!list.length) return null;
  const s = states.states[iso];
  const total = list.reduce((t, [, v]) => t + v.n, 0);
  const nat = (shape) => (total ? (100 * list.reduce((t, [, v]) => t + (v.counts[shape] || 0), 0)) / total : 0);
  const src = sources.states.find((x) => x.iso === iso);
  return (
    <section>
      <h3>Roofs by federal state <small className="count">{list.length} of 16 states</small></h3>
      <label className="inline" style={{ marginBottom: 6 }}>State
        <select value={iso} onChange={(e) => setIso(e.target.value)} aria-label="Federal state">
          {list.map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
        </select>
      </label>
      <p className="hint" style={{ marginTop: 0 }}>{s.n.toLocaleString('en')} tagged dwellings in {s.name} ({total.toLocaleString('en')} in all {list.length} states){s.n < 2000 ? '; few, read the shares with care' : ''}.</p>
      <div style={{ display: 'grid', gap: 4 }}>
        {ORDER.map((k) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '6.5rem minmax(0, 1fr) 7.5rem', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <span>{k}</span>
            <span className="track"><div style={{ width: `${Math.min(100, s.share[k] || 0)}%`, background: k === 'gabled' ? 'var(--hot)' : 'var(--ink)' }} /></span>
            <span>{s.share[k] ?? 0} % <small style={{ color: 'var(--muted)' }}>({nat(k).toFixed(1)} % DE)</small></span>
          </div>
        ))}
      </div>
      <p className="hint">Source: OpenStreetMap tags, Geofabrik extracts. {src ? <>Surveyed building models ({s.name}): {src.lod2.status === 'checked' ? 'downloaded and analysed' : 'not yet checked'}. {src.lod2.note}</> : null}</p>
    </section>
  );
}
