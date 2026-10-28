// Icônes Lucide en SVG en ligne : trait fin, couleur héritée du texte.
// Les tracés sont dans iconData.js (généré par tools/vendor.mjs).

import { html } from '../lib/vendor.js';
import { ICON_PATHS } from './iconData.js';

/** Noms d'icônes disponibles. */
export const ICON_NAMES = Object.keys(ICON_PATHS);

/**
 * Icône décorative : masquée aux lecteurs d'écran (aria-hidden).
 * Un bouton qui ne contient qu'une icône doit porter un aria-label.
 * @param {{ name: string, size?: number, class?: string }} props
 */
export function Icon({ name, size = 20, class: className = '' }) {
  const inner = ICON_PATHS[name];
  if (inner === undefined) return null;
  return html`<svg
    xmlns="http://www.w3.org/2000/svg"
    class=${('icon ' + className).trim()}
    width=${size}
    height=${size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    dangerouslySetInnerHTML=${{ __html: inner }}
  />`;
}
