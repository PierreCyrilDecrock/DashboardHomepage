import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_PREFIX, backupKey, dataKey, instanceIdFromDataKey } from './keys.js';

test('clés : toutes commencent par dash:', () => {
  assert.equal(KEY_PREFIX, 'dash:');
  assert.equal(dataKey('abc'), 'dash:data:abc');
  assert.equal(backupKey('abc'), 'dash:backup:abc');
});

test('instanceIdFromDataKey : identifiant des clés dash:data:*, null sinon', () => {
  assert.equal(instanceIdFromDataKey('dash:data:abc'), 'abc');
  assert.equal(instanceIdFromDataKey('dash:data:'), null);
  assert.equal(instanceIdFromDataKey('dash:state'), null);
  assert.equal(instanceIdFromDataKey('dash:backup:abc'), null);
});
