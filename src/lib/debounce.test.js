import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { debounce } from './debounce.js';

afterEach(() => mock.timers.reset());

test('debounce : un seul appel après le délai, avec les derniers arguments', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const d = debounce((x) => calls.push(x), 300);
  d(1);
  mock.timers.tick(200);
  d(2);
  mock.timers.tick(299);
  assert.deepEqual(calls, []);
  mock.timers.tick(1);
  assert.deepEqual(calls, [2]);
  mock.timers.tick(1000);
  assert.deepEqual(calls, [2]);
});

test('debounce : flush exécute tout de suite, cancel abandonne', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const d = debounce((x) => calls.push(x), 300);
  assert.equal(d.pending(), false);
  assert.equal(d.flush(), undefined);
  d('a');
  assert.equal(d.pending(), true);
  d.flush();
  assert.deepEqual(calls, ['a']);
  assert.equal(d.pending(), false);
  mock.timers.tick(1000);
  assert.deepEqual(calls, ['a']);
  d('b');
  d.cancel();
  mock.timers.tick(1000);
  assert.deepEqual(calls, ['a']);
});
