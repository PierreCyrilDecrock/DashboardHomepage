// Thème : applique le choix de l'utilisateur à <html> et le recopie dans le miroir
// lu par theme-init.js. « system » = aucun attribut, la préférence du système s'applique.
//
// L'attribut data-theme n'est retiré que s'il a été posé par l'application (ou par
// theme-init.js) : si l'hôte (l'aperçu d'un artefact, par exemple) impose son propre
// thème par cet attribut, on ne le supprime pas.

import { readThemeMirror, writeThemeMirror } from './storage/themeMirror.js';

/**
 * @param {Pick<Element, 'getAttribute' | 'setAttribute' | 'removeAttribute'>} root  l'élément <html>
 * @param {{ readMirror?: () => string | null, writeMirror?: (theme: string) => void }} [options]
 */
export function createThemeApplier(root, { readMirror = readThemeMirror, writeMirror = writeThemeMirror } = {}) {
  // theme-init.js a déjà posé l'attribut si le miroir valait « light » ou « dark ».
  const mirror = readMirror();
  let owned = (mirror === 'light' || mirror === 'dark') && root.getAttribute('data-theme') === mirror;

  return {
    /** @param {import('./types.js').Theme} theme */
    apply(theme) {
      if (theme === 'light' || theme === 'dark') {
        root.setAttribute('data-theme', theme);
        owned = true;
      } else if (owned) {
        root.removeAttribute('data-theme');
        owned = false;
      }
      writeMirror(theme);
    },
  };
}

/**
 * Applique le thème du store maintenant, puis à chaque changement.
 * @param {import('./store/createStore.js').Store<import('./types.js').DashboardState>} store
 * @param {{ root?: Parameters<typeof createThemeApplier>[0], writeMirror?: (theme: string) => void }} [options]
 * @returns {() => void} désabonnement
 */
export function startThemeSync(store, { root = document.documentElement, writeMirror = writeThemeMirror } = {}) {
  const applier = createThemeApplier(root, { writeMirror });
  applier.apply(store.getState().theme);
  return store.subscribe((state, previous) => {
    if (state.theme !== previous.theme) applier.apply(state.theme);
  });
}
