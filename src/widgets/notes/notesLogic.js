// Logique pure du widget Notes : aucune dépendance à Preact ni au DOM.
// Chaque fonction renvoie de nouvelles valeurs (ou la même référence, inchangée, s'il n'y a rien à faire).

import { newId } from '../../lib/id.js';

export const MAX_CONTENT_LENGTH = 50_000;
export const MAX_TITLE_LENGTH = 60;
export const DERIVED_TITLE_LENGTH = 40;
export const EMPTY_TITLE = 'Note sans titre';
/** Le compteur de caractères apparaît à partir de 90 % de la limite. */
export const COUNTER_THRESHOLD = 0.9;

/** @typedef {{ id: string, title: string | null, content: string, format: 'text', updatedAt: number, [key: string]: unknown }} Note */

/**
 * Coupe un texte à `max` unités UTF-16 sans séparer une paire de substitution.
 * @param {string} text
 * @param {number} max
 */
export function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * Titre déduit du contenu : première ligne non vide, coupée à 40 caractères.
 * @param {string} content
 * @returns {string}
 */
export function deriveTitle(content) {
  for (const line of String(content ?? '').split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (trimmed !== '') return truncate(trimmed, DERIVED_TITLE_LENGTH).trimEnd();
  }
  return EMPTY_TITLE;
}

/**
 * Titre affiché : le titre choisi s'il existe, sinon le titre déduit.
 * @param {Pick<Note, 'title' | 'content'>} note
 * @returns {string}
 */
export function getDisplayTitle(note) {
  return note.title !== null && note.title !== undefined && note.title.trim() !== '' ? note.title : deriveTitle(note.content);
}

/**
 * Crée une note vide à la fin et la rend active.
 * @param {Note[]} notes
 * @param {number} now
 * @param {() => string} [makeId]
 * @returns {{ notes: Note[], activeId: string }}
 */
export function createNote(notes, now, makeId = newId) {
  const note = { id: makeId(), title: null, content: '', format: /** @type {const} */ ('text'), updatedAt: now };
  return { notes: [...notes, note], activeId: note.id };
}

/**
 * Remplace le contenu d'une note (coupé à 50 000 caractères). Contenu identique ou note inconnue :
 * le tableau est rendu tel quel, sans changer la date de modification.
 * @param {Note[]} notes
 * @param {string} id
 * @param {string} content
 * @param {number} now
 * @returns {Note[]}
 */
export function updateContent(notes, id, content, now) {
  const next = truncate(String(content ?? ''), MAX_CONTENT_LENGTH);
  const current = notes.find((n) => n.id === id);
  if (current === undefined || current.content === next) return notes;
  return notes.map((n) => (n.id === id ? { ...n, content: next, updatedAt: now } : n));
}

/**
 * Renomme une note ; un titre vide (ou d'espaces) rend le titre déduit (title = null).
 * @param {Note[]} notes
 * @param {string} id
 * @param {string} title
 * @returns {Note[]}
 */
export function renameNote(notes, id, title) {
  const clean = truncate(String(title ?? '').trim(), MAX_TITLE_LENGTH).trimEnd();
  const value = clean === '' ? null : clean;
  const current = notes.find((n) => n.id === id);
  if (current === undefined || current.title === value) return notes;
  return notes.map((n) => (n.id === id ? { ...n, title: value } : n));
}

/**
 * Supprime une note. Si c'était la note active, la voisine (la suivante, sinon la précédente) devient active.
 * @param {Note[]} notes
 * @param {string | null} activeId
 * @param {string} id
 * @returns {{ notes: Note[], activeId: string | null, removed: Note | null, index: number }}
 */
export function deleteNote(notes, activeId, id) {
  const index = notes.findIndex((n) => n.id === id);
  if (index === -1) return { notes, activeId, removed: null, index: -1 };
  const remaining = [...notes.slice(0, index), ...notes.slice(index + 1)];
  let nextActive = activeId;
  if (activeId === id || !remaining.some((n) => n.id === activeId)) {
    nextActive = (remaining[index] ?? remaining[index - 1] ?? null)?.id ?? null;
  }
  return { notes: remaining, activeId: nextActive, removed: notes[index], index };
}

/**
 * Remet une note supprimée à sa place (bornée). Sans effet si elle est déjà là.
 * @param {Note[]} notes
 * @param {Note | null} removed
 * @param {number} index
 * @returns {Note[]}
 */
export function restoreNote(notes, removed, index) {
  if (removed === null || notes.some((n) => n.id === removed.id)) return notes;
  const at = Math.max(0, Math.min(notes.length, Number.isInteger(index) ? index : notes.length));
  return [...notes.slice(0, at), removed, ...notes.slice(at)];
}

/**
 * Note active : celle de `activeId`, sinon la première (donnée incohérente), sinon null.
 * @param {{ activeId: string | null, notes: Note[] }} data
 * @returns {Note | null}
 */
export function getActiveNote(data) {
  return data.notes.find((n) => n.id === data.activeId) ?? data.notes[0] ?? null;
}

/**
 * Index de l'onglet à activer pour une touche de navigation (flèches avec retour au bout, Début, Fin).
 * Renvoie -1 si la touche n'est pas une touche de navigation.
 * @param {string} key
 * @param {number} current
 * @param {number} count
 * @returns {number}
 */
export function nextTabIndex(key, current, count) {
  if (count <= 0) return -1;
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return -1;
  }
}

/**
 * Le compteur de caractères est-il visible ? (à partir de 90 % de la limite)
 * @param {number} length
 */
export function shouldShowCounter(length) {
  return length >= MAX_CONTENT_LENGTH * COUNTER_THRESHOLD;
}

/**
 * « Modifiée à 14:32 » (heure locale, ou celle du fuseau donné).
 * @param {number} timestamp
 * @param {string} [timeZone]
 * @returns {string}
 */
export function formatModified(timestamp, timeZone) {
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(timeZone ? { timeZone } : {}) }).format(new Date(timestamp));
  return `Modifiée à ${time}`;
}
