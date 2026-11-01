import express from 'express';
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

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));

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
