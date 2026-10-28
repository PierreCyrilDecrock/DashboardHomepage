import assert from 'node:assert/strict';
import test from 'node:test';
import { definition } from './index.js';
import { dataSchema, defaultData, defaultSettings, settingsSchema, taskSchema } from './schema.js';

const task = (over = {}) => ({ id: 'a', text: 'Écrire', done: false, createdAt: 1, doneAt: null, ...over });

test('la définition respecte le contrat', () => {
  assert.equal(definition.type, 'todo');
  assert.equal(definition.name, 'À faire');
  assert.equal(definition.category, 'organisation');
  assert.equal(definition.icon, 'square-check');
  assert.deepEqual(definition.defaultSize, { w: 4, h: 4 });
  assert.deepEqual(definition.minSize, { w: 3, h: 3 });
  assert.equal(definition.version, 1);
  assert.equal(typeof definition.SettingsPanel, 'function');
});

test('valeurs par défaut valides', () => {
  assert.deepEqual(defaultSettings, { showProgress: true, doneLast: true });
  assert.deepEqual(defaultData, { tasks: [] });
  assert.equal(settingsSchema.safeParse(defaultSettings).success, true);
  assert.equal(dataSchema.safeParse(defaultData).success, true);
});

test('réglages : booléens obligatoires', () => {
  assert.equal(settingsSchema.safeParse({ showProgress: 'oui', doneLast: true }).success, false);
  assert.equal(settingsSchema.safeParse({ showProgress: true }).success, false);
});

test('tâche : texte de 1 à 200 caractères, doneAt nombre ou null', () => {
  assert.equal(taskSchema.safeParse(task()).success, true);
  assert.equal(taskSchema.safeParse(task({ text: '' })).success, false);
  assert.equal(taskSchema.safeParse(task({ text: 'x'.repeat(200) })).success, true);
  assert.equal(taskSchema.safeParse(task({ text: 'x'.repeat(201) })).success, false);
  assert.equal(taskSchema.safeParse(task({ done: true, doneAt: 5 })).success, true);
  assert.equal(taskSchema.safeParse(task({ doneAt: undefined })).success, false);
  assert.equal(taskSchema.safeParse(task({ done: 'non' })).success, false);
});

test('les champs inconnus sont conservés (évolutions futures)', () => {
  const parsed = dataSchema.safeParse({ tasks: [task({ priority: 'haute' })], futur: 1 });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.tasks[0].priority, 'haute');
  assert.equal(parsed.data.futur, 1);
});

test('des données invalides sont refusées (le cadre retombera sur les valeurs par défaut)', () => {
  assert.equal(dataSchema.safeParse({ tasks: 'rien' }).success, false);
  assert.equal(dataSchema.safeParse({ tasks: [task({ text: 42 })] }).success, false);
  assert.equal(dataSchema.safeParse({}).success, false);
});
