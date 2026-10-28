// Aide des raccourcis clavier, et petit panneau de préférences (raccourcis à une touche).

import { html } from '../../lib/vendor.js';
import { Button } from '../../ui/Button.js';
import { Toggle } from '../../ui/Toggle.js';
import { Dialog } from '../../ui/Modal.js';
import { dashboardStore } from '../store/dashboardStore.js';
import { uiStore } from '../store/uiStore.js';
import { useStore } from '../store/useStore.js';
import { SHORTCUTS } from './useGlobalShortcuts.js';

export function ShortcutsHelp() {
  const open = useStore(uiStore, (s) => s.dialog === 'help');
  const enabled = useStore(dashboardStore, (s) => s.preferences.singleKeyShortcuts);
  if (!open) return null;
  const close = () => uiStore.closeDialog();
  return html`
    <${Dialog}
      title="Raccourcis clavier"
      onClose=${close}
      footer=${html`
        <${Button} variant="secondary" icon="settings" onClick=${() => uiStore.openDialog('preferences')}>Préférences<//>
        <${Button} variant="primary" onClick=${close}>Fermer<//>
      `}
    >
      <ul class="shortcuts-help" data-testid="shortcuts-help">
        ${SHORTCUTS.map(
          (shortcut) => html`<li class="shortcuts-help__item" key=${shortcut.keys.join('+')}>
            <span class="shortcuts-help__keys">${shortcut.keys.map((key) => html`<kbd>${key}</kbd>`)}</span>
            <span>${shortcut.label}</span>
          </li>`,
        )}
      </ul>
      <p class="shortcuts-help__note">
        Les raccourcis ne réagissent pas quand tu écris dans un champ, ni avec Ctrl, Cmd ou Alt.
        ${!enabled && html`<strong> Les raccourcis à une touche (E, A, ?) sont désactivés dans les préférences ; Échap reste actif.</strong>`}
      </p>
    <//>
  `;
}

export function PreferencesDialog() {
  const open = useStore(uiStore, (s) => s.dialog === 'preferences');
  const enabled = useStore(dashboardStore, (s) => s.preferences.singleKeyShortcuts);
  if (!open) return null;
  const close = () => uiStore.closeDialog();
  return html`
    <${Dialog} title="Préférences" onClose=${close} footer=${html`<${Button} variant="primary" onClick=${close}>Fermer<//>`}>
      <${Toggle}
        label="Raccourcis à une touche (E, A, ?)"
        help="Désactive-les si une aide à la saisie ou une commande vocale déclenche des touches par erreur. Échap reste toujours actif."
        checked=${enabled}
        onChange=${(/** @type {boolean} */ on) => dashboardStore.setPreferences({ singleKeyShortcuts: on })}
      />
    <//>
  `;
}
