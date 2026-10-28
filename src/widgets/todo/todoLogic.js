// Logique pure du widget À faire : aucune dépendance à Preact ni au DOM.
// Chaque fonction renvoie un NOUVEAU tableau (ou le même tableau, inchangé, quand il n'y a rien à faire).

import { newId } from '../../lib/id.js';

export const MAX_TEXT_LENGTH = 200;

/** @typedef {{ id: string, text: string, done: boolean, createdAt: number, doneAt: number | null, [key: string]: unknown }} Task */
/** @typedef {'all' | 'todo' | 'done'} TaskFilter */

export const FILTERS = /** @type {const} */ (['all', 'todo', 'done']);

/**
 * Nettoie un texte de tâche : espaces retirés aux deux bouts, coupé à 200 caractères
 * (sans couper une paire de substitution UTF-16 en deux). Texte vide : chaîne vide.
 * @param {unknown} text
 * @returns {string}
 */
export function cleanText(text) {
  let value = String(text ?? '').trim();
  if (value.length > MAX_TEXT_LENGTH) {
    value = value.slice(0, MAX_TEXT_LENGTH);
    const last = value.charCodeAt(value.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) value = value.slice(0, -1);
    value = value.trimEnd();
  }
  return value;
}

/**
 * Ajoute une tâche à la fin. Renvoie null si le texte est vide.
 * @param {Task[]} tasks
 * @param {string} text
 * @param {number} now horodatage (Date.now())
 * @param {() => string} [makeId]
 * @returns {{ tasks: Task[], task: Task } | null}
 */
export function addTask(tasks, text, now, makeId = newId) {
  const clean = cleanText(text);
  if (clean === '') return null;
  const task = { id: makeId(), text: clean, done: false, createdAt: now, doneAt: null };
  return { tasks: [...tasks, task], task };
}

/**
 * Bascule « terminée » ; renseigne doneAt en terminant, l'efface en rouvrant.
 * @param {Task[]} tasks
 * @param {string} id
 * @param {number} now
 * @returns {Task[]}
 */
export function toggleTask(tasks, id, now) {
  if (!tasks.some((t) => t.id === id)) return tasks;
  return tasks.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: t.done ? null : now } : t));
}

/**
 * Change le texte d'une tâche (mêmes règles que l'ajout). Texte vide, tâche inconnue ou texte
 * identique : le tableau est rendu tel quel.
 * @param {Task[]} tasks
 * @param {string} id
 * @param {string} text
 * @returns {Task[]}
 */
export function editTask(tasks, id, text) {
  const clean = cleanText(text);
  if (clean === '') return tasks;
  const current = tasks.find((t) => t.id === id);
  if (current === undefined || current.text === clean) return tasks;
  return tasks.map((t) => (t.id === id ? { ...t, text: clean } : t));
}

/**
 * Retire une tâche et dit où elle était, pour pouvoir l'annuler.
 * @param {Task[]} tasks
 * @param {string} id
 * @returns {{ tasks: Task[], removed: Task | null, index: number }}
 */
export function removeTask(tasks, id) {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return { tasks, removed: null, index: -1 };
  return { tasks: [...tasks.slice(0, index), ...tasks.slice(index + 1)], removed: tasks[index], index };
}

/**
 * Remet une tâche retirée à sa place (bornée à la taille actuelle). Sans effet si elle est déjà là.
 * @param {Task[]} tasks
 * @param {Task | null} removed
 * @param {number} index
 * @returns {Task[]}
 */
export function restoreTask(tasks, removed, index) {
  if (removed === null || tasks.some((t) => t.id === removed.id)) return tasks;
  const at = Math.max(0, Math.min(tasks.length, Number.isInteger(index) ? index : tasks.length));
  return [...tasks.slice(0, at), removed, ...tasks.slice(at)];
}

/**
 * Place la tâche `activeId` à l'emplacement de `overId`. Avec `doneLast`, les terminées forment un
 * groupe à part à l'affichage : on ne déplace donc qu'à l'intérieur d'un même groupe.
 * @param {Task[]} tasks
 * @param {string} activeId
 * @param {string} overId
 * @param {{ doneLast?: boolean }} [options]
 * @returns {Task[]}
 */
export function reorderTasks(tasks, activeId, overId, { doneLast = false } = {}) {
  const from = tasks.findIndex((t) => t.id === activeId);
  const to = tasks.findIndex((t) => t.id === overId);
  if (from === -1 || to === -1 || from === to) return tasks;
  if (doneLast && tasks[from].done !== tasks[to].done) return tasks;
  const next = [...tasks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Déplace une tâche d'une position vers le haut (delta < 0) ou le bas (delta > 0), sans sortir
 * des bornes. Avec `doneLast`, le déplacement se fait parmi les tâches du même groupe.
 * @param {Task[]} tasks
 * @param {string} id
 * @param {number} delta
 * @param {{ doneLast?: boolean }} [options]
 * @returns {Task[]}
 */
export function moveTask(tasks, id, delta, { doneLast = false } = {}) {
  const task = tasks.find((t) => t.id === id);
  if (task === undefined || delta === 0) return tasks;
  const group = doneLast ? tasks.filter((t) => t.done === task.done) : tasks;
  const position = group.findIndex((t) => t.id === id);
  const target = Math.max(0, Math.min(group.length - 1, position + delta));
  if (target === position) return tasks;
  return reorderTasks(tasks, id, group[target].id, { doneLast });
}

/**
 * Supprime les tâches terminées.
 * @param {Task[]} tasks
 * @returns {Task[]}
 */
export function clearDone(tasks) {
  return tasks.some((t) => t.done) ? tasks.filter((t) => !t.done) : tasks;
}

/**
 * Tâches à afficher : filtre, puis (si doneLast) terminées en bas, en gardant l'ordre relatif.
 * @param {Task[]} tasks
 * @param {TaskFilter} filter
 * @param {boolean} doneLast
 * @returns {Task[]}
 */
export function getVisibleTasks(tasks, filter, doneLast) {
  const filtered = filter === 'todo' ? tasks.filter((t) => !t.done) : filter === 'done' ? tasks.filter((t) => t.done) : tasks;
  if (!doneLast || filter !== 'all') return filtered;
  return [...filtered.filter((t) => !t.done), ...filtered.filter((t) => t.done)];
}

/**
 * Compteurs de progression.
 * @param {Task[]} tasks
 * @returns {{ done: number, total: number, ratio: number }}
 */
export function getStats(tasks) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}
