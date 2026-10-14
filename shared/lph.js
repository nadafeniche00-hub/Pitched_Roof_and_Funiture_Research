// HOAI Leistungsphase 5 (Ausführungsplanung): data that has to sit next to the geometry.
// The planner works on one room; LPH 5 needs it identified (room number, use), finished (materials) and
// documented (plan header, revision), and every furnishing needs a position number and a schedule entry.
const s = (v, n = 120) => String(v ?? '').slice(0, n);

export const DEFAULT_LPH = {
  plankopf: {
    projekt: 'Neubau / Umbau',
    bauherr: '',
    planTitel: 'Möblierungs- und Ausstattungsplan',
    planNr: 'A-501',
    massstab: '1:50',
    datum: '2026-10-14',
    index: 'A',
    bearbeiter: '',
  },
  raum: {
    nr: '5.01',
    name: 'Dachgeschoss',
    nutzung: 'Wohnen / Aufenthalt',
    boden: '', wand: '', decke: '', // material names (German) - free text, suggestions from the glossary
  },
  // construction elements the roof storey needs a decision on in LPH 5
  details: { dachaufbau: '', daemmung: '', gaube: '', treppe: '' },
};

export function sanitizeLph(l = {}) {
  const d = DEFAULT_LPH;
  const pick = (src = {}, ref) => Object.fromEntries(Object.keys(ref).map((k) => [k, s(src[k] ?? ref[k])]));
  return { plankopf: pick(l.plankopf, d.plankopf), raum: pick(l.raum, d.raum), details: pick(l.details, d.details) };
}

/** What HOAI LPH 5 asks for, as a working checklist (paraphrased - check HOAI Anlage 10 for the binding text). */
export const LPH5_CHECKLIST = [
  { key: 'plans', de: 'Ausführungs-, Detail- und Konstruktionspläne (M 1:50 bis 1:1)', en: 'Execution, detail and construction drawings (1:50 to 1:1)' },
  { key: 'dims', de: 'Vollständige Bemaßung (Maßketten, Höhen, Achsen)', en: 'Complete dimensioning (chains, heights, axes)' },
  { key: 'roombook', de: 'Raumbuch mit Nutzung, Flächen und Oberflächen', en: 'Room book with use, areas and finishes' },
  { key: 'materials', de: 'Festlegung der Materialien und Oberflächen', en: 'Materials and surfaces specified' },
  { key: 'furnishing', de: 'Ausstattungs- und Möblierungsliste mit Positionen', en: 'Furnishing schedule with position numbers' },
  { key: 'coordination', de: 'Abstimmung mit Fachplanern (Tragwerk, TGA)', en: 'Coordination with specialist planners (structure, MEP)' },
];
