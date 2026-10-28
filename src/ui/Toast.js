// Notification éphémère, avec un bouton d'action facultatif (par exemple « Annuler »).

import { html, useEffect, useRef } from '../lib/vendor.js';
import { Button } from './Button.js';

/**
 * @param {{ message: string, actionLabel?: string, focusAction?: boolean, onAction?: () => void, onDismiss: () => void }} props
 */
export function Toast({ message, actionLabel, focusAction = false, onAction, onDismiss }) {
  const root = useRef(/** @type {HTMLElement | null} */ (null));
  useEffect(() => {
    if (focusAction) /** @type {HTMLElement | null | undefined} */ (root.current?.querySelector('.toast__action'))?.focus();
  }, [focusAction]);

  return html`
    <div class="toast" role="status" ref=${root}>
      <p class="toast__message">${message}</p>
      ${actionLabel && html`<${Button} variant="ghost" class="toast__action" onClick=${onAction}>${actionLabel}<//>`}
      <${Button} variant="ghost" icon="x" class="toast__close" aria-label="Fermer la notification" onClick=${onDismiss} />
    </div>
  `;
}
