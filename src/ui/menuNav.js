// Navigation au clavier d'un menu (flèches, Début, Fin) : logique pure, sans DOM.

/**
 * Indice de l'entrée à focaliser après une touche, ou -1 si la touche n'est pas gérée.
 * @param {string} key  'ArrowDown', 'ArrowUp', 'Home' ou 'End'
 * @param {number} current indice actuel (-1 : aucune entrée focalisée)
 * @param {number} count nombre d'entrées
 * @returns {number}
 */
export function nextMenuIndex(key, current, count) {
  if (count <= 0) return -1;
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return -1;
  }
}
