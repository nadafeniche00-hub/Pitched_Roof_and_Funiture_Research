// The part of the API that needs no database, as a Cloudflare Worker (wrangler.jsonc): the engine, the catalogue, the rules, the presets and the brief reader. The built-in rules read a
// brief unless LLM_URL, LLM_API_KEY and LLM_MODEL are set as secrets of the Worker; the sketch and the roof photo need that model server. Everything that needs the SQLite of server/
// (saved projects, wind, the product library, scraping) answers 501. The client (client/dist) is served as static assets; the Worker only sees /api/*.
import { evaluate, solve, sanitizeRoom, sanitizeItems, DEFAULT_RULES } from '../shared/engine.js';
import { CATALOG, PROGRAMS } from '../shared/catalog.js';
import { PRESETS } from '../shared/presets.js';
import { aiStatus, briefFromText, planFromSketch, roofFromPhoto } from '../server/ai.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const NEEDS_SERVER = 'This part needs the database of the local server (the server/ folder): run the app on your own computer to use it.';
const body = async (request) => { try { return (await request.json()) || {}; } catch { return null; } };

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const get = request.method === 'GET', post = request.method === 'POST';

    if (get && pathname === '/api/health') return json({ ok: true, where: 'cloudflare' });
    if (get && pathname === '/api/catalog') return json({ catalog: CATALOG, programs: PROGRAMS });
    if (get && pathname === '/api/rules') return json(DEFAULT_RULES);
    if (get && pathname === '/api/presets') return json(PRESETS);
    if (get && pathname === '/api/ai/status') return json(await aiStatus());

    if (post && (pathname === '/api/evaluate' || pathname === '/api/solve')) {
      const b = await body(request);
      if (!b) return json({ error: 'the body must be JSON' }, 400);
      const room = sanitizeRoom(b.room), items = sanitizeItems(b.items);
      return json(pathname === '/api/evaluate' ? evaluate(room, items) : solve(room, items, { seed: Number.isFinite(+b.seed) ? +b.seed : 1 }));
    }

    if (post && pathname === '/api/ai/brief') {
      const b = await body(request);
      const text = String(b?.text || '').slice(0, 1500);
      if (!text.trim()) return json({ error: 'Describe the flat first, for example: 2 bedrooms, a bath next to them, a study of 6 m2.' }, 400);
      return json(await briefFromText(text));
    }
    if (post && (pathname === '/api/ai/sketch' || pathname === '/api/ai/roof')) {
      const b = await body(request);
      try { return json(await (pathname === '/api/ai/sketch' ? planFromSketch(b?.image) : roofFromPhoto(b?.image))); }
      catch (e) { return json({ error: e.message || 'reading failed' }, e.status || 502); }
    }

    if (pathname.startsWith('/api/dev/')) return json({ error: 'not here' }, 404);
    if (pathname.startsWith('/api/')) return json({ error: NEEDS_SERVER }, 501);
    return new Response('not found', { status: 404 });
  },
};
