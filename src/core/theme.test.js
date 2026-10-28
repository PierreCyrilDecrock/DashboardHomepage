import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardStore } from './store/dashboardStore.js';
import { createDefaultState } from './storage/defaultState.js';
import { createThemeApplier, startThemeSync } from './theme.js';

function fakeRoot(initial = null) {
  let attr = initial;
  return {
    getAttribute: (name) => (name === 'data-theme' ? attr : null),
    setAttribute: (name, value) => {
      if (name === 'data-theme') attr = value;
    },
    removeAttribute: (name) => {
      if (name === 'data-theme') attr = null;
    },
    get attr() {
      return attr;
    },
  };
}
const mirrorLog = () => {
  const log = [];
  return { log, writeMirror: (t) => log.push(t) };
};

test('clair et sombre posent data-theme ; système le retire ; le miroir suit chaque choix', () => {
  const root = fakeRoot();
  const m = mirrorLog();
  const applier = createThemeApplier(root, { readMirror: () => null, writeMirror: m.writeMirror });
  applier.apply('dark');
  assert.equal(root.attr, 'dark');
  applier.apply('light');
  assert.equal(root.attr, 'light');
  applier.apply('system');
  assert.equal(root.attr, null);
  assert.deepEqual(m.log, ['dark', 'light', 'system']);
});

test('un data-theme imposé par l\'hôte (aperçu d\'un artefact) n\'est pas retiré en mode système', () => {
  const root = fakeRoot('dark'); // posé par l'hôte, miroir absent
  const applier = createThemeApplier(root, { readMirror: () => null, writeMirror: () => {} });
  applier.apply('system');
  assert.equal(root.attr, 'dark');
});

test('un data-theme posé par theme-init.js (miroir identique) est bien retiré en mode système', () => {
  const root = fakeRoot('dark');
  const applier = createThemeApplier(root, { readMirror: () => 'dark', writeMirror: () => {} });
  applier.apply('system');
  assert.equal(root.attr, null);
});

test('un miroir qui ne correspond pas à l\'attribut ne donne pas la propriété', () => {
  const root = fakeRoot('light');
  const applier = createThemeApplier(root, { readMirror: () => 'dark', writeMirror: () => {} });
  applier.apply('system');
  assert.equal(root.attr, 'light');
});

test('startThemeSync : applique le thème du store tout de suite, puis à chaque changement de thème', () => {
  const root = fakeRoot();
  const m = mirrorLog();
  const state = createDefaultState(() => 'p');
  state.theme = 'dark';
  const store = createDashboardStore(state);
  const stop = startThemeSync(store, { root, writeMirror: m.writeMirror });
  assert.equal(root.attr, 'dark');
  assert.deepEqual(m.log, ['dark']);

  store.setTheme('light');
  assert.equal(root.attr, 'light');
  store.addInstance({ id: 'a', type: 't', layout: { x: 0, y: 0, w: 1, h: 1 }, settings: {}, version: 1 });
  assert.deepEqual(m.log, ['dark', 'light'], 'un changement sans rapport avec le thème n\'écrit pas le miroir');

  stop();
  store.setTheme('dark');
  assert.equal(root.attr, 'light');
});
