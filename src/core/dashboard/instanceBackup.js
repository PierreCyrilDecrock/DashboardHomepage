// Copies de sauvegarde du contenu d'une instance (clé dash:backup:<instanceId>).
//
// Quand un contenu est écarté (invalide, ou remplacé par « Réinitialiser ce widget »), on
// en garde une copie avant de l'écraser. Le contenu est enregistré en JSON, pour que
// l'utilisateur puisse le récupérer à la main. Le point d'écriture est branché au démarrage
// par main.js : le cadre de widget ne touche jamais au stockage lui-même.

import { backupKey } from '../storage/keys.js';

/** @type {import('../storage/StorageAdapter.js').StorageAdapter | null} */
let storage = null;
/** @type {() => boolean} */
let isReadOnly = () => false;

/**
 * Branche les copies de sauvegarde sur un adaptateur de stockage.
 * @param {import('../storage/StorageAdapter.js').StorageAdapter | null} adapter
 * @param {() => boolean} [readOnly] vrai en lecture seule : rien n'est écrit
 */
export function configureInstanceBackup(adapter, readOnly = () => false) {
  storage = adapter;
  isReadOnly = readOnly;
}

/**
 * Écrit `content` dans dash:backup:<instanceId>, en remplaçant la copie précédente.
 * @param {string} instanceId
 * @param {unknown} content contenu à conserver (réglages et/ou données)
 * @returns {Promise<boolean>} vrai si la copie a été écrite
 */
export async function backupInstance(instanceId, content) {
  if (storage === null || isReadOnly()) return false;
  const key = backupKey(instanceId);
  try {
    await storage.set(key, JSON.stringify(content));
    return true;
  } catch (err) {
    console.warn(`Copie de sauvegarde impossible (${key}) :`, /** @type {Error} */ (err).message);
    return false;
  }
}
