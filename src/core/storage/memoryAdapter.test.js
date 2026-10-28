import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryAdapter } from './memoryAdapter.js';

test('même contrat que l\'adaptateur localStorage : préfixe, keys triées, remove', async () => {
  const a = createMemoryAdapter();
  assert.equal(await a.get('dash:state'), null);
  await a.set('dash:data:b', '2');
  await a.set('dash:data:a', '1');
  await a.set('dash:state', 's');
  assert.deepEqual(await a.keys('dash:data:'), ['dash:data:a', 'dash:data:b']);
  assert.equal(await a.get('dash:data:a'), '1');
  await a.remove('dash:data:a');
  assert.equal(await a.get('dash:data:a'), null);
  await assert.rejects(a.set('state', 'x'), /Clé refusée/);
  await assert.rejects(a.get('state'), /Clé refusée/);
});

test('simulateExternalChange : modifie et prévient les abonnés', () => {
  const a = createMemoryAdapter();
  const seen = [];
  const off = a.subscribe((key) => seen.push(key));
  a.simulateExternalChange('dash:state', '{}');
  assert.deepEqual(a.dump(), { 'dash:state': '{}' });
  a.simulateExternalChange('dash:state', null);
  assert.deepEqual(a.dump(), {});
  off();
  a.simulateExternalChange('dash:state', 'x');
  assert.deepEqual(seen, ['dash:state', 'dash:state']);
});

test('le contenu initial est chargé', async () => {
  const a = createMemoryAdapter({ initial: { 'dash:state': 'x' } });
  assert.equal(await a.get('dash:state'), 'x');
});
