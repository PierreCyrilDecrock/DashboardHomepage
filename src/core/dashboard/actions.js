// Actions de composition du dashboard : ajouter, dupliquer, supprimer (avec annulation),
// renommer et régler une instance. Elles relient le dashboardStore (disposition), le dataStore
// (données) et le registre (définitions des widgets).
//
// Les dépendances sont injectées : les tests créent leurs propres stores et leurs propres minuteurs.

import { newId } from '../../lib/id.js';
import { dashboardStore as defaultDashboard, findInstance } from '../store/dashboardStore.js';
import { dataStore as defaultData } from '../store/dataStore.js';
import { getDefinition as defaultGetDefinition } from '../../widgets/registry.js';
import { createInstance } from './createInstance.js';
import { resolveValue } from './frameLogic.js';

/** Durée pendant laquelle une suppression peut être annulée. */
export const UNDO_DELAY_MS = 8000;

/**
 * @typedef {Object} PendingRemoval
 * @property {import('../types.js').WidgetInstance} instance
 * @property {string} pageId
 * @property {number} index
 * @property {import('../types.js').StoredData<unknown> | undefined} entry
 * @property {unknown} timer
 */

/**
 * @param {{
 *   dashboardStore?: ReturnType<typeof import('../store/dashboardStore.js').createDashboardStore>,
 *   dataStore?: ReturnType<typeof import('../store/dataStore.js').createDataStore>,
 *   getDefinition?: (type: string) => import('../../widgets/types.js').WidgetDefinition<any, any> | undefined,
 *   generateId?: () => string,
 *   now?: () => number,
 *   setTimer?: (fn: () => void, ms: number) => unknown,
 *   clearTimer?: (timer: unknown) => void,
 * }} [deps]
 */
export function createDashboardActions({
  dashboardStore = defaultDashboard,
  dataStore = defaultData,
  getDefinition = defaultGetDefinition,
  generateId = newId,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (timer) => clearTimeout(/** @type {any} */ (timer)),
} = {}) {
  /** @type {Map<string, PendingRemoval>} */
  const pending = new Map();

  return {
    /**
     * Ajoute une instance du type donné à la page active (le même type peut être ajouté autant de fois qu'on veut).
     * @param {string} type
     * @returns {string | null} identifiant de la nouvelle instance, ou null si le type est inconnu
     */
    addWidget(type) {
      const definition = getDefinition(type);
      if (definition === undefined) return null;
      const instance = createInstance(definition, { dataStore, generateId });
      try {
        dashboardStore.addInstance(instance);
      } catch (err) {
        dataStore.removeData(instance.id);
        throw err;
      }
      return instance.id;
    },

    /**
     * Nouvelle instance du même type : mêmes réglages, titre suffixé « (copie) », données copiées
     * (cloneData de la définition, sinon copie profonde), placée juste sous l'original.
     * @param {string} id
     * @returns {string | null} identifiant de la copie, ou null si l'instance n'existe pas
     */
    duplicateInstance(id) {
      const found = findInstance(dashboardStore.getState(), id);
      if (!found) return null;
      const { instance, pageId, index } = found;
      const definition = getDefinition(instance.type);
      const newInstanceId = generateId();
      const entry = dataStore.getData(id);
      if (entry !== undefined) {
        const clone = definition?.cloneData ?? structuredClone;
        dataStore.putEntry(newInstanceId, { version: entry.version, data: clone(entry.data), updatedAt: now() });
      }
      const title = `${instance.title ?? definition?.name ?? instance.type} (copie)`;
      try {
        dashboardStore.insertInstance(
          {
            ...instance,
            id: newInstanceId,
            title,
            layout: { ...instance.layout, y: instance.layout.y + instance.layout.h },
            settings: structuredClone(instance.settings),
          },
          { pageId, index: index + 1 },
        );
      } catch (err) {
        dataStore.removeData(newInstanceId);
        throw err;
      }
      return newInstanceId;
    },

    /**
     * Retire l'instance ET ses données ; une copie reste en mémoire pendant UNDO_DELAY_MS pour
     * permettre restoreInstance. Passé ce délai, la suppression est définitive.
     * @param {string} id
     * @returns {boolean} faux si l'instance n'existe pas
     */
    removeInstance(id) {
      const found = findInstance(dashboardStore.getState(), id);
      if (!found) return false;
      const entry = dataStore.removeData(id);
      dashboardStore.removeInstance(id);
      const timer = setTimer(() => pending.delete(id), UNDO_DELAY_MS);
      pending.set(id, { instance: found.instance, pageId: found.pageId, index: found.index, entry, timer });
      return true;
    },

    /**
     * Annule une suppression : l'instance revient à sa place, avec ses données.
     * @param {string} id
     * @returns {boolean} faux si le délai est dépassé ou si rien n'avait été supprimé
     */
    restoreInstance(id) {
      const record = pending.get(id);
      if (!record) return false;
      clearTimer(record.timer);
      pending.delete(id);
      if (record.entry !== undefined) dataStore.putEntry(id, record.entry);
      dashboardStore.insertInstance(record.instance, { pageId: record.pageId, index: record.index });
      return true;
    },

    /** Vrai si l'instance vient d'être supprimée et peut encore être restaurée. @param {string} id */
    canRestore: (id) => pending.has(id),

    /** Titre personnalisé ; vide = nom du type. @param {string} id @param {string} title */
    renameInstance(id, title) {
      dashboardStore.setInstanceTitle(id, title);
    },

    /**
     * Fusionne `patch` dans les réglages de l'instance, après validation par le settingsSchema du type.
     * @param {string} id
     * @param {Record<string, unknown>} patch
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    updateInstanceSettings(id, patch) {
      const found = findInstance(dashboardStore.getState(), id);
      if (!found) return { ok: false, error: 'Instance introuvable.' };
      const definition = getDefinition(found.instance.type);
      if (!definition) return { ok: false, error: 'Type de widget inconnu.' };
      const current = resolveValue(definition.settingsSchema, found.instance.settings, definition.defaultSettings);
      const check = definition.settingsSchema.safeParse({ ...current.value, ...patch });
      if (!check.success) return { ok: false, error: check.error?.issues?.[0]?.message ?? 'Réglages invalides.' };
      // Réglages enregistrés invalides : on réécrit l'ensemble validé, pas seulement le patch.
      if (current.valid) dashboardStore.updateInstanceSettings(id, patch);
      else dashboardStore.replaceInstanceSettings(id, check.data);
      return { ok: true };
    },

    /**
     * Remet les réglages par défaut du type.
     * @param {string} id
     * @returns {boolean}
     */
    resetInstanceSettings(id) {
      const found = findInstance(dashboardStore.getState(), id);
      const definition = found && getDefinition(found.instance.type);
      if (!definition) return false;
      dashboardStore.replaceInstanceSettings(id, structuredClone(definition.defaultSettings));
      return true;
    },

    /** Abandonne les suppressions en attente (tests, fermeture). */
    dispose() {
      for (const { timer } of pending.values()) clearTimer(timer);
      pending.clear();
    },
  };
}

/** Les actions de l'application. */
export const dashboardActions = createDashboardActions();

