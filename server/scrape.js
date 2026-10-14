// Polite product-page scraper.
//  - reads schema.org JSON-LD (Product / ItemList) and OpenGraph tags: structured data publishers expose for machines
//  - honours robots.txt, identifies itself, waits between requests to the same host
//  - SSRF guard: only http(s), never loopback / private / link-local addresses
import dns from 'node:dns/promises';
import net from 'node:net';
import { upsertProduct } from './library.js';
import { guessType } from '../shared/furnitureTypes.js';

export const UA = 'UsableSpaceResearchBot/0.1 (+student research prototype; respects robots.txt)';
const MIN_DELAY_MS = 1500;
const lastHit = new Map();
const robotsCache = new Map();

// ------------------------------------------------------------ SSRF guard

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') || x.startsWith('::ffff:');
  }
  return true;
}

export async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('invalid URL'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('only http(s) URLs are allowed');
  if (u.username || u.password) throw new Error('credentials in URLs are not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('private host');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('host resolves to a private address');
  return u;
}

// ------------------------------------------------------------ robots.txt

export function robotsAllows(txt, pathname, ua = 'usablespaceresearchbot') {
  // minimal parser: longest matching Allow/Disallow in the most specific matching group wins
  const groups = [];
  let cur = null;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.replace(/#.*/, '').match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (k === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(m[2].toLowerCase());
    } else if ((k === 'allow' || k === 'disallow') && cur) cur.rules.push([k, m[2]]);
  }
  const pick = groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a))) || groups.find((g) => g.agents.includes('*'));
  if (!pick) return true;
  let best = null;
  for (const [k, p] of pick.rules) {
    if (!p) continue;
    const rx = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (rx.test(pathname) && (!best || p.length >= best.len)) best = { len: p.length, allow: k === 'allow' };
  }
  return best ? best.allow : true;
}

async function allowedByRobots(u) {
  const key = u.origin;
  let txt = robotsCache.get(key);
  if (txt === undefined) {
    try {
      const r = await fetch(`${u.origin}/robots.txt`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000), redirect: 'follow' });
      txt = r.ok ? await r.text() : '';
    } catch { txt = ''; }
    robotsCache.set(key, txt);
  }
  return robotsAllows(txt, u.pathname + u.search);
}

// ------------------------------------------------------------ parsing

const cm = (v, unit) => {
  const n = parseFloat(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const u = String(unit || '').toLowerCase();
  if (u === 'mtr' || u === 'm' || u === 'metre' || u === 'meter') return n;
  if (u === 'mmt' || u === 'mm') return n / 1000;
  if (u === 'inh' || u === 'in' || u === 'inch') return n * 0.0254;
  return n / 100; // cmt / cm / unknown -> centimetres is the most common
};

function quant(x) {
  if (x == null) return null;
  if (typeof x === 'number' || typeof x === 'string') return cm(x, 'cm');
  const val = x.value ?? x.maxValue ?? x['@value'];
  return cm(val, x.unitCode || x.unitText);
}

/** "120 x 60 x 75 cm", "B 1200 x T 800 x H 750 mm", "W120 D60 H75" -> metres */
export function parseDims(text) {
  const t = String(text || '').replace(/,/g, '.');
  const m = t.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*[x×*]\s*(\d+(?:\.\d+)?))?\s*(mm|cm|m)\b/i);
  if (!m) return {};
  const f = { mm: 0.001, cm: 0.01, m: 1 }[m[4].toLowerCase()];
  const a = +m[1] * f, b = +m[2] * f, c = m[3] != null ? +m[3] * f : null;
  // convention in furniture listings: width x depth x height
  return c != null ? { w: a, d: b, h: c } : { w: a, d: b };
}

function* walkLd(node) {
  if (Array.isArray(node)) { for (const n of node) yield* walkLd(n); return; }
  if (!node || typeof node !== 'object') return;
  yield node;
  for (const k of ['@graph', 'itemListElement', 'mainEntity', 'item', 'hasVariant', 'offers']) if (node[k]) yield* walkLd(node[k]);
}

const first = (v) => (Array.isArray(v) ? v[0] : v);
const typeOf = (n) => [].concat(n['@type'] || []).map(String);

export function parseProducts(html, pageUrl) {
  const out = [];
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let json;
    try { json = JSON.parse(b[1].trim()); } catch { continue; }
    for (const n of walkLd(json)) {
      if (!typeOf(n).some((t) => /^Product$/i.test(t))) continue;
      const offer = [].concat(n.offers || [])[0] || {};
      const price = offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price;
      const dims = { w: quant(n.width), d: quant(n.depth), h: quant(n.height) };
      const fromText = parseDims(`${n.name || ''} ${n.description || ''}`);
      const brand = first(n.brand)?.name ?? first(n.brand) ?? first(n.manufacturer)?.name ?? null;
      const cat = typeof n.category === 'string' ? n.category : first(n.category)?.name ?? null;
      out.push({
        name: String(n.name || '').trim(), brand: brand ? String(brand) : null, category: cat,
        description: n.description ? String(n.description).replace(/<[^>]+>/g, ' ').trim() : null,
        image: typeof first(n.image) === 'string' ? first(n.image) : first(n.image)?.url ?? null,
        url: n.url ? new URL(n.url, pageUrl).href : pageUrl,
        price: price != null ? parseFloat(String(price).replace(',', '.')) : null, currency: offer.priceCurrency ?? null,
        w: dims.w ?? fromText.w ?? null, d: dims.d ?? fromText.d ?? null, h: dims.h ?? fromText.h ?? null,
      });
    }
  }
  if (!out.length) { // OpenGraph fallback
    const og = (p) => (html.match(new RegExp(`<meta[^>]+property=["']og:${p}["'][^>]+content=["']([^"']*)["']`, 'i')) || [])[1];
    const title = og('title') || (html.match(/<title>([^<]*)<\/title>/i) || [])[1];
    if (title && /product|article|og:price/i.test(html)) {
      const d = parseDims(`${title} ${og('description') || ''}`);
      out.push({ name: title.trim(), description: og('description') || null, image: og('image') || null, url: pageUrl, ...d });
    }
  }
  return out.filter((p) => p.name);
}

// ------------------------------------------------------------ fetch + store

export async function scrapeUrl(raw) {
  const u = await assertPublicUrl(raw);
  if (!(await allowedByRobots(u))) return { url: raw, ok: false, error: 'disallowed by robots.txt' };
  const wait = (lastHit.get(u.host) || 0) + MIN_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(u.host, Date.now());
  const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!r.ok) return { url: raw, ok: false, error: `HTTP ${r.status}` };
  // the redirect target must be public too
  await assertPublicUrl(r.url);
  const ct = r.headers.get('content-type') || '';
  if (!/html|xml/i.test(ct)) return { url: raw, ok: false, error: `not an HTML page (${ct})` };
  const html = (await r.text()).slice(0, 3_000_000);
  const products = parseProducts(html, r.url);
  const host = new URL(r.url).hostname.replace(/^www\./, '');
  const saved = products.map((p) => upsertProduct({ ...p, source: `web:${host}`, source_key: p.url, type: guessType(`${p.name} ${p.category || ''}`) }));
  return { url: raw, ok: true, count: saved.length, products: saved };
}
