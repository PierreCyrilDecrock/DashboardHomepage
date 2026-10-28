// Adaptateur StorageAdapter sur localStorage. Avec memoryAdapter.js et
// themeMirror.js, c'est le seul fichier du projet qui touche localStorage.

import { KEY_PREFIX } from './keys.js';
import { StorageFullError } from './StorageAdapter.js';

/** @returns {Storage | undefined} localStorage, ou undefined s'il est inaccessible. */
function getLocalStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined; // accès refusé (SecurityError)
  }
}

/**
 * Vrai si localStorage fonctionne : un essai d'écriture le prouve.
 * @param {Storage | undefined} [storage]
 * @returns {boolean}
 */
export function isLocalStorageUsable(storage = getLocalStorage()) {
  if (!storage) return false;
  try {
    const probe = KEY_PREFIX + 'probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** @param {any} err */
function isQuotaError(err) {
  return (
    err?.name === 'QuotaExceededError' ||
    err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err?.code === 22 ||
    err?.code === 1014
  );
}

/**
 * @param {string} [prefix] toute clé doit commencer par ce préfixe
 * @param {{ storage?: Storage, target?: EventTarget }} [options] doublures pour les tests
 * @returns {import('./StorageAdapter.js').StorageAdapter}
 */
export function createLocalStorageAdapter(prefix = KEY_PREFIX, { storage, target } = {}) {
  const store = () => {
    const s = storage ?? getLocalStorage();
    if (!s) throw new Error('localStorage est indisponible');
    return s;
  };
  /** @param {string} key */
  const assertKey = (key) => {
    if (typeof key !== 'string' || !key.startsWith(prefix)) {
      throw new Error(`Clé refusée : « ${key} » ne commence pas par « ${prefix} »`);
    }
  };

  return {
    // Les fonctions async s'exécutent de façon synchrone jusqu'à leur premier await :
    // l'écriture a donc bien lieu pendant l'événement pagehide qui la déclenche.
    async get(key) {
      assertKey(key);
      return store().getItem(key);
    },
    async set(key, value) {
      assertKey(key);
      try {
        store().setItem(key, value);
      } catch (err) {
        if (isQuotaError(err)) throw new StorageFullError();
        throw err;
      }
    },
    async remove(key) {
      assertKey(key);
      store().removeItem(key);
    },
    async keys(keyPrefix) {
      assertKey(keyPrefix);
      const s = store();
      const found = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k !== null && k.startsWith(keyPrefix)) found.push(k);
      }
      return found.sort();
    },
    subscribe(listener) {
      const t = target ?? globalThis;
      /** @param {any} event */
      const handler = (event) => {
        // L'événement « storage » ne se déclenche que pour les changements faits dans un AUTRE onglet.
        if (typeof event.key === 'string' && event.key.startsWith(prefix)) listener(event.key);
      };
      t.addEventListener('storage', handler);
      return () => t.removeEventListener('storage', handler);
    },
  };
}
