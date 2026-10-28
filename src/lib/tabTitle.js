// Titre de l'onglet : affiche le temps restant de la minuterie qui se termine la première
// (« 04:12 · Minuteur »), et retrouve le titre d'origine quand plus rien n'est enregistré.
//
// Chaque minuterie s'enregistre sous sa propre clé (l'identifiant de son instance). Le registre est
// partagé parce qu'il n'y a qu'un titre par onglet ; il ne contient que ce que les widgets y mettent.

import { formatDuration } from './countdown.js';

/** Libellé affiché quand la minuterie n'a pas de libellé. */
export const DEFAULT_LABEL = 'Minuteur';

/**
 * @param {{ title: string }} [doc] le document dont on change le titre (une doublure dans les tests)
 */
export function createTabTitle(doc) {
  /** @type {Map<string, { remainingMs: number, label: string }>} */
  const entries = new Map();
  /** Titre d'origine, relevé au premier enregistrement. */
  let original = null;

  const target = () => doc ?? /** @type {{ title: string }} */ (/** @type {any} */ (globalThis).document);

  const render = () => {
    const document = target();
    if (!document) return;
    if (entries.size === 0) {
      if (original !== null) document.title = original;
      original = null;
      return;
    }
    let first = null;
    for (const entry of entries.values()) if (first === null || entry.remainingMs < first.remainingMs) first = entry;
    const title = `${formatDuration(first.remainingMs)} · ${first.label.trim() || DEFAULT_LABEL}`;
    if (document.title !== title) document.title = title;
  };

  return {
    /**
     * Enregistre (ou met à jour) la minuterie `key`.
     * @param {string} key
     * @param {number} remainingMs
     * @param {string} [label]
     */
    registerTitle(key, remainingMs, label = '') {
      const document = target();
      if (!document) return;
      if (entries.size === 0 && original === null) original = document.title;
      entries.set(key, { remainingMs, label });
      render();
    },

    /** @param {string} key */
    clearTitle(key) {
      if (entries.delete(key)) render();
    },
  };
}

const shared = createTabTitle();

/**
 * @param {string} key clé de l'instance
 * @param {number} remainingMs
 * @param {string} [label]
 */
export function registerTitle(key, remainingMs, label) {
  shared.registerTitle(key, remainingMs, label);
}

/** @param {string} key */
export function clearTitle(key) {
  shared.clearTitle(key);
}
