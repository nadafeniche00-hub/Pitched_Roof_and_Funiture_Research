import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RULES, checkLayout, factCheckItem, factCheckRoom } from '@shared/rules.js';
import { designActions } from '../store/designSlice.js';
import { uiActions } from '../store/uiSlice.js';

const MARK = { warn: '!', info: 'i' };

function Finding({ f, onClick }) {
  return (
    <li className={`finding ${f.severity}`} onClick={onClick} title={f.title}>
      <span className="mark">{MARK[f.severity]}</span>
      <span>{f.msg}</span>
    </li>
  );
}

/** Fact check (are the numbers believable?) and layout rules (does it follow planning practice?) for the current plan. */
export default function RulesPanel() {
  const dispatch = useDispatch();
  const room = useSelector((s) => s.room);
  const items = useSelector((s) => s.items);
  const result = useSelector((s) => s.analysis.result);
  const disabled = useSelector((s) => s.design.disabled);

  const facts = useMemo(() => [...factCheckRoom(room), ...items.flatMap((it) => factCheckItem(it).map((f) => ({ ...f, itemId: it.id })))], [room, items]);
  const findings = useMemo(() => checkLayout(room, items, result, { disabled }), [room, items, result, disabled]);
  const select = (id) => id && dispatch(uiActions.select(id));

  return (
    <section className="rules">
      <h3>Fact check <span className="count">{facts.length ? `${facts.length} to look at` : 'all plausible'}</span></h3>
      {facts.length > 0 && <ul className="findings">{facts.map((f, i) => <Finding key={i} f={f} onClick={() => select(f.itemId)} />)}</ul>}

      <h3 style={{ marginTop: 14 }}>Layout rules <span className="count">{findings.length ? `${findings.filter((f) => f.severity === 'warn').length} warnings` : 'all met'}</span></h3>
      {findings.length > 0 && <ul className="findings">{findings.map((f, i) => <Finding key={i} f={f} onClick={() => select(f.itemId)} />)}</ul>}

      <details>
        <summary>The {RULES.length} rules</summary>
        <ul className="rulelist">
          {RULES.map((r) => (
            <li key={r.id}>
              <label><input type="checkbox" checked={!disabled.includes(r.id)} onChange={() => dispatch(designActions.toggleRule(r.id))} /> <b>{r.title}</b></label>
              <small>{r.why}</small>
            </li>
          ))}
        </ul>
        <p className="hint">Planning rules of thumb for design exploration, not code requirements. The loop also uses them: every warning costs score.</p>
      </details>
    </section>
  );
}
