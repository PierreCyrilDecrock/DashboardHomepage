import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from './defaultState.js';
import { dashboardStateSchema, describeZodError, layoutSchema, storedDataSchema, widgetInstanceSchema } from './schemas.js';

const instance = (over = {}) => ({
  id: 'i1',
  type: 'todo',
  layout: { x: 0, y: 0, w: 4, h: 4 },
  settings: { a: 1 },
  version: 1,
  ...over,
});

test('l\'état par défaut est valide : une page « Principal » vide, thème système', () => {
  const state = createDefaultState(() => 'p1');
  assert.equal(dashboardStateSchema.safeParse(state).success, true);
  assert.deepEqual(state, { version: 2, theme: 'system', preferences: { singleKeyShortcuts: true }, activePageId: 'p1', pages: [{ id: 'p1', name: 'Principal', instances: [] }] });
});

test('instance : champs obligatoires et types', () => {
  assert.equal(widgetInstanceSchema.safeParse(instance()).success, true);
  assert.equal(widgetInstanceSchema.safeParse(instance({ title: 'Courses' })).success, true);
  for (const bad of [
    { id: '' },
    { type: 3 },
    { layout: { x: -1, y: 0, w: 1, h: 1 } },
    { layout: { x: 0, y: 0, w: 0, h: 1 } },
    { layout: { x: 0.5, y: 0, w: 1, h: 1 } },
    { version: 0 },
    { title: 5 },
  ]) {
    assert.equal(widgetInstanceSchema.safeParse(instance(bad)).success, false, JSON.stringify(bad));
  }
});

test('les champs inconnus sont tolérés et conservés', () => {
  const parsed = widgetInstanceSchema.parse(instance({ futur: { a: 1 } }));
  assert.deepEqual(parsed.futur, { a: 1 });
  assert.equal(layoutSchema.safeParse({ x: 0, y: 0, w: 1, h: 1, z: 9 }).success, true);
  const state = createDefaultState(() => 'p');
  assert.equal(dashboardStateSchema.parse({ ...state, preferences: { singleKeyShortcuts: false, x: 1 } }).preferences.x, 1);
  assert.equal(dashboardStateSchema.safeParse({ ...state, preferences: { singleKeyShortcuts: 'oui' } }).success, false);
  assert.equal(dashboardStateSchema.safeParse({ ...state, preferences: undefined }).success, false);
});

test('état : thème, page active et au moins une page', () => {
  const base = createDefaultState(() => 'p');
  assert.equal(dashboardStateSchema.safeParse({ ...base, theme: 'bleu' }).success, false);
  assert.equal(dashboardStateSchema.safeParse({ ...base, pages: [] }).success, false);
  assert.equal(dashboardStateSchema.safeParse({ ...base, activePageId: '' }).success, false);
  assert.equal(dashboardStateSchema.safeParse({ ...base, version: 'x' }).success, false);
  for (const theme of ['light', 'dark', 'system']) assert.equal(dashboardStateSchema.safeParse({ ...base, theme }).success, true);
});

test('StoredData : le contenu est quelconque mais le champ data est obligatoire', () => {
  assert.equal(storedDataSchema.safeParse({ version: 1, data: { tasks: [] }, updatedAt: 5 }).success, true);
  assert.equal(storedDataSchema.safeParse({ version: 1, data: null, updatedAt: 5 }).success, true);
  assert.equal(storedDataSchema.safeParse({ version: 1, updatedAt: 5 }).success, false);
  assert.equal(storedDataSchema.safeParse({ version: 1, data: {}, updatedAt: 'hier' }).success, false);
  assert.equal(storedDataSchema.safeParse('texte').success, false);
});

test('describeZodError : chemin et message', () => {
  const r = dashboardStateSchema.safeParse({ ...createDefaultState(() => 'p'), theme: 'bleu' });
  assert.ok(!r.success);
  assert.match(describeZodError(r.error), /^theme : /);
});
