// Chargement de l'état au démarrage : lit dash:state et toutes les clés dash:data:*,
// valide avec Zod, migre si besoin, et garde une copie de tout ce qui est invalide.
//
// Règles :
//  - rien d'enregistré → état par défaut ;
//  - état invalide → copie du texte brut dans dash:backup:state, puis état par défaut ;
//  - donnée d'instance invalide → copie dans dash:backup:<id>, instance signalée
//    (la réinitialisation se fait avec le registre, en phase 2) ;
//  - version enregistrée plus récente que celle du code → lecture seule : rien n'est
//    jamais écrit, pas même une copie de sauvegarde.

import { CURRENT_STATE_VERSION } from '../types.js';
import { createDefaultState } from './defaultState.js';
import { BACKUP_STATE_KEY, DATA_PREFIX, STATE_KEY, backupKey, instanceIdFromDataKey } from './keys.js';
import { migrateState, stateMigrations } from './migrations.js';
import { dashboardStateSchema, describeZodError, storedDataSchema } from './schemas.js';

/**
 * @typedef {Object} HydrateOptions
 * @property {import('./migrations.js').StateMigration[]} [migrations]
 * @property {number} [currentVersion] version de format du code (surchargée dans les tests)
 * @property {() => string} [generateId] pour l'état par défaut
 */

/**
 * Remet la page active sur une page qui existe.
 * @param {import('../types.js').DashboardState} state
 * @returns {import('../types.js').DashboardState}
 */
function normalizeState(state) {
  if (state.pages.some((p) => p.id === state.activePageId)) return state;
  return { ...state, activePageId: state.pages[0].id };
}

/**
 * Lit un état brut (texte JSON) : parse, migre, valide.
 * @param {string} raw
 * @param {HydrateOptions} [options]
 * @returns {{ status: 'ok', state: import('../types.js').DashboardState, migrated: boolean }
 *   | { status: 'newer', version: number, state: import('../types.js').DashboardState | null }
 *   | { status: 'invalid', reason: string }}
 */
export function readState(raw, { migrations = stateMigrations, currentVersion = CURRENT_STATE_VERSION } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid', reason: 'le texte n\'est pas du JSON valide' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'invalid', reason: 'l\'état n\'est pas un objet' };
  }
  const version = parsed.version;
  if (!Number.isInteger(version) || version < 1) {
    return { status: 'invalid', reason: 'numéro de version absent ou invalide' };
  }

  if (version > currentVersion) {
    // Enregistré par une version plus récente : on lit ce qu'on peut, sans migrer ni écrire.
    const attempt = dashboardStateSchema.safeParse(parsed);
    return { status: 'newer', version, state: attempt.success ? normalizeState(/** @type {any} */ (attempt.data)) : null };
  }

  let candidate = parsed;
  let migrated = false;
  if (version < currentVersion) {
    const result = migrateState(parsed, version, currentVersion, migrations);
    if (!result.ok) return { status: 'invalid', reason: result.error };
    candidate = result.state;
    migrated = true;
  }
  const check = dashboardStateSchema.safeParse(candidate);
  if (!check.success) return { status: 'invalid', reason: describeZodError(check.error) };
  return { status: 'ok', state: normalizeState(/** @type {any} */ (check.data)), migrated };
}

/**
 * Lit l'enveloppe StoredData d'une instance (texte JSON).
 * @param {string} raw
 * @returns {{ ok: true, value: import('../types.js').StoredData<unknown> } | { ok: false, reason: string }}
 */
export function readStoredData(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'le texte n\'est pas du JSON valide' };
  }
  const check = storedDataSchema.safeParse(parsed);
  if (!check.success) return { ok: false, reason: describeZodError(check.error) };
  return { ok: true, value: /** @type {any} */ (check.data) };
}

/**
 * @typedef {Object} HydrateResult
 * @property {import('../types.js').DashboardState} state
 * @property {Record<string, import('../types.js').StoredData<unknown>>} data données valides, par identifiant d'instance
 * @property {boolean} readOnly vrai si l'état enregistré est d'une version plus récente que le code
 * @property {boolean} stateWasReset vrai si l'état enregistré était invalide (copie dans dash:backup:state)
 * @property {boolean} stateUnreadable vrai si l'état d'une version plus récente n'a pas pu être lu (état par défaut, en mémoire)
 * @property {boolean} migrated vrai si l'état a été migré (à réenregistrer)
 * @property {string[]} invalidInstanceIds instances dont les données sont invalides, à réinitialiser
 * @property {string[]} warnings
 */

/**
 * Charge l'état complet depuis l'adaptateur.
 * @param {import('./StorageAdapter.js').StorageAdapter} adapter
 * @param {HydrateOptions} [options]
 * @returns {Promise<HydrateResult>}
 */
export async function hydrate(adapter, options = {}) {
  /** @type {HydrateResult} */
  const result = {
    state: createDefaultState(options.generateId),
    data: {},
    readOnly: false,
    stateWasReset: false,
    stateUnreadable: false,
    migrated: false,
    invalidInstanceIds: [],
    warnings: [],
  };

  /**
   * Copie le contenu invalide avant de l'écarter. Jamais en lecture seule.
   * @param {string} key
   * @param {string} raw
   */
  const backup = async (key, raw) => {
    if (result.readOnly) return;
    try {
      await adapter.set(key, raw);
    } catch (err) {
      result.warnings.push(`Copie de sauvegarde impossible (${key}) : ${/** @type {Error} */ (err).message}`);
    }
  };

  const rawState = await adapter.get(STATE_KEY);
  if (rawState !== null) {
    const read = readState(rawState, options);
    if (read.status === 'ok') {
      result.state = read.state;
      result.migrated = read.migrated;
    } else if (read.status === 'newer') {
      result.readOnly = true;
      if (read.state) result.state = read.state;
      else result.stateUnreadable = true;
      result.warnings.push(`L'état enregistré est en version ${read.version}, plus récente que celle de l'application : lecture seule.`);
    } else {
      await backup(BACKUP_STATE_KEY, rawState);
      result.stateWasReset = true;
      result.warnings.push(`État enregistré invalide (${read.reason}) : copié dans ${BACKUP_STATE_KEY}.`);
    }
  }

  for (const key of await adapter.keys(DATA_PREFIX)) {
    const id = instanceIdFromDataKey(key);
    if (id === null) continue;
    const raw = await adapter.get(key);
    if (raw === null) continue;
    const read = readStoredData(raw);
    if (read.ok) {
      result.data[id] = read.value;
    } else {
      result.invalidInstanceIds.push(id);
      await backup(backupKey(id), raw);
      result.warnings.push(`Données invalides pour l'instance ${id} (${read.reason}) : copiées dans ${backupKey(id)}.`);
    }
  }
  return result;
}
