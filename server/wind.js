// Wind-zone detection: 10 years of ERA5 daily maxima (Open-Meteo archive, no key) -> Gumbel 50-year gust
// -> estimated basic wind velocity -> zone class. INDICATIVE ONLY: ERA5 is a ~25 km reanalysis, the official
// zone comes from the national map / building code for the municipality.
import { db, zoneClasses } from './db.js';

const GUST_TO_VB = 1.45; // 50-year peak gust -> 10-min mean basic wind velocity (rough, open terrain)
const TTL_MS = 180 * 24 * 3600 * 1000;
const cellOf = (lat, lon) => ({ key: `${lat.toFixed(1)}:${lon.toFixed(1)}`, lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10 });

/** Method-of-moments Gumbel fit; returns the value exceeded on average once every `T` years. */
export function gumbelReturnLevel(maxima, T = 50) {
  const n = maxima.length;
  const mean = maxima.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(maxima.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const beta = (sd * Math.sqrt(6)) / Math.PI;
  const mu = mean - 0.5772 * beta;
  return mu - beta * Math.log(-Math.log(1 - 1 / T));
}

export function classifyZone(vb, classes = zoneClasses()) {
  return (classes.find((c) => vb >= c.lower && vb < c.upper) || classes[classes.length - 1]).zone;
}

/** Direction (deg, wind comes FROM) of the strongest days, weighted by speed squared. */
export function stormDirection(speeds, dirs) {
  const sorted = [...speeds].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const cut = sorted[Math.floor(sorted.length * 0.9)];
  let sx = 0, sy = 0;
  speeds.forEach((v, i) => {
    if (v >= cut && Number.isFinite(dirs[i])) { const r = (dirs[i] * Math.PI) / 180; sx += v * v * Math.sin(r); sy += v * v * Math.cos(r); }
  });
  return sx === 0 && sy === 0 ? null : (((Math.atan2(sx, sy) * 180) / Math.PI) + 360) % 360;
}

async function fetchEra5(lat, lon) {
  const end = new Date().getUTCFullYear() - 1;
  const start = end - 9;
  const url = 'https://archive-api.open-meteo.com/v1/archive?' + new URLSearchParams({
    latitude: lat, longitude: lon, start_date: `${start}-01-01`, end_date: `${end}-12-31`,
    daily: 'wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant', wind_speed_unit: 'ms', timezone: 'UTC',
  });
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const j = await r.json();
  const d = j.daily;
  const byYear = {};
  d.time.forEach((t, i) => {
    const y = t.slice(0, 4);
    if (Number.isFinite(d.wind_gusts_10m_max[i])) byYear[y] = Math.max(byYear[y] ?? 0, d.wind_gusts_10m_max[i]);
  });
  return { period: `${start}-${end}`, annual: Object.values(byYear), speeds: d.wind_speed_10m_max, dirs: d.wind_direction_10m_dominant };
}

const toRow = (c) => ({
  cell: c.cell_key, lat: c.lat, lon: c.lon, period: c.period, annualMax: JSON.parse(c.annual_max), v50Gust: c.v50_gust,
  vbEst: c.vb_est, zone: c.zone, stormDir: c.storm_dir, source: c.source, fetchedAt: c.fetched_at,
});

export async function windFor(lat, lon) {
  const { key, lat: clat, lon: clon } = cellOf(lat, lon);
  const hit = db.prepare('SELECT * FROM wind_cache WHERE cell_key = ?').get(key);
  if (hit && Date.now() - Date.parse(hit.fetched_at) < TTL_MS) return { ...toRow(hit), cached: true };

  const e = await fetchEra5(clat, clon);
  if (e.annual.length < 5) throw new Error('not enough wind data for this location');
  const v50 = gumbelReturnLevel(e.annual, 50);
  const vb = v50 / GUST_TO_VB;
  const zone = classifyZone(vb);
  const dir = stormDirection(e.speeds, e.dirs);
  db.prepare(`INSERT OR REPLACE INTO wind_cache (cell_key,lat,lon,period,annual_max,v50_gust,vb_est,zone,storm_dir,source,fetched_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(key, clat, clon, e.period, JSON.stringify(e.annual), v50, vb, zone, dir, 'ERA5 via Open-Meteo, Gumbel 50-yr gust / 1.45', new Date().toISOString());
  return { ...toRow(db.prepare('SELECT * FROM wind_cache WHERE cell_key = ?').get(key)), cached: false };
}

export const cachedCells = () => db.prepare('SELECT * FROM wind_cache').all().map(toRow);
