// The gate in front of a plan a model wrote (shared/planCheck.js) and the repair loop that uses it (server/ai.js, planFromSketch). The model is a scripted fake server: no network, no key.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { checkSketchPlan, findingsText } from '../../shared/planCheck.js';
import { DEFAULT_ROOM, sanitizeRoom } from '../../shared/engine.js';

const GOOD = { version: 1, footprint: { w: 6, d: 8 }, rooms: [
  { id: 'a', type: 'bedroom', x: 0, y: 0, w: 3, d: 4 },
  { id: 'b', type: 'child', x: 3, y: 0, w: 3, d: 4 },
  { id: 'c', type: 'living', x: 0, y: 4, w: 4, d: 4 },
  { id: 'd', type: 'bath', x: 4, y: 4, w: 2, d: 4 },
] };
const clone = (o) => JSON.parse(JSON.stringify(o));
const codes = (r, sev) => r.findings.filter((f) => !sev || f.severity === sev).map((f) => f.code);

test('a plan that tiles its outline passes, with nothing to say but the rooms it has', () => {
  const r = checkSketchPlan(GOOD);
  assert.equal(r.ok, true);
  assert.deepEqual(codes(r, 'error'), []);
  assert.equal(r.stats.coverage, 1);
  assert.equal(r.stats.rooms, 4);
});

test('overlapping rooms, rooms outside the outline and holes are errors, each with its measure', () => {
  const overlap = clone(GOOD); overlap.rooms[1].x = 2; // b now overlaps a by 1 x 4 m
  const o = checkSketchPlan(overlap);
  assert.equal(o.ok, false);
  assert.ok(codes(o, 'error').includes('overlap'));
  assert.match(o.findings.find((f) => f.code === 'overlap').msg, /a and b overlap by 4\.0 m²/);

  const outside = clone(GOOD); outside.rooms[3].w = 3; // d reaches x = 7 in a 6 m outline
  const out = checkSketchPlan(outside);
  assert.ok(codes(out, 'error').includes('outside'));

  const holes = clone(GOOD); holes.rooms = holes.rooms.slice(0, 2); // only the top half is covered
  const h = checkSketchPlan(holes);
  assert.equal(h.ok, false);
  assert.ok(codes(h, 'error').includes('gaps'));
  assert.equal(h.stats.coverage, 0.5);
});

test('unusable input is a format error, not a crash; a sliver is not a room; an unknown type is only a guess', () => {
  for (const bad of [null, {}, { footprint: { w: 5, d: 5 }, rooms: [] }, { footprint: { w: 5, d: 5 }, rooms: [{ id: 'x', x: 'a', y: 0, w: 1, d: 1 }] }]) {
    const r = checkSketchPlan(bad);
    assert.equal(r.ok, false);
    assert.ok(codes(r, 'error').includes('format'));
  }
  const sliver = clone(GOOD); sliver.rooms[3].w = 0.5;
  assert.ok(codes(checkSketchPlan(sliver), 'error').includes('narrow'));
  const typed = clone(GOOD); delete typed.rooms[0].type;
  const t = checkSketchPlan(typed);
  assert.equal(t.ok, true);
  assert.ok(codes(t, 'info').includes('type-guess'));
});

test('with the roof the headroom is checked: a bedroom under the knee wall only is a warning, not an error', () => {
  const room = sanitizeRoom({ ...DEFAULT_ROOM, width: 6, depth: 8, kneeWall: 0.2, pitch: 45, maxHeight: 3.0, dormers: [], stair: null });
  // a bedroom in a 1 m strip along the west eave: the roof is 0.2 m high at the wall and 1.2 m a metre in, so almost none of it has usable height; the rest of the plan is fine
  const low = { version: 1, footprint: { w: 6, d: 8 }, rooms: [{ id: 'eave', type: 'bedroom', x: 0, y: 0, w: 1.0, d: 8 }, { id: 'rest', type: 'living', x: 1.0, y: 0, w: 5, d: 8 }] };
  const r = checkSketchPlan(low, { room });
  assert.equal(r.ok, true, 'a warning does not reject the plan');
  assert.ok(codes(r, 'warn').includes('headroom'));
  assert.equal(codes(checkSketchPlan(low), 'warn').includes('headroom'), false, 'without a roof there is nothing to check');
});

test('findingsText: errors first, then warnings, info left out, at most max lines', () => {
  const text = findingsText([{ severity: 'info', msg: 'i' }, { severity: 'warn', msg: 'w' }, { severity: 'error', msg: 'e' }]);
  assert.equal(text, '- ERROR: e\n- warning: w');
  assert.equal(findingsText(Array.from({ length: 30 }, () => ({ severity: 'error', msg: 'x' })), 5).split('\n').length, 5);
});

// ---- the repair loop, against a scripted model server (OpenAI-compatible /chat/completions)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function withModel(answers, run) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'POST') seen.push(JSON.parse(body));
      const content = answers[Math.min(seen.length - 1, answers.length - 1)];
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const saved = { ...process.env };
  process.env.LLM_URL = `http://127.0.0.1:${srv.address().port}`; process.env.LLM_API_KEY = 'test'; process.env.LLM_MODEL = 'fake'; delete process.env.LLM_VISION_MODEL;
  try { return await run(seen); } finally { Object.assign(process.env, saved); for (const k of ['LLM_URL', 'LLM_API_KEY', 'LLM_MODEL']) if (!(k in saved)) delete process.env[k]; srv.close(); }
}

test('repair loop: a plan with an overlap goes back with the measured reason and the corrected one is returned', async () => {
  const { planFromSketch } = await import('../ai.js');
  const bad = clone(GOOD); bad.rooms[1].x = 2;
  await withModel([bad, GOOD], async (seen) => {
    const out = await planFromSketch(PNG);
    assert.equal(seen.length, 2, 'asked twice');
    assert.equal(out.check.ok, true);
    assert.equal(out.check.rounds, 1);
    assert.deepEqual(out.check.history.map((h) => h.ok), [false, true]);
    assert.deepEqual(out.plan.rooms[1], GOOD.rooms[1]);
    const second = seen[1].messages;
    assert.equal(second.length, 3, 'the image prompt, the first answer, the reason');
    assert.equal(second[1].role, 'assistant');
    assert.match(second[2].content, /overlap by 4\.0 m²/, 'the model is told what was measured');
  });
});

test('repair loop: a plan that never passes is returned as it is, marked not ok, with the fewest errors; rounds 0 asks once', async () => {
  const { planFromSketch } = await import('../ai.js');
  const bad = clone(GOOD); bad.rooms[1].x = 2; // one overlap
  const worse = clone(bad); worse.rooms[2].y = 3; // two overlaps
  await withModel([worse, bad, worse], async (seen) => {
    const out = await planFromSketch(PNG, { rounds: 2 });
    assert.equal(seen.length, 3);
    assert.equal(out.check.ok, false);
    assert.equal(out.plan.rooms[2].y, 4, 'the answer with the fewest errors, not the last one');
  });
  await withModel([bad], async (seen) => {
    const out = await planFromSketch(PNG, { rounds: 0 });
    assert.equal(seen.length, 1);
    assert.equal(out.check.ok, false);
    assert.equal(out.check.rounds, 0);
  });
});

test('repair loop: an answer that is not JSON is asked again; one that never is, is refused as before', async () => {
  const { planFromSketch } = await import('../ai.js');
  await withModel(['Sure! Here is the plan: no json', GOOD], async (seen) => {
    const out = await planFromSketch(PNG);
    assert.equal(seen.length, 2);
    assert.equal(out.check.ok, true);
  });
  await withModel(['nothing useful'], async () => {
    await assert.rejects(planFromSketch(PNG, { rounds: 1 }), (e) => e.status === 422);
  });
});
