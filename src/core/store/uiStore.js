// État d'interface NON sauvegardé : il repart de zéro à chaque chargement de la page.

import { createStore } from './createStore.js';

/**
 * @typedef {Object} UiState
 * @property {boolean} isEditing mode d'édition de la disposition
 * @property {boolean} catalogOpen catalogue de widgets ouvert
 * @property {string | null} settingsFor identifiant de l'instance dont les réglages sont ouverts
 * @property {string | null} renameFor identifiant de l'instance en cours de renommage
 * @property {AppDialog | null} dialog boîte de dialogue de l'application ouverte (aide, préférences, sauvegarde)
 */

/** @typedef {'help' | 'preferences' | 'export' | 'import' | 'reset'} AppDialog */

/**
 * Vrai si un panneau ou une boîte de dialogue est ouvert.
 * @param {UiState} state
 */
export const isPanelOpen = (state) => state.catalogOpen || state.settingsFor !== null || state.renameFor !== null || state.dialog !== null;

export function createUiStore() {
  const store = createStore(/** @type {UiState} */ ({ isEditing: false, catalogOpen: false, settingsFor: null, renameFor: null, dialog: null }));
  return {
    ...store,
    toggleEditing() {
      store.setState((state) => ({ isEditing: !state.isEditing }));
    },
    /** @param {boolean} isEditing */
    setEditing(isEditing) {
      store.setState({ isEditing: Boolean(isEditing) });
    },
    openCatalog() {
      store.setState({ catalogOpen: true });
    },
    closeCatalog() {
      store.setState({ catalogOpen: false });
    },
    /** @param {string} id */
    openSettings(id) {
      store.setState({ settingsFor: id });
    },
    closeSettings() {
      store.setState({ settingsFor: null });
    },
    /** @param {AppDialog} name */
    openDialog(name) {
      store.setState({ dialog: name });
    },
    closeDialog() {
      store.setState({ dialog: null });
    },
    /**
     * Ferme le panneau ou la boîte de dialogue ouverte (le plus « haut » d'abord).
     * @returns {boolean} vrai si quelque chose a été fermé
     */
    closeTopPanel() {
      const state = store.getState();
      if (state.dialog !== null) store.setState({ dialog: null });
      else if (state.renameFor !== null) store.setState({ renameFor: null });
      else if (state.settingsFor !== null) store.setState({ settingsFor: null });
      else if (state.catalogOpen) store.setState({ catalogOpen: false });
      else return false;
      return true;
    },
    /** @param {string} id */
    openRename(id) {
      store.setState({ renameFor: id });
    },
    closeRename() {
      store.setState({ renameFor: null });
    },
  };
}

/** Le store d'interface de l'application. */
export const uiStore = createUiStore();
