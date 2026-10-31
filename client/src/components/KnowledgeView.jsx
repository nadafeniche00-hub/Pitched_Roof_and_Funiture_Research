import { useMemo, useState } from 'react';
import catalog from '@shared/sources.json';

const WHEN = { now: 'use now', compare: 'compare', feb: 'February' };

/** The data, models, vocabularies and libraries the planner can draw on (shared/sources.json). */
export default function KnowledgeView() {
  const [track, setTrack] = useState('all');
  const [when, setWhen] = useState('all');
  const [q, setQ] = useState('');
  const list = useMemo(() => catalog.sources.filter((s) => (track === 'all' || s.track === track) && (when === 'all' || s.when === when)
    && (!q || `${s.name} ${s.what} ${s.use}`.toLowerCase().includes(q.toLowerCase()))), [track, when, q]);
  const checked = catalog.sources.filter((s) => s.status === 'checked').length;

  return (
    <div className="knowview">
      <header>
        <h2>Knowledge base <small>{catalog.sources.length} sources · {checked} checked · {catalog.sources.length - checked} to verify</small></h2>
        <p className="hint">{catalog.note}</p>
      </header>
      <div className="know-filters">
        <input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sources" />
        <nav className="tabs" aria-label="Track">
          {['all', ...Object.keys(catalog.tracks)].map((t) => <button key={t} className={track === t ? 'on' : ''} onClick={() => setTrack(t)} title={catalog.tracks[t]}>{t}</button>)}
        </nav>
        <nav className="tabs" aria-label="When">
          {['all', 'now', 'compare', 'feb'].map((w) => <button key={w} className={when === w ? 'on' : ''} onClick={() => setWhen(w)}>{WHEN[w] || 'any time'}</button>)}
        </nav>
      </div>
      <div className="know-grid">
        {list.map((s) => (
          <article key={s.id} className={`know ${s.status === 'checked' ? 'ok' : ''}`}>
            <h3>{s.name}</h3>
            <p className="meta"><span>{s.kind}</span><span>{s.track}</span><span>{WHEN[s.when]}</span><span>{s.status}</span></p>
            <p>{s.what}</p>
            <p><b>Use:</b> {s.use}</p>
            <p className="hint"><b>Licence:</b> {s.license}</p>
            {s.where && <p className="hint"><b>Server:</b> {s.where}</p>}
            <a href={s.url} target="_blank" rel="noreferrer">{s.url.replace(/^https?:\/\//, '').slice(0, 48)}</a>
          </article>
        ))}
        {!list.length && <p className="hint">Nothing matches.</p>}
      </div>
    </div>
  );
}
