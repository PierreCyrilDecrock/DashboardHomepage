// Miroir du thème dans localStorage (clé dash:theme-mirror).
//
// Le stockage de l'application est asynchrone, mais theme-init.js doit lire le
// thème de façon synchrone avant le premier affichage. On recopie donc le thème
// choisi ici à chaque changement. Avec l'adaptateur localStorage, c'est le seul
// fichier du projet à toucher localStorage (et theme-init.js le lit).

import { THEME_MIRROR_KEY } from './keys.js';

/** @returns {Storage | undefined} */
function getLocalStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * @param {string} theme 'light', 'dark' ou 'system'
 * @param {Storage | undefined} [storage]
 */
export function writeThemeMirror(theme, storage = getLocalStorage()) {
  try {
    storage?.setItem(THEME_MIRROR_KEY, theme);
  } catch {
    /* stockage refusé ou plein : le thème reste suivi par le système au prochain chargement */
  }
}

/**
 * @param {Storage | undefined} [storage]
 * @returns {string | null}
 */
export function readThemeMirror(storage = getLocalStorage()) {
  try {
    return storage?.getItem(THEME_MIRROR_KEY) ?? null;
  } catch {
    return null;
  }
}
