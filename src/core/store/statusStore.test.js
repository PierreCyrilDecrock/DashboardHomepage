import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatusStore } from './statusStore.js';

test('statusStore : trois indicateurs faux et aucun avis au départ', () => {
  const s = createStatusStore();
  assert.deepEqual(s.getState(), { storageFull: false, readOnly: false, storageUnavailable: false, resetNotice: null });
  s.setState({ storageFull: true });
  assert.equal(s.getState().storageFull, true);
  assert.equal(s.getState().readOnly, false);
});
