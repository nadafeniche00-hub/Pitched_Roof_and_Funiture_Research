// Turn a sentence into a room brief without any model: "2 bedrooms, a bath next to the bedroom, study 6 m2" or the German "zwei Schlafzimmer, Bad neben dem Schlafzimmer".
// It is the fallback of the language-model path (server/ai.js) and the reference the model's answer is checked against.
import { ROOM_TYPES, sanitizeBrief } from './plans.js';

const WORDS = { ein: 1, eine: 1, einen: 1, one: 1, a: 1, an: 1, zwei: 2, two: 2, drei: 3, three: 3, vier: 4, four: 4, fuenf: 5, five: 5, sechs: 6, six: 6 };
// longest keyword first, so "kinderzimmer" is a child room and not just "kind"
const KEYS = [
  ['schlafzimmer', 'bedroom'], ['bedroom', 'bedroom'], ['schlafen', 'bedroom'], ['bedrooms', 'bedroom'], ['master', 'bedroom'],
  ['kinderzimmer', 'child'], ['child', 'child'], ['kids', 'child'], ['kid', 'child'], ['kinder', 'child'], ['nursery', 'child'],
  ['wohnzimmer', 'living'], ['living', 'living'], ['wohnen', 'living'], ['lounge', 'living'], ['wohn', 'living'],
  ['kueche', 'kitchen'], ['kitchen', 'kitchen'], ['kochen', 'kitchen'],
  ['arbeitszimmer', 'study'], ['buero', 'study'], ['study', 'study'], ['office', 'study'], ['arbeiten', 'study'], ['homeoffice', 'study'],
  ['badezimmer', 'bath'], ['bathroom', 'bath'], ['bath', 'bath'], ['bad', 'bath'], ['dusche', 'bath'], ['shower', 'bath'],
  ['gaeste-wc', 'wc'], ['gaestewc', 'wc'], ['toilette', 'wc'], ['toilet', 'wc'], ['wc', 'wc'],
  ['abstellraum', 'storage'], ['abstell', 'storage'], ['storage', 'storage'], ['kammer', 'storage'], ['speicher', 'storage'], ['lager', 'storage'], ['closet', 'storage'],
].sort((a, b) => b[0].length - a[0].length);
const SHORT = { bedroom: 'bed', child: 'kid', living: 'liv', kitchen: 'kit', study: 'stu', bath: 'bath', wc: 'wc', storage: 'sto' };
const NEAR = /\b(next to|near|beside|adjacent|neben|nahe|beim|bei|an|attached to|connected to|am)\b/;

const norm = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/²/g, '2');

/** @returns {{ brief, understood: string[], ignored: string[] }} brief is already sanitised */
export function parseBriefText(text) {
  const clauses = norm(String(text || '')).split(/[,;\n+]|\band\b|\bund\b|\bplus\b|\bmit\b|\bwith\b/).map((c) => c.trim()).filter(Boolean);
  const rooms = [], links = [], understood = [], ignored = [], made = {};
  const firstOf = {}; // type -> first id, for links
  const find = (clause) => { for (const [k, t] of KEYS) { const m = clause.match(new RegExp(`(^|[^a-z])${k.replace('-', '[- ]?')}[a-z]*`)); if (m) return { type: t, index: m.index }; } return null; };
  for (const clause of clauses) {
    const hit = find(clause);
    if (!hit) { ignored.push(clause); continue; }
    // two room words in one clause with a link word between: "bath next to the bedroom" is a link, not two rooms
    const parts = clause.split(NEAR);
    if (parts.length >= 3) {
      const a = find(parts[0]), b = find(parts[parts.length - 1]);
      if (a && b && a.type !== b.type) { links.push([a.type, b.type, 'near']); understood.push(`${a.type} next to ${b.type}`); if (!rooms.some((r) => r.type === a.type)) add(a.type, 1, null); if (!rooms.some((r) => r.type === b.type)) add(b.type, 1, null); continue; }
    }
    const am = clause.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|qm|sqm|quadratmeter|square)/), rest = am ? clause.replace(am[0], ' ') : clause; // the area must not be read as a count
    const cm = rest.match(/(\d+)\s*x?\s*(?=[a-z])/), word = rest.split(/\s+/).find((w) => WORDS[w] && w !== 'a' && w !== 'an');
    const n = Math.max(1, Math.min(4, cm ? +cm[1] : word ? WORDS[word] : 1));
    add(hit.type, n, am ? +am[1].replace(',', '.') : null);
    understood.push(`${n} x ${hit.type}${am ? ` of ${am[1]} m2` : ''}`);
  }
  function add(type, n, area) {
    for (let i = 0; i < n && rooms.length < 8; i++) {
      made[type] = (made[type] || 0) + 1;
      const id = `${SHORT[type]}${made[type] > 1 || n > 1 ? made[type] : ''}`;
      rooms.push({ id, type, area: area ?? ROOM_TYPES[type].area });
      firstOf[type] = firstOf[type] || id;
    }
  }
  const idLinks = links.map(([a, b, k]) => [firstOf[a], firstOf[b], k]).filter((l) => l[0] && l[1]);
  return { brief: sanitizeBrief({ rooms, links: idLinks }), understood, ignored };
}
