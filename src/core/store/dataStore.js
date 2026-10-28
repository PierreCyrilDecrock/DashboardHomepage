// Store des données d'instance : table instanceId → StoredData.
// Chaque instance a sa propre entrée (clé de stockage dash:data:<instanceId>) :
// deux widgets du même type n'ont jamais les mêmes données.

import { createStore } from './createStore.js';

/** @typedef {import('../types.js').StoredData<unknown>} StoredEntry */

/**
 * @param {{ now?: () => number }} [options]
 */
export function createDataStore({ now = () => Date.now() } = {}) {
  const store = createStore(/** @type {{ byId: Record<string, StoredEntry> }} */ ({ byId: {} }));

  /** @param {string} id */
  const getData = (id) => store.getState().byId[id];

  return {
    ...store,

    /** Entrée complète (version, données, date) d'une instance, ou undefined. @param {string} id */
    getData,

    /**
     * Modifie les données d'une instance. `updater` est une fonction (données actuelles →
     * nouvelles données) ou directement la nouvelle valeur. Renvoyer la même référence ne
     * change rien. La version du format n'est utile qu'à la création de l'entrée.
     * @param {string} id
     * @param {unknown | ((current: any) => unknown)} updater
     * @param {{ version?: number }} [options]
     */
    setData(id, updater, { version } = {}) {
      store.setState((state) => {
        const entry = state.byId[id];
        const next = typeof updater === 'function' ? updater(entry?.data) : updater;
        if (entry && Object.is(next, entry.data)) return null;
        return {
          byId: { ...state.byId, [id]: { version: entry?.version ?? version ?? 1, data: next, updatedAt: now() } },
        };
      });
    },

    /**
     * Remplace l'entrée telle quelle (rechargement depuis le stockage, import).
     * @param {string} id
     * @param {StoredEntry} entry
     */
    putEntry(id, entry) {
      store.setState((state) => ({ byId: { ...state.byId, [id]: entry } }));
    },

    /**
     * Retire les données d'une instance et renvoie l'entrée retirée (pour permettre l'annulation).
     * @param {string} id
     * @returns {StoredEntry | undefined}
     */
    removeData(id) {
      const removed = getData(id);
      if (removed === undefined) return undefined;
      store.setState((state) => {
        const { [id]: _gone, ...rest } = state.byId;
        return { byId: rest };
      });
      return removed;
    },

    /**
     * Copie en profondeur les données d'une instance vers une autre (duplication).
     * @param {string} fromId
     * @param {string} toId
     * @returns {boolean} faux si l'instance source n'a pas de données
     */
    cloneData(fromId, toId) {
      const source = getData(fromId);
      if (source === undefined) return false;
      store.setState((state) => ({
        byId: { ...state.byId, [toId]: { version: source.version, data: structuredClone(source.data), updatedAt: now() } },
      }));
      return true;
    },

    /** Remplace toute la table (chargement, import). @param {Record<string, StoredEntry>} byId */
    replaceAll(byId) {
      store.setState({ byId }, true);
    },
  };
}

/** Le store de données de l'application. */
export const dataStore = createDataStore();
