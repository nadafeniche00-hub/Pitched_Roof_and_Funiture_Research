import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_FILE = ':memory:';
const { gumbelReturnLevel, classifyZone, stormDirection } = await import('../wind.js');

test('gumbel return level rises with T and exceeds the sample mean', () => {
  const m = [24, 27, 22, 31, 26, 28, 25, 30, 23, 29];
  const mean = m.reduce((a, b) => a + b) / m.length;
  assert.ok(gumbelReturnLevel(m, 50) > gumbelReturnLevel(m, 10));
  assert.ok(gumbelReturnLevel(m, 10) > mean);
});

test('zones follow the estimated basic wind velocity', () => {
  assert.equal(classifyZone(20), 1);
  assert.equal(classifyZone(24.5), 2);
  assert.equal(classifyZone(27), 3);
  assert.equal(classifyZone(31), 4);
});

test('storm direction is the circular, speed-weighted mean of the strongest days', () => {
  const speeds = [5, 6, 20, 22, 21, 7, 8, 9, 10, 4];
  const dirs = [90, 90, 270, 280, 260, 90, 90, 90, 90, 90];
  const d = stormDirection(speeds, dirs);
  assert.ok(d > 255 && d < 285, `got ${d}`);
});
