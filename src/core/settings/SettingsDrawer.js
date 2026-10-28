// Réglages d'une instance : affiche le SettingsPanel du type avec les réglages actuels.
// Les changements s'appliquent immédiatement ; « Réinitialiser les réglages » remet les valeurs par défaut.

import { html, useReducer } from '../../lib/vendor.js';
import { Button } from '../../ui/Button.js';
import { Drawer } from '../../ui/Modal.js';
import { getDefinition } from '../../widgets/registry.js';
import { dashboardActions } from '../dashboard/actions.js';
import { resolveValue } from '../dashboard/frameLogic.js';
import { dashboardStore, selectInstance } from '../store/dashboardStore.js';
import { uiStore } from '../store/uiStore.js';
import { useStore } from '../store/useStore.js';

export function SettingsDrawer() {
  const id = useStore(uiStore, (state) => state.settingsFor);
  if (id === null) return null;
  return html`<${SettingsPanelHost} key=${id} instanceId=${id} />`;
}

/** @param {{ instanceId: string }} props */
function SettingsPanelHost({ instanceId }) {
  const instance = useStore(dashboardStore, selectInstance(instanceId));
  const close = () => uiStore.closeSettings();
  const definition = instance ? getDefinition(instance.type) : undefined;
  const Panel = /** @type {any} */ (definition?.SettingsPanel);
  const [, rerender] = useReducer((n) => n + 1, 0);
  if (!instance || !definition || !Panel) return null;
  // Panneau de réglages chargé à la demande (voir ui/lazy.js) : on n'ouvre la fenêtre qu'une fois
  // le panneau arrivé, pour que le focus aille au premier réglage et non au bouton de fermeture.
  if (typeof Panel.isLoaded === 'function' && !Panel.isLoaded()) {
    void Panel.preload().then(() => rerender(0));
    return null;
  }

  const settings = resolveValue(definition.settingsSchema, instance.settings, definition.defaultSettings).value;
  const title = instance.title ?? definition.name;

  return html`
    <${Drawer}
      title=${`Réglages : ${title}`}
      onClose=${close}
      footer=${html`
        <${Button} variant="secondary" onClick=${() => dashboardActions.resetInstanceSettings(instanceId)}>Réinitialiser les réglages<//>
        <${Button} variant="primary" onClick=${close}>Terminé<//>
      `}
    >
      <${Panel}
        settings=${settings}
        onChange=${(/** @type {Record<string, unknown>} */ patch) => dashboardActions.updateInstanceSettings(instanceId, patch)}
      />
    <//>
  `;
}

