// Site = where the building stands and how it is turned. Shared by client and server.
export const DEFAULT_SITE = {
  lat: 48.137, // Munich - placeholder, pick your plot on the map
  lon: 11.575,
  azimuth: 0, // bearing (deg clockwise from true north) of the plan's "N" wall, i.e. the top edge of the plan
  date: '2026-06-21',
  hour: 14,
  windZone: null, // manual override 1..4, null = use the detected one
};

const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);

export function sanitizeSite(s = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : DEFAULT_SITE.date;
  const wz = [1, 2, 3, 4].includes(+s.windZone) ? +s.windZone : null;
  return {
    lat: num(s.lat, -85, 85, DEFAULT_SITE.lat),
    lon: num(s.lon, -180, 180, DEFAULT_SITE.lon),
    azimuth: ((num(s.azimuth, -720, 720, 0) % 360) + 360) % 360,
    date,
    hour: num(s.hour, 0, 24, DEFAULT_SITE.hour),
    windZone: wz,
  };
}

/** Outward bearing (deg from true north) of a plan wall, for a building turned by `azimuth`. */
export const WALL_OFFSET = { N: 0, E: 90, S: 180, W: 270 };
export const wallBearing = (wall, azimuth) => (azimuth + WALL_OFFSET[wall]) % 360;
