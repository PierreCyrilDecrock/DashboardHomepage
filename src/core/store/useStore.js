// Hook Preact pour lire un store : le composant n'est rendu de nouveau que si la
// valeur SÉLECTIONNÉE change. Des sélecteurs fins sont indispensables : une
// modification dans un widget ne doit pas redessiner les autres.

import { useEffect, useReducer, useRef } from '../../lib/vendor.js';

/** @template T @param {T} x */
const identity = (x) => x;

/**
 * Égalité superficielle (utile pour un sélecteur qui renvoie un objet ou un tableau neuf).
 * @param {any} a
 * @param {any} b
 */
export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && Object.is(a[k], b[k]));
}

/**
 * Logique d'abonnement par sélecteur, sans Preact (testée avec node:test).
 * `onChange` n'est appelé que si la valeur sélectionnée a changé selon `isEqual`.
 * @template S, T
 * @param {import('./createStore.js').Store<S>} store
 * @param {(state: S) => T} selector
 * @param {(a: T, b: T) => boolean} isEqual
 * @param {(value: T) => void} onChange
 * @returns {{ getSelected: () => T, unsubscribe: () => void }}
 */
export function subscribeSelected(store, selector, isEqual, onChange) {
  let selected = selector(store.getState());
  const unsubscribe = store.subscribe((state) => {
    const next = selector(state);
    if (isEqual(next, selected)) return;
    selected = next;
    onChange(next);
  });
  return { getSelected: () => selected, unsubscribe };
}

/**
 * @template S, T
 * @param {import('./createStore.js').Store<S>} store
 * @param {(state: S) => T} [selector]
 * @param {(a: T, b: T) => boolean} [isEqual]
 * @returns {T}
 */
export function useStore(store, selector = /** @type {any} */ (identity), isEqual = Object.is) {
  const [, rerender] = useReducer((n) => n + 1, 0);
  const selectorRef = useRef(selector);
  const equalRef = useRef(isEqual);
  selectorRef.current = selector;
  equalRef.current = isEqual;

  // Valeur rendue : on garde la précédente tant que la nouvelle lui est égale.
  const last = useRef(/** @type {{ value: T } | null} */ (null));
  const next = selector(store.getState());
  if (last.current === null || !isEqual(last.current.value, next)) last.current = { value: next };

  useEffect(() => {
    const check = () => {
      const current = selectorRef.current(store.getState());
      if (last.current === null || !equalRef.current(last.current.value, current)) rerender(0);
    };
    const unsubscribe = store.subscribe(check);
    check(); // le store a pu changer entre le rendu et l'abonnement
    return unsubscribe;
  }, [store]);

  return last.current.value;
}
