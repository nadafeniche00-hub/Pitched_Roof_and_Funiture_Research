// Does the checker-and-repair loop (server/ai.js planFromSketch) make the model's reading of a plan better? Each case is a drawn plan with a known truth (make_cases.mjs, render_plans.py).
// For every case the model is asked once, and when the checker (shared/planCheck.js) finds an error it is asked again with the measured reasons, at most ROUNDS times. The first answer is the
// "one shot" condition; the answer the loop returns is the "with the oracle" condition: the same calls, so the two are paired.
//   node --env-file=server/.env server/eval/sketch_eval.mjs [--rounds 2] [--limit 12]
// Metrics against the truth: IoU = mean over the true rooms of the best overlap with a predicted room (a missed room counts 0), count = the number of rooms is right,
// type = share of matched rooms with the right type (the hall is left out), pass = the checker found no error. One run, temperature 0.1: read small differences as noise.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { planFromSketch, configured } from '../ai.js';
import { checkSketchPlan } from '../../shared/planCheck.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const ROUNDS = arg('rounds', 2), LIMIT = arg('limit', 99);
if (!configured()) { console.error('No model server: run with node --env-file=server/.env'); process.exit(2); }

const DIR = new URL('./cases/', import.meta.url);
const files = readdirSync(DIR).filter((f) => /^case_\d+\.json$/.test(f)).sort().slice(0, LIMIT);
const iou = (a, b) => {
  const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (ox <= 0 || oy <= 0) return 0;
  const i = ox * oy, u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i;
  return i / u;
};

function score(truth, plan) {
  const fp = plan?.footprint, list = Array.isArray(plan?.rooms) ? plan.rooms : [];
  const sx = fp?.w > 0 ? truth.footprint.w / fp.w : 1, sy = fp?.d > 0 ? truth.footprint.d / fp.d : 1; // a plan in other units is stretched onto the true outline, as planImport.js does
  const pred = list.map((r) => ({ type: r.type, rect: [r.x * sx, r.y * sy, (r.x + r.w) * sx, (r.y + r.d) * sy] })).filter((p) => p.rect.every(Number.isFinite));
  const used = new Set();
  let sum = 0, typed = 0, typedOk = 0;
  for (const t of truth.rooms) {
    const tr = [t.x, t.y, t.x + t.w, t.y + t.d];
    let best = 0, bi = -1;
    pred.forEach((p, i) => { if (used.has(i)) return; const v = iou(tr, p.rect); if (v > best) { best = v; bi = i; } });
    if (bi >= 0 && best > 0.1) { used.add(bi); sum += best; if (t.type !== 'hall') { typed += 1; if (pred[bi].type === t.type) typedOk += 1; } }
  }
  return { iou: sum / truth.rooms.length, count: pred.length === truth.rooms.length, type: typed ? typedOk / typed : null, pass: checkSketchPlan(plan).ok };
}

const rows = [];
for (const f of files) {
  const truth = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
  const dataUrl = `data:image/png;base64,${readFileSync(new URL(f.replace('.json', '.png'), DIR)).toString('base64')}`;
  const t0 = Date.now();
  try {
    const out = await planFromSketch(dataUrl, { rounds: ROUNDS, trace: true });
    const first = out.check.history[0].plan;
    const row = { case: truth.name, rooms: truth.rooms.length, rounds: out.check.rounds, one: score(truth, first), loop: score(truth, out.plan), ms: Date.now() - t0, findings: out.check.findings.filter((x) => x.severity === 'error').map((x) => x.code) };
    rows.push(row);
    console.log(`${truth.name}  rooms ${truth.rooms.length}  one-shot IoU ${row.one.iou.toFixed(2)} pass ${row.one.pass}  ->  loop IoU ${row.loop.iou.toFixed(2)} pass ${row.loop.pass}  (${out.check.rounds} repair rounds, ${Math.round(row.ms / 1000)} s)`);
  } catch (e) {
    rows.push({ case: truth.name, rooms: truth.rooms.length, error: e.message });
    console.log(`${truth.name}  FAILED: ${e.message}`);
  }
}
const ok = rows.filter((r) => !r.error);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sum = (k) => ({
  iou: +mean(ok.map((r) => r[k].iou)).toFixed(3),
  pass: ok.filter((r) => r[k].pass).length,
  count: ok.filter((r) => r[k].count).length,
  type: +mean(ok.map((r) => r[k].type).filter((v) => v !== null)).toFixed(3),
});
const summary = { model: process.env.LLM_VISION_MODEL || process.env.LLM_MODEL, rounds: ROUNDS, cases: rows.length, answered: ok.length, oneShot: sum('one'), withOracle: sum('loop'), repaired: ok.filter((r) => r.rounds > 0).length, at: new Date().toISOString() };
console.log(JSON.stringify(summary, null, 1));
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify({ summary, rows }, null, 1));
