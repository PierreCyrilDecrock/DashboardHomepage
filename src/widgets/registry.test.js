import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from '../lib/vendor.js';
import manifest from './manifest.js';
import { getDefinition, listByCategory, listDefinitions, loadRegistry, registryErrors, resetRegistry } from './registry.js';
import { defineWidget } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));

const make = (type, over = {}) =>
  defineWidget({
    type,
    name: type,
    description: 'test',
    icon: 'clock',
    category: 'temps',
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 1 },
    settingsSchema: z.object({}),
    defaultSettings: {},
    dataSchema: z.object({}),
    defaultData: {},
    version: 1,
    Component: () => null,
    ...over,
  });

/** Chargeur de test : nom → module (ou erreur). */
const loaderFor = (modules) => async (name) => {
  const m = modules[name];
  if (m instanceof Error) throw m;
  if (m === undefined) throw new Error('Cannot find module');
  return m;
};

beforeEach(() => {
  resetRegistry();
  mock.method(console, 'error', () => {});
});

test('les widgets du manifeste sont découverts par le chargeur par défaut', async () => {
  const { definitions, errors } = await loadRegistry();
  assert.deepEqual(errors, []);
  assert.deepEqual(definitions.map((d) => d.type), manifest);
  assert.equal(getDefinition('timer').name, 'Minuteur');
  assert.equal(getDefinition('demo'), undefined, 'le widget de démonstration a été retiré');
  assert.equal(listDefinitions().length, manifest.length);
  assert.equal(getDefinition('inexistant'), undefined);
});

test('listByCategory : toutes les catégories sont présentes', async () => {
  await loadRegistry(loaderFor({ a: { definition: make('a') }, b: { definition: make('b', { category: 'liens' }) } }), ['a', 'b']);
  const groups = listByCategory();
  assert.deepEqual(Object.keys(groups).sort(), ['focus', 'liens', 'organisation', 'temps']);
  assert.deepEqual(groups.temps.map((d) => d.type), ['a']);
  assert.deepEqual(groups.liens.map((d) => d.type), ['b']);
  assert.deepEqual(groups.focus, []);
});

test('l\'ordre du manifeste est conservé', async () => {
  const modules = Object.fromEntries(['c', 'a', 'b'].map((n) => [n, { definition: make(n) }]));
  await loadRegistry(loaderFor(modules), ['c', 'a', 'b']);
  assert.deepEqual(listDefinitions().map((d) => d.type), ['c', 'a', 'b']);
});

test('type dupliqué dans le manifeste : erreur explicite, la première définition est gardée', async () => {
  const { errors } = await loadRegistry(loaderFor({ a: { definition: make('a') } }), ['a', 'a']);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /plusieurs fois.*type en double/);
  assert.deepEqual(listDefinitions().map((d) => d.type), ['a']);
});

test('identifiant de dossier invalide : signalé, sans charger le module', async () => {
  let called = 0;
  const { errors } = await loadRegistry(async () => { called++; return { definition: make('ok') }; }, ['Mauvais Nom']);
  assert.equal(called, 0);
  assert.match(errors[0].message, /Nom de dossier invalide/);
  assert.equal(listDefinitions().length, 0);
});

test('le type doit être égal au nom du dossier', async () => {
  const { errors } = await loadRegistry(loaderFor({ a: { definition: make('autre') } }), ['a']);
  assert.match(errors[0].message, /doit être égal au nom de son dossier/);
  assert.equal(getDefinition('autre'), undefined);
});

test('un module sans « definition » est signalé', async () => {
  const { errors } = await loadRegistry(loaderFor({ a: {} , b: { definition: null } }), ['a', 'b']);
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /n'exporte pas « definition »/);
});

test('un widget défaillant est isolé : les autres se chargent', async () => {
  const modules = {
    bon: { definition: make('bon') },
    casse: new Error('SyntaxError dans le module'),
    autre: { definition: make('autre') },
  };
  const { definitions, errors } = await loadRegistry(loaderFor(modules), ['bon', 'casse', 'autre']);
  assert.deepEqual(definitions.map((d) => d.type), ['bon', 'autre']);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].name, 'casse');
  assert.match(errors[0].message, /SyntaxError dans le module/);
  assert.deepEqual(registryErrors(), errors);
});

test('loadRegistry recommence à zéro à chaque appel ; resetRegistry vide tout', async () => {
  await loadRegistry(loaderFor({ a: { definition: make('a') } }), ['a']);
  await loadRegistry(loaderFor({ b: { definition: make('b') } }), ['b']);
  assert.deepEqual(listDefinitions().map((d) => d.type), ['b']);
  resetRegistry();
  assert.deepEqual(listDefinitions(), []);
  assert.deepEqual(registryErrors(), []);
});

test('manifeste cohérent avec les dossiers : chaque dossier avec un index.js est listé, et inversement', () => {
  const folders = readdirSync(here, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(here, e.name, 'index.js')))
    .map((e) => e.name)
    .sort();
  assert.deepEqual([...manifest].sort(), folders);
  assert.equal(new Set(manifest).size, manifest.length, 'doublon dans manifest.js');
});
