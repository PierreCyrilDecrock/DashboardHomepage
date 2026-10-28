import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardStore } from '../store/dashboardStore.js';
import { createDataStore } from '../store/dataStore.js';
import { createMemoryAdapter } from '../storage/memoryAdapter.js';
import { startPersistence } from '../storage/persistence.js';
import { createStatusStore } from '../store/statusStore.js';
import { createDefaultState } from '../storage/defaultState.js';
import {
  APP_ID,
  EXPORT_VERSION,
  MAX_IMPORT_BYTES,
  buildExport,
  exportFileName,
  parseBackup,
  replaceConfiguration,
  resetConfiguration,
  restoreSnapshot,
  serializeExport,
  summarizeBackup,
} from './exportImport.js';

const inst = (id, type = 'todo', over = {}) => ({ id, type, layout: { x: 0, y: 0, w: 4, h: 4 }, settings: { a: 1 }, version: 1, ...over });
const entry = (data, updatedAt = 5) => ({ version: 1, data, updatedAt });

/** Un dashboard complet : deux pages d'instances, dont un type inconnu et une donnée orpheline. */
function sampleState() {
  const state = createDefaultState(() => 'p1');
  state.theme = 'dark';
  state.preferences = { singleKeyShortcuts: false };
  state.pages[0].instances = [inst('a', 'todo'), inst('b', 'todo'), inst('c', 'notes'), inst('z', 'futur-widget')];
  return state;
}
const sampleData = () => ({ a: entry({ tasks: ['x'] }), b: entry({ tasks: [] }), c: entry({ text: 'bonjour' }), z: entry({ inconnu: true }) });
const known = (type) => ['todo', 'notes', 'clock'].includes(type);

/** Un environnement complet : stockage mémoire (avec une clé étrangère), stores, persistance. */
async function setup({ state = sampleState(), data = sampleData(), extra = {} } = {}) {
  const adapter = createMemoryAdapter({ prefix: '' });
  const writes = [];
  const spy = {
    ...adapter,
    set: async (k, v) => (writes.push(['set', k]), adapter.set(k, v)),
    remove: async (k) => (writes.push(['remove', k]), adapter.remove(k)),
  };
  await adapter.set('dash:state', JSON.stringify(state));
  for (const [id, e] of Object.entries(data)) await adapter.set(`dash:data:${id}`, JSON.stringify(e));
  for (const [k, v] of Object.entries(extra)) await adapter.set(k, v);
  const dashboardStore = createDashboardStore(state);
  const dataStore = createDataStore();
  dataStore.replaceAll(data);
  const statusStore = createStatusStore();
  const persistence = startPersistence({ adapter: spy, dashboardStore, dataStore, statusStore, delay: 1, doc: undefined, win: undefined });
  let reconciles = 0;
  const deps = { adapter: spy, dashboardStore, dataStore, flush: () => persistence.flush(), reconcile: () => void reconciles++, isReadOnly: () => statusStore.getState().readOnly, };
  return { adapter, writes, dashboardStore, dataStore, statusStore, persistence, deps, reconciles: () => reconciles };
}
const storedKeys = (adapter) => Object.keys(adapter.dump()).sort();

// --- Export ------------------------------------------------------------------------------------

test('export : contenu au format du document de développement', () => {
  const out = buildExport(sampleState(), sampleData(), new Date('2026-10-28T10:00:00Z'));
  assert.equal(out.app, APP_ID);
  assert.equal(out.exportVersion, EXPORT_VERSION);
  assert.equal(out.exportedAt, '2026-10-28T10:00:00.000Z');
  assert.deepEqual(Object.keys(out), ['app', 'exportVersion', 'exportedAt', 'state', 'data']);
  assert.deepEqual(Object.keys(out.data).sort(), ['a', 'b', 'c', 'z']);
});

test('export : les données d\'une instance absente de l\'état ne sont pas exportées', () => {
  const out = buildExport(sampleState(), { ...sampleData(), orpheline: entry({}) });
  assert.equal('orpheline' in out.data, false);
});

test('nom de fichier : dashboard-homepage-AAAA-MM-JJ.json (date locale)', () => {
  assert.equal(exportFileName(new Date(2026, 0, 5, 23, 59)), 'dashboard-homepage-2026-01-05.json');
  assert.equal(exportFileName(new Date(2026, 11, 31)), 'dashboard-homepage-2026-12-31.json');
});

// --- Aller-retour ------------------------------------------------------------------------------

test('aller-retour : exporter puis importer redonne exactement le même état et les mêmes données', () => {
  const state = sampleState();
  const data = sampleData();
  const text = serializeExport(buildExport(state, data));
  const r = parseBackup(text);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.backup.state, state);
  assert.deepEqual(r.backup.data, data);
  assert.deepEqual(r.ignoredDataIds, []);
  // Ré-exporter ce qu'on vient d'importer donne le même JSON (à la date près).
  const again = buildExport(r.backup.state, r.backup.data, new Date(r.backup.exportedAt));
  assert.equal(serializeExport(again), text);
});

test('aller-retour avec remplacement : exporter, vider les clés dash:, importer → stockage identique', async () => {
  const t = await setup({ extra: { 'autre-site:reglage': 'à ne pas toucher' } });
  const before = t.adapter.dump();
  const text = serializeExport(buildExport(t.dashboardStore.getState(), t.dataStore.getState().byId));
  // « Vider » : on supprime toutes les clés dash: du stockage et des stores.
  for (const key of Object.keys(before).filter((k) => k.startsWith('dash:'))) await t.adapter.remove(key);
  t.dashboardStore.replaceAll(createDefaultState(() => 'neuf'));
  t.dataStore.replaceAll({});
  await t.persistence.flush();
  const r = parseBackup(text);
  assert.equal(r.ok, true);
  await replaceConfiguration(t.deps, r.backup);
  const after = t.adapter.dump();
  assert.deepEqual(after, before, 'le stockage est identique, clé étrangère comprise');
});

// --- Fichier invalide ----------------------------------------------------------------------------

const valid = () => JSON.parse(serializeExport(buildExport(sampleState(), sampleData())));
const refused = (value, expected) => {
  const r = parseBackup(typeof value === 'string' ? value : JSON.stringify(value));
  assert.equal(r.ok, false, 'devrait être refusé');
  assert.match(r.error, expected);
};

test('texte vide, JSON cassé, autre type de fichier : refusés avec un message précis', () => {
  refused('', /Rien à importer/);
  refused('   ', /Rien à importer/);
  refused('{pas du json', /n'est pas du JSON valide/);
  refused('[1,2]', /n'est pas une sauvegarde de Dashboard Homepage/);
  refused('"texte"', /n'est pas une sauvegarde de Dashboard Homepage/);
  refused({ app: 'autre-application', exportVersion: 1 }, /n'est pas une sauvegarde de Dashboard Homepage/);
  refused({ name: 'package.json', version: '1.0.0' }, /n'est pas une sauvegarde de Dashboard Homepage/);
});

test('enveloppe incomplète ou abîmée : refusée', () => {
  const noVersion = valid();
  delete noVersion.exportVersion;
  refused(noVersion, /version de son format/);
  const noData = valid();
  delete noData.data;
  refused(noData, /incomplète ou abîmée/);
  refused({ ...valid(), data: [] }, /incomplète ou abîmée/);
  refused({ ...valid(), state: undefined }, /incomplète ou abîmée/);
  refused({ ...valid(), state: null }, /configuration de la sauvegarde est invalide/);
  refused({ ...valid(), state: { version: 2, theme: 'bleu' } }, /configuration de la sauvegarde est invalide/);
});

test('état de la sauvegarde invalide (page sans identifiant, dimensions négatives) : refusé', () => {
  const bad = valid();
  bad.state.pages[0].instances[0].layout.w = 0;
  refused(bad, /configuration de la sauvegarde est invalide/);
});

test('données d\'un widget invalides : refusées, en nommant le widget', () => {
  const bad = valid();
  bad.data.a = { version: 'x', data: {}, updatedAt: 1 };
  refused(bad, /données du widget a sont invalides/);
  const noPayload = valid();
  noPayload.data.b = { version: 1, updatedAt: 1 };
  refused(noPayload, /données du widget b sont invalides/);
});

test('deux widgets avec le même identifiant : refusé', () => {
  const bad = valid();
  bad.state.pages[0].instances.push(inst('a'));
  refused(bad, /même identifiant \(a\)/);
});

test('fichier trop gros : refusé avant toute lecture du contenu', () => {
  const big = ' '.repeat(MAX_IMPORT_BYTES + 1);
  refused(big, /trop gros/);
  // La limite s'applique en octets, pas en caractères : « é » pèse deux octets.
  const wide = JSON.stringify({ app: APP_ID, texte: 'é'.repeat(MAX_IMPORT_BYTES / 2 + 10) });
  refused(wide, /trop gros/);
  assert.equal(parseBackup(JSON.stringify(valid()), { maxBytes: 10 }).ok, false);
});

test('format d\'export plus récent que celui du code : refusé, message clair', () => {
  refused({ ...valid(), exportVersion: 2 }, /version plus récente de Dashboard Homepage \(format 2/);
});

test('état de version plus récente que le code : refusé, message clair', () => {
  const future = valid();
  future.state.version = 9;
  refused(future, /version 9, plus récente que celle de l'application/);
});

test('une donnée sans widget correspondant est ignorée (et signalée), pas importée', () => {
  const extra = valid();
  extra.data.fantome = entry({ x: 1 });
  const r = parseBackup(JSON.stringify(extra));
  assert.equal(r.ok, true);
  assert.deepEqual(r.ignoredDataIds, ['fantome']);
  assert.equal('fantome' in r.backup.data, false);
});

test('un état de version 1 (ancienne sauvegarde) est migré sans perte à l\'import', () => {
  const old = valid();
  delete old.state.preferences;
  old.state.version = 1;
  const r = parseBackup(JSON.stringify(old));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.backup.state.version, 2);
  assert.deepEqual(r.backup.state.preferences, { singleKeyShortcuts: true });
  assert.deepEqual(r.backup.state.pages, sampleState().pages);
  assert.equal(r.backup.state.theme, 'dark');
});

test('un widget absent de la sauvegarde mais dont les données manquent : accepté (reconcile les initialisera)', () => {
  const noData = valid();
  delete noData.data.c;
  assert.equal(parseBackup(JSON.stringify(noData)).ok, true);
});

// --- Résumé -------------------------------------------------------------------------------------

test('résumé : pages, widgets par type, types inconnus du registre conservés', () => {
  const r = parseBackup(serializeExport(buildExport(sampleState(), sampleData(), new Date('2026-10-28T10:00:00Z'))));
  const summary = summarizeBackup(r.backup, known);
  assert.deepEqual(summary, {
    pages: 1,
    widgets: 4,
    byType: [{ type: 'notes', count: 1 }, { type: 'todo', count: 2 }],
    unknownTypes: ['futur-widget'],
    exportedAt: '2026-10-28T10:00:00.000Z',
  });
});

// --- Remplacement ---------------------------------------------------------------------------------

test('type de widget inconnu : conservé par l\'import, avec ses données', async () => {
  const t = await setup({ state: createDefaultState(() => 'vide'), data: {} });
  const r = parseBackup(serializeExport(buildExport(sampleState(), sampleData())));
  await replaceConfiguration(t.deps, r.backup);
  const z = t.dashboardStore.getState().pages[0].instances.find((i) => i.id === 'z');
  assert.equal(z.type, 'futur-widget');
  assert.deepEqual(t.dataStore.getData('z'), entry({ inconnu: true }));
  assert.ok('dash:data:z' in t.adapter.dump());
  assert.equal(t.reconciles(), 1, 'reconcile relancé');
});

test('remplacement : les clés de données devenues orphelines sont supprimées, y compris celles jamais chargées', async () => {
  const t = await setup({ extra: { 'dash:data:jamais-charge': JSON.stringify(entry({})), 'dash:backup:a': '{"ancien":1}' } });
  const smaller = createDefaultState(() => 'p2');
  smaller.pages[0].instances = [inst('a', 'todo')];
  const r = await replaceConfiguration(t.deps, { state: smaller, data: { a: entry({ tasks: ['nouvelle'] }) }, exportedAt: null });
  const keys = storedKeys(t.adapter);
  assert.deepEqual(keys.filter((k) => k.startsWith('dash:data:')), ['dash:data:a']);
  assert.ok(r.removedKeys.includes('dash:data:jamais-charge'));
  assert.equal(JSON.parse(t.adapter.dump()['dash:data:a']).data.tasks[0], 'nouvelle');
  assert.equal(t.adapter.dump()['dash:backup:a'], '{"ancien":1}', 'une copie de sauvegarde d\'instance n\'est pas une donnée orpheline : conservée');
});

test('remplacement : aucune clé hors du préfixe dash: n\'est lue, écrite ou supprimée', async () => {
  const t = await setup({ extra: { 'autre-site:a': '1', 'theme': 'rouge', 'dashboard-autre': 'x' } });
  const r = parseBackup(serializeExport(buildExport(createDefaultState(() => 'p9'), {})));
  await replaceConfiguration(t.deps, r.backup);
  await resetConfiguration(t.deps);
  for (const [, key] of t.writes) assert.ok(key.startsWith('dash:'), `écriture hors préfixe : ${key}`);
  const dump = t.adapter.dump();
  assert.equal(dump['autre-site:a'], '1');
  assert.equal(dump['theme'], 'rouge');
  assert.equal(dump['dashboard-autre'], 'x');
});

test('remplacement : on peut revenir en arrière avec la photo prise juste avant', async () => {
  const t = await setup();
  const before = t.adapter.dump();
  const other = createDefaultState(() => 'p2');
  other.pages[0].instances = [inst('n', 'notes')];
  const { previous } = await replaceConfiguration(t.deps, { state: other, data: { n: entry({ text: '' }) }, exportedAt: null });
  assert.deepEqual(Object.keys(t.adapter.dump()).filter((k) => k.startsWith('dash:data:')), ['dash:data:n']);
  await restoreSnapshot(t.deps, previous);
  assert.deepEqual(t.adapter.dump(), before);
});

test('lecture seule : ni remplacement, ni réinitialisation, rien n\'est écrit', async () => {
  const t = await setup();
  t.statusStore.setState({ readOnly: true });
  const before = t.adapter.dump();
  t.writes.length = 0;
  await assert.rejects(() => replaceConfiguration(t.deps, parseBackup(serializeExport(buildExport(sampleState(), sampleData()))).backup), /Lecture seule/);
  await assert.rejects(() => resetConfiguration(t.deps), /Lecture seule/);
  assert.deepEqual(t.writes, []);
  assert.deepEqual(t.adapter.dump(), before);
});

// --- Réinitialisation -------------------------------------------------------------------------------

test('réinitialisation : page « Principal » vide, plus de données ni de copies dash:, thème et préférences conservés', async () => {
  const t = await setup({ extra: { 'dash:backup:a': 'x', 'dash:backup:state': 'y', 'dash:theme-mirror': 'dark', 'autre:k': 'v' } });
  const { previous } = await resetConfiguration(t.deps, () => 'neuve');
  const state = t.dashboardStore.getState();
  assert.equal(state.pages.length, 1);
  assert.equal(state.pages[0].name, 'Principal');
  assert.deepEqual(state.pages[0].instances, []);
  assert.equal(state.theme, 'dark');
  assert.deepEqual(state.preferences, { singleKeyShortcuts: false });
  const keys = storedKeys(t.adapter);
  assert.deepEqual(keys, ['autre:k', 'dash:state', 'dash:theme-mirror']);
  assert.equal(previous.state.pages[0].instances.length, 4, 'la photo d\'avant permet l\'annulation');
});

test('réinitialisation puis annulation : tout revient', async () => {
  const t = await setup();
  const before = t.adapter.dump();
  const { previous } = await resetConfiguration(t.deps);
  await restoreSnapshot(t.deps, previous);
  assert.deepEqual(t.adapter.dump(), before);
});
