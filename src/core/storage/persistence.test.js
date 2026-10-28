import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from './defaultState.js';
import { createMemoryAdapter } from './memoryAdapter.js';
import { startPersistence } from './persistence.js';
import { StorageFullError } from './StorageAdapter.js';
import { createDashboardStore, selectInstances } from '../store/dashboardStore.js';
import { createDataStore } from '../store/dataStore.js';
import { createStatusStore } from '../store/statusStore.js';

afterEach(() => mock.timers.reset());

const inst = (id) => ({ id, type: 'todo', layout: { x: 0, y: 0, w: 4, h: 4 }, settings: {}, version: 1 });
/** Laisse les promesses en attente se terminer (setImmediate n'est pas simulé). */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Monte stores + adaptateur espion + persistance, minuteries simulées. */
function setup({ readOnly = false, adapterOverrides = {} } = {}) {
  mock.timers.enable({ apis: ['setTimeout'] });
  const memory = createMemoryAdapter();
  const calls = [];
  const adapter = {
    ...memory,
    set: async (k, v) => {
      calls.push(['set', k]);
      return (adapterOverrides.set ?? memory.set)(k, v);
    },
    remove: async (k) => {
      calls.push(['remove', k]);
      return memory.remove(k);
    },
  };
  const dashboardStore = createDashboardStore(createDefaultState(() => 'p1'));
  const dataStore = createDataStore({ now: () => 42 });
  const statusStore = createStatusStore();
  if (readOnly) statusStore.setState({ readOnly: true });
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const win = new EventTarget();
  const persistence = startPersistence({ adapter, dashboardStore, dataStore, statusStore, doc, win });
  return { memory, adapter, calls, dashboardStore, dataStore, statusStore, doc, win, persistence };
}

test('aucune écriture tant que rien ne change (charger n\'écrit rien)', async () => {
  const t = setup();
  mock.timers.tick(5000);
  await t.persistence.flush();
  assert.deepEqual(t.calls, []);
});

test('regroupement : des changements rapprochés donnent UNE écriture, 300 ms après le dernier', async () => {
  const t = setup();
  t.dataStore.setData('x', { text: 'a' });
  mock.timers.tick(200);
  t.dataStore.setData('x', { text: 'ab' });
  mock.timers.tick(200);
  t.dataStore.setData('x', { text: 'abc' });
  mock.timers.tick(299);
  assert.deepEqual(t.calls, [], 'rien avant la fin du délai');
  mock.timers.tick(1);
  await t.persistence.flush();
  assert.deepEqual(t.calls, [['set', 'dash:data:x']]);
  assert.deepEqual(JSON.parse(t.memory.dump()['dash:data:x']), { version: 1, data: { text: 'abc' }, updatedAt: 42 });
});

test('une rafale de 200 modifications ne produit qu\'une écriture', async () => {
  const t = setup();
  for (let i = 0; i < 200; i++) {
    t.dataStore.setData('x', { n: i });
    mock.timers.tick(5);
  }
  mock.timers.tick(300);
  await t.persistence.flush();
  assert.equal(t.calls.length, 1);
  assert.equal(JSON.parse(t.memory.dump()['dash:data:x']).data.n, 199);
});

test('un changement de données de l\'instance X n\'écrit que dash:data:X', async () => {
  const t = setup();
  t.dataStore.setData('x', { n: 1 });
  t.dataStore.setData('y', { n: 1 });
  mock.timers.tick(300);
  await t.persistence.flush();
  t.calls.length = 0;

  t.dataStore.setData('x', { n: 2 });
  mock.timers.tick(300);
  await t.persistence.flush();
  assert.deepEqual(t.calls, [['set', 'dash:data:x']]);
});

test('déplacer un widget n\'écrit que dash:state, jamais ses données', async () => {
  const t = setup();
  t.dashboardStore.addInstance(inst('x'));
  t.dataStore.setData('x', { notes: ['texte'] });
  mock.timers.tick(300);
  await t.persistence.flush();
  t.calls.length = 0;

  t.dashboardStore.updateLayouts({ x: { x: 4, y: 0, w: 4, h: 4 } });
  mock.timers.tick(300);
  await t.persistence.flush();
  assert.deepEqual(t.calls, [['set', 'dash:state']]);
});

test('état et données modifiés ensemble : une seule vague, une écriture par clé', async () => {
  const t = setup();
  t.dashboardStore.addInstance(inst('x'));
  t.dashboardStore.setInstanceTitle('x', 'Courses');
  t.dataStore.setData('x', { n: 1 });
  mock.timers.tick(300);
  await t.persistence.flush();
  assert.deepEqual(t.calls.map((c) => c[1]).sort(), ['dash:data:x', 'dash:state']);
  const saved = JSON.parse(t.memory.dump()['dash:state']);
  assert.equal(saved.pages[0].instances[0].title, 'Courses');
});

test('une donnée retirée supprime sa clé', async () => {
  const t = setup();
  t.dataStore.setData('x', { n: 1 });
  mock.timers.tick(300);
  await t.persistence.flush();
  assert.ok('dash:data:x' in t.memory.dump());

  t.dataStore.removeData('x');
  mock.timers.tick(300);
  await t.persistence.flush();
  assert.equal('dash:data:x' in t.memory.dump(), false);
  assert.deepEqual(t.calls.at(-1), ['remove', 'dash:data:x']);
});

test('créer puis supprimer avant l\'écriture : la clé n\'existe pas', async () => {
  const t = setup();
  t.dataStore.setData('x', { n: 1 });
  t.dataStore.removeData('x');
  mock.timers.tick(300);
  await t.persistence.flush();
  assert.equal('dash:data:x' in t.memory.dump(), false);
});

test('flush() écrit tout de suite, sans attendre le délai', async () => {
  const t = setup();
  t.dataStore.setData('x', { n: 1 });
  assert.deepEqual(t.calls, []);
  await t.persistence.flush();
  assert.deepEqual(t.calls, [['set', 'dash:data:x']]);
  mock.timers.tick(1000);
  await t.persistence.flush();
  assert.equal(t.calls.length, 1, 'pas de double écriture ensuite');
});

test('les écritures partent de façon synchrone au flush (utile pendant pagehide)', () => {
  const t = setup();
  t.dataStore.setData('x', { n: 1 });
  t.dashboardStore.setTheme('dark');
  t.persistence.flush();
  assert.deepEqual(t.calls.map((c) => c[1]).sort(), ['dash:data:x', 'dash:state']);
});

test('page masquée (visibilitychange) et fermeture (pagehide) forcent les écritures', async () => {
  const t = setup();
  t.dataStore.setData('x', { n: 1 });
  t.doc.dispatchEvent(new Event('visibilitychange')); // encore visible : rien
  assert.deepEqual(t.calls, []);
  t.doc.visibilityState = 'hidden';
  t.doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(t.calls, [['set', 'dash:data:x']]);

  t.doc.visibilityState = 'visible';
  t.dataStore.setData('y', { n: 1 });
  t.win.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(t.calls.at(-1), ['set', 'dash:data:y']);
  await t.persistence.flush();
});

test('quota dépassé : statusStore.storageFull passe à vrai, puis revient à faux après une écriture réussie', async () => {
  let full = true;
  const t = setup({
    adapterOverrides: {
      set: async () => {
        if (full) throw new StorageFullError();
      },
    },
  });
  t.dataStore.setData('x', { n: 1 });
  await t.persistence.flush();
  assert.equal(t.statusStore.getState().storageFull, true);

  full = false;
  t.dataStore.setData('x', { n: 2 });
  await t.persistence.flush();
  assert.equal(t.statusStore.getState().storageFull, false);
});

test('lecture seule : aucune écriture, même après flush', async () => {
  const t = setup({ readOnly: true });
  t.dataStore.setData('x', { n: 1 });
  t.dashboardStore.setTheme('dark');
  mock.timers.tick(1000);
  await t.persistence.flush();
  t.win.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(t.calls, []);
});

test('markStateDirty : réenregistre l\'état (après une migration)', async () => {
  const t = setup();
  t.persistence.markStateDirty();
  mock.timers.tick(300);
  await t.persistence.flush();
  assert.deepEqual(t.calls, [['set', 'dash:state']]);
});

test('autre onglet : une donnée modifiée recharge le store, sans la réécrire', async () => {
  const t = setup();
  t.memory.simulateExternalChange('dash:data:x', JSON.stringify({ version: 1, data: { n: 7 }, updatedAt: 9 }));
  await settle();
  assert.deepEqual(t.dataStore.getData('x'), { version: 1, data: { n: 7 }, updatedAt: 9 });
  mock.timers.tick(1000);
  await t.persistence.flush();
  assert.deepEqual(t.calls, [], 'on n\'écrit pas en retour ce qu\'un autre onglet vient d\'écrire');
});

test('autre onglet : une donnée supprimée, ou illisible', async () => {
  const t = setup();
  t.dataStore.setData('x', { n: 1 });
  await t.persistence.flush();
  t.calls.length = 0;

  t.memory.simulateExternalChange('dash:data:x', 'cassé');
  await settle();
  assert.deepEqual(t.dataStore.getData('x').data, { n: 1 }, 'une donnée illisible est ignorée');

  t.memory.simulateExternalChange('dash:data:x', null);
  await settle();
  assert.equal(t.dataStore.getData('x'), undefined);
  mock.timers.tick(1000);
  assert.deepEqual(t.calls, []);
});

test('autre onglet : l\'état modifié recharge le dashboardStore ; la dernière écriture gagne', async () => {
  const t = setup();
  t.dashboardStore.addInstance(inst('local'));
  const remote = createDefaultState(() => 'p1');
  remote.theme = 'dark';
  remote.pages[0].instances.push(inst('distante'));
  t.memory.simulateExternalChange('dash:state', JSON.stringify(remote));
  await settle();
  assert.equal(t.dashboardStore.getState().theme, 'dark');
  assert.deepEqual(selectInstances(t.dashboardStore.getState()).map((i) => i.id), ['distante']);
  mock.timers.tick(1000);
  assert.deepEqual(t.calls, [], 'l\'état distant n\'est pas réécrit, et l\'écriture locale en attente est abandonnée');
});

test('autre onglet : un état d\'une version plus récente passe en lecture seule et arrête les écritures', async () => {
  const t = setup();
  t.memory.simulateExternalChange('dash:state', JSON.stringify({ ...createDefaultState(() => 'p1'), version: 5 }));
  await settle();
  assert.equal(t.statusStore.getState().readOnly, true);
  t.dataStore.setData('x', { n: 1 });
  mock.timers.tick(1000);
  await t.persistence.flush();
  assert.deepEqual(t.calls, []);
});

test('autre onglet : les clés de sauvegarde ou invalides sont ignorées', async () => {
  const t = setup();
  t.memory.simulateExternalChange('dash:backup:x', 'peu importe');
  t.memory.simulateExternalChange('dash:state', 'cassé');
  await settle();
  assert.deepEqual(t.dashboardStore.getState().pages[0].instances, []);
});

test('stop : écrit ce qui est en attente puis se débranche', async () => {
  const t = setup();
  t.dataStore.setData('x', { n: 1 });
  await t.persistence.stop();
  assert.deepEqual(t.calls, [['set', 'dash:data:x']]);
  t.dataStore.setData('x', { n: 2 });
  mock.timers.tick(1000);
  t.win.dispatchEvent(new Event('pagehide'));
  t.memory.simulateExternalChange('dash:data:x', JSON.stringify({ version: 1, data: { n: 5 }, updatedAt: 1 }));
  await settle();
  assert.equal(t.calls.length, 1);
  assert.equal(t.dataStore.getData('x').data.n, 2, 'plus de rechargement après stop');
});
