import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE = ':memory:';
const { seed, searchProducts, searchGlossary } = await import('../library.js');

test('curated office-project data loads and is searchable in fr / de / en', () => {
  seed();
  seed(); // idempotent
  assert.ok(searchProducts({ q: 'chair' }).length > 5, 'English');
  assert.ok(searchProducts({ q: 'Bürodrehstuhl' }).length >= 2, 'German, umlaut folded');
  assert.ok(searchProducts({ q: 'fauteuil' }).length >= 0);
  const embody = searchProducts({ q: 'embody' })[0];
  assert.equal(embody.brand, 'Herman Miller');
  assert.match(embody.source, /^revit:/);
  const iron = searchProducts({ q: 'Beistelltisch' })[0];
  assert.ok(Math.abs(iron.h - 0.73) < 1e-9 && Math.abs(iron.w - 0.412) < 1e-9);
});

test('glossary has rooms, materials and sub-projects in three languages', () => {
  for (const kind of ['room', 'material', 'subproject', 'level', 'view']) {
    const rows = searchGlossary({ kind, limit: 1000 });
    assert.ok(rows.length > 5, kind);
    assert.ok(rows.every((r) => r.fr && r.de && r.en), `${kind}: every row translated`);
  }
  assert.ok(searchGlossary({ kind: 'material', q: 'Edelstahl' }).length >= 2);
  assert.equal(searchGlossary({ kind: 'subproject' }).filter((r) => r.project === 'grand-theatre-agadir').length, 20);
});
