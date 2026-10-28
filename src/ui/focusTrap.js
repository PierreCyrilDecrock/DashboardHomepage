// Piège de focus des fenêtres modales (Dialog, Drawer) : la logique pure est ici,
// le branchement sur le DOM est dans Modal.js.

/** Éléments qui peuvent recevoir le focus au clavier. */
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Indice de l'élément à focaliser après Tab (ou Maj + Tab) : on boucle dans la fenêtre.
 * @param {number} count nombre d'éléments focalisables
 * @param {number} current indice de l'élément actuel (-1 si le focus est hors de la liste)
 * @param {boolean} backwards vrai pour Maj + Tab
 * @returns {number} indice, ou -1 s'il n'y a rien à focaliser
 */
export function nextTrapIndex(count, current, backwards) {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return backwards ? (current - 1 + count) % count : (current + 1) % count;
}

/**
 * Éléments focalisables et visibles d'un conteneur.
 * @param {HTMLElement} root
 * @returns {HTMLElement[]}
 */
export function getFocusable(root) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(FOCUSABLE)]).filter(
    (el) => !el.hidden && !el.closest('[hidden], [inert]') && el.getClientRects().length > 0,
  );
}
