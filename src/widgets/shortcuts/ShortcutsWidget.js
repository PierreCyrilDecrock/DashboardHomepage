// Composant du widget Raccourcis. Il ne connaît que ses props ; toute modification passe par updateData.
//
// Chaque raccourci est un VRAI lien <a href> (rel="noopener noreferrer", target="_blank" seulement si
// l'option est active ; Ctrl/Cmd + clic ouvre un onglet par le comportement natif du navigateur).
// Le mode « Organiser » est local (jamais enregistré) : les tuiles deviennent des boutons avec
// Modifier / Supprimer / Monter / Descendre, et se réordonnent à la souris (SortableJS), au toucher
// et au clavier (Alt + flèches). SortableJS déplace des nœuds du DOM : à la fin du geste on remet le
// nœud à sa place d'origine, puis reorderLinks passe par updateData, pour que Preact reste maître du DOM.

import { Sortable, html, useCallback, useEffect, useLayoutEffect, useRef, useState } from '../../lib/vendor.js';
import { getFaviconUrl } from '../../lib/platform/favicon.js';
import { getDomain, isHttpUrl } from '../../lib/url.js';
import { Icon } from '../../ui/icons.js';
import { lazyComponent } from '../../ui/lazy.js';
import { MAX_LINKS, addLink, getInitial, getLinkTileIndex, moveLink, removeLink, reorderLinks, restoreLink, updateLink } from './shortcutsLogic.js';

/** Formulaire d'ajout et de modification : chargé à la première ouverture. */
const ShortcutForm = lazyComponent(() => import('./ShortcutForm.js'), (m) => m.ShortcutForm);

/** Durée pendant laquelle « Annuler » reste proposé après une suppression. */
export const UNDO_DELAY_MS = 6000;

/**
 * Pastille d'une tuile : la lettre initiale sur la couleur du domaine, ou l'icône du site
 * (retombe sur la lettre si l'image ne se charge pas).
 * @param {{ link: import('./shortcutsLogic.js').Link, favicon: boolean, failed: Set<string>, onFail: (domain: string) => void }} props
 */
function TileIcon({ link, favicon, failed, onFail }) {
  const domain = getDomain(link.url);
  const showImage = favicon && domain !== '' && !failed.has(domain);
  return html`<span class=${`shortcuts__icon ${showImage ? 'shortcuts__icon--image' : ''}`.trim()} data-tile=${getLinkTileIndex(link)} aria-hidden="true">
    ${showImage
      ? html`<img src=${getFaviconUrl(domain)} alt="" referrerpolicy="no-referrer" loading="lazy" onError=${() => onFail(domain)} />`
      : getInitial(link.title)}
  </span>`;
}

/**
 * @param {import('../types.js').WidgetProps<typeof import('./schema.js').defaultSettings, typeof import('./schema.js').defaultData>} props
 */
export function ShortcutsWidget({ instanceId, settings, data, updateData }) {
  const { openInNewTab, showLabels, icons, tileSize } = settings;
  const links = /** @type {import('./shortcutsLogic.js').Link[]} */ (data.links);

  const [organizing, setOrganizing] = useState(false);
  const [form, setForm] = useState(/** @type {null | { mode: 'add' } | { mode: 'edit', id: string }} */ (null));
  const [undo, setUndo] = useState(/** @type {{ removed: import('./shortcutsLogic.js').Link, index: number } | null} */ (null));
  const [failed, setFailed] = useState(/** @type {Set<string>} */ (new Set()));
  const [announcement, setAnnouncement] = useState('');

  const root = useRef(/** @type {HTMLElement | null} */ (null));
  const list = useRef(/** @type {HTMLElement | null} */ (null));
  const undoTimer = useRef(/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined));
  /** Sélecteur de l'élément à focaliser dès qu'il existe (quelques rendus au plus : les données arrivent après l'état local). */
  const pendingFocus = useRef(/** @type {string | null} */ (null));
  const focusTries = useRef(0);

  const isOrganizing = organizing && links.length > 0;
  const full = links.length >= MAX_LINKS;

  // Valeurs courantes pour les gestionnaires de SortableJS (créés une seule fois).
  const latest = useRef({ links, updateData });
  latest.current = { links, updateData };

  /** @param {string} message */
  const announce = useCallback((message) => {
    // Un texte identique ne serait pas relu : on alterne une espace insécable en fin de phrase.
    setAnnouncement((previous) => message + (previous.endsWith(' ') ? '' : ' '));
  }, []);

  /** @param {string} selector */
  const focusSoon = (selector) => {
    focusTries.current = 0;
    pendingFocus.current = selector;
  };

  // Après un rendu : focus demandé par l'action précédente, dès que la cible existe.
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const target = /** @type {HTMLElement | null} */ (root.current?.querySelector(pendingFocus.current) ?? null);
    if (target) {
      target.focus();
      pendingFocus.current = null;
    } else if (++focusTries.current >= 3) {
      pendingFocus.current = null;
    }
  });

  // Le mode Organiser n'a pas de sens sans raccourci : il se referme tout seul.
  useEffect(() => {
    if (organizing && links.length === 0) setOrganizing(false);
  }, [organizing, links.length]);

  // Nettoyage du minuteur d'annulation.
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  // Réordonnancement à la souris et au toucher, seulement en mode Organiser.
  const hasList = links.length > 0;
  useEffect(() => {
    const element = list.current;
    if (!element) return undefined;
    const sortable = Sortable.create(element, {
      draggable: '.shortcuts__item',
      handle: '.shortcuts__tile',
      animation: 120,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 3,
      ghostClass: 'shortcuts__item--ghost',
      chosenClass: 'shortcuts__item--chosen',
      dragClass: 'shortcuts__item--drag',
      disabled: !isOrganizing,
      onEnd(/** @type {any} */ event) {
        // Preact reste maître du DOM : le nœud déplacé retourne à sa place d'origine.
        const { item, from, oldIndex, newIndex, oldDraggableIndex, newDraggableIndex } = event;
        from.removeChild(item);
        from.insertBefore(item, from.children[oldIndex] ?? null);
        if (oldDraggableIndex === undefined || newDraggableIndex === undefined || oldDraggableIndex === newDraggableIndex) return;
        const { links: current, updateData: update } = latest.current;
        const active = current[oldDraggableIndex];
        const over = current[newDraggableIndex];
        if (!active || !over) return;
        update((d) => ({ ...d, links: reorderLinks(d.links, active.id, over.id) }));
        focusSoon(`[data-link-id="${active.id}"] .shortcuts__tile`);
        announce(`${active.title} : position ${newDraggableIndex + 1} sur ${current.length}`);
      },
    });
    return () => sortable.destroy();
  }, [isOrganizing, hasList]);

  /** @param {string} id */
  const titleOf = (id) => links.find((l) => l.id === id)?.title ?? '';

  /**
   * Enregistre le formulaire. Renvoie le résultat pour que le formulaire affiche l'erreur.
   * @param {{ url: string, title: string }} input
   */
  const save = (input) => {
    if (form === null) return /** @type {const} */ ({ ok: false, reason: 'not-found' });
    if (form.mode === 'add') {
      const result = addLink(links, input);
      if (!result.ok) return result;
      const { link } = result;
      updateData((d) => (d.links.length >= MAX_LINKS ? d : { ...d, links: [...d.links, link] }));
      setForm(null);
      announce(`Raccourci ajouté : ${link.title}`);
      return result;
    }
    const { id } = form;
    const result = updateLink(links, id, input);
    if (!result.ok) return result;
    const { link } = result;
    updateData((d) => ({ ...d, links: d.links.map((l) => (l.id === id ? link : l)) }));
    setForm(null);
    announce(`Raccourci modifié : ${link.title}`);
    return result;
  };

  /** @param {string} id */
  const remove = (id) => {
    const { removed, index } = removeLink(links, id);
    if (removed === null) return;
    updateData((d) => ({ ...d, links: removeLink(d.links, id).links }));
    setUndo({ removed, index });
    focusSoon('.shortcuts__undo-action');
    announce(`Raccourci supprimé : ${removed.title}. Annulation possible pendant ${UNDO_DELAY_MS / 1000} secondes.`);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setUndo(null);
      // Le bouton « Annuler » disparaît : si le focus y était, il passe au bouton Organiser / Terminer.
      if (root.current?.querySelector('.shortcuts__undo-action') === document.activeElement) {
        /** @type {HTMLElement | null} */ (root.current?.querySelector('.shortcuts__organize, .shortcuts__empty-add') ?? null)?.focus();
      }
    }, UNDO_DELAY_MS);
  };

  const undoRemove = () => {
    if (undo === null) return;
    const { removed, index } = undo;
    clearTimeout(undoTimer.current);
    setUndo(null);
    updateData((d) => ({ ...d, links: restoreLink(d.links, removed, index) }));
    focusSoon(`[data-link-id="${removed.id}"] .shortcuts__tile`);
    announce(`Raccourci restauré : ${removed.title}`);
  };

  /**
   * Déplace d'une place (boutons Monter / Descendre, Alt + flèches).
   * @param {string} id @param {number} delta @param {string} focusSelector élément à refocaliser (le nœud change de place)
   */
  const move = (id, delta, focusSelector) => {
    const next = moveLink(links, id, delta);
    focusSoon(focusSelector);
    if (next === links) {
      announce(delta < 0 ? 'Déjà en premier.' : 'Déjà en dernier.');
      return;
    }
    updateData((d) => ({ ...d, links: moveLink(d.links, id, delta) }));
    announce(`${titleOf(id)} : position ${next.findIndex((l) => l.id === id) + 1} sur ${next.length}`);
  };

  const toggleOrganize = () => {
    announce(isOrganizing ? 'Mode organisation terminé.' : 'Mode organisation : modifier, supprimer ou réordonner les raccourcis.');
    setOrganizing(!isOrganizing);
  };

  /** @param {string} domain */
  const onFaviconFail = useCallback((domain) => {
    setFailed((previous) => (previous.has(domain) ? previous : new Set(previous).add(domain)));
  }, []);

  const editing = form?.mode === 'edit' ? links.find((l) => l.id === form.id) : undefined;

  return html`
    <div class=${`shortcuts ${isOrganizing ? 'shortcuts--organizing' : ''}`.trim()} ref=${root} data-instance=${instanceId} data-size=${tileSize}>
      ${links.length > 0 &&
      html`<div class="shortcuts__bar">
        <button type="button" class="shortcuts__organize" aria-pressed=${isOrganizing ? 'true' : 'false'} onClick=${toggleOrganize}>
          <${Icon} name=${isOrganizing ? 'square-check' : 'grip-vertical'} size=${16} />
          ${isOrganizing ? 'Terminer' : 'Organiser'}
        </button>
      </div>`}

      <div class="shortcuts__scroll">
        ${links.length === 0 &&
        html`<div class="shortcuts__empty" data-testid="shortcuts-empty">
          <p>Aucun raccourci pour l'instant. Ajoute tes sites favoris pour les retrouver ici d'un clic.</p>
          <button type="button" class="btn btn--primary shortcuts__empty-add" onClick=${() => setForm({ mode: 'add' })}>
            <${Icon} name="plus" size=${18} />Ajouter un raccourci
          </button>
        </div>`}
        ${links.length > 0 &&
        html`<ul class="shortcuts__grid" ref=${list}>
          ${links.map((link, index) => {
            const label = showLabels && html`<span class="shortcuts__label">${link.title}</span>`;
            const icon = html`<${TileIcon} link=${link} favicon=${icons === 'favicon'} failed=${failed} onFail=${onFaviconFail} />`;
            if (!isOrganizing) {
              return html`<li class="shortcuts__item" key=${link.id} data-link-id=${link.id}>
                <a
                  class="shortcuts__tile"
                  href=${isHttpUrl(link.url) ? link.url : undefined}
                  rel="noopener noreferrer"
                  target=${openInNewTab ? '_blank' : undefined}
                  title=${link.title}
                  aria-label=${showLabels ? undefined : link.title}
                >
                  ${icon}${label}
                </a>
              </li>`;
            }
            return html`<li class="shortcuts__item shortcuts__item--organizing" key=${link.id} data-link-id=${link.id}>
              <button
                type="button"
                class="shortcuts__tile"
                title="Glisser pour déplacer, ou Alt + flèches"
                aria-label=${`Déplacer : ${link.title}`}
                onKeyDown=${(/** @type {KeyboardEvent} */ event) => {
                  if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                  event.preventDefault();
                  move(link.id, event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1, `[data-link-id="${link.id}"] .shortcuts__tile`);
                }}
              >
                ${icon}${label}
              </button>
              <div class="shortcuts__actions">
                <button type="button" class="shortcuts__icon-button shortcuts__edit" aria-label=${`Modifier : ${link.title}`} title="Modifier" onClick=${() => setForm({ mode: 'edit', id: link.id })}>
                  <${Icon} name="pencil" size=${18} />
                </button>
                <button type="button" class="shortcuts__icon-button shortcuts__delete" aria-label=${`Supprimer : ${link.title}`} title="Supprimer" onClick=${() => remove(link.id)}>
                  <${Icon} name="trash-2" size=${18} />
                </button>
                <button
                  type="button"
                  class="shortcuts__icon-button shortcuts__up"
                  aria-label=${`Monter : ${link.title}`}
                  title=${index === 0 ? 'Déjà en premier' : 'Monter'}
                  onClick=${() => move(link.id, -1, `[data-link-id="${link.id}"] .shortcuts__up`)}
                >
                  <${Icon} name="chevron-up" size=${18} />
                </button>
                <button
                  type="button"
                  class="shortcuts__icon-button shortcuts__down"
                  aria-label=${`Descendre : ${link.title}`}
                  title=${index === links.length - 1 ? 'Déjà en dernier' : 'Descendre'}
                  onClick=${() => move(link.id, 1, `[data-link-id="${link.id}"] .shortcuts__down`)}
                >
                  <${Icon} name="chevron-down" size=${18} />
                </button>
              </div>
            </li>`;
          })}
          ${!isOrganizing &&
          !full &&
          html`<li class="shortcuts__add-item" key="add">
            <button type="button" class="shortcuts__tile shortcuts__add" aria-label="Ajouter un raccourci" title="Ajouter un raccourci" onClick=${() => setForm({ mode: 'add' })}>
              <span class="shortcuts__icon shortcuts__icon--add" aria-hidden="true"><${Icon} name="plus" size=${22} /></span>
              ${showLabels && html`<span class="shortcuts__label">Ajouter</span>`}
            </button>
          </li>`}
        </ul>`}
        ${full && !isOrganizing && html`<p class="shortcuts__limit">Maximum atteint : ${MAX_LINKS} raccourcis.</p>`}
      </div>

      ${undo !== null &&
      html`<div class="shortcuts__undo">
        <span>Raccourci supprimé</span>
        <button type="button" class="shortcuts__undo-action" onClick=${undoRemove}>Annuler</button>
      </div>`}

      ${form !== null &&
      (form.mode === 'add' || editing) &&
      html`<${ShortcutForm}
        key=${form.mode === 'add' ? 'add' : form.id}
        mode=${form.mode}
        initial=${editing ? { url: editing.url, title: editing.title } : { url: '', title: '' }}
        links=${links}
        editingId=${editing?.id}
        onSubmit=${save}
        onClose=${() => setForm(null)}
      />`}

      <p class="visually-hidden" role="status" aria-live="polite" data-testid="shortcuts-live">${announcement}</p>
    </div>
  `;
}
