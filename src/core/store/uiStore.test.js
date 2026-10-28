import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUiStore, isPanelOpen } from './uiStore.js';

test('uiStore : démarre hors du mode édition ; toggleEditing et setEditing', () => {
  const s = createUiStore();
  assert.deepEqual(s.getState(), { isEditing: false, catalogOpen: false, settingsFor: null, renameFor: null, dialog: null });
  s.toggleEditing();
  assert.equal(s.getState().isEditing, true);
  s.toggleEditing();
  assert.equal(s.getState().isEditing, false);
  s.setEditing(true);
  assert.equal(s.getState().isEditing, true);
  s.setEditing(false);
  assert.equal(s.getState().isEditing, false);
});

test('uiStore : setEditing avec la valeur actuelle ne notifie personne', () => {
  const s = createUiStore();
  let n = 0;
  s.subscribe(() => n++);
  s.setEditing(false);
  assert.equal(n, 0);
});

test('uiStore : catalogue, réglages et renommage s\'ouvrent et se ferment indépendamment du mode édition', () => {
  const s = createUiStore();
  s.setEditing(true);
  s.openCatalog();
  s.openSettings('a');
  s.openRename('b');
  assert.deepEqual(s.getState(), { isEditing: true, catalogOpen: true, settingsFor: 'a', renameFor: 'b', dialog: null });
  s.closeCatalog();
  s.closeSettings();
  s.closeRename();
  assert.deepEqual(s.getState(), { isEditing: true, catalogOpen: false, settingsFor: null, renameFor: null, dialog: null });
});

test('boîtes de dialogue de l\'application : ouvrir, fermer, isPanelOpen', () => {
  const s = createUiStore();
  assert.equal(isPanelOpen(s.getState()), false);
  s.openDialog('help');
  assert.equal(s.getState().dialog, 'help');
  assert.equal(isPanelOpen(s.getState()), true);
  s.closeDialog();
  assert.equal(s.getState().dialog, null);
  assert.equal(isPanelOpen(s.getState()), false);
});

test('closeTopPanel ferme un seul panneau à la fois (dialogue, renommage, réglages, catalogue) et dit s\'il a fermé quelque chose', () => {
  const s = createUiStore();
  assert.equal(s.closeTopPanel(), false);
  s.openCatalog();
  s.openSettings('a');
  s.openRename('b');
  s.openDialog('export');
  assert.equal(s.closeTopPanel(), true);
  assert.equal(s.getState().dialog, null);
  assert.equal(s.getState().renameFor, 'b');
  s.closeTopPanel();
  assert.equal(s.getState().renameFor, null);
  s.closeTopPanel();
  assert.equal(s.getState().settingsFor, null);
  s.closeTopPanel();
  assert.equal(s.getState().catalogOpen, false);
  assert.equal(s.closeTopPanel(), false);
});
