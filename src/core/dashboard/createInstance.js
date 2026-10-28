// Création d'une instance de widget à partir de sa définition.

import { newId } from '../../lib/id.js';
import { dataStore as defaultDataStore } from '../store/dataStore.js';

/** Ordonnée de départ : très basse, la grille remontera le widget à la première place libre. */
export const NEW_INSTANCE_Y = 1000;

/**
 * Renvoie une nouvelle instance (UUID, taille par défaut, réglages par défaut, version de la
 * définition) et initialise ses données par défaut dans le dataStore. L'instance n'est PAS
 * ajoutée à la disposition : l'appelant fait dashboardStore.addInstance(instance).
 * @param {import('../../widgets/types.js').WidgetDefinition<any, any>} definition
 * @param {{ dataStore?: ReturnType<typeof import('../store/dataStore.js').createDataStore>, generateId?: () => string }} [options]
 * @returns {import('../types.js').WidgetInstance}
 */
export function createInstance(definition, { dataStore = defaultDataStore, generateId = newId } = {}) {
  const id = generateId();
  const instance = {
    id,
    type: definition.type,
    layout: { x: 0, y: NEW_INSTANCE_Y, w: definition.defaultSize.w, h: definition.defaultSize.h },
    settings: structuredClone(definition.defaultSettings),
    version: definition.version,
  };
  dataStore.setData(id, structuredClone(definition.defaultData), { version: definition.version });
  return instance;
}
