// Migrations de l'état global (DashboardState). Chaque migration fait passer
// l'état de la version `from` à la version `to` ; elles s'enchaînent dans l'ordre.
// Version 1 → 2 (phase 10) : ajout des préférences (raccourcis à une touche actifs par défaut).
//
// Les formats propres à chaque widget ont leur propre migrate (WidgetDefinition).

import { CURRENT_STATE_VERSION } from '../types.js';

/**
 * @typedef {Object} StateMigration
 * @property {number} from version de départ
 * @property {number} to version d'arrivée
 * @property {(raw: any) => any} migrate reçoit l'état brut de la version `from`, renvoie celui de `to`
 */

/** @type {StateMigration[]} */
export const stateMigrations = [
  {
    from: 1,
    to: 2,
    migrate: (raw) => ({
      ...raw,
      // Un état déjà doté de préférences (écrit à la main) les garde ; le reste reçoit les valeurs par défaut.
      preferences: { singleKeyShortcuts: true, ...(raw.preferences !== null && typeof raw.preferences === 'object' ? raw.preferences : {}) },
    }),
  },
];

/**
 * Enchaîne les migrations de `fromVersion` jusqu'à `toVersion`.
 * @param {any} raw état brut (objet JSON)
 * @param {number} fromVersion
 * @param {number} [toVersion]
 * @param {StateMigration[]} [migrations]
 * @returns {{ ok: true, state: any } | { ok: false, error: string }}
 */
export function migrateState(raw, fromVersion, toVersion = CURRENT_STATE_VERSION, migrations = stateMigrations) {
  let state = raw;
  let version = fromVersion;
  while (version < toVersion) {
    const step = migrations.find((m) => m.from === version);
    if (!step) return { ok: false, error: `aucune migration depuis la version ${version}` };
    try {
      state = { ...step.migrate(state), version: step.to };
    } catch (err) {
      return { ok: false, error: `la migration ${step.from} → ${step.to} a échoué : ${/** @type {Error} */ (err).message}` };
    }
    version = step.to;
  }
  return { ok: true, state };
}
