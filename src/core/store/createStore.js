// Petit store maison (une quarantaine de lignes), utilisable hors des composants.

/**
 * @template S
 * @typedef {Object} Store
 * @property {() => S} getState
 * @property {(partial: Partial<S> | ((state: S) => Partial<S> | null | undefined) | null | undefined, replace?: boolean) => void} setState
 *   Fusionne `partial` dans l'état (ou le remplace si `replace` est vrai). Un patch nul, ou qui ne
 *   change aucune valeur, ne crée pas de nouvel état et ne prévient personne.
 * @property {(listener: (state: S, previous: S) => void) => () => void} subscribe
 *   Renvoie la fonction de désabonnement.
 */

/**
 * @template S
 * @param {S} initialState objet
 * @returns {Store<S>}
 */
export function createStore(initialState) {
  let state = initialState;
  /** @type {Set<(state: S, previous: S) => void>} */
  const listeners = new Set();

  return {
    getState: () => state,
    setState(partial, replace = false) {
      const patch = typeof partial === 'function' ? partial(state) : partial;
      if (patch === null || patch === undefined) return;
      const next = replace ? /** @type {S} */ (patch) : { ...state, ...patch };
      if (replace ? Object.is(next, state) : sameShallow(state, next)) return;
      const previous = state;
      state = next;
      for (const listener of [...listeners]) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Vrai si les deux objets ont les mêmes clés avec les mêmes valeurs (Object.is).
 * @param {any} a
 * @param {any} b
 */
function sameShallow(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && Object.is(a[k], b[k]));
}
