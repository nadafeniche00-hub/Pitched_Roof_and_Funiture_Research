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

export async function aiStatus() {
  if (!configured()) return { llm: false, hint: 'Set LLM_URL, LLM_API_KEY and LLM_MODEL in server/.env to use the language model. The built-in rules read the brief meanwhile.' };
  try {
    const list = await call('/models', null, { method: 'GET', timeout: 6000 });
    const ids = (list.data || []).map((m) => m.id);
    return { llm: true, model: cfg().model, vision: cfg().vision, served: ids.slice(0, 20), modelFound: ids.length ? ids.includes(cfg().model) : null };
  } catch (e) { return { llm: false, error: e.message, hint: 'The model server did not answer; the built-in rules read the brief meanwhile.' }; }
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
