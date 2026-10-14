// Sun + daylight maths on top of suncalc. "hour" is local mean solar time (no time-zone / DST needed).
import { getPosition } from 'suncalc';
import { wallBearing } from '@shared/site.js';
import { resolveDormer } from '@shared/params.js';

const RAD = Math.PI / 180;
const SILL_TO_HEAD = 1.2; // assumed glazing height of a window / dormer front [m]

/** Sun altitude (deg above horizon) and compass bearing (deg clockwise from true north). */
export function sunAt(site, dateStr = site.date, hour = site.hour) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + hour * 3600e3 - (site.lon / 15) * 3600e3;
  const p = getPosition(new Date(t), site.lat, site.lon);
  return { alt: p.altitude, bearing: (p.azimuth + 360) % 360 }; // suncalc 2.x: degrees, azimuth clockwise from north
}

/** Sun direction in plan space (x right, y down, z up): from the building towards the sun. */
export function sunVectorPlan(site, dateStr, hour) {
  const { alt, bearing } = sunAt(site, dateStr, hour);
  const rel = (bearing - site.azimuth) * RAD; // clockwise from the plan's "up" edge
  const c = Math.cos(alt * RAD);
  return { x: Math.sin(rel) * c, y: -Math.cos(rel) * c, z: Math.sin(alt * RAD), alt, bearing };
}

/** All glazed openings with their outward bearing: wall windows + the front of every dormer. */
export function openings(room, site) {
  const out = room.windows.map((w, i) => ({ label: `Window ${w.wall}${i + 1}`, wall: w.wall, area: w.width * SILL_TO_HEAD }));
  room.dormers.forEach((dm, i) => { const d = resolveDormer(room, dm); out.push({ label: `Dormer ${d.side === 'left' ? 'L' : 'R'}${i + 1}`, wall: d.side === 'left' ? 'W' : 'E', area: d.width * SILL_TO_HEAD }); });
  return out.map((o) => ({ ...o, bearing: wallBearing(o.wall, site.azimuth) }));
}

const SEASONS = [['Summer solstice', '06-21'], ['Equinox', '03-20'], ['Winter solstice', '12-21']];

/** Direct-sun hours per opening for three reference days (no shading from surroundings, clear sky). */
export function daylight(room, site, gross) {
  const year = site.date.slice(0, 4);
  const ops = openings(room, site);
  const rows = ops.map((o) => ({ ...o, hours: [], gain: [] }));
  const days = SEASONS.map(([label, md]) => {
    const date = `${year}-${md}`;
    let dayLen = 0;
    const hrs = rows.map(() => 0), gain = rows.map(() => 0);
    for (let h = 0; h < 24; h += 1 / 6) {
      const { alt, bearing } = sunAt(site, date, h + 1 / 12);
      if (alt <= 0) continue;
      dayLen += 1 / 6;
      rows.forEach((o, i) => {
        const cosInc = Math.cos(alt * RAD) * Math.cos((bearing - o.bearing) * RAD);
        if (cosInc > 0) { hrs[i] += 1 / 6; gain[i] += cosInc / 6; }
      });
    }
    rows.forEach((o, i) => { o.hours.push(hrs[i]); o.gain.push(gain[i]); });
    return { label, date, dayLen };
  });
  const glazed = ops.reduce((a, o) => a + o.area, 0);
  return { days, rows, glazed, ratio: gross > 0 ? glazed / gross : 0 };
}

/** Sun path of one day as plan-space vectors (for drawing). */
export function sunPath(site, dateStr = site.date) {
  const pts = [];
  for (let h = 0; h <= 24; h += 0.25) { const v = sunVectorPlan(site, dateStr, h); if (v.alt > 0) pts.push(v); }
  return pts;
}

export const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
