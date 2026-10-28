// Adaptateur StorageAdapter en mémoire : tests, et repli quand le stockage est refusé
// (rien n'est alors conservé après la fermeture de la page).

import { KEY_PREFIX } from './keys.js';

/**
 * @param {{ prefix?: string, initial?: Record<string, string> }} [options]
 * @returns {import('./StorageAdapter.js').StorageAdapter & {
 *   dump: () => Record<string, string>,
 *   simulateExternalChange: (key: string, value: string | null) => void
 * }}
 */
export function createMemoryAdapter({ prefix = KEY_PREFIX, initial = {} } = {}) {
  /** @type {Map<string, string>} */
  const map = new Map(Object.entries(initial));
  /** @type {Set<(key: string) => void>} */
  const listeners = new Set();
  /** @param {string} key */
  const assertKey = (key) => {
    if (typeof key !== 'string' || !key.startsWith(prefix)) {
      throw new Error(`Clé refusée : « ${key} » ne commence pas par « ${prefix} »`);
    }
  };

  return {
    async get(key) {
      assertKey(key);
      return map.has(key) ? /** @type {string} */ (map.get(key)) : null;
    },
    async set(key, value) {
      assertKey(key);
      map.set(key, String(value));
    },
    async remove(key) {
      assertKey(key);
      map.delete(key);
    },
    async keys(keyPrefix) {
      assertKey(keyPrefix);
      return [...map.keys()].filter((k) => k.startsWith(keyPrefix)).sort();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Copie du contenu (pour les tests). */
    dump() {
      return Object.fromEntries(map);
    },
    /** Imite une modification faite par un autre onglet (pour les tests). */
    simulateExternalChange(key, value) {
      if (value === null) map.delete(key);
      else map.set(key, value);
      for (const l of [...listeners]) l(key);
    },
  };
}
