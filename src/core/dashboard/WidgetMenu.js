// Menu d'un widget (bouton « … » dans sa barre de titre) : Renommer, Réglages, Dupliquer, Supprimer.
//
// Accessible au clavier : Entrée, Espace ou flèche bas ouvrent le menu ; flèches, Début et Fin
// naviguent ; Échap ferme et rend le focus au bouton ; Tab ferme. Le menu est positionné en
// « fixed » pour ne pas être coupé par le cadre arrondi du widget.

import { html, useEffect, useRef, useState } from '../../lib/vendor.js';
import { Icon } from '../../ui/icons.js';
import { nextMenuIndex } from '../../ui/menuNav.js';
import { dashboardActions, UNDO_DELAY_MS } from './actions.js';
import { focusWidgetSoon } from './focusWidget.js';
import { toastStore } from '../store/toastStore.js';
import { uiStore } from '../store/uiStore.js';

/**
 * Supprime une instance et propose de l'annuler (toast « Widget supprimé » + « Annuler »).
 * @param {string} instanceId
 */
export function deleteWithUndo(instanceId) {
  if (!dashboardActions.removeInstance(instanceId)) return;
  toastStore.show({
    message: 'Widget supprimé',
    actionLabel: 'Annuler',
    duration: UNDO_DELAY_MS,
    focusAction: true,
    onAction: () => {
      if (dashboardActions.restoreInstance(instanceId)) focusWidgetSoon(instanceId);
    },
  });
}

/**
 * @param {{ instanceId: string, title: string, hasSettings: boolean }} props
 */
export function WidgetMenu({ instanceId, title, hasSettings }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const button = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const menu = useRef(/** @type {HTMLElement | null} */ (null));
  /** Entrée à focaliser à l'ouverture : 'first' ou 'last'. */
  const startAt = useRef(/** @type {'first' | 'last'} */ ('first'));

  const items = [
    { id: 'rename', label: 'Renommer', icon: 'pencil', run: () => uiStore.openRename(instanceId) },
    ...(hasSettings ? [{ id: 'settings', label: 'Réglages', icon: 'settings', run: () => uiStore.openSettings(instanceId) }] : []),
    { id: 'duplicate', label: 'Dupliquer', icon: 'copy', run: () => { const id = dashboardActions.duplicateInstance(instanceId); if (id) focusWidgetSoon(id); } },
    { id: 'delete', label: 'Supprimer', icon: 'trash-2', danger: true, run: () => deleteWithUndo(instanceId) },
  ];

  /** @param {boolean} returnFocus */
  const close = (returnFocus) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  };

  const openMenu = (/** @type {'first' | 'last'} */ at = 'first') => {
    const rect = button.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
    startAt.current = at;
    setOpen(true);
  };

  // À l'ouverture : focus sur une entrée ; clic ailleurs, défilement ou redimensionnement ferment.
  useEffect(() => {
    if (!open) return undefined;
    const entries = /** @type {HTMLElement[]} */ ([...(menu.current?.querySelectorAll('[role="menuitem"]') ?? [])]);
    entries[startAt.current === 'last' ? entries.length - 1 : 0]?.focus();
    /** @param {Event} event */
    const onPointerDown = (event) => {
      const target = /** @type {Node} */ (event.target);
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    const onDismiss = () => setOpen(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onDismiss);
    window.addEventListener('scroll', onDismiss, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('scroll', onDismiss, true);
    };
  }, [open]);

  /** @param {KeyboardEvent} event */
  const onButtonKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(event.key === 'ArrowUp' ? 'last' : 'first');
    }
  };

  /** @param {KeyboardEvent} event */
  const onMenuKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // ne quitte pas le mode édition
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close(false);
      return;
    }
    const entries = /** @type {HTMLElement[]} */ ([...(menu.current?.querySelectorAll('[role="menuitem"]') ?? [])]);
    const current = entries.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const next = nextMenuIndex(event.key, current, entries.length);
    if (next !== -1) {
      event.preventDefault();
      entries[next].focus();
    }
  };

  return html`
    <button
      type="button"
      class="widget__menu-button"
      aria-label=${`Options de ${title}`}
      aria-haspopup="menu"
      aria-expanded=${open ? 'true' : 'false'}
      ref=${button}
      onClick=${() => (open ? close(false) : openMenu())}
      onKeyDown=${onButtonKeyDown}
    >
      <${Icon} name="ellipsis" size=${20} />
    </button>
    ${open &&
    html`<div
      class="widget-menu"
      role="menu"
      aria-label=${`Options de ${title}`}
      ref=${menu}
      style=${`top:${position.top}px;right:${position.right}px`}
      onKeyDown=${onMenuKeyDown}
    >
      ${items.map(
        (item) => html`<button
          type="button"
          role="menuitem"
          class=${`widget-menu__item ${item.danger ? 'widget-menu__item--danger' : ''}`.trim()}
          tabindex="-1"
          onClick=${() => {
            // Le focus revient au bouton avant l'action : un panneau qui s'ouvre le retient comme point de retour.
            close(true);
            item.run();
          }}
        >
          <${Icon} name=${item.icon} size=${18} />
          ${item.label}
        </button>`,
      )}
    </div>`}
  `;
}
