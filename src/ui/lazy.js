// Chargement différé d'un composant : le module n'est demandé qu'au premier rendu du composant
// (import dynamique), et le composant ne dessine rien tant qu'il n'est pas arrivé.

import { h, useReducer } from '../lib/vendor.js';

/**
 * @template P
 * @param {() => Promise<any>} load  doit appeler import('…') avec une adresse littérale
 * @param {(module: any) => (props: P) => any} pick  choisit le composant dans le module
 * @returns {((props: P) => any) & { preload: () => Promise<void>, isLoaded: () => boolean }}
 */
export function lazyComponent(load, pick) {
  /** @type {((props: P) => any) | null} */
  let Loaded = null;
  /** @type {Promise<void> | null} */
  let pending = null;

  const preload = () => {
    pending ??= load().then(
      (module) => {
        Loaded = pick(module);
      },
      (error) => {
        pending = null; // on pourra réessayer
        console.error('Chargement différé impossible :', error);
      },
    );
    return pending;
  };

  /** @param {P} props */
  function Lazy(props) {
    const [, rerender] = useReducer((n) => n + 1, 0);
    if (Loaded === null) {
      void preload().then(() => rerender(0));
      return null;
    }
    return h(Loaded, /** @type {any} */ (props));
  }
  return Object.assign(Lazy, { preload, isLoaded: () => Loaded !== null });
}
