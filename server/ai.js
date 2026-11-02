// The language-model and vision paths. They talk to any OpenAI-compatible endpoint, which is what the team's Open WebUI on the GX10 offers
// (http://<server>:3000/api, an API key made in its Settings > Account). Nothing is sent anywhere unless LLM_URL, LLM_API_KEY and LLM_MODEL are set
// (server/.env, git-ignored); without them the brief is read by the built-in rules (shared/briefText.js) and sketch reading says what is missing.
import { sanitizeBrief } from '../shared/plans.js';
import { parseBriefText } from '../shared/briefText.js';

const cfg = () => ({
  url: (process.env.LLM_URL || '').replace(/\/+$/, ''),
  key: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || '',
  vision: process.env.LLM_VISION_MODEL || process.env.LLM_MODEL || '',
});
export const configured = () => { const c = cfg(); return !!(c.url && c.key && c.model); };

async function call(path, body, { timeout = 60000, method = 'POST' } = {}) {
  const c = cfg(), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${c.url}${path}`, { method, signal: ctl.signal, headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(`the model server answered ${r.status}${r.status === 401 ? ' (check LLM_API_KEY)' : ''}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}
const chat = async (messages, model, timeout) => (await call('/chat/completions', { model, messages, temperature: 0.1, stream: false }, { timeout })).choices?.[0]?.message?.content || '';
const jsonIn = (text) => { const m = String(text).match(/\{[\s\S]*\}/); if (!m) throw new Error('the model did not answer with JSON'); return JSON.parse(m[0]); };

// CLIP, if a clip service runs (pipeline/services/clip_service.py): fast zero-shot naming of a roof photo, much quicker than asking the chat model
const clipUrl = () => (process.env.CLIP_URL || 'http://127.0.0.1:5001').replace(/\/+$/, '');
async function clipUp() { try { const r = await fetch(clipUrl() + '/health', { signal: AbortSignal.timeout(1200) }); return r.ok ? await r.json() : null; } catch { return null; } }
// One sentence pattern for every label. With longer descriptions for some shapes than for others CLIP drifted to the shortest one ("flat") on busy photos:
// on four generated facade photos the long descriptions named 1 of 4 right, this pattern 3 of 4 (a sanity check on four pictures, not a benchmark).
const CLIP_LABELS = Object.fromEntries(Object.entries({ gabled: 'gabled', hipped: 'hipped', 'half-hipped': 'half-hipped', mansard: 'mansard', pyramidal: 'pyramid', skillion: 'single-slope shed', flat: 'flat' })
  .map(([id, word]) => [id, `a photo of a house with a ${word} roof`]));
async function clipRoof(dataUrl) {
  if (!(await clipUp())) return null;
  const t0 = Date.now(), ids = Object.keys(CLIP_LABELS);
  const r = await fetch(clipUrl() + '/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl, labels: ids.map((k) => CLIP_LABELS[k]) }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) return null;
  const j = await r.json(), ranked = ids.map((id, i) => ({ id, p: j.scores[i] })).sort((a, b) => b.p - a.p);
  return { pattern: ranked[0].id, pitch: null, confidence: ranked[0].p, scores: ranked.slice(0, 3), reason: ranked.slice(0, 3).map((q) => q.id + ' ' + Math.round(q.p * 100) + ' %').join(', '), model: 'CLIP ' + j.model.split('/').pop() + ' (' + j.device + ')', ms: Date.now() - t0 };
}

export async function aiStatus() {
  const clip = await clipUp();
  if (!configured()) return { llm: false, clip: !!clip, hint: 'Set LLM_URL, LLM_API_KEY and LLM_MODEL in server/.env to use the language model. The built-in rules read the brief meanwhile.' };
  try {
    const list = await call('/models', null, { method: 'GET', timeout: 6000 });
    const ids = (list.data || []).map((m) => m.id);
    return { llm: true, clip: !!clip, model: cfg().model, vision: cfg().vision, served: ids.slice(0, 20), modelFound: ids.length ? ids.includes(cfg().model) : null };
  } catch (e) { return { llm: false, clip: !!clip, error: e.message, hint: 'The model server did not answer; the built-in rules read the brief meanwhile.' }; }
}

const BRIEF_PROMPT = `You turn a short description of a flat into a JSON room brief for an attic. Answer with JSON only, no text around it:
{"rooms":[{"id":"short-id","type":"bedroom|child|living|kitchen|study|bath|wc|storage","area":number}],"links":[["id-a","id-b","near"]]}
Areas are wanted usable square metres (use 12 bedroom, 10 child, 18 living, 9 kitchen, 8 study, 5 bath, 2.5 wc, 4 storage when none is given).
A link means two rooms should touch (for example a bath next to a bedroom). At most 8 rooms. The description can be English or German.`;

export async function briefFromText(text) {
  const rules = parseBriefText(text), t0 = Date.now();
  if (!configured()) return { brief: rules.brief, engine: 'rules', understood: rules.understood, ignored: rules.ignored, ms: Date.now() - t0 };
  try {
    const out = await chat([{ role: 'system', content: BRIEF_PROMPT }, { role: 'user', content: text }], cfg().model, 45000);
    const brief = sanitizeBrief(jsonIn(out));
    if (!brief.rooms.length) throw new Error('the model returned no rooms');
    return { brief, engine: 'llm', model: cfg().model, understood: brief.rooms.map((r) => `${r.type} ${r.area} m2`), ignored: [], ms: Date.now() - t0 };
  } catch (e) { // the model failed: the rules still answer, and the reason is shown
    return { brief: rules.brief, engine: 'rules', understood: rules.understood, ignored: rules.ignored, note: `Language model unavailable (${e.message}); read with the built-in rules instead.`, ms: Date.now() - t0 };
  }
}

const SKETCH_PROMPT = `This image is a floor plan or a hand sketch of one. Read it and answer with JSON only:
{"version":1,"footprint":{"w":number,"d":number},"rooms":[{"id":"r1","type":"bedroom|child|living|kitchen|study|bath|wc|storage (leave out if unsure)","x":number,"y":number,"w":number,"d":number}]}
Metres, origin at the top-left corner of the outline, x to the right, y downwards. Use the dimensions written on the sketch; if there are none, estimate from typical room sizes.
Every room is a rectangle; the rooms should tile the outline. Do not invent rooms that are not drawn.`;

export async function planFromSketch(dataUrl) {
  if (!configured()) throw Object.assign(new Error('Sketch reading needs the model server: set LLM_URL, LLM_API_KEY and a vision model in LLM_VISION_MODEL (server/.env).'), { status: 501 });
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl || '')) throw Object.assign(new Error('Send a PNG, JPEG or WebP image.'), { status: 400 });
  const t0 = Date.now();
  const out = await chat([{ role: 'user', content: [{ type: 'text', text: SKETCH_PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }], cfg().vision, 120000);
  const plan = jsonIn(out);
  const ok = plan?.footprint?.w > 1 && plan?.footprint?.d > 1 && Array.isArray(plan.rooms) && plan.rooms.length;
  if (!ok) throw Object.assign(new Error('The model could not read rooms from that image. A clearer drawing, or a model that accepts images, may help.'), { status: 422 });
  return { plan, engine: 'vision', model: cfg().vision, ms: Date.now() - t0 };
}

const ROOF_PROMPT = `This is a photo or drawing of a building with a pitched roof. Decide which roof shape it has and answer with JSON only:
{"pattern":"gabled|hipped|half-hipped|mansard|pyramidal|skillion|flat","pitch_deg":number,"confidence":number between 0 and 1,"reason":"one short sentence"}
gabled = two slopes and two vertical gable walls; hipped = four slopes; half-hipped = gable wall with a small hip on top (Krueppelwalm); mansard = two slopes per side, the lower one steep;
pyramidal = four slopes meeting at one point; skillion = a single slope; flat = no visible slope. pitch_deg is your estimate of the main slope in degrees (0 for flat).`;
const PATTERNS = ['gabled', 'hipped', 'half-hipped', 'mansard', 'pyramidal', 'skillion', 'flat'];

/** Name the roof shape on a photo (the job CLIP did in the notebook) with the server's vision model. */
export async function roofFromPhoto(dataUrl) {
  if (/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl || '')) { const c = await clipRoof(dataUrl).catch(() => null); if (c) return c; } // CLIP first, when it runs
  if (!configured()) throw Object.assign(new Error('Roof reading needs the model server: set LLM_URL, LLM_API_KEY and LLM_MODEL in server/.env.'), { status: 501 });
  if (!/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl || '')) throw Object.assign(new Error('Send a PNG, JPEG or WebP image.'), { status: 400 });
  const t0 = Date.now();
  const out = await chat([{ role: 'user', content: [{ type: 'text', text: ROOF_PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }], cfg().vision, 90000);
  const j = jsonIn(out);
  if (!PATTERNS.includes(j.pattern)) throw Object.assign(new Error('The model did not name one of the known roof shapes.'), { status: 422 });
  return { pattern: j.pattern, pitch: Math.min(75, Math.max(0, Math.round(Number(j.pitch_deg) || 0))), confidence: Math.min(1, Math.max(0, Number(j.confidence) || 0)), reason: String(j.reason || '').slice(0, 200), model: cfg().vision, ms: Date.now() - t0 };
}
