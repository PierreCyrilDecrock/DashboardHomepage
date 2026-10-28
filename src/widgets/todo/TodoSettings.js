// Panneau de réglages du widget À faire : deux interrupteurs.

import { html } from '../../lib/vendor.js';
import { Toggle } from '../../ui/Toggle.js';

/**
 * @param {import('../types.js').WidgetSettingsProps<typeof import('./schema.js').defaultSettings>} props
 */
export function TodoSettings({ settings, onChange }) {
  return html`
    <div class="settings-form">
      <${Toggle}
        label="Afficher la progression"
        help="Une barre fine sous le compteur « 3 / 6 »."
        checked=${settings.showProgress}
        onChange=${(/** @type {boolean} */ on) => onChange({ showProgress: on })}
      />
      <${Toggle}
        label="Tâches terminées en bas"
        help="Les tâches cochées descendent sous les autres."
        checked=${settings.doneLast}
        onChange=${(/** @type {boolean} */ on) => onChange({ doneLast: on })}
      />
    </div>
  `;
}
