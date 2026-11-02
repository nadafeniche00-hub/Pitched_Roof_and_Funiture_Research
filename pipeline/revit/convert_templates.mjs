// Turns the Revit export (pipeline/data/revit/roof_templates.json, written by the TemplateExport add-in) into the file the app reads:
//   node pipeline/revit/convert_templates.mjs [input.json]   ->   shared/revit/roofTemplates.json
// The app lists the roof types of the file next to the typical build-up; see shared/roofTemplates.js.
import fs from 'node:fs';
import { fromRevitExport } from '../../shared/roofTemplates.js';

const input = new URL(process.argv[2] ? 'file:///' + process.argv[2].replace(/\\/g, '/') : '../data/revit/roof_templates.json', import.meta.url);
if (!fs.existsSync(input)) {
  console.error(`No Revit export at ${input.pathname}.\nRun pipeline/revit/TemplateExport/run.ps1 first (it starts Revit; choose "Load Once" when Revit asks about the add-in).`);
  process.exit(1);
}
const { templates, skipped } = fromRevitExport(JSON.parse(fs.readFileSync(input, 'utf8').replace(/^﻿/, '')));
for (const s of skipped) console.warn(`skipped ${s.template}: ${s.error}`);
if (!templates.length) { console.error('The export holds no roof types.'); process.exit(1); }
const out = new URL('../../shared/revit/roofTemplates.json', import.meta.url);
fs.mkdirSync(new URL('./', out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(templates, null, 1));
const byTemplate = {};
for (const t of templates) (byTemplate[t.template] ||= []).push(t);
for (const [name, list] of Object.entries(byTemplate)) console.log(`${name}: ${list.length} roof types`);
for (const t of templates.slice(0, 40)) console.log(`  ${t.name.padEnd(46)} ${String(t.totalMm).padStart(7)} mm  ${t.layers.map((l) => `${l.name} ${l.mm}`).join(' | ')}`);
console.log(`wrote ${templates.length} roof types to shared/revit/roofTemplates.json`);
