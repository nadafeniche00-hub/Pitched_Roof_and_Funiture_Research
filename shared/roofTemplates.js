// Roof build-ups ("templates") as the app uses them: a list of layers from the outside to the inside, each with a name, a thickness in mm and a colour.
//
// The exact ones come from the Revit German templates. The chain:
//   pipeline/revit/TemplateExport (a Revit 2025 add-in, started by hand, see its README)  ->  pipeline/data/revit/roof_templates.json
//   node pipeline/revit/convert_templates.mjs                                             ->  shared/revit/roofTemplates.json
//   the app lists them next to the typical build-up (client/src/lib/roofTemplates.js).
// Nothing here is invented: a layer is named after its Revit material (or its Revit function when it has none), the thickness is the Revit layer width.

/** The rule-of-thumb build-up the walk view always had. Not Revit data, not measured. */
export const TYPICAL_ROOF = {
  id: 'typical',
  source: 'typical',
  name: 'Typical build-up (rule of thumb)',
  layers: [
    { name: 'Clay roof tiles', mm: 30, color: 0xa4503a },
    { name: 'Battens and counter-battens', mm: 50, color: 0xb98a55 },
    { name: 'Waterproof membrane', mm: 1, color: 0x2f3a46 },
    { name: 'Rafters with insulation', mm: 200, color: 0xd9c27a },
    { name: 'Vapour barrier', mm: 1, color: 0x6fa3c7 },
    { name: 'Plasterboard', mm: 12.5, color: 0xe8e6df },
  ],
};

// Revit gives every layer a function. When the material has no usable colour the function decides one.
const FUNCTION_COLOR = {
  Structure: 0xb98a55, Substrate: 0xc9b48a, Insulation: 0xd9c27a, Finish1: 0xa4503a, Finish2: 0xe8e6df, Membrane: 0x2f3a46, ThermalAir: 0xcfe3ee,
};

const hexToInt = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? parseInt(h.slice(1), 16) : null);

/**
 * One roof type of the Revit export (the shape TemplateExport/App.cs writes) as an app template.
 * `materials` is the export's material list, to look up colours and thermal values by name.
 */
export function fromRevitType(type, materials = [], meta = {}) {
  const byName = new Map(materials.map((m) => [m.name, m]));
  const layers = (type.layers || []).map((l) => {
    const m = l.material ? byName.get(l.material) : null;
    const col = hexToInt(m?.color);
    return {
      name: l.material || l.function,
      function: l.function,
      mm: l.thickness_mm,
      color: col != null && col !== 0 ? col : FUNCTION_COLOR[l.function] ?? 0x9aa1ab,
      core: !!l.isCore,
      structural: !!l.isStructuralMaterial,
      variable: !!l.isVariable,
      ...(m?.thermal ? { conductivity: m.thermal.conductivity_W_mK, density: m.thermal.density_kg_m3 } : {}),
    };
  });
  return {
    id: `revit:${meta.template || ''}:${type.id}`,
    source: 'revit',
    name: type.name,
    family: type.family,
    template: meta.template || null,
    revit: meta.revit || null,
    totalMm: type.totalThickness_mm ?? layers.reduce((s, l) => s + l.mm, 0),
    layers,
  };
}

/**
 * The whole export file (an array with one entry per .rte) as a flat list of templates.
 * Entries that carry an `error` (a template that would not open) are skipped, and reported in `skipped`.
 */
export function fromRevitExport(json) {
  const out = [], skipped = [];
  for (const t of Array.isArray(json) ? json : [json]) {
    if (!t || t.error || !Array.isArray(t.roofTypes)) { skipped.push({ template: t?.template ?? '?', error: String(t?.error ?? 'no roof types').slice(0, 200) }); continue; }
    const meta = { template: t.template, revit: `${t.revitVersion || 'Revit'} ${t.revitBuild || ''}`.trim() };
    for (const type of t.roofTypes) out.push(fromRevitType(type, t.materials, meta));
  }
  return { templates: out, skipped };
}

/** Thickness text for a layer: Revit membranes have no thickness at all, say so instead of showing a made-up number. */
export const fmtMm = (mm) => (mm === 0 ? '0 mm' : `${Number.isInteger(mm) ? mm : +mm.toFixed(1)} mm`);
