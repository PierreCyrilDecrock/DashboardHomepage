// Panneau de réglages du widget de démonstration : le libellé.

import { html } from '../../lib/vendor.js';
import { Field } from '../../ui/Field.js';

/**
 * @param {import('../types.js').WidgetSettingsProps<{ label: string }>} props
 */
export function DemoSettings({ settings, onChange }) {
  return html`
    <div class="settings-form">
      <${Field} label="Libellé" help="Texte affiché au-dessus du compteur (60 caractères au plus).">
        ${(/** @type {any} */ control) => html`
          <input
            ...${control}
            class="input"
            type="text"
            maxlength="60"
            value=${settings.label}
            onInput=${(/** @type {Event} */ e) => onChange({ label: /** @type {HTMLInputElement} */ (e.currentTarget).value })}
          />
        `}
      <//>
    </div>
  `;
}
