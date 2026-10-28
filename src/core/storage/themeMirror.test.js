import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readThemeMirror, writeThemeMirror } from './themeMirror.js';
import { createFakeStorage } from './fakeStorage.test.js';

test('le miroir est écrit sous dash:theme-mirror et relu', () => {
  const storage = createFakeStorage();
  assert.equal(readThemeMirror(storage), null);
  writeThemeMirror('dark', storage);
  assert.equal(storage.getItem('dash:theme-mirror'), 'dark');
  assert.equal(readThemeMirror(storage), 'dark');
  writeThemeMirror('system', storage);
  assert.equal(readThemeMirror(storage), 'system');
  assert.equal(storage.length, 1);
});

test('un stockage refusé, plein ou absent ne fait jamais planter', () => {
  const broken = createFakeStorage();
  broken.setItem = () => {
    throw new Error('refusé');
  };
  broken.getItem = () => {
    throw new Error('refusé');
  };
  assert.doesNotThrow(() => writeThemeMirror('dark', broken));
  assert.equal(readThemeMirror(broken), null);
  assert.doesNotThrow(() => writeThemeMirror('dark', undefined));
  assert.equal(readThemeMirror(undefined), null);
});
