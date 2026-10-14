import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CATALOG } from '@shared/catalog.js';
import { libActions } from '../store/libSlice.js';
import { itemsActions } from '../store/itemsSlice.js';
import { uiActions } from '../store/uiSlice.js';
import { searchProducts, fetchFacets, fetchGlossary, scrapeUrls } from '../store/thunks.js';
import { useT, useLang, pickName } from '../lib/i18n.js';

const mm = (v) => (v ? Math.round(v * 1000) : null);

function ProductCard({ p }) {
  const dispatch = useDispatch();
  const t = useT();
  const lang = useLang();
  const [type, setType] = useState(p.type || '');
  const base = CATALOG[type];
  const dims = [p.w, p.d, p.h];
  const inherited = !p.w || !p.d || !p.h;

  const use = () => {
    if (!type) return;
    dispatch(itemsActions.addProduct(p, type));
    dispatch(uiActions.setToast(`${pickName(p, lang)} → ${lang === 'de' ? 'Plan' : 'plan'}`));
  };

  return (
    <article className="pcard">
      {p.image ? <img src={p.image} alt="" loading="lazy" /> : <div className="noimg" style={{ background: base?.color || 'var(--line)' }}>{(base?.[lang === 'de' ? 'de' : 'label'] || '?').slice(0, 2)}</div>}
      <div className="pbody">
        <h4>{pickName(p, lang)}</h4>
        {lang === 'de' && p.name_de && <div className="sub">{p.name}</div>}
        <div className="meta">
          {p.brand && <span>{p.brand}</span>}
          <span className="pill">{p.source.split(':')[0]}</span>
          {p.project && <span className="pill">{p.project}</span>}
          {p.occurrences > 1 && <span>×{p.occurrences}</span>}
        </div>
        <div className={`dims ${inherited ? 'inh' : ''}`} title={inherited ? t('inherits') : ''}>
          {dims.map((v, i) => (v ? mm(v) : (base ? `(${mm([base.w, base.d, base.h][i])})` : '–'))).join(' × ')} mm
        </div>
        {p.price && <div className="meta">{p.price.toFixed(2)} {p.currency || ''}</div>}
        <div className="pactions">
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('type')}>
            <option value="">{lang === 'de' ? 'Typ wählen…' : 'choose type…'}</option>
            {Object.entries(CATALOG).map(([k, v]) => <option key={k} value={k}>{lang === 'de' ? v.de : v.label}</option>)}
          </select>
          <button className="mini primary" disabled={!type} onClick={use}>{t('use')}</button>
          {p.url && <a href={p.url} target="_blank" rel="noreferrer noopener" className="mini">↗</a>}
        </div>
      </div>
    </article>
  );
}

export default function LibraryView() {
  const dispatch = useDispatch();
  const t = useT();
  const lang = useLang();
  const lib = useSelector((s) => s.lib);
  const [urls, setUrls] = useState('');

  useEffect(() => {
    dispatch(searchProducts());
    dispatch(fetchFacets());
  }, [dispatch]);
  useEffect(() => { dispatch(fetchGlossary(lib.glossary.kind)); }, [dispatch, lib.glossary.kind]);

  const f = (key) => (e) => dispatch(libActions.setFilter({ key, value: e.target.value }));

  return (
    <div className="libview">
      <section className="card">
        <div className="searchbar">
          <input autoFocus type="search" placeholder={t('search_ph')} value={lib.q} onChange={(e) => dispatch(libActions.setQuery(e.target.value))} aria-label="search" />
          <select value={lib.type} onChange={f('type')} aria-label={t('type')}>
            <option value="">{t('type')}: {t('all')}</option>
            {lib.facets.types.map((x) => <option key={x.type} value={x.type}>{(lang === 'de' ? CATALOG[x.type]?.de : CATALOG[x.type]?.label) || x.type} ({x.n})</option>)}
          </select>
          <select value={lib.source} onChange={f('source')} aria-label={t('source')}>
            <option value="">{t('source')}: {t('all')}</option>
            {lib.facets.sources.map((x) => <option key={x.source} value={x.source}>{x.source} ({x.n})</option>)}
          </select>
          <select value={lib.project} onChange={f('project')} aria-label={t('project')}>
            <option value="">{t('project')}: {t('all')}</option>
            {lib.facets.projects.map((x) => <option key={x.project} value={x.project}>{x.project} ({x.n})</option>)}
          </select>
          <span className="count">{lib.status === 'loading' ? '…' : `${lib.results.length} ${t('results')}`}</span>
        </div>
        {lib.status === 'error' && <p className="issue bad">{lib.error} - is the API running?</p>}
        <div className="pgrid">
          {lib.results.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      </section>

      <section className="card">
        <h2>{t('scrape_title')}</h2>
        <p className="hint">{t('scrape_hint')}</p>
        <textarea rows={4} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://…" aria-label="URLs" />
        <button className="primary" disabled={lib.scrape.status === 'loading' || !urls.trim()}
          onClick={() => dispatch(scrapeUrls(urls.split(/\s+/).filter(Boolean).slice(0, 5)))}>
          {lib.scrape.status === 'loading' ? '…' : t('scrape_go')}
        </button>
        <ul className="scrape">
          {lib.scrape.results.map((r, i) => (
            <li key={i} className={r.ok ? 'good' : 'bad'}>{r.ok ? `✓ ${r.count}× ` : '✕ '}{r.url} {r.error && <em>- {r.error}</em>}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="cardhead">
          <h2>{t('glossary')}</h2>
          {['room', 'level', 'material', 'subproject', 'view'].map((k) => (
            <button key={k} className={`mini ${lib.glossary.kind === k ? 'primary' : ''}`} onClick={() => dispatch(libActions.setGlossaryKind(k))}>{t(`g_${k}`)}</button>
          ))}
        </div>
        <div className="tablewrap">
          <table className="gloss">
            <thead><tr><th>FR</th><th>DE</th><th>EN</th><th>{lib.glossary.kind === 'material' ? (lang === 'de' ? 'Klasse' : 'Class') : lib.glossary.kind === 'subproject' ? (lang === 'de' ? 'Fachbereich' : 'Discipline') : ''}</th><th>{t('project')}</th><th>×</th></tr></thead>
            <tbody>
              {lib.glossary.rows.map((g) => (
                <tr key={g.id}><td>{g.fr}</td><td>{g.de}</td><td>{g.en}</td><td>{g.category}</td><td>{g.project}</td><td>{g.occurrences}</td></tr>
              ))}
            </tbody>
          </table>
          {!lib.glossary.rows.length && <p className="hint">{lib.glossary.status === 'loading' ? '…' : '—'}</p>}
        </div>
      </section>
    </div>
  );
}
