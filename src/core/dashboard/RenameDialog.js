// Renommer une instance : un champ, « Annuler » et « Enregistrer ». Un nom vide rend le nom du type.

import { html, useState } from '../../lib/vendor.js';
import { Button } from '../../ui/Button.js';
import { Field } from '../../ui/Field.js';
import { Dialog } from '../../ui/Modal.js';
import { getDefinition } from '../../widgets/registry.js';
import { dashboardActions } from './actions.js';
import { dashboardStore, findInstance } from '../store/dashboardStore.js';
import { uiStore } from '../store/uiStore.js';
import { useStore } from '../store/useStore.js';

export function RenameDialog() {
  const id = useStore(uiStore, (state) => state.renameFor);
  if (id === null) return null;
  return html`<${RenameForm} key=${id} instanceId=${id} />`;
}

/** @param {{ instanceId: string }} props */
function RenameForm({ instanceId }) {
  const found = findInstance(dashboardStore.getState(), instanceId);
  const definitionName = found ? getDefinition(found.instance.type)?.name ?? found.instance.type : '';
  const [title, setTitle] = useState(found?.instance.title ?? definitionName);
  if (!found) return null;

  const close = () => uiStore.closeRename();
  /** @param {Event} event */
  const submit = (event) => {
    event.preventDefault();
    // Garder le nom du type tel quel ne crée pas de titre personnalisé.
    dashboardActions.renameInstance(instanceId, title.trim() === definitionName ? '' : title);
    close();
  };

  return html`
    <${Dialog}
      title="Renommer le widget"
      onClose=${close}
      footer=${html`
        <${Button} variant="secondary" onClick=${close}>Annuler<//>
        <${Button} variant="primary" type="submit" form="rename-form">Enregistrer<//>
      `}
    >
      <form id="rename-form" onSubmit=${submit}>
        <${Field} label="Nom du widget" help="Laisse vide pour reprendre le nom d'origine.">
          ${(/** @type {any} */ control) => html`
            <input
              ...${control}
              class="input"
              type="text"
              maxlength="60"
              data-autofocus
              value=${title}
              onInput=${(/** @type {Event} */ e) => setTitle(/** @type {HTMLInputElement} */ (e.currentTarget).value)}
              onFocus=${(/** @type {Event} */ e) => /** @type {HTMLInputElement} */ (e.currentTarget).select()}
            />
          `}
        <//>
      </form>
    <//>
  `;
}
