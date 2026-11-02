import test from 'node:test';
import assert from 'node:assert/strict';
import { fromRevitExport, fromRevitType, fmtMm, TYPICAL_ROOF } from '../../shared/roofTemplates.js';

// A made-up export in the shape pipeline/revit/TemplateExport/App.cs writes. The names and numbers are NOT from a Revit template: the test checks the
// conversion, not the content of any template.
const FIXTURE = [
  {
    template: 'Fixture.rte', revitVersion: 'Autodesk Revit 2025', revitBuild: '25.0.0.0',
    roofTypes: [
      {
        name: 'Fixture roof A', family: 'Basic Roof', id: 101, totalThickness_mm: 262.5,
        layers: [
          { index: 0, function: 'Finish1', thickness_mm: 30, material: 'Fixture tiles', isCore: false },
          { index: 1, function: 'Membrane', thickness_mm: 0, material: null, isCore: false },
          { index: 2, function: 'Structure', thickness_mm: 220, material: 'Fixture timber', isCore: true, isStructuralMaterial: true },
          { index: 3, function: 'Finish2', thickness_mm: 12.5, material: 'Fixture board', isCore: false },
        ],
      },
      { name: 'Fixture roof B', family: 'Basic Roof', id: 102, totalThickness_mm: null, layers: [{ function: 'Structure', thickness_mm: 100, material: 'Fixture timber' }] },
    ],
    materials: [
      { name: 'Fixture tiles', color: '#aa4433', thermal: { conductivity_W_mK: 1.0, density_kg_m3: 1900 } },
      { name: 'Fixture timber', color: '#000000' }, // black = no usable colour
    ],
  },
  { template: 'Broken.rte', error: 'System.Exception: the template did not open' },
];

test('every roof type of every template that opened becomes an app template', () => {
  const { templates, skipped } = fromRevitExport(FIXTURE);
  assert.equal(templates.length, 2);
  assert.deepEqual(templates.map((t) => t.name), ['Fixture roof A', 'Fixture roof B']);
  assert.equal(templates[0].source, 'revit');
  assert.equal(templates[0].id, 'revit:Fixture.rte:101');
  assert.equal(templates[0].revit, 'Autodesk Revit 2025 25.0.0.0');
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].template, 'Broken.rte');
});

test('layers keep the Revit order, thickness and function; a layer without a material is named after its function', () => {
  const [a] = fromRevitExport(FIXTURE).templates;
  assert.deepEqual(a.layers.map((l) => l.name), ['Fixture tiles', 'Membrane', 'Fixture timber', 'Fixture board']);
  assert.deepEqual(a.layers.map((l) => l.mm), [30, 0, 220, 12.5]);
  assert.deepEqual(a.layers.map((l) => l.function), ['Finish1', 'Membrane', 'Structure', 'Finish2']);
  assert.equal(a.layers[2].core, true);
  assert.equal(a.layers[2].structural, true);
  assert.equal(a.totalMm, 262.5);
});

test('colours: the material colour when there is one, else a colour by function; thermal values pass through', () => {
  const [a] = fromRevitExport(FIXTURE).templates;
  assert.equal(a.layers[0].color, 0xaa4433);
  assert.equal(a.layers[0].conductivity, 1.0);
  assert.equal(a.layers[0].density, 1900);
  assert.notEqual(a.layers[2].color, 0); // black material colour is not a colour
  assert.ok(Number.isInteger(a.layers[1].color) && a.layers[1].color > 0);
});

test('the total comes from the layers when Revit gives none', () => {
  const b = fromRevitExport(FIXTURE).templates[1];
  assert.equal(b.totalMm, 100);
});

test('a single export object works as well as an array', () => {
  const { templates } = fromRevitExport(FIXTURE[0]);
  assert.equal(templates.length, 2);
});

test('thickness text: whole numbers plain, one decimal at most, zero said as zero', () => {
  assert.equal(fmtMm(30), '30 mm');
  assert.equal(fmtMm(12.5), '12.5 mm');
  assert.equal(fmtMm(0), '0 mm');
  assert.equal(fmtMm(0.123), '0.1 mm');
});

test('the typical build-up stays available and is marked as a rule of thumb', () => {
  assert.equal(TYPICAL_ROOF.source, 'typical');
  assert.equal(TYPICAL_ROOF.layers.length, 6);
  assert.ok(fromRevitType({ name: 'x', id: 1, layers: [] }).layers.length === 0);
});
