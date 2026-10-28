// État du stockage, pour les bandeaux d'information. Non sauvegardé.

import { createStore } from './createStore.js';

/**
 * @typedef {Object} StatusState
 * @property {boolean} storageFull le stockage est plein : des écritures ont échoué
 * @property {boolean} readOnly données d'une version plus récente que le code : rien n'est écrit
 * @property {boolean} storageUnavailable le navigateur refuse le stockage : repli en mémoire, rien n'est conservé
 * @property {ResetNotice | null} resetNotice des données invalides ont été remplacées au démarrage (fermable)
 */

/**
 * @typedef {Object} ResetNotice
 * @property {boolean} state l'état global (disposition) était invalide : copie dans dash:backup:state
 * @property {string[]} instanceIds instances dont les données invalides ont été réinitialisées : copies dans dash:backup:<id>
 */

/** @returns {import('./createStore.js').Store<StatusState>} */
export function createStatusStore() {
  return createStore({ storageFull: false, readOnly: false, storageUnavailable: false, resetNotice: null });
}

export const statusStore = createStatusStore();
