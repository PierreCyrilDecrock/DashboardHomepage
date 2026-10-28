// Composant du widget À faire. Il ne connaît que ses props ; toute modification passe par updateData.
//
// SortableJS déplace des nœuds du DOM : à la fin du geste on remet le nœud à sa place d'origine,
// puis on applique reorderTasks par updateData, pour que Preact reste seul maître du DOM.

import { Sortable, html, useCallback, useEffect, useLayoutEffect, useRef, useState } from '../../lib/vendor.js';
import { Icon } from '../../ui/icons.js';
import {
  FILTERS,
  MAX_TEXT_LENGTH,
  addTask,
  clearDone,
  editTask,
  getStats,
  getVisibleTasks,
  moveTask,
  removeTask,
  reorderTasks,
  restoreTask,
  toggleTask,
} from './todoLogic.js';

/** Durée pendant laquelle « Annuler » reste proposé après une suppression. */
export const UNDO_DELAY_MS = 6000;

const FILTER_LABELS = { all: 'Toutes', todo: 'À faire', done: 'Terminées' };
const EMPTY_FILTER_MESSAGES = { all: '', todo: 'Aucune tâche à faire.', done: 'Aucune tâche terminée.' };

/**
 * Champ de modification d'une tâche : Entrée valide, Échap annule, la perte de focus valide.
 * @param {{ text: string, onCommit: (text: string) => void, onCancel: () => void }} props
 */
function TaskEditor({ text, onCommit, onCancel }) {
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const finished = useRef(false);

  // Focus dès l'insertion dans le DOM (avant la peinture) : la première touche tapée n'est pas perdue.
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  /** @param {() => void} action */
  const finish = (action) => {
    if (finished.current) return;
    finished.current = true;
    action();
  };

  return html`<input
    ref=${input}
    class="todo__edit"
    type="text"
    aria-label="Modifier la tâche"
    maxlength=${MAX_TEXT_LENGTH}
    value=${text}
    onKeyDown=${(/** @type {KeyboardEvent} */ event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(() => onCommit(/** @type {HTMLInputElement} */ (event.currentTarget).value));
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(onCancel);
      }
    }}
    onBlur=${(/** @type {FocusEvent} */ event) => finish(() => onCommit(/** @type {HTMLInputElement} */ (event.currentTarget).value))}
  />`;
}

/**
 * @param {import('../types.js').WidgetProps<typeof import('./schema.js').defaultSettings, typeof import('./schema.js').defaultData>} props
 */
export function TodoWidget({ instanceId, settings, data, updateData }) {
  const { showProgress, doneLast } = settings;
  const tasks = /** @type {import('./todoLogic.js').Task[]} */ (data.tasks);

  const [filter, setFilter] = useState(/** @type {import('./todoLogic.js').TaskFilter} */ ('all'));
  const [editingId, setEditingId] = useState(/** @type {string | null} */ (null));
  const [undo, setUndo] = useState(/** @type {{ removed: import('./todoLogic.js').Task, index: number } | null} */ (null));
  const [announcement, setAnnouncement] = useState('');

  const root = useRef(/** @type {HTMLElement | null} */ (null));
  const list = useRef(/** @type {HTMLElement | null} */ (null));
  const addInput = useRef(/** @type {HTMLInputElement | null} */ (null));
  const undoTimer = useRef(/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined));
  /** Sélecteur de l'élément à focaliser dès qu'il existe (quelques rendus au plus : les données arrivent après l'état local). */
  const pendingFocus = useRef(/** @type {string | null} */ (null));
  const focusTries = useRef(0);
  /** Tâche à faire défiler dans la vue dès qu'elle existe. */
  const pendingScroll = useRef(/** @type {string | null} */ (null));
  const scrollTries = useRef(0);

  const visible = getVisibleTasks(tasks, filter, doneLast);
  const stats = getStats(tasks);
  const canReorder = filter === 'all' && editingId === null;

  // Valeurs courantes pour les gestionnaires de SortableJS (créés une seule fois).
  const latest = useRef({ visible, doneLast, updateData });
  latest.current = { visible, doneLast, updateData };

  /** @param {string} message */
  const announce = useCallback((message) => {
    // Un texte identique ne serait pas relu : on alterne une espace insécable en fin de phrase.
    setAnnouncement((previous) => message + (previous.endsWith(' ') ? '' : ' '));
  }, []);

  // Après un rendu : focus et défilement demandés par l'action précédente, dès que la cible existe.
  useLayoutEffect(() => {
    if (pendingFocus.current !== null) {
      const target = /** @type {HTMLElement | null} */ (root.current?.querySelector(pendingFocus.current) ?? null);
      if (target) {
        target.focus();
        pendingFocus.current = null;
      } else if (++focusTries.current >= 3) {
        pendingFocus.current = null;
      }
    }
    if (pendingScroll.current !== null) {
      const row = /** @type {HTMLElement | null} */ (root.current?.querySelector(`[data-task-id="${pendingScroll.current}"]`) ?? null);
      if (row) {
        row.scrollIntoView({ block: 'nearest' });
        pendingScroll.current = null;
      } else if (++scrollTries.current >= 3) {
        pendingScroll.current = null;
      }
    }
  });

  // Nettoyage du minuteur d'annulation.
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  // Réordonnancement à la souris et au toucher.
  const hasList = visible.length > 0;
  useEffect(() => {
    const element = list.current;
    if (!element) return undefined;
    const sortable = Sortable.create(element, {
      handle: '.todo__handle',
      draggable: '.todo__item',
      animation: 120,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 3,
      ghostClass: 'todo__item--ghost',
      chosenClass: 'todo__item--chosen',
      dragClass: 'todo__item--drag',
      disabled: !canReorder,
      onEnd(/** @type {any} */ event) {
        // Preact reste maître du DOM : le nœud déplacé retourne à sa place d'origine.
        const { item, from, oldIndex, newIndex } = event;
        from.removeChild(item);
        from.insertBefore(item, from.children[oldIndex] ?? null);
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
        const { visible: shown, doneLast: last, updateData: update } = latest.current;
        const active = shown[oldIndex];
        const over = shown[newIndex];
        if (!active || !over) return;
        update((d) => ({ ...d, tasks: reorderTasks(d.tasks, active.id, over.id, { doneLast: last }) }));
        focusTries.current = 0;
        pendingFocus.current = `[data-task-id="${active.id}"] .todo__handle`;
      },
    });
    return () => sortable.destroy();
  }, [canReorder, hasList]);

  /** @param {string} id */
  const textOf = (id) => tasks.find((t) => t.id === id)?.text ?? '';

  const add = (/** @type {string} */ text) => {
    const result = addTask(tasks, text, Date.now());
    if (result === null) {
      announce('Écris d\'abord le texte de la tâche.');
      return false;
    }
    const { task } = result;
    updateData((d) => ({ ...d, tasks: [...d.tasks, task] }));
    if (filter === 'done') setFilter('all');
    scrollTries.current = 0;
    pendingScroll.current = task.id;
    announce(`Tâche ajoutée : ${task.text}`);
    return true;
  };

  /** @param {string} id */
  const toggle = (id) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    updateData((d) => ({ ...d, tasks: toggleTask(d.tasks, id, Date.now()) }));
    announce(task.done ? `Tâche rouverte : ${task.text}` : `Tâche terminée : ${task.text}`);
  };

  /** @param {string} id @param {string} text */
  const commitEdit = (id, text) => {
    setEditingId(null);
    focusTries.current = 0;
    pendingFocus.current = `[data-task-id="${id}"] .todo__edit-button`;
    const next = editTask(tasks, id, text);
    if (next === tasks) return;
    updateData((d) => ({ ...d, tasks: editTask(d.tasks, id, text) }));
    announce(`Tâche modifiée : ${next.find((t) => t.id === id)?.text ?? ''}`);
  };

  /** @param {string} id */
  const cancelEdit = (id) => {
    setEditingId(null);
    focusTries.current = 0;
    pendingFocus.current = `[data-task-id="${id}"] .todo__edit-button`;
  };

  /** @param {string} id */
  const remove = (id) => {
    const { removed, index } = removeTask(tasks, id);
    if (removed === null) return;
    updateData((d) => ({ ...d, tasks: removeTask(d.tasks, id).tasks }));
    setUndo({ removed, index });
    focusTries.current = 0;
    pendingFocus.current = '.todo__undo-action';
    announce(`Tâche supprimée : ${removed.text}. Annulation possible pendant ${UNDO_DELAY_MS / 1000} secondes.`);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setUndo(null);
      // Le bouton « Annuler » disparaît : si le focus y était, il revient au champ d'ajout.
      if (root.current?.querySelector('.todo__undo-action') === document.activeElement) addInput.current?.focus();
    }, UNDO_DELAY_MS);
  };

  const undoRemove = () => {
    if (undo === null) return;
    const { removed, index } = undo;
    clearTimeout(undoTimer.current);
    setUndo(null);
    updateData((d) => ({ ...d, tasks: restoreTask(d.tasks, removed, index) }));
    if (filter !== 'all') setFilter('all');
    focusTries.current = 0;
    pendingFocus.current = `[data-task-id="${removed.id}"] .todo__check`;
    scrollTries.current = 0;
    pendingScroll.current = removed.id;
    announce(`Tâche restaurée : ${removed.text}`);
  };

  const clearFinished = () => {
    const count = stats.done;
    updateData((d) => ({ ...d, tasks: clearDone(d.tasks) }));
    focusTries.current = 0;
    // Le bouton disparaît : le focus passe au filtre actif (jamais au champ d'ajout, qui ouvrirait le clavier à l'écran).
    pendingFocus.current = '.todo__filter[aria-pressed="true"]';
    announce(count > 1 ? `${count} tâches terminées supprimées.` : 'Tâche terminée supprimée.');
  };

  /**
   * Déplacement au clavier (Alt + flèche haut / bas sur la poignée).
   * @param {string} id @param {number} delta
   */
  const move = (id, delta) => {
    const next = moveTask(tasks, id, delta, { doneLast });
    focusTries.current = 0;
    pendingFocus.current = `[data-task-id="${id}"] .todo__handle`;
    if (next === tasks) {
      announce(delta < 0 ? 'Déjà en haut de la liste.' : 'Déjà en bas de la liste.');
      return;
    }
    updateData((d) => ({ ...d, tasks: moveTask(d.tasks, id, delta, { doneLast }) }));
    const shown = getVisibleTasks(next, filter, doneLast);
    announce(`${textOf(id)} : position ${shown.findIndex((t) => t.id === id) + 1} sur ${shown.length}`);
  };

  const emptyMessage = tasks.length === 0 ? 'Aucune tâche. Ajoute la première ci-dessous.' : EMPTY_FILTER_MESSAGES[filter];

  return html`
    <div class="todo" ref=${root} data-instance=${instanceId}>
      <div class="todo__summary">
        <span class="todo__count" data-testid="todo-count" aria-label=${`${stats.done} tâches terminées sur ${stats.total}`}>${stats.done} / ${stats.total}</span>
        <div class="todo__filters" role="group" aria-label="Filtrer les tâches">
          ${FILTERS.map(
            (name) => html`<button
              type="button"
              class="todo__filter"
              key=${name}
              aria-pressed=${filter === name ? 'true' : 'false'}
              onClick=${() => setFilter(name)}
            >
              ${FILTER_LABELS[name]}
            </button>`,
          )}
        </div>
      </div>
      ${showProgress &&
      html`<progress class="todo__progress" max=${Math.max(1, stats.total)} value=${stats.done} aria-label="Progression des tâches"></progress>`}

      <div class="todo__scroll">
        ${visible.length === 0 && html`<p class="todo__empty" data-testid="todo-empty">${emptyMessage}</p>`}
        ${visible.length > 0 &&
        html`<ul class="todo__list" ref=${list}>
          ${visible.map((task) => {
            const textId = `todo-${instanceId}-${task.id}`;
            const editing = editingId === task.id;
            return html`<li class=${`todo__item ${task.done ? 'todo__item--done' : ''}`.trim()} key=${task.id} data-task-id=${task.id}>
              <button
                type="button"
                class="todo__icon todo__handle"
                disabled=${!canReorder}
                aria-label=${`Déplacer : ${task.text}`}
                title=${canReorder ? 'Glisser pour déplacer, ou Alt + flèche haut / bas' : 'Réordonnancement indisponible avec un filtre'}
                onKeyDown=${(/** @type {KeyboardEvent} */ event) => {
                  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
                  event.preventDefault();
                  move(task.id, event.key === 'ArrowUp' ? -1 : 1);
                }}
              >
                <${Icon} name="grip-vertical" size=${18} />
              </button>
              <label class="todo__box">
                <input type="checkbox" class="todo__check" checked=${task.done} aria-labelledby=${textId} onChange=${() => toggle(task.id)} />
              </label>
              ${editing
                ? html`<${TaskEditor} text=${task.text} onCommit=${(/** @type {string} */ value) => commitEdit(task.id, value)} onCancel=${() => cancelEdit(task.id)} />`
                : html`<span class="todo__text" id=${textId} onDblClick=${() => setEditingId(task.id)}>${task.text}</span>`}
              ${!editing &&
              html`<button type="button" class="todo__icon todo__edit-button" aria-label=${`Modifier : ${task.text}`} onClick=${() => setEditingId(task.id)}>
                  <${Icon} name="pencil" size=${18} />
                </button>
                <button type="button" class="todo__icon todo__delete" aria-label=${`Supprimer : ${task.text}`} onClick=${() => remove(task.id)}>
                  <${Icon} name="trash-2" size=${18} />
                </button>`}
            </li>`;
          })}
        </ul>`}
        ${stats.done > 0 &&
        html`<button type="button" class="todo__clear" onClick=${clearFinished}>Vider les terminées</button>`}
      </div>

      ${undo !== null &&
      html`<div class="todo__undo">
        <span>Tâche supprimée</span>
        <button type="button" class="todo__undo-action" onClick=${undoRemove}>Annuler</button>
      </div>`}

      <form
        class="todo__add"
        onSubmit=${(/** @type {Event} */ event) => {
          event.preventDefault();
          const input = addInput.current;
          if (input && add(input.value)) input.value = '';
          input?.focus();
        }}
      >
        <input
          ref=${addInput}
          class="todo__add-input"
          type="text"
          aria-label="Nouvelle tâche"
          placeholder="Ajouter une tâche…"
          maxlength=${MAX_TEXT_LENGTH}
          autocomplete="off"
          onKeyDown=${(/** @type {KeyboardEvent} */ event) => {
            if (event.key !== 'Escape') return;
            const input = /** @type {HTMLInputElement} */ (event.currentTarget);
            if (input.value !== '') {
              event.stopPropagation();
              input.value = '';
            }
          }}
        />
        <button type="submit" class="todo__icon todo__add-button" aria-label="Ajouter la tâche">
          <${Icon} name="plus" size=${20} />
        </button>
      </form>

      <p class="visually-hidden" role="status" aria-live="polite" data-testid="todo-live">${announcement}</p>
    </div>
  `;
}
