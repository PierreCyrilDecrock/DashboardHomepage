// En-tête du dashboard : titre de l'application, nom de la page, bouton du mode édition, et une
// rangée d'outils : thème, sauvegarde, aide des raccourcis et préférences.

import { html } from '../../lib/vendor.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/icons.js';
import { BackupMenu } from '../backup/BackupMenu.js';
import { dashboardStore, selectActivePage } from '../store/dashboardStore.js';
import { uiStore } from '../store/uiStore.js';
import { useStore } from '../store/useStore.js';
import { ThemeSwitch } from './ThemeSwitch.js';

export function Toolbar() {
  const pageName = useStore(dashboardStore, (state) => selectActivePage(state).name);
  const isEditing = useStore(uiStore, (state) => state.isEditing);

  return html`
    <header class="toolbar">
      <div class="toolbar__row">
        <div class="toolbar__titles">
          <h1 class="app__title">
            <${Icon} name="layout-grid" size=${28} />
            Dashboard Homepage
          </h1>
          <p class="toolbar__page" data-testid="page-name">${pageName}</p>
        </div>
        <div class="toolbar__actions">
          <${Button} variant="primary" icon="plus" onClick=${() => uiStore.openCatalog()}>Ajouter un widget<//>
          <button
            type="button"
            class=${`toolbar__button ${isEditing ? 'toolbar__button--active' : ''}`.trim()}
            onClick=${() => uiStore.toggleEditing()}
          >
            <${Icon} name=${isEditing ? 'x' : 'pencil'} size=${18} />
            ${isEditing ? 'Terminer' : 'Modifier la disposition'}
          </button>
        </div>
      </div>
      <div class="toolbar__tools">
        <${ThemeSwitch} />
        <${BackupMenu} />
        <button type="button" class="toolbar__button" onClick=${() => uiStore.openDialog('help')}>
          <${Icon} name="keyboard" size=${18} />
          Raccourcis
        </button>
        <button type="button" class="toolbar__button" onClick=${() => uiStore.openDialog('preferences')}>
          <${Icon} name="settings" size=${18} />
          Préférences
        </button>
      </div>
      ${isEditing &&
      html`<p class="toolbar__help">Glisse les widgets pour les déplacer, tire les coins pour les redimensionner. Échap pour terminer.</p>`}
    </header>
  `;
}
