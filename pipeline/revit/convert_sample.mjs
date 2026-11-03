// Turns the export of the sample projects (pipeline/data/revit/samples.json, written by SampleExport/run.ps1) into
//   shared/revit/sampleTemplates.json   up to three attic storeys with a pitched roof, as templates of the app (room, brief, the real rooms), and
//   pipeline/data/revit/sample_check.json   the rules of the app held against every sample: size, width, proportion and headroom of every real room.
//   node pipeline/revit/convert_sample.mjs [input.json]
// A sample without a pitched roof is reported and not kept as a template. Nothing is invented: what Revit did not give is said in `notes`.
import fs from 'node:fs';
import { deriveTemplate, checkRooms } from '../../shared/sampleCheck.js';

const input = new URL(process.argv[2] ? 'file:///' + process.argv[2].replace(/\\/g, '/') : '../data/revit/samples.json', import.meta.url);
if (!fs.existsSync(input)) {
  console.error(`No Revit export at ${input.pathname}.\nRun pipeline/revit/SampleExport/run.ps1 first (it starts Revit; choose "Load Once" when Revit asks about the add-in).`);
  process.exit(1);
}
const samples = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^﻿/, ''));
const cal = JSON.parse(fs.readFileSync(new URL('../oracle/msd/calibration_results.json', import.meta.url), 'utf8')).percentiles_by_type;
const bands = Object.fromEntries(Object.entries(cal).map(([k, v]) => [k, { p5: +v.net_area.p5.toFixed(1), p95: +v.net_area.p95.toFixed(1) }]));
bands.child = bands.bedroom;

const slug = (s) => s.replace(/\.rvt$/i, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'sample';
const report = [], kept = [];
for (const s of samples) {
  if (s.error) { report.push({ source: s.source, error: String(s.error).split('\n')[0] }); continue; }
  const levels = (s.levels || []).filter((l) => l.rooms > 0).map((l) => `${l.name} (${l.rooms} rooms)`);
  const attics = s.attics || (s.attic ? [s.attic] : []); // the storeys that lie under a roof (older exports: one attic)
  if (!attics.length) { report.push({ source: s.source, levels, note: 'no level with rooms' }); continue; }
  for (const attic of attics) {
    const t = deriveTemplate({ ...s, attic });
    if (!t) continue;
    const rows = t.room ? checkRooms(t, bands) : [];
    report.push({ source: s.source, levels, level: attic.level.name, fallback: !!s.fallback, pitched: t.pitched, room: t.room, roofs: t.roofs, notes: t.notes, rooms: rows });
    if (t.pitched && t.rooms.length >= 2) kept.push({ s, attic, t });
  }
}
kept.sort((a, b) => b.t.rooms.length - a.t.rooms.length);
const templates = kept.slice(0, 3).map(({ s, attic, t }) => {
  const rooms = t.rooms.filter((r) => r.type && r.type !== 'hall' && r.type !== 'stair');
  return {
    id: `revit-${slug(s.source)}-${slug(attic.level.name)}`,
    name: `Revit sample: ${s.source.replace(/\.rvt$/i, '')}, ${attic.level.name}`,
    note: `Read from ${s.source} by Revit's API: ${t.rooms.length} rooms, roof ${t.room.pitch}°, knee wall ${t.room.kneeWall} m. The sizes are the real ones of the sample.`,
    source: s.source,
    room: t.room,
    brief: { rooms: rooms.slice(0, 8).map((r, i) => ({ id: `${r.type}${i}`, type: r.type, area: +r.area.toFixed(1) })), links: [] },
    rooms: t.rooms.map((r) => ({ name: r.name, type: r.type, area: r.area, polygon: r.polygon.map((p) => p.map((v) => +v.toFixed(2))) })),
  };
});
fs.mkdirSync(new URL('../../shared/revit/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../../shared/revit/sampleTemplates.json', import.meta.url), JSON.stringify(templates, null, 1));
fs.writeFileSync(new URL('../data/revit/sample_check.json', import.meta.url), JSON.stringify(report, null, 1));

for (const r of report) {
  console.log(`\n== ${r.source}`);
  if (r.error) { console.log('   not read:', r.error); continue; }
  console.log(`   levels: ${r.levels.join(', ')}`);
  if (!r.room) { console.log(`   ${r.note || r.notes.join('; ')}`); continue; }
  console.log(`   ${r.level}: ${r.pitched ? 'pitched' : 'NOT pitched'} roof, ${r.room.width} x ${r.room.depth} m, knee wall ${r.room.kneeWall} m, pitch ${r.room.pitch}°, ridge ${r.room.maxHeight} m${r.notes.length ? `\n   notes: ${r.notes.join('; ')}` : ''}`);
  for (const q of r.rooms) {
    console.log(`   ${(q.name || '?').padEnd(24)} ${String(q.type || '?').padEnd(8)} ${String(q.area).padStart(6)} m²  ${q.short} x ${q.long} m   under roof: ${Math.round(q.headroom.full * 100)} % full, ${Math.round(q.headroom.half * 100)} % half, ${Math.round(q.headroom.low * 100)} % low${q.flags.length ? `\n      ! ${q.flags.join('\n      ! ')}` : ''}`);
  }
}
console.log(`\nwrote ${templates.length} template(s) to shared/revit/sampleTemplates.json (${templates.map((t) => t.id).join(', ') || 'none: no sample with a pitched roof and rooms'}) and the check to pipeline/data/revit/sample_check.json`);
