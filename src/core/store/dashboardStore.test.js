import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../storage/defaultState.js';
import { createDashboardStore, findInstance, selectActivePage, selectInstance, selectInstances } from './dashboardStore.js';

const inst = (id, over = {}) => ({
  id,
  type: 'todo',
  layout: { x: 0, y: 0, w: 4, h: 4 },
  settings: { showProgress: true },
  version: 1,
  ...over,
});
const make = () => createDashboardStore(createDefaultState(() => 'p1'));

test('addInstance : ajoute à la fin de la page active, plusieurs instances du même type', () => {
  const s = make();
  s.addInstance(inst('a'));
  s.addInstance(inst('b'));
  assert.deepEqual(selectInstances(s.getState()).map((i) => i.id), ['a', 'b']);
  assert.equal(selectInstances(s.getState()).every((i) => i.type === 'todo'), true);
});

test('addInstance : refuse une instance invalide ou un identifiant déjà utilisé', () => {
  const s = make();
  assert.throws(() => s.addInstance({ id: 'x' }), TypeError);
  assert.throws(() => s.addInstance(inst('a', { layout: { x: 0, y: 0, w: 0, h: 1 } })), TypeError);
  s.addInstance(inst('a'));
  assert.throws(() => s.addInstance(inst('a')), /déjà l'identifiant a/);
  assert.equal(selectInstances(s.getState()).length, 1);
});

test('addInstance : ajoute à la page active quand il y en a plusieurs', () => {
  const state = createDefaultState(() => 'p1');
  state.pages.push({ id: 'p2', name: 'Perso', instances: [] });
  state.activePageId = 'p2';
  const s = createDashboardStore(state);
  s.addInstance(inst('a'));
  assert.equal(s.getState().pages[0].instances.length, 0);
  assert.equal(s.getState().pages[1].instances.length, 1);
  assert.equal(selectActivePage(s.getState()).id, 'p2');
});

test('removeInstance : retire l\'instance, les autres gardent leur référence', () => {
  const s = make();
  s.addInstance(inst('a'));
  s.addInstance(inst('b'));
  const b = selectInstance('b')(s.getState());
  s.removeInstance('a');
  assert.deepEqual(selectInstances(s.getState()).map((i) => i.id), ['b']);
  assert.equal(selectInstance('b')(s.getState()), b);
  assert.equal(selectInstance('a')(s.getState()), undefined);
});

test('removeInstance : id inconnu = aucun changement, aucune notification', () => {
  const s = make();
  s.addInstance(inst('a'));
  let n = 0;
  s.subscribe(() => n++);
  s.removeInstance('fantome');
  assert.equal(n, 0);
});

test('updateLayouts : ne remplace que les instances dont la position change', () => {
  const s = make();
  s.addInstance(inst('a'));
  s.addInstance(inst('b', { layout: { x: 4, y: 0, w: 4, h: 4 } }));
  const before = { a: selectInstance('a')(s.getState()), b: selectInstance('b')(s.getState()) };
  let n = 0;
  s.subscribe(() => n++);

  s.updateLayouts({ a: { x: 0, y: 0, w: 4, h: 4 }, b: { x: 8, y: 2, w: 3, h: 5 } });
  assert.equal(n, 1);
  assert.equal(selectInstance('a')(s.getState()), before.a, 'a n\'a pas bougé');
  assert.deepEqual(selectInstance('b')(s.getState()).layout, { x: 8, y: 2, w: 3, h: 5 });

  s.updateLayouts({ b: { x: 8, y: 2, w: 3, h: 5 } });
  s.updateLayouts({});
  s.updateLayouts({ inconnu: { x: 1, y: 1, w: 1, h: 1 } });
  assert.equal(n, 1, 'même position, aucune instance concernée : pas de notification');
});

test('updateLayouts : une position invalide est ignorée', () => {
  const s = make();
  s.addInstance(inst('a'));
  s.updateLayouts({ a: { x: -3, y: 0, w: 4, h: 4 } });
  assert.deepEqual(selectInstance('a')(s.getState()).layout, { x: 0, y: 0, w: 4, h: 4 });
});

test('updateInstanceSettings : fusionne dans les réglages de CETTE instance seulement', () => {
  const s = make();
  s.addInstance(inst('a'));
  s.addInstance(inst('b'));
  s.updateInstanceSettings('a', { doneLast: false });
  assert.deepEqual(selectInstance('a')(s.getState()).settings, { showProgress: true, doneLast: false });
  assert.deepEqual(selectInstance('b')(s.getState()).settings, { showProgress: true });
});

test('updateInstanceSettings : même valeur = aucune notification ; réglages absents acceptés', () => {
  const s = make();
  s.addInstance(inst('a', { settings: undefined }));
  s.updateInstanceSettings('a', { x: 1 });
  assert.deepEqual(selectInstance('a')(s.getState()).settings, { x: 1 });
  let n = 0;
  s.subscribe(() => n++);
  s.updateInstanceSettings('a', { x: 1 });
  s.updateInstanceSettings('fantome', { x: 2 });
  assert.equal(n, 0);
});

test('setInstanceTitle : titre personnalisé, nettoyé, et retiré s\'il est vide', () => {
  const s = make();
  s.addInstance(inst('a'));
  s.setInstanceTitle('a', '  Courses  ');
  assert.equal(selectInstance('a')(s.getState()).title, 'Courses');
  s.setInstanceTitle('a', 'Courses');
  s.setInstanceTitle('a', '   ');
  assert.equal('title' in selectInstance('a')(s.getState()), false);
  let n = 0;
  s.subscribe(() => n++);
  s.setInstanceTitle('a', '');
  assert.equal(n, 0);
});

test('setPreferences : fusionne, refuse une valeur invalide, ne notifie pas si rien ne change', () => {
  const s = createDashboardStore(createDefaultState(() => 'p'));
  let calls = 0;
  s.subscribe(() => calls++);
  s.setPreferences({ singleKeyShortcuts: false });
  assert.equal(s.getState().preferences.singleKeyShortcuts, false);
  assert.equal(calls, 1);
  s.setPreferences({ singleKeyShortcuts: false });
  assert.equal(calls, 1);
  assert.throws(() => s.setPreferences({ singleKeyShortcuts: 'oui' }), TypeError);
  assert.equal(s.getState().preferences.singleKeyShortcuts, false);
});

test('setTheme : trois valeurs, le reste est refusé', () => {
  const s = make();
  for (const t of ['dark', 'light', 'system']) {
    s.setTheme(t);
    assert.equal(s.getState().theme, t);
  }
  assert.throws(() => s.setTheme('bleu'), TypeError);
  assert.equal(s.getState().theme, 'system');
});

test('replaceAll : remplace tout l\'état', () => {
  const s = make();
  s.addInstance(inst('a'));
  const next = createDefaultState(() => 'p9');
  next.theme = 'dark';
  s.replaceAll(next);
  assert.equal(s.getState(), next);
  assert.equal(selectActivePage(s.getState()).id, 'p9');
});

test('selectActivePage : retombe sur la première page si l\'identifiant a disparu', () => {
  const state = createDefaultState(() => 'p1');
  state.activePageId = 'inconnue';
  assert.equal(selectActivePage(state).id, 'p1');
});

test('deux stores sont indépendants', () => {
  const a = make();
  const b = make();
  a.addInstance(inst('x'));
  assert.equal(selectInstances(b.getState()).length, 0);
});

test('migrateInstance : remplace les réglages et la version, laisse les autres instances intactes', () => {
  const s = make();
  s.addInstance(inst('a', { settings: { old: true }, version: 1 }));
  s.addInstance(inst('b'));
  const b = selectInstances(s.getState())[1];
  s.migrateInstance('a', { settings: { fresh: 1 }, version: 2 });
  const [a, b2] = selectInstances(s.getState());
  assert.deepEqual(a.settings, { fresh: 1 });
  assert.equal(a.version, 2);
  assert.equal(b2, b);
  assert.throws(() => s.migrateInstance('a', { settings: {}, version: 0 }), /Version invalide/);
});

test('insertInstance : à un rang précis d\'une page, borné, sans doublon', () => {
  const s = make();
  s.addInstance(inst('a'));
  s.addInstance(inst('b'));
  s.insertInstance(inst('c'), { index: 1 });
  assert.deepEqual(selectInstances(s.getState()).map((i) => i.id), ['a', 'c', 'b']);
  s.insertInstance(inst('d'), { pageId: 'p1', index: 99 });
  s.insertInstance(inst('e'), { pageId: 'inconnue', index: -4 });
  assert.deepEqual(selectInstances(s.getState()).map((i) => i.id), ['e', 'a', 'c', 'b', 'd']);
  assert.throws(() => s.insertInstance(inst('a')), /déjà l'identifiant/);
  assert.throws(() => s.insertInstance(/** @type {any} */ ({ id: 'x' })), /Instance invalide/);
});

test('findInstance : page, rang et instance ; undefined si absente', () => {
  const s = make();
  s.addInstance(inst('a'));
  s.addInstance(inst('b'));
  assert.deepEqual(findInstance(s.getState(), 'b'), { pageId: 'p1', index: 1, instance: selectInstances(s.getState())[1] });
  assert.equal(findInstance(s.getState(), 'zzz'), undefined);
});

test('replaceInstanceSettings : remplace tout, sans fusion', () => {
  const s = make();
  s.addInstance(inst('a', { settings: { x: 1, y: 2 } }));
  s.replaceInstanceSettings('a', { z: 3 });
  assert.deepEqual(selectInstances(s.getState())[0].settings, { z: 3 });
});
