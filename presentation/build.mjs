import fs from 'node:fs';
const R = (p) => fs.readFileSync(new URL(p, import.meta.url));
let h = R('./deck.src.html').toString('utf8');
const logos = JSON.parse(R('./data/logos.json')), sv = JSON.parse(R('./data/states_svg.json')), det = JSON.parse(R('./data/detmold.json'));
const sp = JSON.parse(R('../shared/statePatterns.json')).states, lod = JSON.parse(R('../shared/lod2Patterns.json'));
const states = { states: {} }; let total = 0, gab = 0;
for (const [k, s] of Object.entries(sv.states)) { const p = sp[k]; if (!p) continue; states.states[k] = { name: s.name, d: s.d, n: p.n, g: p.share.gabled }; total += p.n; gab += p.counts.gabled; }
const SUM = { total, nw: sp['DE-NW'].n, gshare: Math.round((100 * gab) / total) };
const D = { buildings: det.buildings, hist: lod.gabled_pitch_hist };
// the pictures Revit exported (pipeline/revit/DemoBuild/run_demo.ps1 + deck_images.py) do not exist until someone with a licence has run it: a marked placeholder stands in until then
const missing = (n) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800"><rect width="1280" height="800" fill="#10151c"/><path d="M0 0L1280 800M1280 0L0 800" stroke="#26303b" stroke-width="3"/><text x="640" y="385" fill="#ffc533" font-family="Arial,sans-serif" font-weight="900" font-size="84" text-anchor="middle">NOT RUN YET</text><text x="640" y="470" fill="#aab1bb" font-family="Arial,sans-serif" font-size="46" text-anchor="middle">${n.replace('_', ' ')} - run_demo.ps1</text></svg>`);
const img = (n) => (/^revit_/.test(n) && !fs.existsSync(new URL('./img/' + n + '.jpg', import.meta.url)) ? missing(n) : 'data:image/jpeg;base64,' + R('./img/' + n + '.jpg').toString('base64'));
let ai = { img: null };
if (fs.existsSync(new URL('./img/roofs_montage.jpg', import.meta.url))) ai.img = img('roofs_montage');
const cmp = JSON.parse(R('../pipeline/data/compare_results.json')), ua = cmp.tasks.usable_area;
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)], tool = { engine: 'engine (JS, 10 cm grid)', shapely: 'shapely', compas: 'compas', ifc: 'ifcopenshell', topologic: 'topologicpy' };
let agree = 0; // the largest difference of any room between any two tools, over the three roofs
for (const r of Object.values(ua)) for (const room of Object.keys(r.shapely.result)) { const v = Object.values(tool).map((n) => r[n].result[room]); agree = Math.max(agree, Math.max(...v) - Math.min(...v)); }
const FW = { ms: Object.fromEntries(Object.entries(tool).map(([k, n]) => [k, +med(Object.values(ua).map((r) => r[n].ms)).toFixed(1)])), loc: { shapely: cmp.loc.shapely, compas: cmp.loc.compas, ifc: cmp.loc.ifcopenshell, topologic: cmp.loc.topologicpy, networkx: cmp.loc.networkx },
  total: Object.values(ua.gabled.shapely.result).reduce((a, b) => a + b, 0), agree, pysal: { I: cmp.tasks.regional.pysal.result.gabled.I, p: cmp.tasks.regional.pysal.result.gabled.p_sim, n: cmp.tasks.regional.pysal.result.gabled.n } };
const keep = ['python','pytorch','huggingface','nvidia','apachespark','apacheairflow','apacheparquet','duckdb','pandas','geopandas','scikitlearn','jupyter','openstreetmap','qgis','react','threedotjs','vite','redux','nodedotjs','sqlite','docker','ubuntu','git','github','opencv','numpy','polars','plotly','blender','unrealengine','autodesk','express'];
const L = Object.fromEntries(keep.filter((k) => logos[k]).map((k) => [k, logos[k]]));
const J = (o) => JSON.stringify(o).replace(/</g, '\u003c');
h = h.replace('{{LOGOS}}', () => J(L)).replace('{{STATES}}', () => J(states)).replace('{{DETMOLD}}', () => J(D)).replace('{{SUM}}', () => J(SUM)).replace('{{AI}}', () => J(ai)).replace('{{FW}}', () => J(FW));
h = h.replace('{{PIPE_CSS}}', () => R('./pipe-slide.css').toString('utf8')).replace('{{PIPE_HTML}}', () => R('./pipe-slide.html').toString('utf8')).replace('{{PIPE_JS}}', () => R('./pipe-slide.js').toString('utf8'));
h = h.replace('{{PLAN}}', () => J(JSON.parse(R('./data/plan_sample.json')))); // what presentation/data/make_plan_sample.mjs made of the app's generator and technical-plan code
h = h.replace('{{AI_SLIDES_CSS}}', () => R('./ai-slides.css').toString('utf8')).replace('{{AI_SLIDES_HTML}}', () => R('./ai-slides.html').toString('utf8')).replace('{{AI_SLIDES_JS}}', () => R('./ai-slides.js').toString('utf8'));
const png = (n) => 'data:image/png;base64,' + R('./img/' + n).toString('base64');
h = h.replace(/\{\{AI_PLAN_IMG\}\}/g, () => png('ai_test_plan.png')).replace(/\{\{AI_ROOF_IMG\}\}/g, () => png('ai_test_roof.png'));
h = h.replace(/\{\{IMG_(\w+)\}\}/g, (_, n) => img(n));
const HEAD = '</title><meta name="claude:viewport-fit-sides" content="cover"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&display=swap">';
fs.writeFileSync(new URL('./deck.fragment.html', import.meta.url), h.replace('</title>', () => HEAD));
fs.writeFileSync(new URL('./deck.html', import.meta.url), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&display=swap">' + h);
console.log('built', (h.length / 1e6).toFixed(2) + ' MB', SUM, Object.keys(L).length + ' logos', 'tool test', JSON.stringify(FW));
