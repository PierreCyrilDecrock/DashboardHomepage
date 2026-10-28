// Fait défiler jusqu'à un widget et lui donne le focus (après un ajout, une annulation).

/**
 * @param {string} instanceId
 * @param {Document} [doc]
 * @returns {boolean} vrai si le widget a été trouvé
 */
export function focusWidget(instanceId, doc = globalThis.document) {
  const el = /** @type {HTMLElement | null} */ (doc.querySelector(`section.widget[data-instance-id="${CSS.escape(instanceId)}"]`));
  if (!el) return false;
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
  return true;
}

/**
 * Attend que l'interface soit à jour (fermeture d'un panneau, rendu de la grille), puis focalise.
 * @param {string} instanceId
 */
export function focusWidgetSoon(instanceId) {
  requestAnimationFrame(() => requestAnimationFrame(() => focusWidget(instanceId)));
}
