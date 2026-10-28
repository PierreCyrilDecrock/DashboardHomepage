// Bouton : variantes primaire, secondaire, discrète et danger. Cible tactile d'au moins 44 px.

import { html } from '../lib/vendor.js';
import { Icon } from './icons.js';

/** @typedef {'primary' | 'secondary' | 'ghost' | 'danger'} ButtonVariant */

/**
 * @param {{ variant?: ButtonVariant, icon?: string, class?: string, children?: any, [key: string]: any }} props
 *   `icon` : nom d'une icône de src/ui/icons.js ; un bouton à icône seule doit porter un aria-label.
 */
export function Button({ variant = 'secondary', icon, class: className = '', children, ...rest }) {
  return html`<button type="button" class=${`btn btn--${variant} ${className}`.trim()} ...${rest}>
    ${icon && html`<${Icon} name=${icon} size=${18} />`}${children}
  </button>`;
}
