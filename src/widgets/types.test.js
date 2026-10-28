import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from '../lib/vendor.js';
import { checkWidgetDefinition, defineWidget } from './types.js';

/** Définition valide, modifiable cas par cas. */
const valid = (over = {}) => ({
  type: 'exemple',
  name: 'Exemple',
  description: 'Un widget pour les tests.',
  icon: 'clock',
  category: 'temps',
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 1 },
  settingsSchema: z.object({ label: z.string() }),
  defaultSettings: { label: 'a' },
  dataSchema: z.object({ n: z.number() }),
  defaultData: { n: 0 },
  version: 1,
  Component: () => null,
  ...over,
});

test('defineWidget : une définition valide est renvoyée telle quelle', () => {
  const d = valid();
  assert.equal(defineWidget(d), d);
});

test('defineWidget : accepte migrate, SettingsPanel, cloneData et styleUrl', () => {
  const d = valid({ migrate: () => ({}), SettingsPanel: () => null, cloneData: (x) => x, styleUrl: new URL('https://x.test/s.css') });
  assert.equal(defineWidget(d), d);
  assert.deepEqual(checkWidgetDefinition(valid({ styleUrl: './style.css' })), []);
});

test('defineWidget : ce qui n\'est pas un objet est refusé', () => {
  for (const bad of [null, undefined, 'x', 3, []]) {
    assert.throws(() => defineWidget(/** @type {any} */ (bad)), /doit être un objet/);
  }
});

test('un champ obligatoire manquant est signalé', () => {
  for (const field of ['type', 'name', 'description', 'icon', 'category', 'defaultSize', 'minSize', 'settingsSchema', 'defaultSettings', 'dataSchema', 'defaultData', 'version', 'Component']) {
    const d = valid();
    delete d[field];
    const problems = checkWidgetDefinition(d);
    assert.ok(problems.some((p) => p.includes(`« ${field} »`) && p.includes('obligatoire')), `${field} : ${problems.join(' | ')}`);
  }
});

test('type : doit respecter /^[a-z][a-z0-9-]*$/', () => {
  for (const type of ['Todo', '1abc', 'a_b', 'a b', 'é', '-a', '']) {
    assert.ok(checkWidgetDefinition(valid({ type })).length > 0, JSON.stringify(type));
  }
  for (const type of ['todo', 'a1', 'mon-widget-2']) assert.deepEqual(checkWidgetDefinition(valid({ type })), [], type);
});

test('icône inconnue et catégorie inconnue sont refusées', () => {
  assert.match(checkWidgetDefinition(valid({ icon: 'fusée' })).join('\n'), /icône "fusée" n'existe pas/);
  assert.match(checkWidgetDefinition(valid({ icon: 'toString' })).join('\n'), /n'existe pas/);
  assert.match(checkWidgetDefinition(valid({ category: 'jeux' })).join('\n'), /category/);
});

test('tailles : entiers ≥ 1, et minSize pas plus grand que defaultSize', () => {
  assert.match(checkWidgetDefinition(valid({ defaultSize: { w: 1.5, h: 2 } })).join('\n'), /defaultSize/);
  assert.match(checkWidgetDefinition(valid({ minSize: { w: 0, h: 1 } })).join('\n'), /minSize/);
  assert.match(checkWidgetDefinition(valid({ defaultSize: { w: '3', h: 2 } })).join('\n'), /defaultSize/);
  assert.match(checkWidgetDefinition(valid({ minSize: { w: 4, h: 1 } })).join('\n'), /minSize.*plus grand/);
  assert.match(checkWidgetDefinition(valid({ minSize: { w: 1, h: 5 } })).join('\n'), /minSize.*plus grand/);
  assert.deepEqual(checkWidgetDefinition(valid({ minSize: { w: 3, h: 2 } })), []);
});

test('schémas : sans safeParse refusés ; valeurs par défaut qui ne passent pas leur schéma refusées', () => {
  assert.match(checkWidgetDefinition(valid({ settingsSchema: {} })).join('\n'), /settingsSchema.*safeParse/);
  assert.match(checkWidgetDefinition(valid({ dataSchema: 'x' })).join('\n'), /dataSchema.*safeParse/);
  assert.match(checkWidgetDefinition(valid({ defaultSettings: { label: 3 } })).join('\n'), /defaultSettings.*ne passe pas.*label/);
  assert.match(checkWidgetDefinition(valid({ defaultData: { n: 'x' } })).join('\n'), /defaultData.*ne passe pas.*n/);
});

test('version : entier ≥ 1', () => {
  for (const version of [0, -1, 1.5, '1', null]) {
    assert.match(checkWidgetDefinition(valid({ version })).join('\n'), /version/, String(version));
  }
});

test('Component, migrate, SettingsPanel, cloneData doivent être des fonctions', () => {
  assert.match(checkWidgetDefinition(valid({ Component: 'x' })).join('\n'), /Component.*fonction/);
  for (const field of ['migrate', 'SettingsPanel', 'cloneData']) {
    assert.match(checkWidgetDefinition(valid({ [field]: 'x' })).join('\n'), new RegExp(`${field}.*pas une fonction`));
  }
  assert.match(checkWidgetDefinition(valid({ styleUrl: 3 })).join('\n'), /styleUrl/);
});

test('defineWidget : UNE erreur qui liste TOUS les problèmes', () => {
  const d = valid({ type: 'Mauvais', name: '', category: 'x', version: 0, Component: 3, defaultData: { n: 'x' } });
  delete d.description;
  let message = '';
  try {
    defineWidget(d);
  } catch (err) {
    message = err.message;
  }
  assert.match(message, /Définition de widget « Mauvais » invalide \(7 problèmes\)/);
  for (const part of ['type', 'name', 'description', 'category', 'version', 'Component', 'defaultData']) {
    assert.ok(message.includes(`« ${part} »`), `${part} absent de : ${message}`);
  }
  assert.equal(message.split('\n').length, 8);
});

test('un schéma qui plante sur la valeur par défaut est signalé sans arrêter le contrôle', () => {
  const boom = { safeParse: () => { throw new Error('boum'); } };
  const problems = checkWidgetDefinition(valid({ settingsSchema: boom, version: 0 }));
  assert.ok(problems.some((p) => p.includes('boum')));
  assert.ok(problems.some((p) => p.includes('version')));
});
