import assert from 'node:assert/strict';
import test from 'node:test';
import { msUntilNextTick } from './ticks.js';

test('seconde : délai jusqu\'au début de la seconde suivante', () => {
  assert.equal(msUntilNextTick(1_000_250, 'second'), 750);
  assert.equal(msUntilNextTick(1_000_999, 'second'), 1);
  assert.equal(msUntilNextTick(1_000_001, 'second'), 999);
});

test('pile sur un début : une période entière, jamais 0', () => {
  assert.equal(msUntilNextTick(5_000, 'second'), 1000);
  assert.equal(msUntilNextTick(120_000, 'minute'), 60_000);
});

test('minute : délai jusqu\'au début de la minute suivante', () => {
  assert.equal(msUntilNextTick(60_000 * 7 + 15_000, 'minute'), 45_000);
  assert.equal(msUntilNextTick(60_000 * 7 + 59_999, 'minute'), 1);
});

test('le délai est toujours dans ]0, période]', () => {
  for (let t = 1_700_000_000_000; t < 1_700_000_000_000 + 3_000; t += 37) {
    const s = msUntilNextTick(t, 'second');
    assert.ok(s >= 1 && s <= 1000);
    assert.equal((t + s) % 1000, 0, 'le prochain top tombe pile sur une seconde');
    const m = msUntilNextTick(t, 'minute');
    assert.equal((t + m) % 60_000, 0);
  }
});
