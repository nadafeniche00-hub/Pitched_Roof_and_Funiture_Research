// SQLite storage (node:sqlite, built into Node >= 22.5 - no native build step).
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(process.env.DB_FILE || path.join(dir, 'usable-space.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  data       TEXT NOT NULL,          -- JSON: { room, items, site }
  updated_at TEXT NOT NULL
);

-- where each project stands (queryable copy of data.site)
CREATE TABLE IF NOT EXISTS sites (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  lat        REAL NOT NULL,
  lon        REAL NOT NULL,
  azimuth    REAL NOT NULL,
  wind_zone  INTEGER,                -- manual override, NULL = detected
  updated_at TEXT NOT NULL
);

-- reference wind zones (DIN EN 1991-1-4/NA style: basic wind velocity v_b0 in m/s, q_b = 1/2 rho v^2)
CREATE TABLE IF NOT EXISTS wind_zone_classes (
  zone  INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  vb0   REAL NOT NULL,
  qb    REAL NOT NULL,               -- Pa
  lower REAL NOT NULL,               -- classification band for the estimated v_b: [lower, upper)
  upper REAL NOT NULL
);

-- detected wind climate per ~0.1 degree cell (cache; refreshed after 180 days)
CREATE TABLE IF NOT EXISTS wind_cache (
  cell_key     TEXT PRIMARY KEY,     -- "lat:lon" rounded to 0.1
  lat          REAL NOT NULL,
  lon          REAL NOT NULL,
  period       TEXT NOT NULL,        -- e.g. 2016-2025
  annual_max   TEXT NOT NULL,        -- JSON array: yearly maximum gust [m/s]
  v50_gust     REAL NOT NULL,        -- Gumbel 50-year gust [m/s]
  vb_est       REAL NOT NULL,        -- estimated basic wind velocity [m/s]
  zone         INTEGER NOT NULL REFERENCES wind_zone_classes(zone),
  storm_dir    REAL,                 -- prevailing direction storms come FROM [deg]
  source       TEXT NOT NULL,
  fetched_at   TEXT NOT NULL
);
`);

const seed = db.prepare('INSERT OR IGNORE INTO wind_zone_classes (zone,label,vb0,qb,lower,upper) VALUES (?,?,?,?,?,?)');
const RHO = 1.25;
[[1, 'Zone 1', 22.5, 0, 0, 23.75], [2, 'Zone 2', 25.0, 0, 23.75, 26.25], [3, 'Zone 3', 27.5, 0, 26.25, 28.75], [4, 'Zone 4', 30.0, 0, 28.75, 999]]
  .forEach(([z, l, v, , lo, up]) => seed.run(z, l, v, 0.5 * RHO * v * v, lo, up));

// one-time import of the earlier JSON-file store
const legacy = path.join(dir, 'projects.json');
if (existsSync(legacy) && db.prepare('SELECT COUNT(*) n FROM projects').get().n === 0) {
  try {
    const ins = db.prepare('INSERT INTO projects (id,name,data,updated_at) VALUES (?,?,?,?)');
    for (const p of JSON.parse(readFileSync(legacy, 'utf8')))
      ins.run(p.id, p.name, JSON.stringify({ room: p.room, items: p.items, site: p.site }), p.updatedAt);
    renameSync(legacy, legacy + '.migrated');
  } catch (e) { console.error('legacy import failed', e); }
}

export const zoneClasses = () => db.prepare('SELECT * FROM wind_zone_classes ORDER BY zone').all();
