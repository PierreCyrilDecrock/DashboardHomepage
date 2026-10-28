// Sauvegarde du dashboard : export, import (avec validation complète), remplacement et
// réinitialisation de la configuration.
//
// Format du fichier (exportVersion 1) :
//   { app: 'dashboard-homepage', exportVersion: 1, exportedAt: '2026-10-28T10:00:00.000Z',
//     state: <DashboardState>, data: { <instanceId>: <StoredData>, … } }
//
// Principes :
//  - tout ce qui est lu d'un fichier ou d'un texte collé passe par Zod avant d'être utilisé ;
//  - un fichier invalide, trop gros ou d'une version plus récente est REFUSÉ sans rien écraser ;
//  - un widget de type inconnu du registre est conservé (affiché « indisponible ») ;
//  - remplacer ou réinitialiser ne touche qu'aux clés « dash: » (l'adaptateur de stockage le
//    garantit aussi), jamais à localStorage en bloc.

import { z } from '../../lib/vendor.js';
import { CURRENT_STATE_VERSION } from '../types.js';
import { createDefaultState } from '../storage/defaultState.js';
import { readState } from '../storage/hydrate.js';
import { BACKUP_PREFIX, DATA_PREFIX, instanceIdFromDataKey } from '../storage/keys.js';
import { describeZodError, storedDataSchema } from '../storage/schemas.js';

export const APP_ID = 'dashboard-homepage';
export const EXPORT_VERSION = 1;
/** Taille maximale d'un fichier ou d'un texte importé. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/**
 * @typedef {Object} Backup
 * @property {import('../types.js').DashboardState} state
 * @property {Record<string, import('../types.js').StoredData<unknown>>} data données par identifiant d'instance
 * @property {string | null} exportedAt date de l'export (texte ISO), si le fichier la porte
 */

/**
 * @typedef {Object} BackupSummary
 * @property {number} pages
 * @property {number} widgets
 * @property {Array<{ type: string, count: number }>} byType types connus, par ordre alphabétique
 * @property {string[]} unknownTypes types absents du registre (conservés tels quels)
 * @property {string | null} exportedAt
 */

// --- Export -----------------------------------------------------------------------------------

/**
 * Construit le contenu d'un export. Seules les données des instances présentes sont incluses.
 * @param {import('../types.js').DashboardState} state
 * @param {Record<string, import('../types.js').StoredData<unknown>>} dataById
 * @param {Date} [now]
 */
export function buildExport(state, dataById, now = new Date()) {
  /** @type {Record<string, import('../types.js').StoredData<unknown>>} */
  const data = {};
  for (const page of state.pages) {
    for (const instance of page.instances) {
      if (instance.id in dataById) data[instance.id] = dataById[instance.id];
    }
  }
  return { app: APP_ID, exportVersion: EXPORT_VERSION, exportedAt: now.toISOString(), state, data };
}

/**
 * Texte JSON d'un export (indenté : lisible et comparable à la main).
 * @param {ReturnType<typeof buildExport>} backup
 */
export const serializeExport = (backup) => JSON.stringify(backup, null, 2);

/**
 * Nom de fichier : dashboard-homepage-AAAA-MM-JJ.json (date locale).
 * @param {Date} [date]
 */
export function exportFileName(date = new Date()) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `dashboard-homepage-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

// --- Import : lecture et validation -----------------------------------------------------------

const envelopeSchema = z.looseObject({
  app: z.literal(APP_ID),
  exportVersion: z.number().int().min(1),
  exportedAt: z.string().optional(),
  state: z.unknown(),
  data: z.record(z.string(), z.unknown()),
});

/** @param {string} text */
const byteLength = (text) => new TextEncoder().encode(text).length;

/** Message affiché quand un fichier choisi dépasse la limite (vérifié avant de le lire). */
export const TOO_BIG_MESSAGE = `Le fichier est trop gros (plus de ${MAX_IMPORT_BYTES / (1024 * 1024)} Mo) : une sauvegarde de Dashboard Homepage est bien plus légère.`;

/**
 * Lit et valide un texte de sauvegarde. Ne modifie rien.
 * @param {string} text
 * @param {{ maxBytes?: number, currentVersion?: number, migrations?: import('../storage/migrations.js').StateMigration[] }} [options]
 * @returns {{ ok: true, backup: Backup, ignoredDataIds: string[] } | { ok: false, error: string }}
 */
export function parseBackup(text, { maxBytes = MAX_IMPORT_BYTES, currentVersion = CURRENT_STATE_VERSION, migrations } = {}) {
  if (typeof text === 'string' && byteLength(text) > maxBytes) return { ok: false, error: TOO_BIG_MESSAGE };
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: 'Rien à importer : colle le texte d\'une sauvegarde ou choisis un fichier.' };

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Ce contenu n\'est pas du JSON valide : il est peut-être incomplet ou ce n\'est pas une sauvegarde.' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.app !== APP_ID) {
    return { ok: false, error: 'Le fichier n\'est pas une sauvegarde de Dashboard Homepage.' };
  }
  if (!Number.isInteger(parsed.exportVersion) || parsed.exportVersion < 1) {
    return { ok: false, error: 'La sauvegarde n\'indique pas la version de son format : elle est abîmée ou incomplète.' };
  }
  if (parsed.exportVersion > EXPORT_VERSION) {
    return {
      ok: false,
      error: `Cette sauvegarde a été faite par une version plus récente de Dashboard Homepage (format ${parsed.exportVersion}, celui-ci lit jusqu'au format ${EXPORT_VERSION}). Mets l'application à jour pour l'importer.`,
    };
  }
  const envelope = envelopeSchema.safeParse(parsed);
  if (!envelope.success) return { ok: false, error: `La sauvegarde est incomplète ou abîmée (${describeZodError(envelope.error)}).` };

  const read = readState(JSON.stringify(envelope.data.state ?? null), { currentVersion, ...(migrations ? { migrations } : {}) });
  if (read.status === 'newer') {
    return {
      ok: false,
      error: `La configuration de cette sauvegarde est en version ${read.version}, plus récente que celle de l'application (version ${currentVersion}) : mets l'application à jour pour l'importer.`,
    };
  }
  if (read.status === 'invalid') return { ok: false, error: `La configuration de la sauvegarde est invalide (${read.reason}).` };

  const state = read.state;
  const ids = new Set();
  for (const page of state.pages) {
    for (const instance of page.instances) {
      if (ids.has(instance.id)) return { ok: false, error: `Deux widgets de la sauvegarde portent le même identifiant (${instance.id}) : elle est abîmée.` };
      ids.add(instance.id);
    }
  }

  /** @type {Record<string, import('../types.js').StoredData<unknown>>} */
  const data = {};
  /** @type {string[]} */
  const ignoredDataIds = [];
  for (const [id, entry] of Object.entries(envelope.data.data)) {
    if (!ids.has(id)) {
      ignoredDataIds.push(id);
      continue;
    }
    const check = storedDataSchema.safeParse(entry);
    if (!check.success) return { ok: false, error: `Les données du widget ${id} sont invalides (${describeZodError(check.error)}) : la sauvegarde n'est pas utilisable.` };
    data[id] = /** @type {any} */ (check.data);
  }
  return { ok: true, backup: { state, data, exportedAt: envelope.data.exportedAt ?? null }, ignoredDataIds };
}

/**
 * Résumé affiché avant de remplacer la configuration.
 * @param {Backup} backup
 * @param {(type: string) => boolean} isKnownType  vrai si le registre connaît ce type
 * @returns {BackupSummary}
 */
export function summarizeBackup(backup, isKnownType) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  /** @type {Set<string>} */
  const unknown = new Set();
  let widgets = 0;
  for (const page of backup.state.pages) {
    for (const instance of page.instances) {
      widgets++;
      if (isKnownType(instance.type)) counts.set(instance.type, (counts.get(instance.type) ?? 0) + 1);
      else unknown.add(instance.type);
    }
  }
  return {
    pages: backup.state.pages.length,
    widgets,
    byType: [...counts].map(([type, count]) => ({ type, count })).sort((a, b) => a.type.localeCompare(b.type)),
    unknownTypes: [...unknown].sort(),
    exportedAt: backup.exportedAt,
  };
}

// --- Remplacement et réinitialisation -----------------------------------------------------------

/**
 * @typedef {Object} ConfigurationSnapshot
 * @property {import('../types.js').DashboardState} state
 * @property {Record<string, import('../types.js').StoredData<unknown>>} data
 */

/**
 * @typedef {Object} BackupDeps
 * @property {import('../storage/StorageAdapter.js').StorageAdapter} adapter
 * @property {ReturnType<typeof import('../store/dashboardStore.js').createDashboardStore>} dashboardStore
 * @property {ReturnType<typeof import('../store/dataStore.js').createDataStore>} dataStore
 * @property {() => Promise<void>} flush écrit tout de suite les modifications en attente (persistance)
 * @property {() => unknown} reconcile met les instances en accord avec le registre (migrations, données par défaut)
 * @property {() => boolean} [isReadOnly] vrai en lecture seule : rien ne doit être remplacé
 */

/** Photo de la configuration actuelle (pour proposer l'annulation). @param {BackupDeps} deps @returns {ConfigurationSnapshot} */
export function takeSnapshot({ dashboardStore, dataStore }) {
  return { state: dashboardStore.getState(), data: { ...dataStore.getState().byId } };
}

/**
 * Remplace la configuration par `next`, écrit, puis supprime les clés devenues orphelines.
 * @param {BackupDeps} deps
 * @param {ConfigurationSnapshot} next
 * @param {{ clearBackups?: boolean }} [options]  clearBackups : supprime aussi les copies dash:backup:*
 * @returns {Promise<{ previous: ConfigurationSnapshot, removedKeys: string[] }>}
 */
async function applyConfiguration(deps, next, { clearBackups = false } = {}) {
  const { adapter, dashboardStore, dataStore, flush, reconcile } = deps;
  if (deps.isReadOnly?.()) throw new Error('Lecture seule : ces données viennent d\'une version plus récente de l\'application, rien ne peut être remplacé.');
  const previous = takeSnapshot(deps);

  dashboardStore.replaceAll(next.state);
  dataStore.replaceAll(next.data);
  await flush();

  // Clés devenues orphelines : celles dont l'instance n'existe plus (y compris des données
  // invalides jamais chargées en mémoire). Seules des clés dash:data: / dash:backup: sont visées.
  const kept = new Set(next.state.pages.flatMap((p) => p.instances.map((i) => i.id)));
  /** @type {string[]} */
  const removedKeys = [];
  for (const key of await adapter.keys(DATA_PREFIX)) {
    const id = instanceIdFromDataKey(key);
    if (id !== null && !kept.has(id)) {
      await adapter.remove(key);
      removedKeys.push(key);
    }
  }
  if (clearBackups) {
    for (const key of await adapter.keys(BACKUP_PREFIX)) {
      await adapter.remove(key);
      removedKeys.push(key);
    }
  }

  reconcile();
  await flush();
  return { previous, removedKeys };
}

/**
 * Remplace la configuration par une sauvegarde déjà validée (voir parseBackup).
 * @param {BackupDeps} deps
 * @param {Backup} backup
 */
export function replaceConfiguration(deps, backup) {
  return applyConfiguration(deps, { state: backup.state, data: backup.data });
}

/**
 * Réinitialise le dashboard : une page vide, plus aucune donnée de widget, plus de copies
 * dash:backup:*. Le thème et les préférences sont conservés.
 * @param {BackupDeps} deps
 * @param {() => string} [generateId]
 */
export function resetConfiguration(deps, generateId) {
  const current = deps.dashboardStore.getState();
  const fresh = createDefaultState(generateId);
  return applyConfiguration(deps, { state: { ...fresh, theme: current.theme, preferences: current.preferences }, data: {} }, { clearBackups: true });
}

/**
 * Revient à la configuration d'avant un remplacement ou une réinitialisation.
 * @param {BackupDeps} deps
 * @param {ConfigurationSnapshot} snapshot
 */
export function restoreSnapshot(deps, snapshot) {
  return applyConfiguration(deps, snapshot);
}
