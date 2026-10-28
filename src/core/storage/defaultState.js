// État initial : une page « Principal », aucune instance, thème du système, raccourcis à une touche actifs.

import { newId } from '../../lib/id.js';
import { CURRENT_STATE_VERSION } from '../types.js';

/**
 * @param {() => string} [generateId]
 * @returns {import('../types.js').DashboardState}
 */
export function createDefaultState(generateId = newId) {
  const pageId = generateId();
  return {
    version: CURRENT_STATE_VERSION,
    theme: 'system',
    preferences: { singleKeyShortcuts: true },
    activePageId: pageId,
    pages: [{ id: pageId, name: 'Principal', instances: [] }],
  };
}
