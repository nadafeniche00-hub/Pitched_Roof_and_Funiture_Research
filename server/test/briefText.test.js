import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBriefText } from '../../shared/briefText.js';

const types = (b) => b.rooms.map((r) => r.type);

test('English: counts, areas and a link', () => {
  const { brief } = parseBriefText('2 bedrooms, a bathroom next to the bedroom, study of 6 m2 and a kitchen');
  assert.deepEqual(types(brief).sort(), ['bath', 'bedroom', 'bedroom', 'kitchen', 'study']);
  assert.equal(brief.rooms.find((r) => r.type === 'study').area, 6);
  assert.equal(brief.links.length, 1);
});

test('German: zwei Schlafzimmer, Bad neben Schlafzimmer, Arbeitszimmer 7 qm', () => {
  const { brief } = parseBriefText('zwei Schlafzimmer, Bad neben dem Schlafzimmer, Arbeitszimmer 7 qm, Küche');
  assert.equal(types(brief).filter((t) => t === 'bedroom').length, 2);
  assert.ok(types(brief).includes('kitchen') && types(brief).includes('study') && types(brief).includes('bath'));
  assert.equal(brief.rooms.find((r) => r.type === 'study').area, 7);
  assert.equal(brief.links.length, 1);
});

test('unknown words are reported, never invented into rooms', () => {
  const { brief, ignored } = parseBriefText('sauna, 1 bedroom');
  assert.deepEqual(types(brief), ['bedroom']);
  assert.deepEqual(ignored, ['sauna']);
});

test('no more than eight rooms', () => {
  assert.ok(parseBriefText('4 bedrooms, 4 kids rooms, 4 baths').brief.rooms.length <= 8);
});
