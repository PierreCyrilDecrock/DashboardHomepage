// Panneau de réglages du widget Notes : taille du texte, police mono, correction orthographique.

import { html } from '../../lib/vendor.js';
import { Field } from '../../ui/Field.js';
import { Toggle } from '../../ui/Toggle.js';

const SIZE_LABELS = { sm: 'Petit', md: 'Moyen', lg: 'Grand' };

/**
 * @param {import('../types.js').WidgetSettingsProps<typeof import('./schema.js').defaultSettings>} props
 */
export function NotesSettings({ settings, onChange }) {
  return html`
    <div class="settings-form">
      <${Field} label="Taille du texte">
        ${(/** @type {any} */ control) => html`
          <select ...${control} class="input" value=${settings.fontSize} onChange=${(/** @type {Event} */ e) => onChange({ fontSize: /** @type {HTMLSelectElement} */ (e.currentTarget).value })}>
            ${Object.entries(SIZE_LABELS).map(([value, label]) => html`<option value=${value} selected=${settings.fontSize === value}>${label}</option>`)}
          </select>
        `}
      <//>
      <${Toggle}
        label="Police à chasse fixe"
        help="Caractères de même largeur, pratique pour du code ou des listes alignées."
        checked=${settings.monospace}
        onChange=${(/** @type {boolean} */ on) => onChange({ monospace: on })}
      />
      <${Toggle}
        label="Correction orthographique"
        help="Souligne les fautes de frappe dans le navigateur."
        checked=${settings.spellcheck}
        onChange=${(/** @type {boolean} */ on) => onChange({ spellcheck: on })}
      />
    </div>
  `;
}
