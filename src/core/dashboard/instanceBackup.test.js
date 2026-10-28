import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryAdapter } from '../storage/memoryAdapter.js';
import { backupInstance, configureInstanceBackup } from './instanceBackup.js';

beforeEach(() => configureInstanceBackup(null));

test('backupInstance : sans stockage branché, ne fait rien', async () => {
  assert.equal(await backupInstance('a', { x: 1 }), false);
});

test('backupInstance : écrit le contenu en JSON sous dash:backup:<id>, en remplaçant la copie précédente', async () => {
  const adapter = createMemoryAdapter();
  configureInstanceBackup(adapter);
  assert.equal(await backupInstance('a', { data: { count: 1 } }), true);
  assert.deepEqual(JSON.parse(adapter.dump()['dash:backup:a']), { data: { count: 1 } });
  await backupInstance('a', { data: { count: 2 } });
  assert.deepEqual(JSON.parse(adapter.dump()['dash:backup:a']), { data: { count: 2 } });
  assert.deepEqual(Object.keys(adapter.dump()), ['dash:backup:a']);
});

test('backupInstance : jamais d\'écriture en lecture seule', async () => {
  const adapter = createMemoryAdapter();
  configureInstanceBackup(adapter, () => true);
  assert.equal(await backupInstance('a', { x: 1 }), false);
  assert.deepEqual(adapter.dump(), {});
});

test('backupInstance : une écriture qui échoue ne plante pas', async () => {
  const adapter = createMemoryAdapter();
  adapter.set = async () => { throw new Error('plein'); };
  configureInstanceBackup(adapter);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await backupInstance('a', {}), false);
  } finally {
    console.warn = warn;
  }
});
