// Interface de stockage. Elle est asynchrone dès le départ parce que
// chrome.storage l'est : le jour où l'extension arrive, seul l'adaptateur change.
// Aucun composant ni widget n'appelle localStorage directement.

/**
 * @typedef {Object} StorageAdapter
 * @property {(key: string) => Promise<string|null>} get
 * @property {(key: string, value: string) => Promise<void>} set
 *   Une implémentation doit lancer StorageFullError quand le stockage est plein.
 * @property {(key: string) => Promise<void>} remove
 * @property {(prefix: string) => Promise<string[]>} keys clés complètes qui commencent par `prefix`
 * @property {(listener: (key: string) => void) => () => void} [subscribe]
 *   changements venant d'un autre onglet ; renvoie la fonction de désabonnement
 */

/** Le stockage est plein (quota dépassé). */
export class StorageFullError extends Error {
  /** @param {string} [message] */
  constructor(message = 'Stockage plein') {
    super(message);
    this.name = 'StorageFullError';
  }
}
