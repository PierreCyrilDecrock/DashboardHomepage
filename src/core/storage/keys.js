// Clés de stockage. Toutes commencent par « dash: » : le localStorage d'un site
// GitHub Pages est commun à tous les sites du même compte, donc le code ne
// l'efface jamais en bloc.

export const KEY_PREFIX = 'dash:';
export const STATE_KEY = 'dash:state';
export const DATA_PREFIX = 'dash:data:';
export const BACKUP_PREFIX = 'dash:backup:';
export const BACKUP_STATE_KEY = 'dash:backup:state';
export const THEME_MIRROR_KEY = 'dash:theme-mirror';

/** @param {string} instanceId */
export const dataKey = (instanceId) => DATA_PREFIX + instanceId;

/** @param {string} instanceId */
export const backupKey = (instanceId) => BACKUP_PREFIX + instanceId;

/**
 * Renvoie l'identifiant d'instance d'une clé dash:data:<id>, ou null pour une autre clé.
 * @param {string} key
 * @returns {string|null}
 */
export function instanceIdFromDataKey(key) {
  return key.startsWith(DATA_PREFIX) && key.length > DATA_PREFIX.length ? key.slice(DATA_PREFIX.length) : null;
}
