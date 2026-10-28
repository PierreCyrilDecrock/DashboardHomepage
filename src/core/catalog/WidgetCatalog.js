// Catalogue de widgets : panneau latéral qui liste les définitions du registre par catégorie.
// Ajouter un widget crée une instance (autant de fois qu'on veut), ferme le panneau, fait
// défiler jusqu'au widget et lui donne le focus. Le mode courant (édition ou lecture) ne change pas.

import { html, useState } from '../../lib/vendor.js';
import { Button } from '../../ui/Button.js';
import { Drawer } from '../../ui/Modal.js';
import { Icon } from '../../ui/icons.js';
import { listDefinitions } from '../../widgets/registry.js';
import { dashboardActions } from '../dashboard/actions.js';
import { focusWidgetSoon } from '../dashboard/focusWidget.js';
import { dashboardStore } from '../store/dashboardStore.js';
import { uiStore } from '../store/uiStore.js';
import { useStore } from '../store/useStore.js';
import { countByType, describeCount, filterDefinitions, groupByCategory } from './catalogLogic.js';

/** Panneau ouvert par « Ajouter un widget » (barre d'outils ou état vide). */
export function WidgetCatalog() {
  const open = useStore(uiStore, (state) => state.catalogOpen);
  if (!open) return null;
  return html`<${CatalogPanel} />`;
}

function CatalogPanel() {
  const [query, setQuery] = useState('');
  const counts = useStore(dashboardStore, countByType, (a, b) => JSON.stringify(a) === JSON.stringify(b));
  const matches = filterDefinitions(listDefinitions(), query);
  const groups = groupByCategory(matches);

  /** @param {string} type */
  const add = (type) => {
    const id = dashboardActions.addWidget(type);
    uiStore.closeCatalog();
    if (id) focusWidgetSoon(id);
  };

  return html`
    <${Drawer} title="Ajouter un widget" onClose=${() => uiStore.closeCatalog()}>
      <div class="catalog">
        <div class="field">
          <label class="field__label" for="catalog-search">Rechercher un widget</label>
          <input
            id="catalog-search"
            class="input"
            type="search"
            data-autofocus
            autocomplete="off"
            value=${query}
            onInput=${(/** @type {Event} */ e) => setQuery(/** @type {HTMLInputElement} */ (e.currentTarget).value)}
          />
        </div>
        <p class="visually-hidden" role="status">${matches.length} ${matches.length > 1 ? 'widgets trouvés' : 'widget trouvé'}</p>
        ${groups.length === 0 && html`<p class="catalog__empty">Aucun widget ne correspond à « ${query} ».</p>`}
        ${groups.map(
          (group) => html`
            <section class="catalog__group" aria-labelledby=${`catalog-group-${group.category}`}>
              <h3 class="catalog__group-title" id=${`catalog-group-${group.category}`}>${group.label}</h3>
              <ul class="catalog__list">
                ${group.items.map(
                  (definition) => html`
                    <li class="catalog__item" key=${definition.type} data-widget-type=${definition.type}>
                      <span class="catalog__icon"><${Icon} name=${definition.icon} size=${22} /></span>
                      <div class="catalog__text">
                        <p class="catalog__name">${definition.name}</p>
                        <p class="catalog__description">${definition.description}</p>
                        <p class="catalog__count">${describeCount(counts[definition.type] ?? 0)}</p>
                      </div>
                      <${Button} variant="primary" aria-label=${`Ajouter ${definition.name}`} onClick=${() => add(definition.type)}>Ajouter<//>
                    </li>
                  `,
                )}
              </ul>
            </section>
          `,
        )}
      </div>
    <//>
  `;
}
