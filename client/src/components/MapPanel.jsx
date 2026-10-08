import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { setSite } from '../store/siteSlice.js';
import { fetchWind, fetchWindMeta } from '../store/thunks.js';
import { sunAt, compass } from '../lib/solar.js';

const BASES = {
  osm: { name: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors', max: 19 },
  light: { name: 'Light', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors © CARTO', max: 19 },
  topo: { name: 'Topography', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)', max: 17 },
  sat: { name: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles © Esri, Maxar, Earthstar Geographics', max: 19 },
};
export const ZONE_COLOR = { 1: '#4aa3df', 2: '#6bbf59', 3: '#e0a526', 4: '#d64545' };

const OVERLAYS = [
  ['building', 'Building', '#2f6fdd'],
  ['sun', 'Sun ray', '#f0a500'],
  ['wind', 'Wind zone', '#6bbf59'],
  ['cells', 'Detected cells', '#9b7bd6'],
];

const thumbUrl = (b, lat, lon, z = 9) => {
  const n = 2 ** z, x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  return b.url.replace('{s}', 'a').replace('{z}', z).replace('{x}', x).replace('{y}', y);
};

const offsetLatLng = (lat, lon, east, north) => [lat + north / 111320, lon + east / (111320 * Math.cos((lat * Math.PI) / 180))];

/** Plan-space vector (x right, y down) -> east/north for a building turned by azimuth. */
const planToEN = (dx, dy, az) => {
  const r = (az * Math.PI) / 180;
  const ux = [Math.sin(r + Math.PI / 2), Math.cos(r + Math.PI / 2)], uy = [Math.sin(r), Math.cos(r)];
  return [dx * ux[0] - dy * uy[0], dx * ux[1] - dy * uy[1]];
};

export default function MapPanel() {
  const dispatch = useDispatch();
  const site = useSelector((s) => s.site);
  const room = useSelector((s) => s.room);
  const wind = useSelector((s) => s.wind);
  const [base, setBase] = useState('osm');
  const [on, setOn] = useState({ building: true, sun: true, wind: true, cells: false });
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');
  const el = useRef(null);
  const M = useRef({});

  // --- map setup
  useEffect(() => {
    const map = L.map(el.current, { zoomControl: true }).setView([site.lat, site.lon], 17);
    M.current = { map, overlays: L.layerGroup().addTo(map) };
    map.on('click', (e) => dispatch(setSite({ lat: +e.latlng.lat.toFixed(5), lon: +e.latlng.lng.toFixed(5) })));
    dispatch(fetchWindMeta());
    return () => map.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- base layer
  useEffect(() => {
    const { map } = M.current;
    const b = BASES[base];
    const layer = L.tileLayer(b.url, { attribution: b.attr, maxZoom: b.max, subdomains: 'abc' }).addTo(map);
    layer.bringToBack();
    return () => map.removeLayer(layer);
  }, [base]);

  // --- auto-detect wind for the clicked cell (server caches per 0.1° cell)
  const cell = `${site.lat.toFixed(1)}:${site.lon.toFixed(1)}`;
  useEffect(() => {
    const t = setTimeout(() => dispatch(fetchWind({ lat: site.lat, lon: site.lon })), 500);
    return () => clearTimeout(t);
  }, [cell]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- overlays
  const sun = useMemo(() => sunAt(site), [site]);
  useEffect(() => {
    const { map, overlays } = M.current;
    overlays.clearLayers();
    const ll = [site.lat, site.lon];
    L.circleMarker(ll, { radius: 5, color: '#fff', weight: 2, fillColor: '#2f6fdd', fillOpacity: 1 }).addTo(overlays);

    if (on.building) {
      const hw = room.width / 2, hd = room.depth / 2;
      const pt = (dx, dy) => offsetLatLng(site.lat, site.lon, ...planToEN(dx, dy, site.azimuth));
      L.polygon([pt(-hw, -hd), pt(hw, -hd), pt(hw, hd), pt(-hw, hd)], { color: '#2f6fdd', weight: 2, fillOpacity: 0.25 }).addTo(overlays);
      L.polyline([pt(-hw, -hd), pt(hw, -hd)], { color: '#d64545', weight: 4 }).bindTooltip('plan "N" wall').addTo(overlays);
    }
    if (on.sun && sun.alt > 0) {
      const len = Math.max(room.width, room.depth) * 2.2;
      const r = (sun.bearing * Math.PI) / 180;
      L.polyline([ll, offsetLatLng(site.lat, site.lon, Math.sin(r) * len, Math.cos(r) * len)], { color: '#f0a500', weight: 3, dashArray: '6 6' })
        .bindTooltip(`sun ${compass(sun.bearing)} ${sun.bearing.toFixed(0)}°, ${sun.alt.toFixed(0)}° high`, { permanent: false }).addTo(overlays);
    }
    const w = wind.data;
    const zone = site.windZone ?? w?.zone;
    if (on.wind && w && zone) {
      L.rectangle([[w.lat - 0.05, w.lon - 0.05], [w.lat + 0.05, w.lon + 0.05]], { color: ZONE_COLOR[zone], weight: 1, fillOpacity: 0.12 })
        .bindTooltip(`Wind zone ${zone} (v_b ≈ ${w.vbEst.toFixed(1)} m/s)`).addTo(overlays);
      if (w.stormDir != null) {
        const to = ((w.stormDir + 180) * Math.PI) / 180;
        const a = offsetLatLng(site.lat, site.lon, -Math.sin(to) * 250, -Math.cos(to) * 250);
        L.polyline([a, ll], { color: ZONE_COLOR[zone], weight: 4 }).bindTooltip(`storms from ${compass(w.stormDir)}`).addTo(overlays);
      }
    }
    if (on.cells) {
      for (const c of wind.cells)
        L.rectangle([[c.lat - 0.05, c.lon - 0.05], [c.lat + 0.05, c.lon + 0.05]], { color: ZONE_COLOR[c.zone], weight: 1, fillOpacity: 0.3 })
          .bindTooltip(`Zone ${c.zone} · v_b ${c.vbEst.toFixed(1)} m/s · ${c.period}`).addTo(overlays);
    }
  }, [site, room.width, room.depth, on, wind, sun]);

  // --- keep the map centred on the plot when it changes (search, load)
  useEffect(() => { M.current.map?.panTo([site.lat, site.lon]); }, [site.lat, site.lon]);

  const search = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setMsg('searching…');
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
      const j = await r.json();
      if (!j.length) return setMsg('nothing found');
      dispatch(setSite({ lat: +(+j[0].lat).toFixed(5), lon: +(+j[0].lon).toFixed(5) }));
      M.current.map.setView([+j[0].lat, +j[0].lon], 17);
      setMsg('');
    } catch { setMsg('search failed (offline?)'); }
  };

  const set = (patch) => dispatch(setSite(patch));
  const fmtHour = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

  return (
    <div className="card">
      <div className="cardhead">
        <h2>Site <small>sun, wind and location</small></h2>
        <form onSubmit={search} className="searchform">
          <input placeholder="Search an address…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search address" />
          <button className="mini">Go</button>
        </form>
      </div>
      {msg && <p className="hint">{msg}</p>}

      <div ref={el} className="map" />

      <div className="previews" role="group" aria-label="Map layers">
        {Object.entries(BASES).map(([k, b]) => (
          <button key={k} className={`prev ${base === k ? 'on' : ''}`} onClick={() => setBase(k)} title={b.name}>
            <img src={thumbUrl(b, site.lat, site.lon)} alt="" loading="lazy" />
            <span>{b.name}</span>
          </button>
        ))}
        <span className="vsep" />
        {OVERLAYS.map(([k, name, c]) => (
          <button key={k} className={`prev ov ${on[k] ? 'on' : ''}`} onClick={() => setOn({ ...on, [k]: !on[k] })} aria-pressed={on[k]}>
            <i style={{ background: c }} /><span>{name}</span>
          </button>
        ))}
      </div>

      <div className="sunctl">
        <label>Date <input type="date" value={site.date} onChange={(e) => e.target.value && set({ date: e.target.value })} /></label>
        <label className="grow">Solar time <input type="range" min="0" max="24" step="0.25" value={site.hour} onChange={(e) => set({ hour: +e.target.value })} /> <output>{fmtHour(site.hour)}</output></label>
        <label className="grow">Building turned <input type="range" min="0" max="355" step="5" value={site.azimuth} onChange={(e) => set({ azimuth: +e.target.value })} /> <output>{site.azimuth}° ({compass(site.azimuth)})</output></label>
        <span className="sunread">{sun.alt > 0 ? `☀ ${compass(sun.bearing)} · ${sun.alt.toFixed(0)}° high` : '☾ below horizon'}</span>
      </div>
      <p className="hint">Click the map to place the building. Plot {site.lat.toFixed(4)}, {site.lon.toFixed(4)} · the red edge is the plan's top ("N") wall.</p>
    </div>
  );
}
