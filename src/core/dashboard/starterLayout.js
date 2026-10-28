// Disposition de départ : proposée dans l'état vide du dashboard. Heure, Minuteur et À faire (à
// droite, sur deux rangées) en haut, puis Notes et Raccourcis, sur la grille de 12 colonnes.
//
//   colonnes :  0..3        4..7        8..11
//   rangée 1 :  Heure       Minuteur    À faire
//   rangée 2 :  Notes       Raccourcis  (À faire, suite)

import { dashboardActions } from './actions.js';
import { dashboardStore } from '../store/dashboardStore.js';
import { getDefinition } from '../../widgets/registry.js';

/** @type {ReadonlyArray<{ type: string, layout: { x: number, y: number, w: number, h: number } }>} */
export const STARTER_LAYOUT = [
  { type: 'clock', layout: { x: 0, y: 0, w: 4, h: 3 } },
  { type: 'timer', layout: { x: 4, y: 0, w: 4, h: 3 } },
  { type: 'todo', layout: { x: 8, y: 0, w: 4, h: 6 } },
  { type: 'notes', layout: { x: 0, y: 3, w: 4, h: 3 } },
  { type: 'shortcuts', layout: { x: 4, y: 3, w: 4, h: 3 } },
];

/**
 * Ajoute les widgets de la disposition de départ qui existent dans le registre (les autres sont
 * ignorés), puis les place d'un seul coup.
 * @param {{
 *   actions?: Pick<typeof dashboardActions, 'addWidget'>,
 *   store?: Pick<typeof dashboardStore, 'updateLayouts'>,
 *   isRegistered?: (type: string) => boolean,
 * }} [deps]
 * @returns {string[]} identifiants des instances créées
 */
export function applyStarterLayout({ actions = dashboardActions, store = dashboardStore, isRegistered = (type) => getDefinition(type) !== undefined } = {}) {
  /** @type {string[]} */
  const ids = [];
  /** @type {Record<string, { x: number, y: number, w: number, h: number }>} */
  const layouts = {};
  for (const { type, layout } of STARTER_LAYOUT) {
    if (!isRegistered(type)) continue;
    const id = actions.addWidget(type);
    if (id === null) continue;
    ids.push(id);
    layouts[id] = { ...layout };
  }
  store.updateLayouts(layouts);
  return ids;
}
