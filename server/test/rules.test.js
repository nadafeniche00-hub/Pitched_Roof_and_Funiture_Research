import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, DEFAULT_ROOM } from '../../shared/engine.js';
import { CATALOG } from '../../shared/catalog.js';
import { RULES, anchorOk, checkLayout, factCheckItem, factCheckRoom } from '../../shared/rules.js';
import { NODES, buildPattern, itemsFromPattern, walk } from '../../shared/patterns.js';
import { runLoop } from '../../shared/iterate.js';

const item = (type, x, y, rot = 0, extra = {}) => ({ id: `${type}-${x}-${y}`, type, x, y, rot, placed: true, ...extra });
const check = (room, items) => checkLayout(room, items, evaluate(room, items));

test('every catalogue type passes its own fact check', () => {
  for (const type of Object.keys(CATALOG)) assert.deepEqual(factCheckItem({ id: 'a', type }), [], type);
});

test('fact check catches a typo in a dimension and a window in a knee wall', () => {
  const deep = factCheckItem({ id: 'a', type: 'wardrobe', overrides: { d: 1.4 } });
  assert.ok(deep.some((f) => f.code === 'fact-dim' && /depth/.test(f.msg)));
  const room = { ...DEFAULT_ROOM, windows: [{ wall: 'E', pos: 3, width: 1 }] };
  assert.ok(factCheckRoom(room).some((f) => f.code === 'fact-window-knee'));
  assert.deepEqual(factCheckRoom(DEFAULT_ROOM).filter((f) => f.severity === 'warn'), []);
});

test('a bed head must stand against a wall', () => {
  const room = { ...DEFAULT_ROOM, dormers: [], stair: null };
  // rot 3: front faces +x, head at x = 0
  assert.ok(!check(room, [item('bed_single', 0, 3, 3)]).some((f) => f.rule === 'bed-head-wall'));
  // rot 0 in the middle of the room: head floats
  assert.ok(check(room, [item('bed_single', 2, 2.5, 0)]).some((f) => f.rule === 'bed-head-wall'));
});

test('the stair landing rule flags a piece next to the stair, and a disabled rule is skipped', () => {
  const room = { ...DEFAULT_ROOM, stair: { x: 2, y: 0.2, w: 0.9, d: 2 } };
  const items = [item('chest', 2, 2.4, 0)];
  assert.ok(check(room, items).some((f) => f.rule === 'stair-landing'));
  const result = evaluate(room, items);
  assert.ok(!checkLayout(room, items, result, { disabled: ['stair-landing'] }).some((f) => f.rule === 'stair-landing'));
});

test('storage per sleeper is judged on the whole programme', () => {
  const room = DEFAULT_ROOM;
  const bare = [{ id: 'b', type: 'bed_double', x: 0, y: 0, rot: 0, placed: false }];
  assert.ok(check(room, bare).some((f) => f.rule === 'storage-per-bed'));
  const stored = [...bare, { id: 'w', type: 'wardrobe', x: 0, y: 0, rot: 0, placed: false }, { id: 'c', type: 'chest', x: 0, y: 0, rot: 0, placed: false }];
  assert.ok(!check(room, stored).some((f) => f.rule === 'storage-per-bed'));
});

test('every rule has an id, a reason and a scope', () => {
  const ids = new Set();
  for (const r of RULES) {
    assert.ok(r.id && r.title && r.why && ['item', 'room'].includes(r.scope));
    assert.ok(!ids.has(r.id), `duplicate ${r.id}`);
    ids.add(r.id);
  }
});

test('the pattern tree walks to a pattern and rejects a wrong path', () => {
  const path = ['sleep', 'two', 'slope', 'both', 'light'];
  assert.equal(walk(path).node, null);
  const p = buildPattern(path);
  assert.deepEqual(p.pieces.map((x) => x.type), ['bed_double', 'wardrobe', 'chest', 'chest', 'desk']);
  assert.deepEqual(p.pieces[0].spec, { backTo: 'slope' });
  assert.equal(buildPattern(['sleep', 'two']), null, 'incomplete path');
  assert.equal(walk(['sleep', 'nope']).valid, false);
});

test('every complete path of the tree builds a pattern of known types', () => {
  const paths = [];
  const grow = (path, node) => {
    if (node === null) { paths.push(path); return; }
    for (const o of NODES[node].options) grow([...path, o.id], o.next);
  };
  grow([], 'use');
  assert.ok(paths.length > 20);
  for (const path of paths) {
    const p = buildPattern(path);
    assert.ok(p && p.pieces.length > 0, path.join('/'));
    for (const piece of p.pieces) assert.ok(CATALOG[piece.type], path.join('/'));
  }
});

test('fold builds the pattern piece by piece and respects the bed anchor', () => {
  const room = { ...DEFAULT_ROOM };
  const pattern = buildPattern(['sleep', 'one', 'slope', 'slope', 'none']);
  const { frames } = runLoop(room, itemsFromPattern(pattern), { kind: 'fold', seed: 3 });
  assert.equal(frames.length, pattern.pieces.length + 1);
  assert.equal(frames[0].items.filter((i) => i.placed).length, 0);
  const last = frames.at(-1);
  assert.equal(last.items.filter((i) => i.placed).length, pattern.pieces.length, 'every piece found a position');
  const bed = last.items.find((i) => i.type === 'bed_single');
  const def = CATALOG.bed_single;
  const w = bed.rot % 2 ? def.d : def.w, d = bed.rot % 2 ? def.w : def.d;
  assert.ok(anchorOk(room, 'slope', [bed.x, bed.y, bed.x + w, bed.y + d], bed.rot), 'head under the slope');
});

test('repeat never makes the design worse and records every pass', () => {
  const room = { ...DEFAULT_ROOM };
  const pattern = buildPattern(['sleep', 'two', 'gable', 'gable', 'light']);
  const start = runLoop(room, itemsFromPattern(pattern), { kind: 'fold', seed: 5 }).frames.at(-1).items;
  const out = runLoop(room, start, { kind: 'repeat', maxIter: 12, seed: 5 });
  assert.ok(out.frames.length >= 1 && out.frames.length <= 13);
  const accepted = out.frames.filter((f) => f.accepted);
  for (let i = 1; i < accepted.length; i++) assert.ok(accepted[i].score >= accepted[i - 1].score - 1e-9, 'accepted passes only raise the score');
  assert.ok(out.frames[out.best].score >= out.frames[0].score - 1e-9);
});
