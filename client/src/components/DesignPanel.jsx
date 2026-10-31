import { useDispatch, useSelector } from 'react-redux';
import { CATALOG } from '@shared/catalog.js';
import { NODES, walk, buildPattern } from '@shared/patterns.js';
import { LOOP_KINDS } from '@shared/iterate.js';
import { designActions } from '../store/designSlice.js';
import { itemsActions } from '../store/itemsSlice.js';
import { applyPattern, runIteration } from '../store/thunks.js';

const ANCHOR = { slope: 'back to the slope', gable: 'back to a gable wall', wall: 'back to a wall', free: 'free-standing', light: 'near daylight' };
const anchorText = (spec) => (spec ? [spec.backTo && ANCHOR[spec.backTo], spec.near && ANCHOR[spec.near]].filter(Boolean).join(', ') : 'anywhere');

/** The pattern tree: a few questions that end in a furniture pattern with an anchor per piece. */
function PatternTree() {
  const dispatch = useDispatch();
  const { path, running } = useSelector((s) => s.design);
  const { chosen, node } = walk(path);
  const pattern = buildPattern(path);

  return (
    <section>
      <h3>Design pattern {path.length > 0 && <button className="mini" onClick={() => dispatch(designActions.rewind(0))}>restart</button>}</h3>

      {chosen.length > 0 && (
        <ol className="crumbs" aria-label="Your choices">
          {chosen.map((c, i) => (
            <li key={c.node}><button className="mini" title="Go back to this question" onClick={() => dispatch(designActions.rewind(i))}>{c.label}</button></li>
          ))}
        </ol>
      )}

      {node && (
        <div className="question">
          <p className="q">{NODES[node].q}</p>
          <div className="opts">
            {NODES[node].options.map((o) => (
              <button key={o.id} className="opt" onClick={() => dispatch(designActions.choose(o.id))}>
                <b>{o.label}</b>
                {o.hint && <small>{o.hint}</small>}
              </button>
            ))}
          </div>
        </div>
      )}

      {pattern && (
        <div className="pattern">
          <ul>
            {pattern.pieces.map((p, i) => <li key={i}><b>{CATALOG[p.type].label}</b> <small>{anchorText(p.spec)}</small></li>)}
          </ul>
          <button className="primary" disabled={running} onClick={() => dispatch(applyPattern())}>Build this pattern</button>
          <p className="hint">Replaces the furniture, then places the pieces one by one at the anchors you chose.</p>
        </div>
      )}
      {!chosen.length && <p className="hint">Answer a few questions and the pieces and their anchors follow from your choices.</p>}
    </section>
  );
}

function Sparkline({ frames, at }) {
  const n = frames.length;
  if (n < 2) return null;
  const lo = Math.min(...frames.map((f) => f.score));
  const hi = Math.max(...frames.map((f) => f.score));
  const x = (i) => (i / (n - 1)) * 100;
  const y = (v) => 22 - (hi === lo ? 11 : ((v - lo) / (hi - lo)) * 20);
  return (
    <svg className="spark" viewBox="0 -1 100 26" preserveAspectRatio="none" role="img" aria-label="Design score per pass">
      <polyline points={frames.map((f, i) => `${x(i)},${y(f.score)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx={x(at)} cy={y(frames[at].score)} r="2.2" fill="var(--accent)" />
    </svg>
  );
}

/** The Swalloop-style loop: Max iter., Tolerance, a history you can replay, and the best pass kept. */
function LoopControls() {
  const dispatch = useDispatch();
  const { kind, maxIter, tolerance, frames, frame, running } = useSelector((s) => s.design);
  const hasItems = useSelector((s) => s.items.length > 0);
  const cur = frames[frame];
  const set = (patch) => dispatch(designActions.setLoop(patch));
  const scrub = (i) => { dispatch(designActions.setFrame(i)); dispatch(itemsActions.setItems(frames[i].items)); };

  return (
    <section>
      <h3>Iterate {frames.length > 1 && <span className="count">pass {frame}/{frames.length - 1}</span>}</h3>
      <div className="tabs" role="group" aria-label="Loop kind">
        {Object.entries(LOOP_KINDS).map(([k, v]) => <button key={k} className={kind === k ? 'on' : ''} disabled={running} onClick={() => set({ kind: k })}>{v.label}</button>)}
      </div>
      <p className="hint">{LOOP_KINDS[kind].hint}</p>
      <div className="line">
        <label className="num">Max iter.
          <input type="number" min="1" max="60" step="1" value={maxIter} disabled={running} onChange={(e) => set({ maxIter: Math.min(60, Math.max(1, Math.round(+e.target.value) || 1)) })} />
        </label>
        <label className="num">Tolerance
          <input type="number" min="0" max="0.05" step="0.001" value={tolerance} disabled={running} onChange={(e) => set({ tolerance: Math.min(0.05, Math.max(0, +e.target.value || 0)) })} />
        </label>
        <button className="primary" disabled={running || !hasItems} onClick={() => dispatch(runIteration())}>{running ? 'Running…' : 'Run loop'}</button>
      </div>

      {frames.length > 1 && cur && (
        <div className="history">
          <Sparkline frames={frames} at={frame} />
          <input type="range" min="0" max={frames.length - 1} step="1" value={frame} disabled={running} onChange={(e) => scrub(+e.target.value)} aria-label="Replay a pass" />
          <p className="hint"><b>{cur.note}</b><br />score {cur.score.toFixed(2)} · index {Math.round(cur.index * 100)} · {cur.warns} rule warning{cur.warns === 1 ? '' : 's'}{!cur.accepted && ' · rejected'}</p>
          <p className="hint">Drag the slider to replay: the plan shows that pass. The pass you leave it on is your layout.</p>
        </div>
      )}
    </section>
  );
}

export default function DesignPanel() {
  return (
    <>
      <PatternTree />
      <LoopControls />
    </>
  );
}
