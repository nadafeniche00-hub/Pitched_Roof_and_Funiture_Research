// Furniture / material library: SQLite tables + FTS5 live search + idempotent seeding.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { CATALOG } from '../shared/catalog.js';

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  source      TEXT NOT NULL,            -- builtin | revit:<project> | web:<host> | ifc | import
  source_key  TEXT NOT NULL,            -- stable key inside the source (url, family name ...)
  name        TEXT NOT NULL,
  name_de     TEXT,
  name_en     TEXT,
  brand       TEXT,
  category    TEXT,
  type        TEXT,                     -- base type in shared/catalog.js the piece inherits its parameters from
  w REAL, d REAL, h REAL,               -- metres, NULL = inherit from the category
  price REAL, currency TEXT,
  url TEXT, image TEXT, description TEXT,
  project     TEXT,
  occurrences INTEGER,                  -- how often the family occurs in the source model
  scraped_at  TEXT NOT NULL,
  UNIQUE (source, source_key)
);
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  name, name_de, name_en, brand, category, description,
  content='products', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid,name,name_de,name_en,brand,category,description) VALUES (new.id,new.name,new.name_de,new.name_en,new.brand,new.category,new.description);
END;
CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
  INSERT INTO products_fts(products_fts,rowid,name,name_de,name_en,brand,category,description) VALUES ('delete',old.id,old.name,old.name_de,old.name_en,old.brand,old.category,old.description);
END;
CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
  INSERT INTO products_fts(products_fts,rowid,name,name_de,name_en,brand,category,description) VALUES ('delete',old.id,old.name,old.name_de,old.name_en,old.brand,old.category,old.description);
  INSERT INTO products_fts(rowid,name,name_de,name_en,brand,category,description) VALUES (new.id,new.name,new.name_de,new.name_en,new.brand,new.category,new.description);
END;

-- translated vocabulary taken from the office projects: rooms, materials, sub-projects (linked models), views
CREATE TABLE IF NOT EXISTS glossary (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                   -- room | material | subproject | view | furniture
  project TEXT NOT NULL,
  fr TEXT NOT NULL, de TEXT, en TEXT,
  category TEXT,                        -- material class (Boden, Wand, ...) / discipline (Tragwerk, TGA, ...)
  occurrences INTEGER,
  UNIQUE (kind, project, fr)
);
`);

const q = {
  upsert: db.prepare(`
    INSERT INTO products (source,source_key,name,name_de,name_en,brand,category,type,w,d,h,price,currency,url,image,description,project,occurrences,scraped_at)
    VALUES (@source,@source_key,@name,@name_de,@name_en,@brand,@category,@type,@w,@d,@h,@price,@currency,@url,@image,@description,@project,@occurrences,@scraped_at)
    ON CONFLICT(source,source_key) DO UPDATE SET name=excluded.name, name_de=excluded.name_de, name_en=excluded.name_en, brand=excluded.brand,
      category=excluded.category, type=excluded.type, w=excluded.w, d=excluded.d, h=excluded.h, price=excluded.price, currency=excluded.currency,
      url=excluded.url, image=excluded.image, description=excluded.description, project=excluded.project, occurrences=excluded.occurrences, scraped_at=excluded.scraped_at`),
  gloss: db.prepare(`
    INSERT INTO glossary (kind,project,fr,de,en,category,occurrences) VALUES (@kind,@project,@fr,@de,@en,@category,@occurrences)
    ON CONFLICT(kind,project,fr) DO UPDATE SET de=excluded.de, en=excluded.en, category=excluded.category, occurrences=excluded.occurrences`),
};

const num = (v) => (Number.isFinite(+v) && +v > 0 ? +v : null);

export function upsertProduct(p) {
  const row = {
    source: p.source, source_key: String(p.source_key ?? p.url ?? p.name),
    name: String(p.name).slice(0, 200), name_de: p.name_de ?? null, name_en: p.name_en ?? null,
    brand: p.brand ?? null, category: p.category ?? null, type: CATALOG[p.type] ? p.type : null,
    w: num(p.w), d: num(p.d), h: num(p.h), price: num(p.price), currency: p.currency ?? null,
    url: p.url ?? null, image: p.image ?? null, description: p.description ? String(p.description).slice(0, 1000) : null,
    project: p.project ?? null, occurrences: p.occurrences ?? null, scraped_at: new Date().toISOString(),
  };
  q.upsert.run(row);
  return row;
}

export function upsertGlossary(g) {
  q.gloss.run({ kind: g.kind, project: g.project, fr: g.fr, de: g.de ?? null, en: g.en ?? null, category: g.category ?? null, occurrences: g.occurrences ?? null });
}

/** Turn free text into a safe FTS5 prefix query: "chaise bur" -> "chaise"* AND "bur"* */
export function ftsQuery(text) {
  const toks = String(text || '').normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 8);
  return toks.map((t) => `"${t.replace(/"/g, '')}"*`).join(' AND ');
}

export function searchProducts({ q: text, type, source, project, limit = 30 }) {
  const lim = Math.min(100, Math.max(1, +limit || 30));
  const where = [];
  const args = [];
  if (type) { where.push('p.type = ?'); args.push(type); }
  if (source) { where.push('p.source LIKE ?'); args.push(`${source}%`); }
  if (project) { where.push('p.project = ?'); args.push(project); }
  const fq = ftsQuery(text);
  if (fq) {
    const sql = `SELECT p.*, bm25(products_fts) AS rank FROM products_fts JOIN products p ON p.id = products_fts.rowid
                 WHERE products_fts MATCH ? ${where.length ? 'AND ' + where.join(' AND ') : ''} ORDER BY rank LIMIT ${lim}`;
    return db.prepare(sql).all(fq, ...args);
  }
  const sql = `SELECT p.* FROM products p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(p.occurrences,0) DESC, p.name LIMIT ${lim}`;
  return db.prepare(sql).all(...args);
}

export const getProduct = (id) => db.prepare('SELECT * FROM products WHERE id = ?').get(id);

export function facets() {
  return {
    types: db.prepare('SELECT type, COUNT(*) n FROM products WHERE type IS NOT NULL GROUP BY type ORDER BY n DESC').all(),
    sources: db.prepare("SELECT source, COUNT(*) n FROM products GROUP BY source ORDER BY n DESC").all(),
    projects: db.prepare('SELECT project, COUNT(*) n FROM products WHERE project IS NOT NULL GROUP BY project ORDER BY n DESC').all(),
  };
}

export function searchGlossary({ q: text, kind, project, limit = 200 }) {
  const where = [];
  const args = [];
  if (kind) { where.push('kind = ?'); args.push(kind); }
  if (project) { where.push('project = ?'); args.push(project); }
  if (text) { where.push('(fr LIKE ? OR de LIKE ? OR en LIKE ?)'); const l = `%${text}%`; args.push(l, l, l); }
  return db.prepare(`SELECT * FROM glossary ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY kind, COALESCE(occurrences,0) DESC, fr LIMIT ${Math.min(1000, +limit || 200)}`).all(...args);
}

// ------------------------------------------------------------ seeding (idempotent)

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, '..', 'data', 'revit');

export function seed() {
  for (const [type, d] of Object.entries(CATALOG)) {
    upsertProduct({ source: 'builtin', source_key: type, name: d.label, category: d.group, type, w: d.w, d: d.d, h: d.h, brand: 'Built-in' });
  }
  if (!existsSync(DATA)) return;
  for (const f of readdirSync(DATA).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(path.join(DATA, f), 'utf8'));
    const proj = j.project.slug;
    db.exec('BEGIN');
    try {
      for (const p of j.furniture || [])
        upsertProduct({ ...p, source: `revit:${proj}`, source_key: p.family || p.name, project: proj });
      for (const kind of ['rooms', 'levels', 'materials', 'subprojects', 'views'])
        for (const g of j[kind] || []) upsertGlossary({ ...g, kind: kind.replace(/s$/, ''), project: proj });
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}
