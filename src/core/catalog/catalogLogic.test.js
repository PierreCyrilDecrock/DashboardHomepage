import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countByType, describeCount, filterDefinitions, groupByCategory, normalize } from './catalogLogic.js';

const defs = [
  { type: 'clock', name: 'Heure', description: 'Heure, date et fuseaux horaires.', category: 'temps' },
  { type: 'todo', name: 'Todo', description: 'Liste de tâches à cocher.', category: 'organisation' },
  { type: 'links', name: 'Raccourcis', description: 'Tes sites préférés en un clic.', category: 'liens' },
  { type: 'timer', name: 'Minuteur', description: 'Compte à rebours et chronomètre.', category: 'focus' },
  { type: 'agenda', name: 'Agenda', description: 'Les événements du jour.', category: 'temps' },
];

test('normalize : minuscules, sans accents, sans espaces autour', () => {
  assert.equal(normalize('  Événements À Venir '), 'evenements a venir');
  assert.equal(normalize(undefined), '');
});

test('filterDefinitions : par nom ou description, sans tenir compte des accents ni de la casse', () => {
  assert.deepEqual(filterDefinitions(defs, 'heure').map((d) => d.type), ['clock']);
  assert.deepEqual(filterDefinitions(defs, 'TACHES').map((d) => d.type), ['todo']);
  assert.deepEqual(filterDefinitions(defs, 'evenement').map((d) => d.type), ['agenda']);
  assert.deepEqual(filterDefinitions(defs, 'cli').map((d) => d.type), ['links']);
});

test('filterDefinitions : plusieurs mots (tous requis), recherche vide = tout, aucun résultat = liste vide', () => {
  assert.deepEqual(filterDefinitions(defs, 'compte rebours').map((d) => d.type), ['timer']);
  assert.deepEqual(filterDefinitions(defs, 'compte tâches'), []);
  assert.equal(filterDefinitions(defs, '   ').length, 5);
  assert.equal(filterDefinitions(defs, '').length, 5);
  assert.deepEqual(filterDefinitions(defs, 'zzz'), []);
});

test('groupByCategory : ordre temps, organisation, liens, focus ; catégories vides omises', () => {
  const groups = groupByCategory(defs);
  assert.deepEqual(groups.map((g) => g.category), ['temps', 'organisation', 'liens', 'focus']);
  assert.deepEqual(groups.map((g) => g.label), ['Temps', 'Organisation', 'Liens', 'Focus']);
  assert.deepEqual(groups[0].items.map((d) => d.type), ['clock', 'agenda']);
  assert.deepEqual(groupByCategory(defs.filter((d) => d.category === 'focus')).map((g) => g.category), ['focus']);
  assert.deepEqual(groupByCategory([]), []);
});

test('countByType : exemplaires par type, toutes pages confondues ; describeCount', () => {
  const inst = (id, type) => ({ id, type, layout: { x: 0, y: 0, w: 1, h: 1 }, settings: {}, version: 1 });
  const state = {
    version: 1, theme: 'system', activePageId: 'p1',
    pages: [
      { id: 'p1', name: 'A', instances: [inst('1', 'clock'), inst('2', 'clock'), inst('3', 'todo')] },
      { id: 'p2', name: 'B', instances: [inst('4', 'clock')] },
    ],
  };
  assert.deepEqual(countByType(state), { clock: 3, todo: 1 });
  assert.equal(describeCount(2), '2 sur le dashboard');
  assert.equal(describeCount(1), '1 sur le dashboard');
  assert.equal(describeCount(0), 'Pas encore ajouté');
});
