import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { z } from '../../lib/vendor.js';
import { createDefaultState } from '../storage/defaultState.js';
import { createDashboardStore, selectInstances } from '../store/dashboardStore.js';
import { createDataStore } from '../store/dataStore.js';
import { reconcile } from './reconcile.js';

beforeEach(() => mock.method(console, 'error', () => {}));

const instance = (id, over = {}) => ({ id, type: 'note', layout: { x: 0, y: 0, w: 3, h: 3 }, settings: { title: 'T' }, version: 1, ...over });

/** Définition v2 : v1 avait { title } et { text } ; v2 a { heading } et { text, words }. */
const noteV2 = {
  type: 'note',
  version: 2,
  settingsSchema: z.object({ heading: z.string() }),
  defaultSettings: { heading: '' },
  dataSchema: z.object({ text: z.string(), words: z.number() }),
  defaultData: { text: '', words: 0 },
  migrate: (old, from) => {
    assert.equal(from, 1);
    return { settings: { heading: old.settings.title }, data: { text: old.data.text, words: old.data.text.split(' ').length } };
  },
};
const noteV1 = { ...noteV2, version: 1, migrate: undefined, settingsSchema: z.object({ title: z.string() }), defaultSettings: { title: '' }, dataSchema: z.object({ text: z.string() }), defaultData: { text: '' } };

function setup(instances, entries = {}) {
  const dashboardStore = createDashboardStore(createDefaultState(() => 'p1'));
  for (const i of instances) dashboardStore.addInstance(i);
  const dataStore = createDataStore({ now: () => 99 });
  dataStore.replaceAll(entries);
  return { dashboardStore, dataStore };
}
const defs = (...list) => (type) => list.find((d) => d.type === type);

test('reconcile : type inconnu → rien n\'est modifié (ni disposition, ni données)', () => {
  const entries = { a: { version: 7, data: { n: 1 }, updatedAt: 1 } };
  const { dashboardStore, dataStore } = setup([instance('a', { type: 'inexistant', version: 7 })], entries);
  const before = dashboardStore.getState();
  const report = reconcile({ dashboardStore, dataStore, getDefinition: defs(noteV2), invalidInstanceIds: ['a'] });
  assert.equal(dashboardStore.getState(), before);
  assert.equal(dataStore.getData('a'), entries.a);
  assert.deepEqual(report, { migrated: [], reset: [], initialized: [], failed: [] });
});

test('reconcile : version plus ancienne → migrate, résultat validé et version mise à jour', () => {
  const { dashboardStore, dataStore } = setup([instance('a')], { a: { version: 1, data: { text: 'un deux trois' }, updatedAt: 1 } });
  const report = reconcile({ dashboardStore, dataStore, getDefinition: defs(noteV2), now: () => 99 });
  assert.deepEqual(report.migrated, ['a']);
  const [a] = selectInstances(dashboardStore.getState());
  assert.deepEqual(a.settings, { heading: 'T' });
  assert.equal(a.version, 2);
  assert.deepEqual(dataStore.getData('a'), { version: 2, data: { text: 'un deux trois', words: 3 }, updatedAt: 99 });
});

test('reconcile : version à jour → rien ne change', () => {
  const entry = { version: 2, data: { text: 'x', words: 1 }, updatedAt: 1 };
  const { dashboardStore, dataStore } = setup([instance('a', { version: 2, settings: { heading: 'H' } })], { a: entry });
  const before = dashboardStore.getState();
  const report = reconcile({ dashboardStore, dataStore, getDefinition: defs(noteV2) });
  assert.equal(dashboardStore.getState(), before);
  assert.equal(dataStore.getData('a'), entry);
  assert.deepEqual(report, { migrated: [], reset: [], initialized: [], failed: [] });
});

test('reconcile : migrate qui échoue (exception, forme, schéma) → instance et données intactes, échec signalé', () => {
  const cases = [
    () => { throw new Error('boum'); },
    () => 'pas un objet',
    () => ({ settings: { heading: 3 }, data: { text: '', words: 0 } }),
    () => ({ settings: { heading: 'ok' }, data: { text: 5, words: 0 } }),
  ];
  for (const migrate of cases) {
    const entry = { version: 1, data: { text: 'x' }, updatedAt: 1 };
    const { dashboardStore, dataStore } = setup([instance('a')], { a: entry });
    const before = dashboardStore.getState();
    const report = reconcile({ dashboardStore, dataStore, getDefinition: defs({ ...noteV2, migrate }) });
    assert.equal(report.migrated.length, 0);
    assert.equal(report.failed.length, 1);
    assert.equal(report.failed[0].id, 'a');
    assert.equal(dashboardStore.getState(), before);
    assert.equal(dataStore.getData('a'), entry);
  }
});

test('reconcile : version ancienne sans migrate → laissé tel quel', () => {
  const entry = { version: 1, data: { text: 'x' }, updatedAt: 1 };
  const { dashboardStore, dataStore } = setup([instance('a')], { a: entry });
  const def = { ...noteV2, migrate: undefined };
  const report = reconcile({ dashboardStore, dataStore, getDefinition: defs(def) });
  assert.deepEqual(report.migrated, []);
  assert.equal(dataStore.getData('a'), entry);
});

test('reconcile : données signalées invalides par hydrate → defaultData ; absentes → initialisées', () => {
  const { dashboardStore, dataStore } = setup([instance('inv'), instance('vide')], {});
  const report = reconcile({ dashboardStore, dataStore, getDefinition: defs(noteV1), invalidInstanceIds: ['inv'], now: () => 99 });
  assert.deepEqual(report.reset, ['inv']);
  assert.deepEqual(report.initialized, ['vide']);
  assert.deepEqual(dataStore.getData('inv'), { version: 1, data: { text: '' }, updatedAt: 99 });
  assert.deepEqual(dataStore.getData('vide').data, { text: '' });
  assert.notEqual(dataStore.getData('inv').data, noteV1.defaultData);
});

test('reconcile : instance migrée dont les données étaient invalides → migrate reçoit data undefined', () => {
  let seen = 'jamais appelé';
  const def = { ...noteV2, migrate: (old) => { seen = old.data; return { settings: { heading: 'h' }, data: { text: '', words: 0 } }; } };
  const { dashboardStore, dataStore } = setup([instance('a')], {});
  const report = reconcile({ dashboardStore, dataStore, getDefinition: defs(def), invalidInstanceIds: ['a'] });
  assert.equal(seen, undefined);
  assert.deepEqual(report.migrated, ['a']);
});

test('reconcile : en lecture seule, rien n\'est modifié', () => {
  const { dashboardStore, dataStore } = setup([instance('a')], {});
  const before = dashboardStore.getState();
  const report = reconcile({ dashboardStore, dataStore, getDefinition: defs(noteV2), readOnly: true });
  assert.equal(dashboardStore.getState(), before);
  assert.equal(dataStore.getData('a'), undefined);
  assert.deepEqual(report, { migrated: [], reset: [], initialized: [], failed: [] });
});
