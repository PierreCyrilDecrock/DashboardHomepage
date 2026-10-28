import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTabTitle } from './tabTitle.js';

const make = (title = 'Dashboard Homepage') => {
  const doc = { title };
  return { doc, tabs: createTabTitle(doc) };
};

test('rien d\'enregistré : le titre d\'origine reste intact', () => {
  const { doc } = make();
  assert.equal(doc.title, 'Dashboard Homepage');
});

test('une minuterie : « mm:ss · Minuteur », ou son libellé', () => {
  const { doc, tabs } = make();
  tabs.registerTitle('a', 252_000);
  assert.equal(doc.title, '04:12 · Minuteur');
  tabs.registerTitle('a', 251_000, 'Thé');
  assert.equal(doc.title, '04:11 · Thé');
  tabs.registerTitle('a', 3_725_000, '   ');
  assert.equal(doc.title, '1:02:05 · Minuteur', 'libellé vide : « Minuteur », h:mm:ss au-delà d\'une heure');
});

test('plusieurs minuteries : la plus proche de sa fin gagne', () => {
  const { doc, tabs } = make();
  tabs.registerTitle('long', 600_000, 'Four');
  tabs.registerTitle('court', 90_000, 'Œufs');
  assert.equal(doc.title, '01:30 · Œufs');
  tabs.registerTitle('long', 80_000, 'Four');
  assert.equal(doc.title, '01:20 · Four');
  tabs.registerTitle('court', 70_000, 'Œufs');
  assert.equal(doc.title, '01:10 · Œufs');
});

test('retirer une minuterie : on passe à l\'autre ; retirer la dernière rend le titre d\'origine', () => {
  const { doc, tabs } = make('Mon titre');
  tabs.registerTitle('a', 60_000, 'A');
  tabs.registerTitle('b', 30_000, 'B');
  tabs.clearTitle('b');
  assert.equal(doc.title, '01:00 · A');
  tabs.clearTitle('a');
  assert.equal(doc.title, 'Mon titre');
  tabs.clearTitle('a');
  assert.equal(doc.title, 'Mon titre', 'clearTitle est sans effet si la clé est inconnue');
});

test('le titre d\'origine est relevé une seule fois par série d\'enregistrements, puis relevé de nouveau', () => {
  const { doc, tabs } = make('Premier');
  tabs.registerTitle('a', 1000);
  tabs.registerTitle('a', 900);
  tabs.clearTitle('a');
  assert.equal(doc.title, 'Premier');
  doc.title = 'Second';
  tabs.registerTitle('a', 1000);
  tabs.clearTitle('a');
  assert.equal(doc.title, 'Second');
});

test('chaque créateur de registre est indépendant', () => {
  const one = make('Un');
  const two = make('Deux');
  one.tabs.registerTitle('a', 5000);
  assert.equal(two.doc.title, 'Deux');
});
