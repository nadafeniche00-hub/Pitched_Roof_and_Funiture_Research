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

test('a link clause keeps the area of its room and does not make a second room of the type it points at', () => {
  const sentence = (a, b) => `${a}, a bath of 3 m2 next to the bedroom, a child room of 14 m2, ${b}`;
  for (const text of [sentence('a study of 4 m2', 'a bedroom of 14 m2'), sentence('a bedroom of 14 m2', 'a study of 4 m2')]) { // the room pointed at is defined before or after the link
    const { brief } = parseBriefText(text);
    assert.deepEqual(types(brief).sort(), ['bath', 'bedroom', 'child', 'study'], text);
    assert.equal(brief.rooms.find((r) => r.type === 'bath').area, 3, 'the 3 m2 of the bath are kept');
    assert.equal(brief.rooms.find((r) => r.type === 'bedroom').area, 14);
    const bed = brief.rooms.find((r) => r.type === 'bedroom').id;
    assert.deepEqual(brief.links, [[brief.rooms.find((r) => r.type === 'bath').id, bed, 'near']]);
  }
});

test('a room that is only pointed at is made once, of the usual size; one with an area of its own is defined', () => {
  const only = parseBriefText('a bath next to the bedroom').brief;
  assert.deepEqual(types(only).sort(), ['bath', 'bedroom']);
  assert.equal(only.links.length, 1);
  const both = parseBriefText('Bad von 4 qm neben dem Schlafzimmer von 14 qm').brief;
  assert.equal(both.rooms.find((r) => r.type === 'bedroom').area, 14);
  assert.equal(both.rooms.length, 2);
});

test('unknown words are reported, never invented into rooms', () => {
  const { brief, ignored } = parseBriefText('sauna, 1 bedroom');
  assert.deepEqual(types(brief), ['bedroom']);
  assert.deepEqual(ignored, ['sauna']);
});

test('no more than eight rooms', () => {
  assert.ok(parseBriefText('4 bedrooms, 4 kids rooms, 4 baths').brief.rooms.length <= 8);
});
