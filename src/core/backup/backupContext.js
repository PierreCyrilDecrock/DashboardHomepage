// Branchement de la sauvegarde sur l'application (comme instanceBackup.js pour les instances).
//
// main.js appelle configureBackup() une fois le stockage, les stores, la persistance et le registre
// prêts ; les boîtes de dialogue n'ont alors qu'à appeler getBackupDeps(). Garde aussi en mémoire,
// pour la session seulement, la configuration d'avant le dernier remplacement (annulation).

import { createStore } from '../store/createStore.js';

/**
 * @typedef {Object} BackupSession
 * @property {{ label: string, snapshot: import('./exportImport.js').ConfigurationSnapshot } | null} undo
 *   configuration d'avant le dernier remplacement ou la dernière réinitialisation (non sauvegardée)
 */

/** @type {import('./exportImport.js').BackupDeps | null} */
let deps = null;

export const backupSession = createStore(/** @type {BackupSession} */ ({ undo: null }));

/** @param {import('./exportImport.js').BackupDeps | null} next */
export function configureBackup(next) {
  deps = next;
  backupSession.setState({ undo: null });
}

/** @returns {import('./exportImport.js').BackupDeps} */
export function getBackupDeps() {
  if (deps === null) throw new Error('La sauvegarde n\'est pas branchée (configureBackup).');
  return deps;
}
