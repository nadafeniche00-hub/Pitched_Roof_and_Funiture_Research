// The wishes and rules about which rooms sit next to each other are held to what real flats do (shared/links.js: the Modified Swiss Dwellings, 16,744 flats). A rule that real flats do not follow,
// or a default link that the data does not support, fails here: nobody can add a hand-written neighbour rule without evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADJACENCY, rulebook } from '../../shared/knowledge.js';
import { EXAMPLE_BRIEF, generatePlans } from '../../shared/plans.js';
import { briefFromPath } from '../../shared/roomTree.js';
import { DEFAULT_ROOM } from '../../shared/engine.js';
import { FLATS, SUPPORTED, connectedShare, defaultLinks, doorShare, roomWallShare, wallShare } from '../../shared/links.js';

test('a wall shared and a door are different questions: baths share a wall with a bedroom in most flats and have a door to one in few', () => {
  assert.ok(wallShare('bath', 'bedroom').share > 0.6, 'in most flats that have both, a bath shares a wall with a bedroom');
  assert.ok(wallShare('bath', 'bedroom').flats > 10000);
  assert.ok(doorShare('bath', 'bedroom') < 0.1, 'but only a few baths have a door into a bedroom');
  assert.ok(roomWallShare('bath', 'hall') > 0.85 && roomWallShare('bedroom', 'hall') > 0.85, 'nearly every room shares a wall with the hall of the flat');
  assert.equal(wallShare('bath', 'child').share, wallShare('bath', 'bedroom').share, 'a child room is a bedroom in the data');
  assert.equal(wallShare('bath', 'nonsense'), null);
  assert.ok(FLATS > 15000);
});

test('every adjacency rule carries evidence that agrees with it', () => {
  assert.ok(ADJACENCY.length >= 6);
  for (const r of ADJACENCY) {
    assert.ok(r.evidence && Number.isFinite(r.evidence.share), `${r.a}-${r.b} has evidence`);
    if (r.kind === 'want') assert.ok(r.evidence.share >= SUPPORTED, `${r.a}-${r.b}: only ${Math.round(r.evidence.share * 100)} % of real flats do what the rule wants`);
    else assert.ok(r.evidence.share <= 0.1, `${r.a}-${r.b}: ${Math.round(r.evidence.share * 100)} % of real rooms have the door that the rule avoids`);
    assert.match(r.why, /\d+ %/, `${r.a}-${r.b}: the finding names the measured share`);
  }
});

test('default links are the neighbours that most real flats have, one pair each, and only for rooms that exist', () => {
  assert.deepEqual(defaultLinks([{ id: 'bed', type: 'bedroom' }, { id: 'b', type: 'bath' }]), [['bed', 'b', 'near']]);
  assert.deepEqual(defaultLinks([{ id: 'k', type: 'kitchen' }, { id: 'l', type: 'living' }]), [['k', 'l', 'near']]);
  assert.deepEqual(defaultLinks([{ id: 'bed', type: 'bedroom' }, { id: 'kid', type: 'child' }, { id: 'b1', type: 'bath' }, { id: 'b2', type: 'bath' }]), [['bed', 'b1', 'near']], 'the first bath next to the first sleeping room, not every pair');
  assert.deepEqual(defaultLinks([{ id: 'bed', type: 'bedroom' }, { id: 'st', type: 'study' }]), [], 'no bath, no link');
  assert.deepEqual(defaultLinks([]), []);
  assert.ok(connectedShare('kitchen', 'living') > 0.4, 'kitchen and living room are connected in about half of the flats');
});

test('the example brief and the question tree get their links from the data, and the plans still come out', () => {
  assert.deepEqual(EXAMPLE_BRIEF.links, defaultLinks(EXAMPLE_BRIEF.rooms));
  assert.deepEqual(EXAMPLE_BRIEF.links, [['bed', 'bath', 'near']]);
  const b = briefFromPath(['kid1', 'yes', 'two', 'yes']);
  assert.deepEqual(b.links, defaultLinks(b.rooms));
  assert.deepEqual(b.links, [['bed', 'bath', 'near']], 'the tree has no kitchen, so only the bath next to the sleeping room');
});

test('the rulebook for the language model quotes the measured numbers', () => {
  const text = rulebook();
  assert.match(text, /measured on 16,744 real flats|measured on [\d,.]+ real flats/);
  assert.ok(text.includes(`${Math.round(wallShare('bath', 'bedroom').share * 100)} %`));
  assert.ok(text.includes('bathroom next to the bedrooms'));
});

test('plans on the example brief are still made', () => {
  const plans = generatePlans(DEFAULT_ROOM, EXAMPLE_BRIEF, { seed: 4 });
  assert.ok(plans.length > 0 && plans[0].score > 0);
});
