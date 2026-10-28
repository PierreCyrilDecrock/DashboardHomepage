// Menu « Sauvegarde » de la barre d'outils : Exporter, Importer, Réinitialiser le dashboard et,
// après un remplacement, « Annuler le dernier remplacement ».
//
// Clavier : Entrée, Espace ou flèche bas ouvrent le menu ; flèches, Début et Fin naviguent ;
// Échap ferme et rend le focus au bouton ; Tab ferme.

import { html, useEffect, useRef, useState } from '../../lib/vendor.js';
import { Icon } from '../../ui/icons.js';
import { nextMenuIndex } from '../../ui/menuNav.js';
import { uiStore } from '../store/uiStore.js';
import { useStore } from '../store/useStore.js';
import { backupSession } from './backupContext.js';

export function BackupMenu() {
  const undo = useStore(backupSession, (s) => s.undo);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const button = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const menu = useRef(/** @type {HTMLElement | null} */ (null));
  const startAt = useRef(/** @type {'first' | 'last'} */ ('first'));

  const items = [
    { id: 'export', label: 'Exporter', icon: 'download', run: () => uiStore.openDialog('export') },
    { id: 'import', label: 'Importer', icon: 'upload', run: () => uiStore.openDialog('import') },
    { id: 'reset', label: 'Réinitialiser le dashboard', icon: 'trash-2', danger: true, run: () => uiStore.openDialog('reset') },
    ...(undo ? [{ id: 'undo', label: 'Annuler le dernier remplacement', icon: 'undo-2', run: () => void import('./BackupDialog.js').then((m) => m.undoLastReplacement()) }] : []),
  ];

  /** @param {boolean} returnFocus */
  const close = (returnFocus) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  };

  /** @param {'first' | 'last'} [at] */
  const openMenu = (at = 'first') => {
    const rect = button.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)) });
    startAt.current = at;
    setOpen(true);
  };

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
      class="toolbar__button"
      aria-haspopup="menu"
      aria-expanded=${open ? 'true' : 'false'}
      ref=${button}
      onClick=${() => (open ? close(false) : openMenu())}
      onKeyDown=${onButtonKeyDown}
    >
      <${Icon} name="download" size=${18} />
      Sauvegarde
      <${Icon} name="chevron-down" size=${16} />
    </button>
    ${open &&
    html`<div class="widget-menu widget-menu--wide" role="menu" aria-label="Sauvegarde" ref=${menu} style=${`top:${position.top}px;left:${position.left}px`} onKeyDown=${onMenuKeyDown}>
      ${items.map(
        (item) => html`<button
          type="button"
          role="menuitem"
          class=${`widget-menu__item ${item.danger ? 'widget-menu__item--danger' : ''}`.trim()}
          tabindex="-1"
          onClick=${() => {
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
