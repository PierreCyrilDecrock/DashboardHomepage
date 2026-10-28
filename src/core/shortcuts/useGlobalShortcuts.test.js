import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUiStore } from '../store/uiStore.js';
import { createShortcutHandler, isTypingTarget, SHORTCUTS } from './useGlobalShortcuts.js';

const body = { tagName: 'BODY' };
const setup = (singleKeyShortcuts = true) => {
  const ui = createUiStore();
  const dashboard = { getState: () => ({ preferences: { singleKeyShortcuts } }) };
  const handle = createShortcutHandler({ ui, dashboard });
  const press = (key, extra = {}) => {
    const event = { key, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, target: body, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
    return { handled: handle(event), event };
  };
  return { ui, press };
};

test('E active puis quitte le mode édition (majuscule comprise)', () => {
  const { ui, press } = setup();
  assert.equal(press('e').handled, true);
  assert.equal(ui.getState().isEditing, true);
  press('E');
  assert.equal(ui.getState().isEditing, false);
});

test('A ouvre le catalogue, ? ouvre l\'aide', () => {
  const { ui, press } = setup();
  const a = press('a');
  assert.equal(a.handled, true);
  assert.equal(a.event.prevented, true);
  assert.equal(ui.getState().catalogOpen, true);
  ui.closeCatalog();
  assert.equal(press('?', { shiftKey: true }).handled, true);
  assert.equal(ui.getState().dialog, 'help');
});

test('Échap ferme d\'abord le panneau ouvert, puis quitte le mode édition', () => {
  const { ui, press } = setup();
  ui.setEditing(true);
  ui.openDialog('help');
  assert.equal(press('Escape').handled, true);
  assert.equal(ui.getState().dialog, null);
  assert.equal(ui.getState().isEditing, true, 'le mode édition reste actif après la fermeture du dialogue');
  assert.equal(press('Escape').handled, true);
  assert.equal(ui.getState().isEditing, false);
  assert.equal(press('Escape').handled, false, 'rien à fermer');
});

test('aucune réaction dans un champ de saisie, une zone de texte, une liste ou un élément modifiable', () => {
  const { ui, press } = setup();
  for (const target of [
    { tagName: 'INPUT' },
    { tagName: 'TEXTAREA' },
    { tagName: 'SELECT' },
    { tagName: 'DIV', isContentEditable: true },
    { tagName: 'DIV', getAttribute: () => 'true' },
    { tagName: 'DIV', getAttribute: () => '' },
  ]) {
    for (const key of ['e', 'a', '?']) assert.equal(press(key, { target }).handled, false, `${target.tagName} ${key}`);
  }
  assert.equal(ui.getState().isEditing, false);
  assert.equal(ui.getState().catalogOpen, false);
  assert.equal(ui.getState().dialog, null);
  // Un bouton ou un lien n'est pas un champ de saisie.
  assert.equal(press('e', { target: { tagName: 'BUTTON' } }).handled, true);
});

test('Échap reste actif même dans un champ de saisie', () => {
  const { ui, press } = setup();
  ui.openCatalog();
  assert.equal(press('Escape', { target: { tagName: 'INPUT' } }).handled, true);
  assert.equal(ui.getState().catalogOpen, false);
});

test('aucune réaction avec Ctrl, Cmd ou Alt enfoncés', () => {
  const { ui, press } = setup();
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    for (const key of ['e', 'a', '?']) assert.equal(press(key, { [modifier]: true }).handled, false);
  }
  assert.equal(ui.getState().isEditing, false);
  assert.equal(ui.getState().catalogOpen, false);
});

test('préférence « raccourcis à une touche » désactivée : E, A et ? ne font rien, Échap reste actif', () => {
  const { ui, press } = setup(false);
  for (const key of ['e', 'a', '?']) assert.equal(press(key).handled, false);
  assert.equal(ui.getState().isEditing, false);
  ui.setEditing(true);
  assert.equal(press('Escape').handled, true);
  assert.equal(ui.getState().isEditing, false);
});

test('un panneau ouvert bloque E, A et ? (on ne change pas ce qu\'on ne voit pas)', () => {
  const { ui, press } = setup();
  ui.openSettings('x');
  for (const key of ['e', 'a', '?']) assert.equal(press(key).handled, false);
  assert.equal(ui.getState().isEditing, false);
});

test('événement déjà traité (defaultPrevented), saisie par composition ou touche répétée : ignorés', () => {
  const { ui, press } = setup();
  assert.equal(press('e', { defaultPrevented: true }).handled, false);
  assert.equal(press('e', { isComposing: true }).handled, false);
  assert.equal(press('e', { repeat: true }).handled, false);
  assert.equal(press('Escape', { defaultPrevented: true }).handled, false);
  assert.equal(ui.getState().isEditing, false);
});

test('autres touches : ignorées', () => {
  const { press } = setup();
  for (const key of ['b', 'Enter', ' ', 'ArrowDown', 'Tab', '1']) assert.equal(press(key).handled, false);
});

test('isTypingTarget : null et valeurs étranges ne plantent pas', () => {
  assert.equal(isTypingTarget(null), false);
  assert.equal(isTypingTarget(/** @type {any} */ ('x')), false);
  assert.equal(isTypingTarget(/** @type {any} */ ({})), false);
});

test('la liste de l\'aide couvre les quatre raccourcis', () => {
  assert.deepEqual(SHORTCUTS.map((s) => s.keys[0]), ['E', 'A', '?', 'Échap']);
});
