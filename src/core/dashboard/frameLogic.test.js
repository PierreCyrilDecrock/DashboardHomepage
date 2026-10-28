import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from '../../lib/vendor.js';
import { applyDataUpdate, resolveValue } from './frameLogic.js';

const schema = z.object({ count: z.number().int() });
const fallback = { count: 0 };

test('resolveValue : valeur valide renvoyée (validée)', () => {
  const r = resolveValue(schema, { count: 3 }, fallback);
  assert.deepEqual(r, { value: { count: 3 }, valid: true });
});

test('resolveValue : rien d\'enregistré → valeur par défaut, sans être une erreur, et copie indépendante', () => {
  const r = resolveValue(schema, undefined, fallback);
  assert.equal(r.valid, true);
  assert.deepEqual(r.value, fallback);
  assert.notEqual(r.value, fallback);
});

test('resolveValue : contenu invalide → valeur par défaut, valid=false, raison lisible', () => {
  const r = resolveValue(schema, { count: 'beaucoup' }, fallback);
  assert.equal(r.valid, false);
  assert.deepEqual(r.value, fallback);
  assert.match(r.reason, /^count : /);
  assert.equal(resolveValue(schema, 'texte', fallback).valid, false);
  assert.equal(resolveValue(schema, null, fallback).valid, false);
});

test('applyDataUpdate : met à jour avec le résultat validé', () => {
  const r = applyDataUpdate(schema, { count: 1 }, (d) => ({ count: d.count + 1 }));
  assert.deepEqual(r, { ok: true, data: { count: 2 } });
});

test('applyDataUpdate : même référence → null (rien à faire)', () => {
  const current = { count: 1 };
  assert.equal(applyDataUpdate(schema, current, (d) => d), null);
});

test('applyDataUpdate : résultat invalide refusé avec une raison', () => {
  const r = applyDataUpdate(schema, { count: 1 }, () => ({ count: 1.5 }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /count/);
});
