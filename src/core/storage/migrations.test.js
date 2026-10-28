import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateState, stateMigrations } from './migrations.js';

const m12 = { from: 1, to: 2, migrate: (s) => ({ ...s, preferences: { singleKeyShortcuts: true } }) };
const m23 = { from: 2, to: 3, migrate: (s) => ({ ...s, extra: 'x' }) };

test('migration 1 → 2 : ajoute les préférences par défaut sans rien perdre', () => {
  assert.deepEqual(stateMigrations.map((m) => [m.from, m.to]), [[1, 2]]);
  const raw = { version: 1, theme: 'dark', activePageId: 'p', pages: [{ id: 'p', name: 'Principal', instances: [] }], futur: 7 };
  const r = migrateState(raw, 1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, { ...raw, version: 2, preferences: { singleKeyShortcuts: true } });
  assert.equal(raw.version, 1, 'l\'état d\'origine n\'est pas modifié');
});

test('migration 1 → 2 : des préférences déjà présentes sont conservées', () => {
  const r = migrateState({ version: 1, preferences: { singleKeyShortcuts: false, autre: 1 } }, 1);
  assert.deepEqual(r.state.preferences, { singleKeyShortcuts: false, autre: 1 });
});

test('à la version courante, rien à faire', () => {
  const raw = { version: 2 };
  assert.deepEqual(migrateState(raw, 2), { ok: true, state: raw });
});

test('les migrations s\'enchaînent dans l\'ordre et fixent la version', () => {
  const r = migrateState({ version: 1, theme: 'dark' }, 1, 3, [m23, m12]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, { version: 3, theme: 'dark', preferences: { singleKeyShortcuts: true }, extra: 'x' });
});

test('une migration manquante est signalée', () => {
  const r = migrateState({ version: 1 }, 1, 3, [m12]);
  assert.deepEqual(r, { ok: false, error: 'aucune migration depuis la version 2' });
});

test('une migration qui échoue est signalée sans lancer d\'exception', () => {
  const boom = { from: 1, to: 2, migrate: () => { throw new Error('oups'); } };
  const r = migrateState({ version: 1 }, 1, 2, [boom]);
  assert.equal(r.ok, false);
  assert.match(r.error, /1 → 2 a échoué : oups/);
});

test('partir d\'une version intermédiaire n\'applique que la suite', () => {
  const r = migrateState({ version: 2 }, 2, 3, [m12, m23]);
  assert.deepEqual(r.state, { version: 3, extra: 'x' });
});
