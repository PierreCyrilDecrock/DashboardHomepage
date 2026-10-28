// Fenêtres modales : Dialog (au centre) et Drawer (panneau latéral).
//
// Accessibilité : role="dialog" aria-modal, titre relié par aria-labelledby, piège de focus
// (Tab reste dans la fenêtre), fermeture par Échap ou clic sur le fond, et retour du focus à
// l'élément qui l'avait avant l'ouverture. Aucune boîte de dialogue du navigateur.

import { html, useEffect, useRef } from '../lib/vendor.js';
import { Button } from './Button.js';
import { getFocusable, nextTrapIndex } from './focusTrap.js';

let counter = 0;

/**
 * @param {{ kind: 'dialog' | 'drawer', title: string, onClose: () => void, footer?: any, children?: any, class?: string }} props
 *   Dans le contenu, un élément portant data-autofocus reçoit le focus à l'ouverture.
 */
function Modal({ kind, title, onClose, footer, children, class: className = '' }) {
  const titleId = useRef(`modal-title-${++counter}`);
  const panel = useRef(/** @type {HTMLElement | null} */ (null));
  // Élément qui avait le focus avant l'ouverture (relevé au premier rendu).
  const opener = useRef(/** @type {Element | null} */ (typeof document === 'undefined' ? null : document.activeElement));

  useEffect(() => {
    const root = panel.current;
    if (!root) return undefined;
    const body = /** @type {HTMLElement | null} */ (root.querySelector('.modal__body'));
    // Le contenu d'abord (champ de recherche, premier réglage), le bouton « Fermer » en dernier recours.
    const target = /** @type {HTMLElement | null} */ (root.querySelector('[data-autofocus]')) ?? (body ? getFocusable(body)[0] : undefined) ?? getFocusable(root)[0] ?? root;
    target.focus();
    return () => {
      const origin = /** @type {HTMLElement | null} */ (opener.current);
      const active = document.activeElement;
      // On rend le focus seulement s'il n'a pas déjà été placé ailleurs (par exemple sur un widget ajouté).
      const unplaced = active === null || active === document.body || root.contains(active);
      if (unplaced && origin && origin.isConnected && typeof origin.focus === 'function') origin.focus();
    };
  }, []);

  /** @param {KeyboardEvent} event */
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const items = getFocusable(panel.current);
    const current = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const next = nextTrapIndex(items.length, current, event.shiftKey);
    if (next === -1) {
      event.preventDefault();
      panel.current.focus();
    } else if (current === -1 || (event.shiftKey && current === 0) || (!event.shiftKey && current === items.length - 1)) {
      event.preventDefault();
      items[next].focus();
    }
  };

  return html`
    <div class=${`modal modal--${kind} ${className}`.trim()} onKeyDown=${onKeyDown}>
      <div class="modal__backdrop" onClick=${onClose}></div>
      <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby=${titleId.current} tabindex="-1" ref=${panel}>
        <header class="modal__header">
          <h2 class="modal__title" id=${titleId.current}>${title}</h2>
          <${Button} variant="ghost" icon="x" aria-label="Fermer" onClick=${onClose} />
        </header>
        <div class="modal__body">${children}</div>
        ${footer && html`<footer class="modal__footer">${footer}</footer>`}
      </div>
    </div>
  `;
}

/**
 * Boîte de dialogue centrée.
 * @param {{ title: string, onClose: () => void, footer?: any, children?: any }} props
 */
export function Dialog(props) {
  return html`<${Modal} kind="dialog" ...${props} />`;
}

/**
 * Panneau latéral.
 * @param {{ title: string, onClose: () => void, footer?: any, children?: any }} props
 */
export function Drawer(props) {
  return html`<${Modal} kind="drawer" ...${props} />`;
}
