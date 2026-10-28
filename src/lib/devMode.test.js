import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDevMode } from './devMode.js';

test('isDevMode : seulement avec ?dev=1', () => {
  assert.equal(isDevMode('?dev=1'), true);
  assert.equal(isDevMode('?a=2&dev=1'), true);
  assert.equal(isDevMode(''), false);
  assert.equal(isDevMode('?dev=0'), false);
  assert.equal(isDevMode('?dev'), false);
});

test('isDevMode : sans argument, lit l\'adresse de la page (absente sous Node)', () => {
  assert.equal(isDevMode(), false);
});

test('countRender : compte par instance, ne fait rien hors mode développement', async () => {
  const { countRender } = await import('./devMode.js');
  const env = { __dash: { renders: {} } };
  countRender('a', env);
  countRender('a', env);
  countRender('b', env);
  assert.deepEqual(env.__dash.renders, { a: 2, b: 1 });
  assert.doesNotThrow(() => countRender('a', {}));
  assert.doesNotThrow(() => countRender('a', { __dash: {} }));
  assert.doesNotThrow(() => countRender('a', null));
});
