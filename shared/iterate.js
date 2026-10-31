// Iteration loop for the furniture layout - a simplified version of the Swalloop loop (Loop Start -> body -> Loop End).
//
//   Loop Start   the current layout (state) and, for Fold, the list of pieces
//   body         one pass: place or move ONE piece to its best position, anchors from the pattern tree respected
//   Loop End     Max iter. and Tolerance as in Swalloop; History = one frame per pass, replayable
//
// Two kinds, as in Swalloop:
//   repeat  improve the layout you have: each pass takes the worst piece (failing, breaking rules) and tries better
//           positions; a move is kept only if the design score goes up. Stops when every piece has been tried without
//           gain, when the gain stays under Tolerance three passes in a row, or at Max iter.
//   fold    build the layout piece by piece (hardest first): one piece per pass, the result is the layout after the last one.
//
// design score = Usable-Space Index - rule penalty (rules.js), so a layout that fits but breaks planning rules loses.
import { CATALOG } from './catalog.js';
import { defOf } from './params.js';
import { DEFAULT_RULES, candidatesFor, evaluate, mulberry32, occupancy } from './engine.js';
import { checkLayout, layoutPenalty } from './rules.js';
import { specFilter } from './patterns.js';

export const LOOP_KINDS = {
  repeat: { label: 'Repeat', hint: 'Improve the layout piece by piece, keep only moves that raise the score.' },
  fold: { label: 'Fold', hint: 'Build the layout from nothing, one piece per pass, hardest first.' },
};

export function designScore(room, items, { rules, disabled } = {}) {
  const result = evaluate(room, items, { rules });
  const findings = checkLayout(room, items, result, { disabled });
  return { result, findings, index: result.metrics.index, score: result.metrics.index - layoutPenalty(findings) };
}

/** Valid positions of one piece, anchored by its pattern spec; falls back to any position if the anchor cannot be met. */
function positionsFor(room, items, id, rules, jitter) {
  const it = items.find((i) => i.id === id);
  const { g, occ } = occupancy(room, items, id);
  const filter = specFilter(room, it.spec);
  const cands = candidatesFor(g, occ, room, it, rules, { filter, jitter });
  if (cands.length || !filter) return { cands, relaxed: false };
  return { cands: candidatesFor(g, occ, room, it, rules, { filter: specFilter(room, it.spec, true), jitter }), relaxed: true };
}

const label = (items, id) => defOf(items.find((i) => i.id === id)).label;
const difficulty = (it) => { const d = defOf(it); return d.bodyH * 10 + d.w * d.d; };

/**
 * The loop as a generator: yields frame 0 (the start) and then one frame per pass, so a UI can animate while it runs.
 * Frame: { i, items, score, index, warns, infos, piece, accepted, note }.
 */
export function* loopSteps(room, items, opts = {}) {
  const rules = { ...DEFAULT_RULES, ...(opts.rules || {}) };
  const disabled = opts.disabled || [];
  const rng = mulberry32(opts.seed ?? 1);
  const maxIter = opts.maxIter ?? 20;
  const tolerance = opts.tolerance ?? 0.002;
  const measure = (its) => designScore(room, its, { rules, disabled });
  const frame = (i, its, m, extra) => ({
    i, items: its, score: m.score, index: m.index,
    warns: m.findings.filter((f) => f.severity === 'warn').length,
    infos: m.findings.filter((f) => f.severity === 'info').length,
    ...extra,
  });

  const fold = opts.kind === 'fold';
  let cur = items.filter((it) => CATALOG[it.type]).map((it) => ({ ...it, placed: fold ? false : it.placed }));
  let m = measure(cur);
  yield frame(0, cur, m, { piece: null, accepted: true, note: fold ? 'Start: nothing placed' : 'Start' });

  if (fold) {
    const order = cur.slice().sort((a, b) => difficulty(b) - difficulty(a)).map((it) => it.id);
    for (let pass = 1; pass <= Math.min(maxIter, order.length); pass++) {
      const id = order[pass - 1];
      const { cands, relaxed } = positionsFor(room, cur, id, rules, null);
      if (cands.length) cur = cur.map((it) => (it.id === id ? { ...cands[0].cand, placed: true } : it));
      m = measure(cur);
      const note = !cands.length ? `${label(cur, id)}: no position left` : relaxed ? `${label(cur, id)} placed - anchor could not be met` : `${label(cur, id)} placed`;
      yield frame(pass, cur, m, { piece: id, accepted: cands.length > 0, note });
    }
    return;
  }

  const tried = new Set();
  let quiet = 0;
  const rank = (it) => {
    const r = m.result.items.find((x) => x.id === it.id);
    const base = !it.placed ? 3 : { fail: 2, warn: 1, ok: 0 }[r.status];
    return base * 10 + m.findings.filter((f) => f.itemId === it.id).length;
  };
  for (let pass = 1; pass <= maxIter; pass++) {
    const pool = cur.filter((it) => !tried.has(it.id)).sort((a, b) => rank(b) - rank(a));
    if (!pool.length) return; // every piece tried without gain: converged
    const target = pool[0];
    const { cands } = positionsFor(room, cur, target.id, rules, () => rng() * 0.3);
    let best = null;
    for (const c of cands.slice(0, 6)) {
      const next = cur.map((it) => (it.id === target.id ? { ...c.cand, placed: true } : it));
      const s = measure(next);
      if (!best || s.score > best.s.score) best = { next, s };
    }
    if (best && best.s.score > m.score + 1e-9) {
      const gain = best.s.score - m.score;
      cur = best.next;
      m = best.s;
      tried.clear();
      quiet = gain < tolerance ? quiet + 1 : 0;
      yield frame(pass, cur, m, { piece: target.id, accepted: true, note: `${label(cur, target.id)} moved (+${gain.toFixed(3)})` });
      if (quiet >= 3) return;
    } else {
      tried.add(target.id);
      yield frame(pass, cur, m, { piece: target.id, accepted: false, note: `${label(cur, target.id)}: no better position` });
    }
  }
}

/** Run the whole loop. `best` is the index of the highest-scoring frame. */
export function runLoop(room, items, opts = {}) {
  const frames = [...loopSteps(room, items, opts)];
  let best = 0;
  frames.forEach((f, i) => { if (f.score > frames[best].score) best = i; });
  return { frames, best, count: frames.length - 1, stopped: frames.length - 1 >= (opts.maxIter ?? 20) ? 'max' : 'converged' };
}
