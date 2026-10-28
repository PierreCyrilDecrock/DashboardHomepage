import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from '../../lib/vendor.js';
import { createDefaultState } from '../storage/defaultState.js';
import { createDashboardStore, findInstance, selectInstances } from '../store/dashboardStore.js';
import { createDataStore } from '../store/dataStore.js';
import { UNDO_DELAY_MS, createDashboardActions } from './actions.js';

const counter = {
  type: 'counter',
  name: 'Compteur',
  version: 2,
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  settingsSchema: z.object({ label: z.string().max(5), step: z.number().int().min(1) }),
  defaultSettings: { label: 'ok', step: 1 },
  dataSchema: z.object({ n: z.number(), log: z.array(z.string()) }),
  defaultData: { n: 0, log: [] },
};
const defs = { counter };

/** Faux minuteur : on avance le temps à la main. */
function fakeTimers() {
  let t = 0;
  /** @type {Map<number, { at: number, fn: () => void }>} */
  const timers = new Map();
  let next = 1;
  return {
    setTimer: (fn, ms) => { timers.set(next, { at: t + ms, fn }); return next++; },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      t += ms;
      for (const [id, { at, fn }] of [...timers]) if (at <= t) { timers.delete(id); fn(); }
    },
    count: () => timers.size,
  };
}

function setup() {
  let n = 0;
  const dashboardStore = createDashboardStore(createDefaultState(() => 'p1'));
  const dataStore = createDataStore({ now: () => 7 });
  const timers = fakeTimers();
  const actions = createDashboardActions({ dashboardStore, dataStore, getDefinition: (t) => defs[t], generateId: () => `id${++n}`, now: () => 7, ...timers });
  const ids = () => selectInstances(dashboardStore.getState()).map((i) => i.id);
  return { actions, dashboardStore, dataStore, timers, ids };
}

test('addWidget : deux instances du même type, données indépendantes, une entrée de données chacune', () => {
  const { actions, dataStore, ids, dashboardStore } = setup();
  const a = actions.addWidget('counter');
  const b = actions.addWidget('counter');
  assert.deepEqual(ids(), [a, b]);
  dataStore.setData(a, (d) => ({ ...d, n: 5 }));
  assert.equal(dataStore.getData(a).data.n, 5);
  assert.equal(dataStore.getData(b).data.n, 0);
  assert.notEqual(dataStore.getData(a).data, dataStore.getData(b).data);
  assert.deepEqual(Object.keys(dataStore.getState().byId).sort(), [a, b]);
  assert.equal(dataStore.getData(a).version, 2);
  const [first] = selectInstances(dashboardStore.getState());
  assert.equal(first.version, 2);
});

test('addWidget : type inconnu → null, rien n\'est créé', () => {
  const { actions, dataStore, ids } = setup();
  assert.equal(actions.addWidget('inexistant'), null);
  assert.deepEqual(ids(), []);
  assert.deepEqual(dataStore.getState().byId, {});
});

test('duplicateInstance : données copiées, identifiants différents, titre « (copie) », placée sous l\'original', () => {
  const { actions, dataStore, dashboardStore, ids } = setup();
  const a = actions.addWidget('counter');
  const other = actions.addWidget('counter');
  dashboardStore.updateLayouts({ [a]: { x: 2, y: 3, w: 4, h: 2 } });
  dataStore.setData(a, { n: 5, log: ['x'] });
  const copy = actions.duplicateInstance(a);
  assert.notEqual(copy, a);
  assert.deepEqual(ids(), [a, copy, other], 'la copie suit l\'original');
  const dup = findInstance(dashboardStore.getState(), copy).instance;
  assert.equal(dup.title, 'Compteur (copie)');
  assert.deepEqual(dup.layout, { x: 2, y: 5, w: 4, h: 2 });
  assert.deepEqual(dataStore.getData(copy).data, { n: 5, log: ['x'] });
});

test('duplicateInstance : modifier la copie ne change pas l\'original (données et réglages)', () => {
  const { actions, dataStore, dashboardStore } = setup();
  const a = actions.addWidget('counter');
  dataStore.setData(a, { n: 5, log: ['x'] });
  const copy = actions.duplicateInstance(a);
  dataStore.setData(copy, (d) => ({ n: d.n + 1, log: [...d.log, 'y'] }));
  actions.updateInstanceSettings(copy, { label: 'copie' });
  assert.deepEqual(dataStore.getData(a).data, { n: 5, log: ['x'] });
  assert.equal(dataStore.getData(copy).data.n, 6);
  assert.equal(findInstance(dashboardStore.getState(), a).instance.settings.label, 'ok');
  assert.equal(findInstance(dashboardStore.getState(), copy).instance.settings.label, 'copie');
  assert.notEqual(dataStore.getData(a).data.log, dataStore.getData(copy).data.log);
});

test('duplicateInstance : utilise cloneData de la définition si elle existe ; titre personnalisé conservé dans le suffixe', () => {
  const calls = [];
  const withClone = { ...counter, cloneData: (d) => { calls.push(d); return { ...d, n: 100 }; } };
  let n = 0;
  const dashboardStore = createDashboardStore(createDefaultState(() => 'p1'));
  const dataStore = createDataStore();
  const actions = createDashboardActions({ dashboardStore, dataStore, getDefinition: () => withClone, generateId: () => `i${++n}`, ...fakeTimers() });
  const a = actions.addWidget('counter');
  actions.renameInstance(a, 'Mes courses');
  const copy = actions.duplicateInstance(a);
  assert.equal(calls.length, 1);
  assert.equal(dataStore.getData(copy).data.n, 100);
  assert.equal(findInstance(dashboardStore.getState(), copy).instance.title, 'Mes courses (copie)');
});

test('duplicateInstance : instance absente → null ; type inconnu → copie générique des données', () => {
  const { actions, dashboardStore, dataStore, ids } = setup();
  assert.equal(actions.duplicateInstance('zzz'), null);
  dashboardStore.addInstance({ id: 'u', type: 'disparu', layout: { x: 0, y: 0, w: 2, h: 2 }, settings: { a: [1] }, version: 1 });
  dataStore.putEntry('u', { version: 1, data: { k: [1, 2] }, updatedAt: 1 });
  const copy = actions.duplicateInstance('u');
  assert.deepEqual(ids(), ['u', copy]);
  assert.deepEqual(dataStore.getData(copy).data, { k: [1, 2] });
  assert.notEqual(dataStore.getData(copy).data, dataStore.getData('u').data);
  assert.equal(findInstance(dashboardStore.getState(), copy).instance.title, 'disparu (copie)');
});

test('removeInstance retire l\'instance ET ses données ; restoreInstance les remet à leur place', () => {
  const { actions, dataStore, ids } = setup();
  const a = actions.addWidget('counter');
  const b = actions.addWidget('counter');
  const c = actions.addWidget('counter');
  dataStore.setData(b, { n: 9, log: ['z'] });
  const before = dataStore.getData(b);
  assert.equal(actions.removeInstance(b), true);
  assert.deepEqual(ids(), [a, c]);
  assert.equal(dataStore.getData(b), undefined);
  assert.equal(actions.canRestore(b), true);
  assert.equal(actions.restoreInstance(b), true);
  assert.deepEqual(ids(), [a, b, c], 'même rang');
  assert.deepEqual(dataStore.getData(b), before);
  assert.equal(actions.canRestore(b), false);
  assert.equal(actions.restoreInstance(b), false, 'on ne restaure pas deux fois');
});

test('suppression définitive après le délai : plus de restauration, plus de données', () => {
  const { actions, dataStore, timers } = setup();
  const a = actions.addWidget('counter');
  actions.removeInstance(a);
  timers.advance(UNDO_DELAY_MS - 1);
  assert.equal(actions.canRestore(a), true);
  timers.advance(1);
  assert.equal(actions.canRestore(a), false);
  assert.equal(actions.restoreInstance(a), false);
  assert.equal(dataStore.getData(a), undefined);
  assert.equal(UNDO_DELAY_MS, 8000);
});

test('removeInstance : instance absente → false ; restaurer annule le minuteur', () => {
  const { actions, timers } = setup();
  assert.equal(actions.removeInstance('zzz'), false);
  const a = actions.addWidget('counter');
  actions.removeInstance(a);
  assert.equal(timers.count(), 1);
  actions.restoreInstance(a);
  assert.equal(timers.count(), 0);
});

test('plusieurs suppressions : chacune est annulable séparément', () => {
  const { actions, ids } = setup();
  const a = actions.addWidget('counter');
  const b = actions.addWidget('counter');
  actions.removeInstance(a);
  actions.removeInstance(b);
  assert.deepEqual(ids(), []);
  actions.restoreInstance(a);
  assert.deepEqual(ids(), [a]);
  assert.equal(actions.canRestore(b), true);
});

test('renameInstance : titre propre, titre vide = nom du type', () => {
  const { actions, dashboardStore } = setup();
  const a = actions.addWidget('counter');
  actions.renameInstance(a, '  Perso ');
  assert.equal(findInstance(dashboardStore.getState(), a).instance.title, 'Perso');
  actions.renameInstance(a, '   ');
  assert.equal(findInstance(dashboardStore.getState(), a).instance.title, undefined);
});

test('updateInstanceSettings : validé par le schéma, sans toucher aux autres instances du même type', () => {
  const { actions, dashboardStore } = setup();
  const a = actions.addWidget('counter');
  const b = actions.addWidget('counter');
  assert.deepEqual(actions.updateInstanceSettings(a, { label: 'abc', step: 3 }), { ok: true });
  const get = (id) => findInstance(dashboardStore.getState(), id).instance.settings;
  assert.deepEqual(get(a), { label: 'abc', step: 3 });
  assert.deepEqual(get(b), { label: 'ok', step: 1 });
  const refused = actions.updateInstanceSettings(a, { label: 'trop long pour le schéma' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /.+/);
  assert.deepEqual(get(a), { label: 'abc', step: 3 });
  assert.equal(actions.updateInstanceSettings('zzz', {}).ok, false);
});

test('updateInstanceSettings : type inconnu refusé ; réglages enregistrés invalides remplacés par l\'ensemble validé', () => {
  const { actions, dashboardStore } = setup();
  dashboardStore.addInstance({ id: 'u', type: 'disparu', layout: { x: 0, y: 0, w: 2, h: 2 }, settings: {}, version: 1 });
  assert.equal(actions.updateInstanceSettings('u', { a: 1 }).ok, false);
  const a = actions.addWidget('counter');
  dashboardStore.replaceInstanceSettings(a, { label: 42, junk: true });
  assert.deepEqual(actions.updateInstanceSettings(a, { step: 2 }), { ok: true });
  assert.deepEqual(findInstance(dashboardStore.getState(), a).instance.settings, { label: 'ok', step: 2 });
});

test('resetInstanceSettings : remet les réglages par défaut (copie indépendante)', () => {
  const { actions, dashboardStore } = setup();
  const a = actions.addWidget('counter');
  actions.updateInstanceSettings(a, { label: 'x', step: 4 });
  assert.equal(actions.resetInstanceSettings(a), true);
  const settings = findInstance(dashboardStore.getState(), a).instance.settings;
  assert.deepEqual(settings, { label: 'ok', step: 1 });
  assert.notEqual(settings, counter.defaultSettings);
  assert.equal(actions.resetInstanceSettings('zzz'), false);
});

test('dispose : abandonne les suppressions en attente', () => {
  const { actions, timers } = setup();
  actions.removeInstance(actions.addWidget('counter'));
  actions.dispose();
  assert.equal(timers.count(), 0);
});
