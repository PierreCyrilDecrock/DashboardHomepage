import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from '../../lib/vendor.js';
import { widgetInstanceSchema } from '../storage/schemas.js';
import { createDataStore } from '../store/dataStore.js';
import { createDashboardStore } from '../store/dashboardStore.js';
import { createDefaultState } from '../storage/defaultState.js';
import { NEW_INSTANCE_Y, createInstance } from './createInstance.js';

const definition = {
  type: 'exemple',
  defaultSize: { w: 4, h: 3 },
  defaultSettings: { label: 'a', tags: ['x'] },
  defaultData: { items: [1, 2] },
  version: 3,
  settingsSchema: z.object({}),
  dataSchema: z.object({}),
};

test('createInstance : UUID, taille par défaut, position très basse, réglages et version', () => {
  const dataStore = createDataStore();
  const instance = createInstance(/** @type {any} */ (definition), { dataStore });
  assert.match(instance.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(instance.type, 'exemple');
  assert.deepEqual(instance.layout, { x: 0, y: NEW_INSTANCE_Y, w: 4, h: 3 });
  assert.equal(NEW_INSTANCE_Y, 1000);
  assert.deepEqual(instance.settings, { label: 'a', tags: ['x'] });
  assert.equal(instance.version, 3);
  assert.equal(widgetInstanceSchema.safeParse(instance).success, true);
});

test('createInstance : initialise les données par défaut dans le dataStore, avec la version de la définition', () => {
  const dataStore = createDataStore({ now: () => 5 });
  const instance = createInstance(/** @type {any} */ (definition), { dataStore });
  assert.deepEqual(dataStore.getData(instance.id), { version: 3, data: { items: [1, 2] }, updatedAt: 5 });
});

test('createInstance : copies indépendantes (ni les réglages ni les données ne sont partagés avec la définition)', () => {
  const dataStore = createDataStore();
  const a = createInstance(/** @type {any} */ (definition), { dataStore });
  const b = createInstance(/** @type {any} */ (definition), { dataStore });
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.settings, definition.defaultSettings);
  assert.notEqual(dataStore.getData(a.id).data, definition.defaultData);
  assert.notEqual(dataStore.getData(a.id).data, dataStore.getData(b.id).data);
  a.settings.tags.push('y');
  assert.deepEqual(definition.defaultSettings.tags, ['x']);
});

test('createInstance : l\'instance s\'ajoute à la disposition avec dashboardStore.addInstance', () => {
  const dataStore = createDataStore();
  const dashboard = createDashboardStore(createDefaultState(() => 'p1'));
  const instance = createInstance(/** @type {any} */ (definition), { dataStore, generateId: () => 'id-fixe' });
  dashboard.addInstance(instance);
  assert.equal(dashboard.getState().pages[0].instances[0].id, 'id-fixe');
});
