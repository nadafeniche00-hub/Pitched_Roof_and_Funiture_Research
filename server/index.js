import express from 'express';
try { process.loadEnvFile(new URL('./.env', import.meta.url)); } catch { /* no server/.env: the model paths stay off */ }
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, solve, sanitizeRoom, sanitizeItems, DEFAULT_RULES } from '../shared/engine.js';
import { sanitizeSite } from '../shared/site.js';
import { sanitizeLph } from '../shared/lph.js';
import { CATALOG, PROGRAMS } from '../shared/catalog.js';
import { PRESETS } from '../shared/presets.js';
import { db, zoneClasses } from './db.js';
import { windFor, cachedCells } from './wind.js';
import { searchProducts, getProduct, facets, searchGlossary, upsertProduct, seed } from './library.js';
import { scrapeUrl } from './scrape.js';
import { guessType } from '../shared/furnitureTypes.js';
import { aiStatus, briefFromText, planFromSketch, roofFromPhoto } from './ai.js';

const app = express();
app.use(cors());
// a sketch photo is big: this route takes its own, larger body before the general small limit applies
app.post('/api/ai/sketch', express.json({ limit: '12mb' }), async (req, res) => {
  try { res.json(await planFromSketch(req.body?.image)); } catch (e) { res.status(e.status || 502).json({ error: e.message || 'sketch reading failed' }); }
});
app.post('/api/ai/roof', express.json({ limit: '12mb' }), async (req, res) => {
  try { res.json(await roofFromPhoto(req.body?.image)); } catch (e) { res.status(e.status || 502).json({ error: e.message || 'roof reading failed' }); }
});
// dev only, loopback only: the walk view posts its exported .glb here so pipeline/render/blender_render.py can pick it up
app.post('/api/dev/glb', express.raw({ type: '*/*', limit: '300mb' }), (req, res) => {
  const ip = req.socket.remoteAddress || '';
  if (!/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ip)) return res.status(403).json({ error: 'local only' });
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pipeline/render/in');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'scene.glb'), req.body);
  res.json({ ok: true, bytes: req.body.length });
});
// dev only, loopback only: the plan for the Revit demo builder (client/src/lib/revitExport.js); pipeline/revit/DemoBuild/run_demo.ps1 reads it from here.
// Nothing here starts Revit: installing an unsigned add-in is for the person at the keyboard (see pipeline/revit/README.md).
const demoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pipeline/data/revit_demo');
const loopback = (req) => /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '');
app.post('/api/dev/demo', express.json({ limit: '200kb' }), (req, res) => {
  if (!loopback(req)) return res.status(403).json({ error: 'local only' });
  const b = req.body;
  if (!b?.room?.width || !b?.room?.depth || !Array.isArray(b.partitions)) return res.status(400).json({ error: 'not a demo plan' });
  fs.mkdirSync(demoDir, { recursive: true });
  fs.writeFileSync(path.join(demoDir, 'demo.json'), JSON.stringify(b, null, 1));
  res.json({ ok: true, dir: demoDir, partitions: b.partitions.length });
});
// what the last run left behind: the project, the pictures, the last lines of the log
app.get('/api/dev/demo', (req, res) => {
  if (!loopback(req)) return res.status(403).json({ error: 'local only' });
  const has = (f) => fs.existsSync(path.join(demoDir, f));
  let log = [];
  try { log = fs.readFileSync(path.join(demoDir, 'demo_log.txt'), 'utf8').split(/\r?\n/).filter(Boolean).slice(-12); } catch { /* no run yet */ }
  res.json({ plan: has('demo.json'), project: has('DEMO.rvt'), done: has('done.txt'), failed: has('error.txt'), pictures: ['exterior', 'section', 'cutaway', 'plan'].filter((n) => has(`revit_${n}.png`)), log, dir: demoDir });
});
app.use(express.json({ limit: '200kb' }));
app.get('/api/ai/status', async (_q, res) => res.json(await aiStatus()));
app.post('/api/ai/brief', async (req, res) => {
  const text = String(req.body?.text || '').slice(0, 1500);
  if (!text.trim()) return res.status(400).json({ error: 'Describe the flat first, for example: 2 bedrooms, a bath next to them, a study of 6 m2.' });
  res.json(await briefFromText(text));
});

const clean = (b) => ({ name: String(b.name || 'Untitled').slice(0, 80), room: sanitizeRoom(b.room), items: sanitizeItems(b.items), site: sanitizeSite(b.site), lph: sanitizeLph(b.lph) });
const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: e.message || 'server error' }); } };

const q = {
  list: db.prepare('SELECT id, name, updated_at AS updatedAt FROM projects ORDER BY updated_at DESC'),
  get: db.prepare('SELECT id, name, data, updated_at AS updatedAt FROM projects WHERE id = ?'),
  insert: db.prepare('INSERT INTO projects (id,name,data,updated_at) VALUES (?,?,?,?)'),
  update: db.prepare('UPDATE projects SET name = ?, data = ?, updated_at = ? WHERE id = ?'),
  del: db.prepare('DELETE FROM projects WHERE id = ?'),
  site: db.prepare(`INSERT INTO sites (project_id,lat,lon,azimuth,wind_zone,updated_at) VALUES (?,?,?,?,?,?)
                    ON CONFLICT(project_id) DO UPDATE SET lat=excluded.lat, lon=excluded.lon, azimuth=excluded.azimuth, wind_zone=excluded.wind_zone, updated_at=excluded.updated_at`),
};
const inflate = (r) => (r ? { id: r.id, name: r.name, updatedAt: r.updatedAt, ...JSON.parse(r.data) } : null);
const save = (id, c, isNew) => {
  const now = new Date().toISOString();
  const data = JSON.stringify({ room: c.room, items: c.items, site: c.site, lph: c.lph });
  if (isNew) q.insert.run(id, c.name, data, now); else q.update.run(c.name, data, now, id);
  q.site.run(id, c.site.lat, c.site.lon, c.site.azimuth, c.site.windZone, now);
  return inflate(q.get.get(id));
};

app.get('/api/health', (_q, r) => r.json({ ok: true }));
app.get('/api/catalog', (_q, r) => r.json({ catalog: CATALOG, programs: PROGRAMS }));
app.get('/api/rules', (_q, r) => r.json(DEFAULT_RULES));
app.get('/api/presets', (_q, r) => r.json(PRESETS));

app.post('/api/evaluate', (req, res) => {
  const { room, items } = clean(req.body || {});
  res.json(evaluate(room, items));
});

app.post('/api/solve', (req, res) => {
  const { room, items } = clean(req.body || {});
  const seed = Number.isFinite(+req.body?.seed) ? +req.body.seed : 1;
  res.json(solve(room, items, { seed }));
});

// --- wind
app.get('/api/wind/zones', (_q, r) => r.json(zoneClasses()));
app.get('/api/wind/cells', (_q, r) => r.json(cachedCells()));
app.get('/api/wind', wrap(async (req, res) => {
  const lat = +req.query.lat, lon = +req.query.lon;
  if (!(Math.abs(lat) <= 85) || !(Math.abs(lon) <= 180)) return res.status(400).json({ error: 'lat/lon required' });
  try { res.json(await windFor(lat, lon)); }
  catch (e) { res.status(502).json({ error: `wind data unavailable: ${e.message}` }); }
}));

// --- library: live search, import, scraping
app.get('/api/products/search', (req, res) => {
  const { q, type, source, project, limit } = req.query;
  res.json(searchProducts({ q, type, source, project, limit }));
});
app.get('/api/products/facets', (_q, res) => res.json(facets()));
app.get('/api/products/:id', (req, res) => {
  const p = getProduct(+req.params.id);
  p ? res.json(p) : res.status(404).json({ error: 'not found' });
});
app.post('/api/products/import', (req, res) => {
  const rows = Array.isArray(req.body?.products) ? req.body.products.slice(0, 500) : [];
  let n = 0;
  for (const r of rows) {
    if (!r || !r.name) continue;
    upsertProduct({ ...r, source: String(r.source || 'import').slice(0, 40), source_key: r.source_key ?? r.url ?? r.name, type: r.type || guessType(`${r.name} ${r.category || ''}`) });
    n++;
  }
  res.json({ imported: n });
});
app.post('/api/scrape', wrap(async (req, res) => {
  const urls = (Array.isArray(req.body?.urls) ? req.body.urls : []).map(String).slice(0, 5);
  if (!urls.length) return res.status(400).json({ error: 'urls required (max 5 per request)' });
  const results = [];
  for (const url of urls) {
    try { results.push(await scrapeUrl(url)); } catch (e) { results.push({ url, ok: false, error: e.message }); }
  }
  res.json({ results });
}));
app.get('/api/glossary', (req, res) => res.json(searchGlossary(req.query)));

// --- projects (SQLite)
app.get('/api/projects', (_q, res) => res.json(q.list.all()));
app.get('/api/projects/:id', (req, res) => {
  const p = inflate(q.get.get(req.params.id));
  p ? res.json(p) : res.status(404).json({ error: 'not found' });
});
app.post('/api/projects', (req, res) => res.status(201).json(save(randomUUID(), clean(req.body || {}), true)));
app.put('/api/projects/:id', (req, res) => {
  if (!q.get.get(req.params.id)) return res.status(404).json({ error: 'not found' });
  res.json(save(req.params.id, clean(req.body || {}), false));
});
app.delete('/api/projects/:id', (req, res) => {
  const { changes } = q.del.run(req.params.id);
  changes ? res.status(204).end() : res.status(404).json({ error: 'not found' });
});

// production: serve the built client (npm run build) from the same port, so one process is the whole app
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

seed();
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`usable-space API on http://localhost:${port}`));
