import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, sanitizeRoom, DEFAULT_ROOM } from '../../shared/engine.js';
import { SYSTEMS, COVERINGS, REGIONS, SOURCES, snowFactor, WOLF_PITCH, wolfRatio, rafterLength, framePosts, applyFrame, checkFrame } from '../../shared/timber.js';

const ROOM = { ...DEFAULT_ROOM, width: 6, depth: 9, dormers: [], stair: null, windows: [], posts: [] };

test('snow shape coefficient: 0.8 to 30 deg, linear to 0 at 60 deg', () => {
  assert.equal(snowFactor(20), 0.8);
  assert.equal(snowFactor(30), 0.8);
  assert.ok(Math.abs(snowFactor(45) - 0.4) < 1e-9);
  assert.equal(snowFactor(60), 0);
  assert.equal(snowFactor(70), 0);
});

test("Wolf's 3-4-5 carpenter rule is 53.13 deg and a ridge height of 2/3 of the width", () => {
  assert.ok(Math.abs(WOLF_PITCH - 53.13) < 0.01);
  assert.ok(Math.abs(wolfRatio(WOLF_PITCH) - 2 / 3) < 1e-9);
  // rafter = 5 parts when half width = 3 parts
  assert.ok(Math.abs(rafterLength({ width: 6 }, WOLF_PITCH) - 5) < 1e-9);
});

test('every region points at known systems, coverings and sources', () => {
  for (const r of REGIONS) {
    assert.ok(SYSTEMS[r.system], r.id);
    assert.ok(COVERINGS[r.covering], r.id);
    r.coverings.forEach((c) => assert.ok(COVERINGS[c], `${r.id}:${c}`));
    r.src.forEach((s) => assert.ok(SOURCES[s], `${r.id}:${s}`));
  }
  for (const s of Object.values(SYSTEMS)) s.rules.forEach((x) => x.src.forEach((k) => assert.ok(SOURCES[k], k)));
  for (const c of Object.values(COVERINGS)) c.src.forEach((k) => assert.ok(SOURCES[k], k));
});

test('thatch needs 45 deg (50 deg when windy); a shallow roof fails the check', () => {
  assert.equal(COVERINGS.reet.min, 45);
  assert.equal(COVERINGS.reet.minWindy, 50);
  const checks = checkFrame({ ...ROOM, pitch: 35 }, { system: 'staenderbau', covering: 'reet' });
  assert.ok(checks.some((c) => c.level === 'fail'));
  const ok = checkFrame({ ...ROOM, pitch: 53 }, { system: 'staenderbau', covering: 'reet' });
  assert.ok(!ok.some((c) => c.level === 'fail'), JSON.stringify(ok.filter((c) => c.level === 'fail')));
});

test('a simple rafter roof wider than 8 m is flagged', () => {
  const c = checkFrame({ ...ROOM, width: 10, pitch: 45 }, { system: 'sparren', covering: 'hohlpfanne' });
  assert.ok(c.some((x) => x.level === 'warn' && /Kehlbalken/.test(x.de)));
});

test('post-and-beam hall house: pitch from the 2:3 rule, two post rows every ~2.5 m', () => {
  const patch = applyFrame(ROOM, { system: 'staenderbau', region: 'muensterland', covering: 'reet' });
  assert.ok(patch.pitch >= 53 && patch.pitch <= 54);
  const xs = [...new Set(patch.posts.map((p) => p.x))];
  assert.equal(xs.length, 2);
  const ys = [...new Set(patch.posts.map((p) => p.y))].sort((a, b) => a - b);
  assert.ok(ys.length >= 3);
  assert.ok(Math.abs(ys[1] - ys[0] - 2.5) < 0.6);
});

test('collar-beam roof caps the usable height at the collar beam', () => {
  const patch = applyFrame(ROOM, { system: 'kehlbalken', covering: 'hohlpfanne' });
  const ridge = patch.kneeWall + Math.tan((patch.pitch * Math.PI) / 180) * 3;
  assert.ok(patch.maxHeight < ridge - 0.5);
  assert.deepEqual(patch.posts, []);
});

test('purlin roof with raking posts leaves the attic floor free; standing posts do not', () => {
  assert.deepEqual(framePosts(ROOM, 'pfetten_liegend'), []);
  assert.ok(framePosts(ROOM, 'pfetten_stehend').length >= 4);
});

test('a roof post blocks furniture and is part of the sanitised room', () => {
  const room = sanitizeRoom({ ...ROOM, posts: [{ x: 3, y: 4.5, s: 0.25 }], frame: { system: 'pfetten_stehend', covering: 'dachziegel' } });
  assert.equal(room.posts.length, 1);
  assert.equal(room.frame.system, 'pfetten_stehend');
  const hit = evaluate(room, [{ id: 'c', type: 'chest', x: 2.7, y: 4.3, rot: 0, placed: true }]);
  assert.ok(hit.items[0].issues.some((i) => i.code === 'post'));
  const clear = evaluate(room, [{ id: 'c', type: 'chest', x: 3.6, y: 6.5, rot: 0, placed: true }]);
  assert.ok(!clear.items[0].issues.some((i) => i.code === 'post'));
});
