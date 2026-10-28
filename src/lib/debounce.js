// Regroupement d'appels : la fonction n'est exécutée qu'après `waitMs` sans nouvel appel.

/**
 * @template {(...args: any[]) => any} F
 * @param {F} fn
 * @param {number} waitMs
 * @returns {((...args: Parameters<F>) => void) & { cancel: () => void, flush: () => ReturnType<F> | undefined, pending: () => boolean }}
 */
export function debounce(fn, waitMs) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** @type {Parameters<F>} */
  let lastArgs = /** @type {any} */ ([]);

  const run = () => {
    timer = null;
    const args = lastArgs;
    lastArgs = /** @type {any} */ ([]);
    return fn(...args);
  };

  const debounced = (/** @type {Parameters<F>} */ ...args) => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(run, waitMs);
  };
  /** Abandonne l'exécution en attente. */
  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  /** Exécute tout de suite l'appel en attente (sans effet s'il n'y en a pas). */
  debounced.flush = () => {
    if (timer === null) return undefined;
    clearTimeout(timer);
    return run();
  };
  debounced.pending = () => timer !== null;
  return debounced;
}
