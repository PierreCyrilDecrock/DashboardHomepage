// Raccourcis clavier globaux.
//
//   E       activer ou quitter le mode édition
//   A       ouvrir le catalogue de widgets
//   ?       ouvrir l'aide des raccourcis
//   Échap   fermer le panneau ou la boîte de dialogue ouverte, puis quitter le mode édition
//
// Règles (accessibilité) :
//  - aucun raccourci ne réagit quand le focus est dans un champ de saisie, une zone de texte,
//    une liste déroulante ou un élément modifiable ; ni quand Ctrl, Cmd ou Alt sont enfoncés ;
//  - E, A et ? (touches seules) peuvent être désactivées dans les préférences ; Échap reste actif ;
//  - tant qu'un panneau est ouvert, E, A et ? ne font rien (on ne change pas ce qu'on ne voit pas).
//
// La logique est une fonction pure (createShortcutHandler) ; le hook ne fait que l'abonner au document.

import { useEffect } from '../../lib/vendor.js';
import { dashboardStore } from '../store/dashboardStore.js';
import { isPanelOpen, uiStore } from '../store/uiStore.js';

/** Raccourcis affichés dans l'aide. */
export const SHORTCUTS = [
  { keys: ['E'], label: 'Activer ou quitter le mode édition', singleKey: true },
  { keys: ['A'], label: 'Ouvrir le catalogue de widgets (ajouter un widget)', singleKey: true },
  { keys: ['?'], label: 'Ouvrir cette aide', singleKey: true },
  { keys: ['Échap'], label: 'Fermer le panneau ou la fenêtre ouverte, puis quitter le mode édition', singleKey: false },
];

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Vrai si la cible est un endroit où l'on tape du texte.
 * @param {EventTarget | null} target
 */
export function isTypingTarget(target) {
  const el = /** @type {any} */ (target);
  if (el === null || typeof el !== 'object') return false;
  if (TYPING_TAGS.has(String(el.tagName ?? '').toUpperCase())) return true;
  if (el.isContentEditable === true) return true;
  const editable = typeof el.getAttribute === 'function' ? el.getAttribute('contenteditable') : null;
  return editable !== null && editable !== 'false';
}

/**
 * @param {{
 *   ui?: ReturnType<typeof import('../store/uiStore.js').createUiStore>,
 *   dashboard?: Pick<typeof dashboardStore, 'getState'>,
 * }} [deps]
 * @returns {(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'defaultPrevented' | 'target'> & Partial<Pick<KeyboardEvent, 'isComposing' | 'repeat' | 'preventDefault'>>) => boolean}
 *   renvoie vrai si l'événement a déclenché un raccourci
 */
export function createShortcutHandler({ ui = uiStore, dashboard = dashboardStore } = {}) {
  return (event) => {
    if (event.defaultPrevented || event.isComposing) return false;

    if (event.key === 'Escape') {
      // Échap marche partout, même dans un champ : il ferme d'abord ce qui est ouvert.
      if (ui.closeTopPanel()) return true;
      if (ui.getState().isEditing) {
        ui.setEditing(false);
        return true;
      }
      return false;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (isTypingTarget(event.target)) return false;
    if (!dashboard.getState().preferences?.singleKeyShortcuts) return false;
    if (isPanelOpen(ui.getState())) return false;
    if (event.repeat) return false;

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === 'e') ui.toggleEditing();
    else if (key === 'a') ui.openCatalog();
    else if (key === '?') ui.openDialog('help');
    else return false;
    event.preventDefault?.();
    return true;
  };
}

/** Branche les raccourcis sur le document pendant la vie du composant. */
export function useGlobalShortcuts() {
  useEffect(() => {
    const handle = createShortcutHandler();
    /** @param {KeyboardEvent} event */
    const onKeyDown = (event) => {
      handle(event);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
