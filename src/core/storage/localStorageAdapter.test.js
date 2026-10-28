import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStorageAdapter, isLocalStorageUsable } from './localStorageAdapter.js';
import { createFakeStorage } from './fakeStorage.test.js';
import { StorageFullError } from './StorageAdapter.js';

test('lecture, écriture, suppression et liste des clés', async () => {
  const storage = createFakeStorage();
  const a = createLocalStorageAdapter('dash:', { storage });
  assert.equal(await a.get('dash:state'), null);
  await a.set('dash:state', '{}');
  await a.set('dash:data:2', 'b');
  await a.set('dash:data:1', 'a');
  assert.equal(await a.get('dash:state'), '{}');
  assert.deepEqual(await a.keys('dash:data:'), ['dash:data:1', 'dash:data:2']);
  await a.remove('dash:data:1');
  assert.deepEqual(await a.keys('dash:data:'), ['dash:data:2']);
});

test('refuse toute clé sans le préfixe, sans rien écrire ni toucher aux autres clés', async () => {
  const storage = createFakeStorage();
  storage.setItem('autre-site:cle', 'intacte');
  const a = createLocalStorageAdapter('dash:', { storage });
  await assert.rejects(a.set('state', 'x'), /ne commence pas par « dash: »/);
  await assert.rejects(a.get('autre-site:cle'), /Clé refusée/);
  await assert.rejects(a.remove('autre-site:cle'), /Clé refusée/);
  await assert.rejects(a.keys(''), /Clé refusée/);
  assert.equal(storage.getItem('autre-site:cle'), 'intacte');
  assert.equal(storage.getItem('state'), null);
});

test('keys ne renvoie que les clés du préfixe demandé, pas celles des autres sites', async () => {
  const storage = createFakeStorage();
  storage.setItem('autre:data:1', 'x');
  storage.setItem('dash:data:1', 'y');
  storage.setItem('dash:state', 'z');
  const a = createLocalStorageAdapter('dash:', { storage });
  assert.deepEqual(await a.keys('dash:'), ['dash:data:1', 'dash:state']);
});

test('un dépassement de quota devient StorageFullError', async () => {
  const storage = createFakeStorage({ quotaChars: 30 });
  const a = createLocalStorageAdapter('dash:', { storage });
  await a.set('dash:ok', 'petit');
  await assert.rejects(a.set('dash:gros', 'x'.repeat(100)), (err) => {
    assert.ok(err instanceof StorageFullError);
    assert.equal(err.name, 'StorageFullError');
    return true;
  });
  assert.equal(await a.get('dash:ok'), 'petit');
});

test('les autres erreurs d\'écriture ne sont pas prises pour un quota', async () => {
  const storage = createFakeStorage();
  storage.setItem = () => {
    throw new DOMException('refusé', 'SecurityError');
  };
  const a = createLocalStorageAdapter('dash:', { storage });
  await assert.rejects(a.set('dash:x', '1'), (err) => !(err instanceof StorageFullError) && err.name === 'SecurityError');
});

test('subscribe : prévient pour les clés dash: modifiées ailleurs, se désabonne', () => {
  const target = new EventTarget();
  const a = createLocalStorageAdapter('dash:', { storage: createFakeStorage(), target });
  const seen = [];
  const unsubscribe = a.subscribe((key) => seen.push(key));
  const fire = (key) => target.dispatchEvent(Object.assign(new Event('storage'), { key }));
  fire('dash:state');
  fire('autre-site:cle');
  fire(null);
  fire('dash:data:7');
  assert.deepEqual(seen, ['dash:state', 'dash:data:7']);
  unsubscribe();
  fire('dash:state');
  assert.equal(seen.length, 2);
});

test('isLocalStorageUsable : essai d\'écriture, quota plein ou accès refusé', () => {
  assert.equal(isLocalStorageUsable(createFakeStorage()), true);
  assert.equal(isLocalStorageUsable(createFakeStorage({ quotaChars: 3 })), false);
  assert.equal(isLocalStorageUsable(undefined), false);
  const refused = createFakeStorage();
  refused.setItem = () => {
    throw new DOMException('refusé', 'SecurityError');
  };
  assert.equal(isLocalStorageUsable(refused), false);
});

test('isLocalStorageUsable : n\'laisse aucune clé de sonde', () => {
  const storage = createFakeStorage();
  isLocalStorageUsable(storage);
  assert.equal(storage.length, 0);
});
