import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { SYSTEMS, COVERINGS, REGIONS, SOURCES, applyFrame, checkFrame, snowFactor, rafterLength, WOLF_PITCH } from '@shared/timber.js';
import { roomActions } from '../store/roomSlice.js';
import { uiActions } from '../store/uiSlice.js';
import { useLang } from '../lib/i18n.js';

const RAD = Math.PI / 180;
const DEFAULT_SEL = { system: 'staenderbau', region: 'muensterland', covering: 'hohlpfanne', windy: false, kehlFraction: 0.5 };
const ICON = { ok: '✓', warn: '!', fail: '✕', info: 'i' };
const COL = { ok: '#2f9e5b', warn: '#d99a1c', fail: '#d64545', info: '#6b7078' };

/** Cross-section of the frame (x across the building, y = height), in metres. */
function sectionParts(W, pitch, knee, systemId, f, posts) {
  const tan = Math.tan(pitch * RAD);
  const h = (x) => knee + tan * Math.min(x, W - x);
  const ridge = h(W / 2);
  const L = [];
  const add = (x1, y1, x2, y2, kind) => L.push({ x1, y1, x2, y2, kind });
  add(0, 0, 0, knee, 'wall'); add(W, 0, W, knee, 'wall');
  add(0, knee, W / 2, ridge, 'rafter'); add(W, knee, W / 2, ridge, 'rafter');
  const sys = SYSTEMS[systemId];
  if (systemId !== 'staenderbau') add(0, knee, W, knee, 'tie');
  if (sys?.collar) { const x = (W / 2) * f; const y = h(x); add(x, y, W - x, y, 'collar'); }
  const dots = [];
  if (systemId === 'pfetten_stehend') {
    for (const px of posts.length ? [...new Set(posts.map((p) => p.x))] : [W * 0.3, W * 0.7]) {
      const y = h(px);
      add(px, knee, px, y, 'post');
      dots.push([px, y]);
    }
  }
  if (systemId === 'pfetten_liegend') {
    for (const side of [0, 1]) {
      const fx = side ? W - W * 0.1 : W * 0.1, px = side ? W - W * 0.33 : W * 0.33;
      add(fx, knee, px, h(px), 'post');
      dots.push([px, h(px)]);
    }
    const y = h(W * 0.33) - 0.35; add(W * 0.19, y, W - W * 0.19, y, 'collar');
  }
  if (systemId === 'staenderbau') {
    const xs = [W * 0.3, W * 0.7];
    for (const px of xs) { add(px, 0, px, h(px), 'post'); dots.push([px, h(px)]); }
    add(0, knee, W, knee, 'tie');
    const yb = Math.max(h(xs[0]) - 0.15, knee);
    add(xs[0], yb, xs[1], yb, 'collar'); // Rähm / Dachbalken between the post heads
    add(0, knee, xs[0], yb, 'brace'); add(W, knee, xs[1], yb, 'brace');
  }
  return { L, dots, ridge, h };
}

function Diagram({ W, pitch, knee, system, f, posts, covering }) {
  const { L, dots, ridge } = useMemo(() => sectionParts(W, pitch, knee, system, f, posts), [W, pitch, knee, system, f, posts]);
  const top = ridge + 0.6, pad = 0.5;
  const Y = (v) => top - v;
  const stroke = { wall: '#555', rafter: '#8a5a2b', tie: '#6b4a2b', collar: '#b0793a', post: '#8a5a2b', brace: '#a67c52' };
  const wid = { wall: 0.06, rafter: 0.09, tie: 0.08, collar: 0.08, post: 0.1, brace: 0.06 };
  return (
    <svg viewBox={`${-pad} 0 ${W + 2 * pad} ${top + 0.6}`} className="framesvg" role="img" aria-label="Cross-section of the roof frame">
      <line x1={-pad} x2={W + pad} y1={Y(0)} y2={Y(0)} stroke="#222" strokeWidth="0.05" />
      {L.map((l, i) => <line key={i} x1={l.x1} y1={Y(l.y1)} x2={l.x2} y2={Y(l.y2)} stroke={stroke[l.kind]} strokeWidth={wid[l.kind]} strokeLinecap="round" />)}
      {dots.map(([x, y], i) => <rect key={i} x={x - 0.1} y={Y(y) - 0.1} width="0.2" height="0.2" fill="#8a5a2b" />)}
      <text x={W / 2} y={Y(ridge) - 0.15} textAnchor="middle" className="dim">{pitch}° · {rafterLength({ width: W }, pitch).toFixed(1)} m</text>
      <text x={W / 2} y={Y(0) + 0.45} textAnchor="middle" className="dim">{W.toFixed(1)} m</text>
      {covering && <text x={-pad + 0.1} y={0.4} className="dim small">{covering}</text>}
    </svg>
  );
}

export default function FrameView() {
  const dispatch = useDispatch();
  const lang = useSelector((s) => s.ui.lang);
  const de = lang === 'de';
  const room = useSelector((s) => s.room);
  const sel = { ...DEFAULT_SEL, ...(room.frame || {}) };
  const set = (patch) => dispatch(roomActions.setFrame({ ...sel, ...patch }));

  const region = REGIONS.find((r) => r.id === sel.region);
  const system = SYSTEMS[sel.system];
  const cov = COVERINGS[sel.covering];
  const proposal = useMemo(() => applyFrame(room, sel), [room.width, room.depth, sel.system, sel.region, sel.covering, sel.windy, sel.kehlFraction]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = { ...room, ...proposal };
  const checks = useMemo(() => checkFrame(preview, sel), [preview.pitch, preview.width, sel.system, sel.covering, sel.windy, sel.kehlFraction]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = (a, b) => (de ? a : b);

  const pickRegion = (r) => set({ region: r.id, system: r.system, covering: r.covering });
  const apply = () => {
    dispatch(roomActions.applyFrame({ ...proposal, frame: sel }));
    dispatch(uiActions.setToast(t('Dachmodell aktualisiert', 'Roof model updated')));
  };

  return (
    <div className="frameview">
      <section className="card regions">
        <h2>{t('Landschaften (LWL-Freilichtmuseum Detmold)', 'Landscapes (LWL open-air museum Detmold)')}</h2>
        <ul>
          {REGIONS.map((r) => (
            <li key={r.id}>
              <button className={`regionbtn ${sel.region === r.id ? 'on' : ''}`} onClick={() => pickRegion(r)}>
                <b>{de ? r.de : r.en}</b>
                <span>{de ? r.museum.de : r.museum.en}</span>
                <span className="h">{de ? r.house.de : r.house.en}</span>
                <span className="tags">
                  <i>{SYSTEMS[r.system][de ? 'de' : 'en']}</i>
                  <i>{COVERINGS[r.covering][de ? 'de' : 'en']}</i>
                  <i>{r.form}</i>
                  {r.assumed && <i className="assumed">{t('Dachsystem angenommen', 'roof system assumed')}</i>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card framemain">
        <div className="cardhead">
          <h2>{t('Dachwerk', 'Roof frame')} · {system[de ? 'de' : 'en']}</h2>
          <button className="primary" onClick={apply}>{t('Auf das Dachmodell anwenden', 'Apply to the roof model')}</button>
        </div>
        {region && <p className="hint" style={{ marginTop: 0 }}>{de ? region.note.de : region.note.en}</p>}
        <Diagram W={room.width} pitch={proposal.pitch} knee={proposal.kneeWall} system={sel.system} f={sel.kehlFraction} posts={proposal.posts} covering={cov?.[de ? 'de' : 'en']} />
        <div className="proposal">
          <div><small>{t('Neigung', 'Pitch')}</small><b>{proposal.pitch}°</b><em>{t('jetzt', 'now')} {room.pitch}°</em></div>
          <div><small>{t('Kniestock', 'Knee wall')}</small><b>{proposal.kneeWall.toFixed(2)} m</b><em>{t('jetzt', 'now')} {room.kneeWall.toFixed(2)}</em></div>
          <div><small>{system.collar ? t('Höhe Kehlbalken', 'Collar-beam height') : t('max. Höhe', 'max height')}</small><b>{proposal.maxHeight.toFixed(2)} m</b><em>{t('jetzt', 'now')} {room.maxHeight.toFixed(2)}</em></div>
          <div><small>{t('Dachpfosten', 'Roof posts')}</small><b>{proposal.posts.length}</b><em>{t('jetzt', 'now')} {(room.posts || []).length}</em></div>
          <div><small>μ1 {t('Schnee', 'snow')}</small><b>{snowFactor(proposal.pitch).toFixed(2)}</b></div>
        </div>

        <div className="frameopts">
          <label>{t('Dachwerk', 'System')}
            <select value={sel.system} onChange={(e) => set({ system: e.target.value })}>
              {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{de ? v.de : v.en}</option>)}
            </select>
          </label>
          <label>{t('Deckung', 'Covering')}
            <select value={sel.covering} onChange={(e) => set({ covering: e.target.value })}>
              {Object.entries(COVERINGS).map(([k, v]) => <option key={k} value={k}>{de ? v.de : v.en}{(region?.coverings || []).includes(k) ? ' ★' : ''}</option>)}
            </select>
          </label>
          <label className="chk"><input type="checkbox" checked={sel.windy} onChange={(e) => set({ windy: e.target.checked })} /> {t('windreiche Lage', 'windy site')}</label>
          {system.collar && (
            <label>{t('Kehlbalken bei', 'Collar beam at')} {Math.round(sel.kehlFraction * 100)} % {t('der Sparrenlänge', 'of rafter length')}
              <input type="range" min="0.35" max="0.8" step="0.05" value={sel.kehlFraction} onChange={(e) => set({ kehlFraction: +e.target.value })} />
            </label>
          )}
        </div>
        {cov && <p className="hint">{de ? cov.note_de : cov.note_en}</p>}
        <p className="hint">{t('Zimmermannsregel nach Wolf (1950): Firsthöhe = 2/3 der Breite ≙', 'Carpenter’s rule after Wolf (1950): ridge height = 2/3 of the width ≙')} {WOLF_PITCH.toFixed(1)}°.</p>
      </section>

      <aside className="card framerules">
        <h3>{t('Prüfung gegen das Dachmodell', 'Checks against the roof model')}</h3>
        <ul className="checks">
          {checks.map((c, i) => (
            <li key={i}><span className="badge" style={{ background: COL[c.level] }}>{ICON[c.level]}</span><span>{de ? c.de : c.en}</span></li>
          ))}
        </ul>
        <h3>{t('Regeln', 'Rules')} · {system[de ? 'de' : 'en']}</h3>
        <ul className="rules">
          {system.rules.map((r, i) => (
            <li key={i}>{de ? r.de : r.en} <span className="src">{r.src.map((s) => SOURCES[s].title.split(/[:(-]/)[0].trim()).join(' · ')}</span></li>
          ))}
        </ul>
        <h3>{t('Quellen', 'Sources')}</h3>
        <ul className="sources">
          {Object.entries(SOURCES).map(([k, s]) => <li key={k}><a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a></li>)}
        </ul>
        <p className="hint">{t('Zahlen aus Lehrbuch-Faustregeln und Fachseiten sind Orientierungswerte, keine Norm. Bemessung nach DIN EN 1995-1-1 und Statiker.', 'Numbers from textbook rules of thumb and trade sites are guidance, not code. Design to DIN EN 1995-1-1 with a structural engineer.')}</p>
      </aside>
    </div>
  );
}
