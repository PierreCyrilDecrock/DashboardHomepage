// Persistance : écrit les stores dans l'adaptateur de stockage.
//
//  - Les stores travaillent en mémoire ; chaque changement est écrit avec un délai
//    de 300 ms (regroupement des frappes).
//  - On ne réécrit que ce qui a changé : une modification des données de l'instance X
//    n'écrit que dash:data:X ; un déplacement de widget n'écrit que dash:state.
//  - Les écritures en attente sont forcées quand la page est masquée (visibilitychange)
//    et à sa fermeture (pagehide), pour ne rien perdre.
//  - Un changement fait par un autre onglet recharge le store concerné ; la dernière
//    écriture gagne.
//  - En lecture seule (données d'une version plus récente), rien n'est jamais écrit.
//  - Une erreur de quota passe statusStore.storageFull à vrai.

import { debounce } from '../../lib/debounce.js';
import { readState, readStoredData } from './hydrate.js';
import { STATE_KEY, dataKey, instanceIdFromDataKey } from './keys.js';
import { StorageFullError } from './StorageAdapter.js';

/**
 * @typedef {Object} PersistenceOptions
 * @property {import('./StorageAdapter.js').StorageAdapter} adapter
 * @property {ReturnType<typeof import('../store/dashboardStore.js').createDashboardStore>} dashboardStore
 * @property {ReturnType<typeof import('../store/dataStore.js').createDataStore>} dataStore
 * @property {import('../store/createStore.js').Store<import('../store/statusStore.js').StatusState>} statusStore
 * @property {number} [delay] regroupement des écritures, en ms (300 par défaut)
 * @property {Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>} [doc]
 * @property {Pick<Window, 'addEventListener' | 'removeEventListener'>} [win]
 */

/**
 * @param {PersistenceOptions} options
 * @returns {{ flush: () => Promise<void>, markStateDirty: () => void, stop: () => Promise<void> }}
 */
export function startPersistence({
  adapter,
  dashboardStore,
  dataStore,
  statusStore,
  delay = 300,
  doc = globalThis.document,
  win = globalThis.window,
}) {
  /** Clés à écrire au prochain regroupement. @type {Set<string>} */
  const pending = new Set();
  let applyingRemote = false;
  let stopped = false;
  /** @type {Promise<void>} */
  let inflight = Promise.resolve();

  const isReadOnly = () => statusStore.getState().readOnly;

  /** @param {string} key */
  function schedule(key) {
    if (stopped || applyingRemote || isReadOnly()) return;
    pending.add(key);
    debounced();
  }

  /** @param {string} key */
  async function writeKey(key) {
    if (key === STATE_KEY) return adapter.set(key, JSON.stringify(dashboardStore.getState()));
    const id = instanceIdFromDataKey(key);
    if (id === null) return undefined;
    const entry = dataStore.getData(id);
    return entry === undefined ? adapter.remove(key) : adapter.set(key, JSON.stringify(entry));
  }

  function writePending() {
    if (stopped || isReadOnly()) {
      pending.clear();
      return;
    }
    const keys = [...pending];
    pending.clear();
    if (keys.length === 0) return;
    // Tous les appels à l'adaptateur partent tout de suite (de façon synchrone) : à la
    // fermeture de la page, aucune écriture ne dépend d'une étape asynchrone.
    const attempts = keys.map((key) => writeKey(key).then(() => null, (err) => err));
    const job = Promise.all(attempts).then((errors) => {
      const failures = errors.filter(Boolean);
      if (failures.some((e) => e instanceof StorageFullError)) {
        statusStore.setState({ storageFull: true });
      } else if (failures.length === 0) {
        statusStore.setState({ storageFull: false });
      }
      for (const err of failures) {
        if (!(err instanceof StorageFullError)) console.error('Écriture impossible dans le stockage :', err);
      }
    });
    inflight = Promise.all([inflight, job]).then(() => undefined);
  }

  const debounced = debounce(writePending, delay);

  /** Force les écritures en attente ; la promesse se termine quand elles sont faites. */
  function flush() {
    debounced.flush();
    return inflight;
  }

  const unsubscribeDashboard = dashboardStore.subscribe((state, previous) => {
    if (state !== previous) schedule(STATE_KEY);
  });

  const unsubscribeData = dataStore.subscribe((state, previous) => {
    if (state.byId === previous.byId) return;
    for (const id of Object.keys(state.byId)) {
      if (state.byId[id] !== previous.byId[id]) schedule(dataKey(id));
    }
    for (const id of Object.keys(previous.byId)) {
      if (!(id in state.byId)) schedule(dataKey(id));
    }
  });

  // Changement venant d'un autre onglet : on recharge le store concerné (la dernière écriture gagne).
  /** @param {string} key */
  async function reloadKey(key) {
    try {
      if (key === STATE_KEY) {
        const raw = await adapter.get(key);
        if (raw === null) return;
        const read = readState(raw);
        if (read.status === 'newer') {
          // Une version plus récente a écrit : on arrête d'écrire pour ne pas la corrompre.
          pending.clear();
          statusStore.setState({ readOnly: true });
        } else if (read.status === 'ok') {
          pending.delete(STATE_KEY);
          applyingRemote = true;
          try {
            dashboardStore.replaceAll(read.state);
          } finally {
            applyingRemote = false;
          }
        }
        return;
      }
      const id = instanceIdFromDataKey(key);
      if (id === null) return;
      const raw = await adapter.get(key);
      pending.delete(key);
      applyingRemote = true;
      try {
        if (raw === null) {
          dataStore.removeData(id);
        } else {
          const read = readStoredData(raw);
          if (read.ok) dataStore.putEntry(id, read.value);
        }
      } finally {
        applyingRemote = false;
      }
    } catch (err) {
      console.error('Rechargement depuis un autre onglet impossible :', err);
    }
  }
  const unsubscribeAdapter = adapter.subscribe?.((key) => {
    void reloadKey(key);
  });

  const onVisibility = () => {
    if (doc?.visibilityState === 'hidden') void flush();
  };
  const onPageHide = () => {
    void flush();
  };
  doc?.addEventListener?.('visibilitychange', onVisibility);
  win?.addEventListener?.('pagehide', onPageHide);

  return {
    flush,
    /** Marque l'état comme à réenregistrer (par exemple après une migration). */
    markStateDirty() {
      schedule(STATE_KEY);
    },
    /** Écrit ce qui est en attente, puis arrête tout. */
    async stop() {
      debounced.flush();
      stopped = true;
      unsubscribeDashboard();
      unsubscribeData();
      unsubscribeAdapter?.();
      doc?.removeEventListener?.('visibilitychange', onVisibility);
      win?.removeEventListener?.('pagehide', onPageHide);
      await inflight;
    },
  };
}
