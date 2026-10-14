import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FRONT, bodySize, dormerRect, itemRects, stairRect, windowRect } from '@shared/engine.js';
import { resolveItem, resolveDormer } from '@shared/params.js';
import { LPH5_CHECKLIST } from '@shared/lph.js';
import { MATERIALS_DE } from '@shared/materials.js';
import { lphActions } from '../store/lphSlice.js';
import { fetchGlossary } from '../store/thunks.js';
import { useT, useLang } from '../lib/i18n.js';
import { STATUS_COLOR } from './PlanView.jsx';

const mm = (v) => Math.round(v * 1000);
const STATUS_DE = { ok: 'passt', warn: 'eingeschränkt', fail: 'passt nicht', unplaced: 'nicht platziert' };
const STATUS_EN = { ok: 'fits', warn: 'restricted', fail: 'does not fit', unplaced: 'not placed' };

/** Group placed pieces into schedule positions (same product + same effective size = same position). */
export function buildSchedule(items, result) {
  const groups = new Map();
  const byId = Object.fromEntries((result?.items || []).map((r) => [r.id, r]));
  for (const it of items) {
    const { def, source } = resolveItem(it);
    const key = [it.type, it.product?.name || '', mm(def.w), mm(def.d), mm(def.h)].join('|');
    const g = groups.get(key) || { key, def, product: it.product, type: it.type, source, ids: [], statuses: [] };
    g.ids.push(it.id);
    g.statuses.push(it.placed ? byId[it.id]?.status || 'ok' : 'unplaced');
    groups.set(key, g);
  }
  return [...groups.values()].map((g, i) => {
    const order = ['fail', 'unplaced', 'warn', 'ok'];
    const worst = order.find((s) => g.statuses.includes(s)) || 'ok';
    return { ...g, pos: String(i + 1).padStart(2, '0'), qty: g.ids.length, status: worst };
  });
}

function Field({ label, value, onChange, list, wide }) {
  return (
    <label className={`f ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} list={list} />
    </label>
  );
}

export default function Lph5View() {
  const dispatch = useDispatch();
  const t = useT();
  const lang = useLang();
  const de = lang === 'de';
  const room = useSelector((s) => s.room);
  const items = useSelector((s) => s.items);
  const result = useSelector((s) => s.analysis.result);
  const lph = useSelector((s) => s.lph);
  const site = useSelector((s) => s.site);
  const gloss = useSelector((s) => s.lib.glossary);

  useEffect(() => { dispatch(fetchGlossary('material')); }, [dispatch]);
  const set = (group, key) => (value) => dispatch(lphActions.setField({ group, key, value }));

  const schedule = useMemo(() => buildSchedule(items, result), [items, result]);
  const posOf = useMemo(() => Object.fromEntries(schedule.flatMap((g) => g.ids.map((id) => [id, g.pos]))), [schedule]);
  const m = result?.metrics;
  const tan = Math.tan((room.pitch * Math.PI) / 180);
  const ridge = Math.min(room.maxHeight, room.kneeWall + tan * room.width / 2);
  const glazing = room.windows.reduce((a, w) => a + w.width * 1.2, 0) + room.dormers.reduce((a, d) => a + resolveDormer(room, d).width * 1.2, 0);

  const matOptions = (surface) => {
    const own = gloss.rows.filter((g) => g.kind === 'material').map((g) => g.de || g.fr);
    return [...MATERIALS_DE.filter((x) => x.surface === surface).map((x) => x.de), ...own];
  };

  const csv = () => {
    const rows = [[t('pos'), t('designation'), t('maker'), 'B (mm)', 'T (mm)', 'H (mm)', t('qty'), t('status'), t('origin')]];
    for (const g of schedule) {
      rows.push([g.pos, de ? g.def.labelDe : g.def.label, g.product?.brand || '', mm(g.def.w), mm(g.def.d), mm(g.def.h), g.qty,
        (de ? STATUS_DE : STATUS_EN)[g.status], g.product ? (g.product.url || g.product.name) : (de ? 'Standardtyp' : 'built-in type')]);
    }
    const text = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = `${lph.plankopf.planNr || 'LPH5'}_Moeblierungsliste.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const W = room.width, D = room.depth, P = 0.9;
  const sr = stairRect(room);
  const pk = lph.plankopf;

  return (
    <div className="lphview">
      <aside className="card noprint lphside">
        <h3>{t('lph_header')}</h3>
        <div className="grid2">
          <Field label={de ? 'Projekt' : 'Project'} value={pk.projekt} onChange={set('plankopf', 'projekt')} wide />
          <Field label={de ? 'Bauherr' : 'Client'} value={pk.bauherr} onChange={set('plankopf', 'bauherr')} wide />
          <Field label={de ? 'Plantitel' : 'Plan title'} value={pk.planTitel} onChange={set('plankopf', 'planTitel')} wide />
          <Field label={de ? 'Plan-Nr.' : 'Plan no.'} value={pk.planNr} onChange={set('plankopf', 'planNr')} />
          <Field label={de ? 'Maßstab' : 'Scale'} value={pk.massstab} onChange={set('plankopf', 'massstab')} />
          <Field label={de ? 'Datum' : 'Date'} value={pk.datum} onChange={set('plankopf', 'datum')} />
          <Field label="Index" value={pk.index} onChange={set('plankopf', 'index')} />
          <Field label={de ? 'Bearbeiter' : 'Author'} value={pk.bearbeiter} onChange={set('plankopf', 'bearbeiter')} wide />
        </div>

        <h3>{t('lph_room')}</h3>
        <div className="grid2">
          <Field label={de ? 'Raum-Nr.' : 'Room no.'} value={lph.raum.nr} onChange={set('raum', 'nr')} />
          <Field label={de ? 'Raumname' : 'Room name'} value={lph.raum.name} onChange={set('raum', 'name')} />
          <Field label={de ? 'Nutzung' : 'Use'} value={lph.raum.nutzung} onChange={set('raum', 'nutzung')} wide />
          <Field label={de ? 'Boden' : 'Floor'} value={lph.raum.boden} onChange={set('raum', 'boden')} list="mat-boden" wide />
          <Field label={de ? 'Wand' : 'Wall'} value={lph.raum.wand} onChange={set('raum', 'wand')} list="mat-wand" wide />
          <Field label={de ? 'Decke' : 'Ceiling'} value={lph.raum.decke} onChange={set('raum', 'decke')} list="mat-decke" wide />
          <Field label={de ? 'Dachaufbau' : 'Roof build-up'} value={lph.details.dachaufbau} onChange={set('details', 'dachaufbau')} wide />
          <Field label={de ? 'Dämmung' : 'Insulation'} value={lph.details.daemmung} onChange={set('details', 'daemmung')} wide />
        </div>
        {['boden', 'wand', 'decke'].map((s) => <datalist key={s} id={`mat-${s}`}>{matOptions(s).map((x) => <option key={x} value={x} />)}</datalist>)}

        <h3>{t('lph_check')}</h3>
        <ul className="check">
          {LPH5_CHECKLIST.map((c) => <li key={c.key}>{de ? c.de : c.en}</li>)}
        </ul>

        <div className="btnrow">
          <button className="primary" onClick={() => window.print()}>{t('lph_print')}</button>
          <button onClick={csv}>{t('lph_csv')}</button>
        </div>
      </aside>

      <section className="sheet">
        <header className="plankopf">
          <div><small>{de ? 'Projekt' : 'Project'}</small><b>{pk.projekt}</b></div>
          <div><small>{de ? 'Bauherr' : 'Client'}</small><b>{pk.bauherr || '—'}</b></div>
          <div className="wide"><small>LPH 5 · {de ? 'Ausführungsplanung' : 'Execution planning'}</small><b>{pk.planTitel}</b></div>
          <div><small>{de ? 'Plan-Nr.' : 'Plan no.'}</small><b>{pk.planNr} / {pk.index}</b></div>
          <div><small>{de ? 'Maßstab' : 'Scale'}</small><b>{pk.massstab}</b></div>
          <div><small>{de ? 'Datum' : 'Date'}</small><b>{pk.datum}</b></div>
        </header>

        <div className="sheetbody">
          <svg viewBox={`${-P} ${-P} ${W + 2 * P} ${D + 2 * P}`} className="sheetplan" role="img" aria-label="Möblierungsplan">
            <defs>
              <pattern id="hatch2" width="0.12" height="0.12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="0.12" stroke="#222" strokeWidth="0.015" /></pattern>
            </defs>
            <rect x="0" y="0" width={W} height={D} fill="#fff" stroke="#111" strokeWidth="0.06" />
            {room.dormers.map((d, i) => { const r = dormerRect(room, d); return <rect key={i} x={r[0]} y={r[1]} width={r[2] - r[0]} height={r[3] - r[1]} fill="none" stroke="#111" strokeWidth="0.025" strokeDasharray="0.1 0.07" />; })}
            {room.windows.map((w, i) => { const r = windowRect(room, w); return <rect key={i} x={r[0]} y={r[1]} width={r[2] - r[0]} height={r[3] - r[1]} fill="#9cc5ee" stroke="#111" strokeWidth="0.02" />; })}
            {sr && <rect x={sr[0]} y={sr[1]} width={sr[2] - sr[0]} height={sr[3] - sr[1]} fill="url(#hatch2)" stroke="#111" strokeWidth="0.03" />}
            {items.filter((i) => i.placed).map((it) => {
              const def = resolveItem(it).def;
              const b = itemRects(def, it).body;
              const f = FRONT[it.rot];
              const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
              const st = result?.items.find((r) => r.id === it.id)?.status || 'ok';
              const { w, d } = bodySize(def, it.rot);
              return (
                <g key={it.id}>
                  <rect x={b[0]} y={b[1]} width={b[2] - b[0]} height={b[3] - b[1]} fill={def.color} fillOpacity="0.35" stroke={STATUS_COLOR[st]} strokeWidth="0.04" />
                  <line x1={cx} y1={cy} x2={cx + f[0] * Math.min(w, d) * 0.3} y2={cy + f[1] * Math.min(w, d) * 0.3} stroke="#111" strokeWidth="0.025" />
                  <circle cx={cx} cy={cy} r="0.17" fill="#fff" stroke="#111" strokeWidth="0.02" />
                  <text x={cx} y={cy + 0.065} textAnchor="middle" fontSize="0.19" fontWeight="700">{posOf[it.id]}</text>
                </g>
              );
            })}
            {/* overall dimensions */}
            <g stroke="#111" strokeWidth="0.02" fontSize="0.2" fill="#111">
              <line x1="0" y1={-0.45} x2={W} y2={-0.45} /><line x1="0" y1={-0.55} x2="0" y2={-0.35} /><line x1={W} y1={-0.55} x2={W} y2={-0.35} />
              <text x={W / 2} y={-0.55} textAnchor="middle" stroke="none">{mm(W)}</text>
              <line x1={-0.45} y1="0" x2={-0.45} y2={D} /><line x1={-0.55} y1="0" x2={-0.35} y2="0" /><line x1={-0.55} y1={D} x2={-0.35} y2={D} />
              <text x={-0.55} y={D / 2} textAnchor="middle" stroke="none" transform={`rotate(-90 ${-0.55} ${D / 2})`}>{mm(D)}</text>
            </g>
            {/* north arrow: true north is rotated against the plan's top edge by the building azimuth */}
            <g transform={`translate(${W + 0.45} 0.5) rotate(${-site.azimuth})`}>
              <polygon points="0,-0.35 0.12,0.12 0,0.04 -0.12,0.12" fill="#111" /><text y="0.38" textAnchor="middle" fontSize="0.18" fill="#111">N</text>
            </g>
          </svg>

          <div className="sheetdata">
            <table className="roombook">
              <caption>{de ? 'Raumbuch' : 'Room book'} · {lph.raum.nr} {lph.raum.name}</caption>
              <tbody>
                <tr><th>{de ? 'Nutzung' : 'Use'}</th><td>{lph.raum.nutzung}</td></tr>
                <tr><th>{de ? 'Grundfläche (brutto)' : 'Gross area'}</th><td>{m ? m.gross.toFixed(2) : '–'} m²</td></tr>
                <tr><th>{de ? 'Wohnfläche (nach Höhe gewertet)' : 'Living area (height-weighted)'}</th><td>{m ? m.counted.toFixed(2) : '–'} m²</td></tr>
                <tr><th>{de ? 'Fläche < 1,00 m (nicht angerechnet)' : 'Area < 1.00 m (not counted)'}</th><td>{m ? m.lost.toFixed(2) : '–'} m²</td></tr>
                <tr><th>{de ? 'Kniestock / First' : 'Knee wall / ridge'}</th><td>{mm(room.kneeWall)} / {mm(ridge)} mm</td></tr>
                <tr><th>{de ? 'Dachneigung' : 'Roof pitch'}</th><td>{room.pitch}°</td></tr>
                <tr><th>{de ? 'Belichtung (Fenster + Gauben)' : 'Glazing (windows + dormers)'}</th><td>{glazing.toFixed(1)} m² ({m ? Math.round((glazing / m.gross) * 100) : '–'} %)</td></tr>
                <tr><th>{de ? 'Boden' : 'Floor'}</th><td>{lph.raum.boden || '—'}</td></tr>
                <tr><th>{de ? 'Wand' : 'Wall'}</th><td>{lph.raum.wand || '—'}</td></tr>
                <tr><th>{de ? 'Decke' : 'Ceiling'}</th><td>{lph.raum.decke || '—'}</td></tr>
                <tr><th>{de ? 'Dachaufbau / Dämmung' : 'Roof build-up / insulation'}</th><td>{[lph.details.dachaufbau, lph.details.daemmung].filter(Boolean).join(' / ') || '—'}</td></tr>
              </tbody>
            </table>

            <table className="schedule">
              <caption>{t('lph_schedule')}</caption>
              <thead><tr><th>{t('pos')}</th><th>{t('designation')}</th><th>{t('maker')}</th><th>{t('size')}</th><th>{t('qty')}</th><th>{t('status')}</th></tr></thead>
              <tbody>
                {schedule.map((g) => (
                  <tr key={g.key}>
                    <td>{g.pos}</td>
                    <td>{de ? g.def.labelDe : g.def.label}{g.source.w !== 'Category' && <small className="src"> ·{g.source.w === 'Product' ? (de ? ' Produktmaß' : ' product size') : (de ? ' überschrieben' : ' overridden')}</small>}</td>
                    <td>{g.product?.brand || '—'}</td>
                    <td>{mm(g.def.w)} × {mm(g.def.d)} × {mm(g.def.h)}</td>
                    <td>{g.qty}</td>
                    <td><span className="dot" style={{ background: STATUS_COLOR[g.status] }} /> {(de ? STATUS_DE : STATUS_EN)[g.status]}</td>
                  </tr>
                ))}
                {!schedule.length && <tr><td colSpan="6" className="hint">—</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
