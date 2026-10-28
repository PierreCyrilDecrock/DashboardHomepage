import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newId } from './id.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('newId : UUID v4 valides et différents', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, UUID);
});

test('newId : repli quand crypto.randomUUID n\'existe pas (contexte non sécurisé)', () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues: original.getRandomValues.bind(original) },
  });
  try {
    assert.match(newId(), UUID);
  } finally {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original });
  }
});
