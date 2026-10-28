import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from './defaultState.js';
import { hydrate, readState, readStoredData } from './hydrate.js';
import { createMemoryAdapter } from './memoryAdapter.js';

const validState = (over = {}) => ({
  version: 1,
  theme: 'dark',
  activePageId: 'p1',
  pages: [
    {
      id: 'p1',
      name: 'Principal',
      instances: [{ id: 'a', type: 'todo', layout: { x: 0, y: 0, w: 4, h: 4 }, settings: {}, version: 1 }],
    },
  ],
  ...over,
});
const stored = (data, over = {}) => JSON.stringify({ version: 1, data, updatedAt: 10, ...over });

/** Adaptateur mémoire qui note toutes les écritures. */
function spy(initial = {}) {
  const inner = createMemoryAdapter({ initial });
  const writes = [];
  return {
    ...inner,
    writes,
    set: async (k, v) => {
      writes.push(['set', k]);
      return inner.set(k, v);
    },
    remove: async (k) => {
      writes.push(['remove', k]);
      return inner.remove(k);
    },
  };
}

test('rien d\'enregistré : état par défaut (page « Principal », aucune instance, thème système), rien d\'écrit', async () => {
  const a = spy();
  const r = await hydrate(a);
  assert.equal(r.state.pages.length, 1);
  assert.equal(r.state.pages[0].name, 'Principal');
  assert.deepEqual(r.state.pages[0].instances, []);
  assert.equal(r.state.theme, 'system');
  assert.equal(r.state.version, 2);
  assert.deepEqual(r.state.preferences, { singleKeyShortcuts: true });
  assert.equal(r.state.activePageId, r.state.pages[0].id);
  assert.deepEqual(r.data, {});
  assert.equal(r.readOnly, false);
  assert.equal(r.stateWasReset, false);
  assert.deepEqual(r.invalidInstanceIds, []);
  assert.deepEqual(a.writes, []);
});

test('état et données valides : chargés tels quels, rien d\'écrit', async () => {
  const a = spy({
    'dash:state': JSON.stringify(validState()),
    'dash:data:a': stored({ tasks: [{ id: 't', text: 'x' }] }),
    'dash:data:b': stored({ n: 2 }, { updatedAt: 20 }),
  });
  const r = await hydrate(a);
  assert.equal(r.state.theme, 'dark');
  assert.equal(r.state.pages[0].instances[0].id, 'a');
  assert.deepEqual(r.data.a, { version: 1, data: { tasks: [{ id: 't', text: 'x' }] }, updatedAt: 10 });
  assert.equal(r.data.b.updatedAt, 20);
  assert.equal(r.stateWasReset, false);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(a.writes, []);
});

test('les clés qui ne sont pas des données d\'instance sont ignorées', async () => {
  const a = spy({ 'dash:backup:x': 'peu importe', 'dash:theme-mirror': 'dark', 'dash:data:a': stored({}) });
  const r = await hydrate(a);
  assert.deepEqual(Object.keys(r.data), ['a']);
});

test('état qui n\'est pas du JSON : copie dans dash:backup:state puis état par défaut', async () => {
  const a = spy({ 'dash:state': '{pas du json' });
  const r = await hydrate(a);
  assert.equal(r.stateWasReset, true);
  assert.equal(r.state.pages[0].name, 'Principal');
  assert.equal((await a.get('dash:backup:state')), '{pas du json');
  assert.equal(r.readOnly, false);
  assert.match(r.warnings[0], /dash:backup:state/);
});

test('état qui ne respecte pas le schéma : même traitement', async () => {
  const raw = JSON.stringify(validState({ theme: 'bleu' }));
  const a = spy({ 'dash:state': raw });
  const r = await hydrate(a);
  assert.equal(r.stateWasReset, true);
  assert.equal(r.state.theme, 'system');
  assert.equal(await a.get('dash:backup:state'), raw);
});

test('plusieurs formes d\'état invalide sont refusées', () => {
  for (const raw of ['null', '[]', '"texte"', '{}', '{"version":0}', '{"version":"1"}', JSON.stringify(validState({ pages: [] }))]) {
    assert.equal(readState(raw).status, 'invalid', raw);
  }
});

test('page active inconnue : on retombe sur la première page', () => {
  const r = readState(JSON.stringify(validState({ activePageId: 'fantome' })));
  assert.equal(r.status, 'ok');
  assert.equal(r.state.activePageId, 'p1');
});

test('donnée d\'instance invalide : copie dans dash:backup:<id>, instance signalée, les autres chargées', async () => {
  const bad = '{"version":1,"updatedAt":1}';
  const a = spy({
    'dash:state': JSON.stringify(validState()),
    'dash:data:a': bad,
    'dash:data:b': stored({ ok: true }),
    'dash:data:c': 'pas du json',
  });
  const r = await hydrate(a);
  assert.deepEqual(r.invalidInstanceIds.sort(), ['a', 'c']);
  assert.deepEqual(Object.keys(r.data), ['b']);
  assert.equal(await a.get('dash:backup:a'), bad);
  assert.equal(await a.get('dash:backup:c'), 'pas du json');
  assert.equal(r.stateWasReset, false);
  // L'ancienne donnée n'est pas effacée de dash:data:a (la phase 2 la réinitialisera avec le registre).
  assert.equal(await a.get('dash:data:a'), bad);
});

test('version plus récente que le code : lecture seule, état lu, AUCUNE écriture', async () => {
  const a = spy({
    'dash:state': JSON.stringify(validState({ version: 3, preferences: { singleKeyShortcuts: false } })),
    'dash:data:a': stored({ ok: 1 }),
    'dash:data:b': 'cassé',
  });
  const r = await hydrate(a);
  assert.equal(r.readOnly, true);
  assert.equal(r.stateWasReset, false);
  assert.equal(r.stateUnreadable, false);
  assert.equal(r.state.pages[0].instances[0].id, 'a');
  assert.deepEqual(r.invalidInstanceIds, ['b']);
  assert.deepEqual(a.writes, [], 'aucune écriture en lecture seule, pas même une copie de sauvegarde');
});

test('version plus récente dont le format est illisible : lecture seule, état par défaut en mémoire, rien d\'écrit', async () => {
  const raw = JSON.stringify({ version: 9, mondes: ['x'] });
  const a = spy({ 'dash:state': raw });
  const r = await hydrate(a);
  assert.equal(r.readOnly, true);
  assert.equal(r.stateUnreadable, true);
  assert.equal(r.state.pages[0].name, 'Principal');
  assert.deepEqual(a.writes, []);
  assert.equal(await a.get('dash:state'), raw);
});

test('un état de version 1 (sans préférences) est migré sans perte vers la version 2', async () => {
  const v1 = validState();
  const a = spy({ 'dash:state': JSON.stringify(v1) });
  const r = await hydrate(a);
  assert.equal(r.migrated, true);
  assert.equal(r.stateWasReset, false);
  assert.equal(r.readOnly, false);
  assert.equal(r.state.version, 2);
  assert.deepEqual(r.state.preferences, { singleKeyShortcuts: true });
  // Rien d'autre n'a changé : thème, page active, pages, instances.
  const { version: _v, preferences: _p, ...rest } = r.state;
  const { version: _v1, ...rest1 } = v1;
  assert.deepEqual(rest, rest1);
  assert.deepEqual(a.writes, [], 'hydrate n\'écrit rien : c\'est la persistance qui réenregistre');
});

test('un état de version 3 se charge en lecture seule, sans rien écrire ni migrer', async () => {
  const raw = JSON.stringify(validState({ version: 3, preferences: { singleKeyShortcuts: false }, futur: true }));
  const a = spy({ 'dash:state': raw });
  const r = await hydrate(a);
  assert.equal(r.readOnly, true);
  assert.equal(r.migrated, false);
  assert.equal(r.state.preferences.singleKeyShortcuts, false);
  assert.equal(r.state.version, 3);
  assert.deepEqual(a.writes, []);
  assert.equal(await a.get('dash:state'), raw);
});

test('état plus ancien : migré (version courante simulée à 2), signalé pour réenregistrement', async () => {
  const migrations = [{ from: 1, to: 2, migrate: (s) => ({ ...s, preferences: { singleKeyShortcuts: true } }) }];
  const a = spy({ 'dash:state': JSON.stringify(validState()) });
  const r = await hydrate(a, { migrations, currentVersion: 2 });
  assert.equal(r.migrated, true);
  assert.equal(r.state.version, 2);
  assert.deepEqual(r.state.preferences, { singleKeyShortcuts: true });
  assert.equal(r.stateWasReset, false);
  assert.equal(r.readOnly, false);
});

test('migration impossible : traité comme un état invalide (copie puis état par défaut)', async () => {
  const raw = JSON.stringify(validState());
  const a = spy({ 'dash:state': raw });
  const r = await hydrate(a, { migrations: [], currentVersion: 2 });
  assert.equal(r.stateWasReset, true);
  assert.equal(await a.get('dash:backup:state'), raw);
});

test('copie de sauvegarde impossible (stockage plein) : avertissement, pas de plantage', async () => {
  const a = spy({ 'dash:state': 'cassé' });
  a.set = async () => {
    throw new Error('plein');
  };
  const r = await hydrate(a);
  assert.equal(r.stateWasReset, true);
  assert.ok(r.warnings.some((w) => /Copie de sauvegarde impossible/.test(w)));
});

test('le générateur d\'identifiant est utilisé pour l\'état par défaut', async () => {
  const r = await hydrate(createMemoryAdapter(), { generateId: () => 'fixe' });
  assert.equal(r.state.pages[0].id, 'fixe');
  assert.deepEqual(r.state, createDefaultState(() => 'fixe'));
});

test('readStoredData : valide, invalide, JSON cassé', () => {
  assert.equal(readStoredData(stored({ a: 1 })).ok, true);
  assert.equal(readStoredData('{"version":1,"updatedAt":1}').ok, false);
  assert.equal(readStoredData('pas du json').ok, false);
  assert.equal(readStoredData('null').ok, false);
});
