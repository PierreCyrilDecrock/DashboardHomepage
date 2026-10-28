// Logique pure du widget Minuteur (présentation et réglages). Le décompte lui-même est dans
// src/lib/countdown.js. Aucune dépendance à Preact ni au DOM.

import { MINUTE_MS } from '../../lib/countdown.js';

export const MAX_LABEL_LENGTH = 40;
export const MIN_PRESET_MINUTES = 1;
export const MAX_PRESET_MINUTES = 600;
export const MAX_PRESETS = 4;
export const DEFAULT_PRESETS = [1, 5, 10, 15];

/**
 * Lit une durée prédéfinie saisie : un nombre entier de minutes, de 1 à 600. Sinon null.
 * @param {unknown} text
 * @returns {number | null}
 */
export function parsePresetMinutes(text) {
  if (typeof text === 'number') text = String(text);
  if (typeof text !== 'string' || !/^\s*\d{1,4}\s*$/.test(text)) return null;
  const minutes = Number(text);
  return minutes >= MIN_PRESET_MINUTES && minutes <= MAX_PRESET_MINUTES ? minutes : null;
}

/**
 * Remplace la durée prédéfinie n° `index`. Valeur invalide ou position inconnue : liste inchangée.
 * @param {number[]} presets
 * @param {number} index
 * @param {unknown} value
 * @returns {number[]}
 */
export function updatePreset(presets, index, value) {
  const minutes = parsePresetMinutes(value);
  if (minutes === null || index < 0 || index >= presets.length || presets[index] === minutes) return presets;
  return presets.map((p, i) => (i === index ? minutes : p));
}

/**
 * Ajoute une durée prédéfinie (la première valeur courante qui n'y est pas encore), au plus MAX_PRESETS.
 * @param {number[]} presets
 * @returns {number[]}
 */
export function addPreset(presets) {
  if (presets.length >= MAX_PRESETS) return presets;
  const candidate = [30, 20, 25, 45, 60, 2, 3, 90].find((m) => !presets.includes(m)) ?? MAX_PRESET_MINUTES;
  return [...presets, candidate];
}

/**
 * Retire la durée prédéfinie n° `index`, en en gardant toujours au moins une.
 * @param {number[]} presets
 * @param {number} index
 * @returns {number[]}
 */
export function removePreset(presets, index) {
  if (presets.length <= 1 || index < 0 || index >= presets.length) return presets;
  return presets.filter((_, i) => i !== index);
}

/**
 * Texte d'un bouton de durée prédéfinie : « 5 min », « 1 h », « 1 h 30 ».
 * @param {number} minutes
 * @returns {string}
 */
export function formatPresetLabel(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

/**
 * Cette durée prédéfinie est-elle la durée choisie ?
 * @param {number} durationMs
 * @param {number} minutes
 * @returns {boolean}
 */
export function isPresetSelected(durationMs, minutes) {
  return durationMs === minutes * MINUTE_MS;
}

/**
 * Heure de fin, « 14:32 » (24 h, heure locale ou celle du fuseau donné).
 * @param {number} timestamp
 * @param {string} [timeZone]
 * @returns {string}
 */
export function formatFinishedAt(timestamp, timeZone) {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(timestamp));
}

/**
 * Largeur approximative d'un temps affiché, en « em » de la police DM Mono (0,6 em par caractère) :
 * sert à le faire tenir dans la largeur du widget.
 * @param {string} text
 * @returns {number}
 */
export function timeEmWidth(text) {
  return Math.round(text.length * 0.6 * 105) / 100;
}

/**
 * Part du temps écoulé, de 0 à 1.
 * @param {'idle' | 'running' | 'paused' | 'done'} status
 * @param {number} remainingMs
 * @param {number} durationMs
 * @returns {number}
 */
export function progressRatio(status, remainingMs, durationMs) {
  if (status === 'done') return 1;
  if (status === 'idle' || durationMs <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - remainingMs / durationMs));
}

/** @typedef {import('../../lib/platform/alarmService.js').PermissionState} PermissionState */

/**
 * État de la permission, en français, pour les réglages.
 * @param {PermissionState} state
 * @returns {string}
 */
export function permissionLabel(state) {
  switch (state) {
    case 'granted':
      return 'autorisées';
    case 'denied':
      return 'refusées';
    case 'default':
      return 'non demandées';
    default:
      return 'non disponibles ici';
  }
}

/**
 * Explication affichée sous l'état de la permission.
 * @param {PermissionState} state
 * @returns {string}
 */
export function permissionHelp(state) {
  switch (state) {
    case 'granted':
      return 'Une notification s\'affiche quand le minuteur se termine, même si l\'onglet est en arrière-plan.';
    case 'denied':
      return 'Le navigateur bloque les notifications pour ce site. Pour les réactiver, clique sur le cadenas (ou l\'icône de réglages) à gauche de l\'adresse, autorise les notifications pour ce site, puis recharge la page.';
    case 'default':
      return 'Le navigateur te demandera ton accord quand tu cliqueras sur le bouton ci-dessous.';
    default:
      return 'Ce navigateur, ou cet aperçu, ne propose pas les notifications. Le son et le message « Terminé à… » fonctionnent quand même.';
  }
}
