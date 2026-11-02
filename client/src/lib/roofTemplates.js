// The roof build-ups the walk view can show on hover and in the exploded view. 'typical' is a rule of thumb; the others are the roof types of the Revit
// German templates, exact, as soon as shared/revit/roofTemplates.json exists (pipeline/revit/convert_templates.mjs writes it from the Revit export).
import { TYPICAL_ROOF } from '@shared/roofTemplates.js';

// a glob, so the build does not fail while the file is not there
const files = import.meta.glob('../../../shared/revit/roofTemplates.json', { eager: true, import: 'default' });
export const roofTemplates = [TYPICAL_ROOF, ...Object.values(files).flat()];

const KEY = 'us-roof-template';
let chosen = null; // also kept in memory: a private window may refuse localStorage
export function selectedRoofTemplate() {
  let id = chosen;
  if (!id) { try { id = localStorage.getItem(KEY); } catch { /* not remembered */ } }
  return roofTemplates.find((t) => t.id === id) || TYPICAL_ROOF;
}
export function setRoofTemplate(id) {
  chosen = id;
  try { localStorage.setItem(KEY, id); } catch { /* not remembered across visits */ }
}
