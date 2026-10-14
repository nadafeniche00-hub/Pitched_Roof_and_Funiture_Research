// Map a free-text product / family name (fr / en / de) to one of the base types in catalog.js.
// First matching rule wins, so more specific words come first (a "chaise de bureau" is a chair, not a desk).
const RULES = [
  [/lit\s*(double|2|1\s*,?\s*(60|80|40))|double bed|doppelbett|queen|king size/i, 'bed_double'],
  [/\blit\b|\bbed\b|\bbett\b|single bed|einzelbett|couchage/i, 'bed_single'],
  [/armoire|wardrobe|kleiderschrank|garde-?robe|penderie|placard|schrank|tall cabinet|armario/i, 'wardrobe'],
  [/biblioth|bookcase|shelving|regal|[ée]tag[eè]re|shelf|rayonnage|rangement|archive|casier|stationary/i, 'shelf'],
  [/commode|chest of drawers|sideboard|kommode|buffet|caisson|cabinet|meuble|credenza|drawer/i, 'chest'],
  [/canap[ée]|sofa|couch|banquette|bench seating|lounge/i, 'sofa'],
  [/fauteuil|armchair|sessel|club chair|office chair|chair|chaise|si[èe]ge|seat|stuhl|tabouret|stool|bench|\bbanc\b/i, 'armchair'],
  [/bureau|desk|schreibtisch|workstation|table de travail|poste de travail|worktop|haworth/i, 'desk'],
  [/\bwc\b|toilet|cuvette|urinoir|sanitaire/i, 'toilet'],
  [/lavabo|vasque|basin|waschbecken|washbasin/i, 'basin'],
  [/douche|shower|dusche/i, 'shower'],
  [/table|tisch|conference|r[ée]union/i, 'desk'],
];

export function guessType(text) {
  const t = String(text || '');
  for (const [rx, type] of RULES) if (rx.test(t)) return type;
  return null;
}
