import express from 'express';
import cors from 'cors';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, solve, sanitizeRoom, sanitizeItems, DEFAULT_RULES } from '../shared/engine.js';
import { CATALOG, PROGRAMS } from '../shared/catalog.js';
import { PRESETS } from '../shared/presets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(__dirname, 'data', 'projects.json');

const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));

// --- tiny JSON-file store, writes serialised so concurrent saves cannot corrupt it
let queue = Promise.resolve();
const readAll = async () => {
  try { return JSON.parse(await fs.readFile(DB, 'utf8')); } catch { return []; }
};
const mutate = (fn) => {
  const run = queue.then(async () => {
    const all = await readAll();
    const out = await fn(all);
    await fs.mkdir(path.dirname(DB), { recursive: true });
    await fs.writeFile(DB, JSON.stringify(all, null, 2));
    return out;
  });
  queue = run.catch(() => {});
  return run;
};
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'server error' }); });
const clean = (b) => ({ name: String(b.name || 'Untitled').slice(0, 80), room: sanitizeRoom(b.room), items: sanitizeItems(b.items) });

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
  const out = solve(room, items, { seed });
  res.json(out);
});

app.get('/api/projects', wrap(async (_q, res) => {
  const all = await readAll();
  res.json(all.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}));

app.get('/api/projects/:id', wrap(async (req, res) => {
  const p = (await readAll()).find((x) => x.id === req.params.id);
  p ? res.json(p) : res.status(404).json({ error: 'not found' });
}));

app.post('/api/projects', wrap(async (req, res) => {
  const p = { id: randomUUID(), ...clean(req.body || {}), updatedAt: new Date().toISOString() };
  await mutate((all) => { all.push(p); });
  res.status(201).json(p);
}));

app.put('/api/projects/:id', wrap(async (req, res) => {
  const found = await mutate((all) => {
    const i = all.findIndex((x) => x.id === req.params.id);
    if (i < 0) return null;
    all[i] = { id: all[i].id, ...clean(req.body || {}), updatedAt: new Date().toISOString() };
    return all[i];
  });
  found ? res.json(found) : res.status(404).json({ error: 'not found' });
}));

app.delete('/api/projects/:id', wrap(async (req, res) => {
  const hit = await mutate((all) => {
    const i = all.findIndex((x) => x.id === req.params.id);
    if (i >= 0) all.splice(i, 1);
    return i >= 0;
  });
  hit ? res.status(204).end() : res.status(404).json({ error: 'not found' });
}));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`usable-space API on http://localhost:${port}`));
