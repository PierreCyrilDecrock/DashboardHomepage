// Affiché à la place d'une instance dont le type n'est pas (ou plus) dans le registre.
// Il ne touche à rien : les réglages et les données restent enregistrés, et le widget
// réapparaît si son type revient.

import { html } from '../../lib/vendor.js';
import { Icon } from '../../ui/icons.js';

/**
 * @param {{ type: string }} props
 */
export function UnknownWidget({ type }) {
  return html`
    <div class="widget__unknown">
      <${Icon} name="layout-grid" size=${24} />
      <p class="widget__unknown-title">Widget indisponible</p>
      <p class="widget__unknown-type">Type : <code>${type}</code></p>
      <p class="widget__unknown-hint">Ses données sont conservées.</p>
    </div>
  `;
}
