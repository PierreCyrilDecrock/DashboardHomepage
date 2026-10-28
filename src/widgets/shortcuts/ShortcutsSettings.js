// Panneau de réglages du widget Raccourcis : nouvel onglet, noms, taille des tuiles, icônes.

import { html } from '../../lib/vendor.js';
import { FAVICON_SERVICE_NAME } from '../../lib/platform/favicon.js';
import { Field } from '../../ui/Field.js';
import { Toggle } from '../../ui/Toggle.js';

const SIZE_LABELS = { sm: 'Petites', md: 'Moyennes', lg: 'Grandes' };

/**
 * @param {import('../types.js').WidgetSettingsProps<typeof import('./schema.js').defaultSettings>} props
 */
export function ShortcutsSettings({ settings, onChange }) {
  return html`
    <div class="settings-form">
      <${Toggle}
        label="Ouvrir dans un nouvel onglet"
        help="Sinon le lien s'ouvre dans l'onglet courant. Ctrl ou Cmd + clic ouvre toujours un nouvel onglet."
        checked=${settings.openInNewTab}
        onChange=${(/** @type {boolean} */ on) => onChange({ openInNewTab: on })}
      />
      <${Toggle}
        label="Afficher les noms"
        help="Le nom sous chaque tuile, sur une ligne."
        checked=${settings.showLabels}
        onChange=${(/** @type {boolean} */ on) => onChange({ showLabels: on })}
      />
      <${Field} label="Taille des tuiles">
        ${(/** @type {any} */ control) => html`
          <select ...${control} class="input" value=${settings.tileSize} onChange=${(/** @type {Event} */ e) => onChange({ tileSize: /** @type {HTMLSelectElement} */ (e.currentTarget).value })}>
            ${Object.entries(SIZE_LABELS).map(([value, label]) => html`<option value=${value} selected=${settings.tileSize === value}>${label}</option>`)}
          </select>
        `}
      <//>
      <fieldset class="shortcuts-settings__icons">
        <legend class="field__label">Icônes</legend>
        <label class="shortcuts-settings__choice">
          <input type="radio" name="shortcuts-icons" value="letter" checked=${settings.icons === 'letter'} onChange=${() => onChange({ icons: 'letter' })} />
          <span>Lettre initiale</span>
        </label>
        <label class="shortcuts-settings__choice">
          <input
            type="radio"
            name="shortcuts-icons"
            value="favicon"
            aria-describedby="shortcuts-icons-notice"
            checked=${settings.icons === 'favicon'}
            onChange=${() => onChange({ icons: 'favicon' })}
          />
          <span>Icônes du site</span>
        </label>
        <p class="shortcuts-settings__notice" id="shortcuts-icons-notice">Les noms de domaine sont envoyés à ${FAVICON_SERVICE_NAME} pour récupérer les icônes.</p>
      </fieldset>
    </div>
  `;
}
