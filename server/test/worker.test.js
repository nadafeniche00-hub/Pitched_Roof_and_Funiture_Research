import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, solve, sanitizeRoom, sanitizeItems, DEFAULT_ROOM } from '../../shared/engine.js';
import worker from '../../worker/index.js';
import { devOnly } from '../devOnly.js';

// no model server in these tests: the built-in rules answer
for (const k of ['LLM_URL', 'LLM_API_KEY', 'LLM_MODEL', 'LLM_VISION_MODEL']) delete process.env[k];

const call = (path, method = 'GET', payload) => worker.fetch(new Request('https://example.test' + path, { method, ...(payload === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: typeof payload === 'string' ? payload : JSON.stringify(payload) }) }));
const items = [{ type: 'bed', placed: false }, { type: 'wardrobe', placed: false }];

test('the Worker answers the stateless routes of the local server', async () => {
  assert.deepEqual(await (await call('/api/health')).json(), { ok: true, where: 'cloudflare' });
  const cat = await (await call('/api/catalog')).json();
  assert.ok(cat.catalog && cat.programs);
  assert.ok(Object.keys(await (await call('/api/presets')).json()).length > 0);
  assert.ok((await (await call('/api/rules')).json()));
});

test('evaluate and solve give what the engine gives', async () => {
  const room = sanitizeRoom(DEFAULT_ROOM), its = sanitizeItems(items);
  const ev = await call('/api/evaluate', 'POST', { room: DEFAULT_ROOM, items });
  assert.equal(ev.status, 200);
  assert.deepEqual(await ev.json(), JSON.parse(JSON.stringify(evaluate(room, its))));
  const so = await call('/api/solve', 'POST', { room: DEFAULT_ROOM, items, seed: 3 });
  assert.deepEqual(await so.json(), JSON.parse(JSON.stringify(solve(room, its, { seed: 3 }))));
  assert.equal((await call('/api/evaluate', 'POST', 'not json')).status, 400);
});

test('a brief is read by the rules when no model server is set, and an empty one is refused', async () => {
  const r = await call('/api/ai/brief', 'POST', { text: '2 bedrooms, a bath next to them, a study of 6 m2' });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.engine, 'rules');
  assert.ok(j.brief.rooms.length >= 3);
  assert.equal((await call('/api/ai/brief', 'POST', { text: '   ' })).status, 400);
  assert.equal((await call('/api/ai/status')).status, 200);
  assert.equal((await call('/api/ai/sketch', 'POST', { image: 'data:image/png;base64,AAAA' })).status, 501);
});

test('what needs the database says so, and the dev routes do not exist here', async () => {
  for (const p of ['/api/projects', '/api/wind?lat=51&lon=8', '/api/products/search', '/api/scrape']) assert.equal((await call(p)).status, 501, p);
  assert.equal((await call('/api/dev/glb', 'POST', {})).status, 404);
  assert.equal((await call('/api/dev/demo')).status, 404);
});

test('devOnly: this computer only, and nothing behind a tunnel or a proxy', () => {
  const req = (headers = {}, ip = '127.0.0.1') => ({ socket: { remoteAddress: ip }, headers: { host: 'localhost:4000', ...headers } });
  assert.equal(devOnly(req(), {}), true);
  assert.equal(devOnly(req({}, '::1'), {}), true);
  assert.equal(devOnly(req({}, '192.168.2.141'), {}), false);                       // another computer
  assert.equal(devOnly(req({ 'cf-connecting-ip': '203.0.113.9' }), {}), false);     // cloudflared connects from 127.0.0.1 itself
  assert.equal(devOnly(req({ 'x-forwarded-for': '203.0.113.9' }), {}), false);
  assert.equal(devOnly(req({ host: 'abc.trycloudflare.com' }), {}), false);
  assert.equal(devOnly(req(), { NODE_ENV: 'production' }), false);
});
