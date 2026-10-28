// Notifications éphémères (« Widget supprimé » + bouton « Annuler »). Non sauvegardé.

import { createStore } from './createStore.js';

/**
 * @typedef {Object} Toast
 * @property {number} id
 * @property {string} message
 * @property {string} [actionLabel] texte du bouton d'action
 * @property {() => void} [onAction] appelé au clic sur le bouton d'action (le toast se ferme ensuite)
 * @property {boolean} [focusAction] vrai : le bouton d'action reçoit le focus à l'affichage (clavier)
 */

/**
 * @param {{ setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (t: unknown) => void }} [deps]
 */
export function createToastStore({ setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (t) => clearTimeout(/** @type {any} */ (t)) } = {}) {
  const store = createStore(/** @type {{ toasts: Toast[] }} */ ({ toasts: [] }));
  /** @type {Map<number, unknown>} */
  const timers = new Map();
  let nextId = 1;

  /** @param {number} id */
  function dismiss(id) {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimer(timer);
    timers.delete(id);
    store.setState((state) => (state.toasts.some((t) => t.id === id) ? { toasts: state.toasts.filter((t) => t.id !== id) } : null));
  }

  return {
    ...store,
    dismiss,

    /**
     * Affiche un toast ; il disparaît seul après `duration` ms (0 = reste affiché).
     * @param {Omit<Toast, 'id'> & { duration?: number }} options
     * @returns {number} identifiant du toast
     */
    show({ duration = 5000, ...toast }) {
      const id = nextId++;
      store.setState((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
      if (duration > 0) timers.set(id, setTimer(() => dismiss(id), duration));
      return id;
    },

    /** Clic sur le bouton d'action : exécute l'action puis ferme le toast. @param {number} id */
    runAction(id) {
      const toast = store.getState().toasts.find((t) => t.id === id);
      dismiss(id);
      toast?.onAction?.();
    },
  };
}

/** Le store de notifications de l'application. */
export const toastStore = createToastStore();
