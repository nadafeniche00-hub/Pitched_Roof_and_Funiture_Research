import { useSelector } from 'react-redux';

// UI strings for the views that exist for LPH 5 work (library, IFC, room book, schedules). German is the working
// language of LPH 5 deliverables; the planner side keeps its English labels.
const D = {
  tab_planner: { en: 'Planner', de: 'Planer' },
  tab_library: { en: 'Library', de: 'Bibliothek' },
  tab_ifc: { en: 'IFC viewer', de: 'IFC-Viewer' },
  tab_lph5: { en: 'LPH 5', de: 'LPH 5' },
  tab_frame: { en: 'Traditional frame', de: 'Fachwerk' },
  search_ph: { en: 'Search furniture - chair, Schreibtisch, armoire…', de: 'Möbel suchen – Stuhl, desk, armoire…' },
  all: { en: 'all', de: 'alle' },
  type: { en: 'Type', de: 'Typ' },
  source: { en: 'Source', de: 'Quelle' },
  project: { en: 'Project', de: 'Projekt' },
  use: { en: 'Use in plan', de: 'In Plan übernehmen' },
  results: { en: 'results', de: 'Treffer' },
  inherits: { en: 'dimensions inherited from the category', de: 'Maße vom Typ geerbt' },
  glossary: { en: 'Vocabulary from the office projects', de: 'Vokabular aus den Büroprojekten' },
  g_room: { en: 'Rooms', de: 'Räume' },
  g_level: { en: 'Levels', de: 'Ebenen' },
  g_material: { en: 'Materials', de: 'Materialien' },
  g_subproject: { en: 'Sub-projects', de: 'Teilprojekte' },
  g_view: { en: 'Views', de: 'Ansichten' },
  scrape_title: { en: 'Add products from web pages', de: 'Produkte aus Webseiten übernehmen' },
  scrape_hint: { en: 'One product-page URL per line (max. 5). Only pages whose robots.txt allows it; structured data (schema.org) is read.', de: 'Eine Produktseiten-URL pro Zeile (max. 5). Nur Seiten, die robots.txt erlaubt; gelesen werden strukturierte Daten (schema.org).' },
  scrape_go: { en: 'Fetch', de: 'Abrufen' },
  ifc_open: { en: 'Open an IFC file…', de: 'IFC-Datei öffnen…' },
  ifc_hint: { en: 'Everything stays in your browser; the file is not uploaded.', de: 'Alles bleibt im Browser; die Datei wird nicht hochgeladen.' },
  ifc_types: { en: 'Element types', de: 'Bauteilarten' },
  ifc_props: { en: 'Properties', de: 'Eigenschaften' },
  ifc_to_lib: { en: 'Add furnishings to the library', de: 'Ausstattung in die Bibliothek übernehmen' },
  lph_header: { en: 'Plan header', de: 'Plankopf' },
  lph_room: { en: 'Room book entry', de: 'Raumbuch' },
  lph_schedule: { en: 'Furnishing schedule', de: 'Ausstattungs- und Möblierungsliste' },
  lph_check: { en: 'LPH 5 checklist', de: 'LPH-5-Checkliste' },
  lph_print: { en: 'Print / PDF', de: 'Drucken / PDF' },
  lph_csv: { en: 'Export CSV', de: 'CSV exportieren' },
  pos: { en: 'Pos.', de: 'Pos.' },
  designation: { en: 'Designation', de: 'Bezeichnung' },
  maker: { en: 'Manufacturer', de: 'Hersteller' },
  size: { en: 'W × D × H (mm)', de: 'B × T × H (mm)' },
  qty: { en: 'Qty', de: 'Menge' },
  status: { en: 'Status', de: 'Status' },
  origin: { en: 'Origin', de: 'Herkunft' },
};

export const useLang = () => useSelector((s) => s.ui.lang);
export const useT = () => {
  const lang = useLang();
  return (k) => D[k]?.[lang] ?? D[k]?.en ?? k;
};
export const pickName = (row, lang) => (lang === 'de' ? row.name_de || row.name : row.name_en || row.name);
