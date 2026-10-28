// Composant du widget Notes. Il ne connaît que ses props.
//
// Pas de minuterie de sauvegarde ici : chaque frappe appelle updateData (le store est en mémoire),
// et la persistance du cœur regroupe les écritures et les force à la fermeture de l'onglet.

import { html, useCallback, useEffect, useLayoutEffect, useRef, useState } from '../../lib/vendor.js';
import { Icon } from '../../ui/icons.js';
import {
  MAX_CONTENT_LENGTH,
  MAX_TITLE_LENGTH,
  createNote,
  deleteNote,
  deriveTitle,
  formatModified,
  getActiveNote,
  getDisplayTitle,
  nextTabIndex,
  renameNote,
  restoreNote,
  shouldShowCounter,
  updateContent,
} from './notesLogic.js';

/** Durée pendant laquelle « Annuler » reste proposé après une suppression. */
export const UNDO_DELAY_MS = 6000;

/**
 * Champ de renommage : Entrée valide, Échap annule, la perte de focus valide.
 * @param {{ value: string, onCommit: (value: string) => void, onCancel: () => void }} props
 */
function TitleEditor({ value, onCommit, onCancel }) {
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const finished = useRef(false);

  // Focus dès l'insertion dans le DOM : la première touche tapée n'est pas perdue.
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
    class="notes__rename"
    type="text"
    aria-label="Titre de la note"
    maxlength=${MAX_TITLE_LENGTH}
    value=${value}
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
export function NotesWidget({ instanceId, settings, data, updateData }) {
  const notes = /** @type {import('./notesLogic.js').Note[]} */ (data.notes);
  const active = getActiveNote(data);

  const [renamingId, setRenamingId] = useState(/** @type {string | null} */ (null));
  const [undo, setUndo] = useState(/** @type {{ removed: import('./notesLogic.js').Note, index: number } | null} */ (null));
  const [announcement, setAnnouncement] = useState('');

  const root = useRef(/** @type {HTMLElement | null} */ (null));
  const tablist = useRef(/** @type {HTMLElement | null} */ (null));
  const undoTimer = useRef(/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined));
  /** Sélecteur de l'élément à focaliser dès qu'il existe (les données arrivent après l'état local). */
  const pendingFocus = useRef(/** @type {string | null} */ (null));
  const focusTries = useRef(0);

  /** @param {string} selector */
  const focusSoon = (selector) => {
    focusTries.current = 0;
    pendingFocus.current = selector;
  };

  /** @param {string} message */
  const announce = useCallback((message) => {
    // Un texte identique ne serait pas relu : on alterne une espace insécable en fin de phrase.
    setAnnouncement((previous) => message + (previous.endsWith(' ') ? '' : ' '));
  }, []);

  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const target = /** @type {HTMLElement | null} */ (root.current?.querySelector(pendingFocus.current) ?? null);
    if (target) {
      target.focus();
      pendingFocus.current = null;
    } else if (++focusTries.current >= 3) {
      pendingFocus.current = null;
    }
  });

  // L'onglet actif reste visible quand la barre déborde.
  const activeId = active?.id ?? null;
  const activeTitle = active ? getDisplayTitle(active) : '';
  useLayoutEffect(() => {
    const tab = /** @type {HTMLElement | null} */ (tablist.current?.querySelector('[role="tab"][aria-selected="true"]') ?? null);
    tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeId, activeTitle, notes.length]);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  /** @param {string} id */
  const select = (id) => {
    if (id === activeId) return;
    updateData((d) => ({ ...d, activeId: id }));
  };

  const create = () => {
    const { notes: next, activeId: newId } = createNote(notes, Date.now());
    const created = next[next.length - 1];
    updateData((d) => ({ ...d, notes: [...d.notes, created], activeId: newId }));
    focusSoon('.notes__textarea');
    announce('Note créée');
  };

  /** @param {string} value */
  const type = (value) => {
    if (active === null) return;
    const id = active.id;
    // Chaque frappe va directement au store : aucune minuterie ici.
    updateData((d) => ({ ...d, notes: updateContent(d.notes, id, value, Date.now()) }));
  };

  /** @param {string} id @param {string} value */
  const commitRename = (id, value) => {
    setRenamingId(null);
    focusSoon(`[data-note-id="${id}"]`);
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    // Valider sans rien changer ne « fige » pas un titre déduit.
    if (note.title === null && value.trim() === deriveTitle(note.content)) return;
    updateData((d) => ({ ...d, notes: renameNote(d.notes, id, value) }));
  };

  /** @param {string} id */
  const cancelRename = (id) => {
    setRenamingId(null);
    focusSoon(`[data-note-id="${id}"]`);
  };

  const remove = () => {
    if (active === null) return;
    const id = active.id;
    const result = deleteNote(notes, id, id);
    if (result.removed === null) return;
    updateData((d) => {
      const next = deleteNote(d.notes, id, id);
      return { ...d, notes: next.notes, activeId: next.activeId };
    });
    setUndo({ removed: result.removed, index: result.index });
    focusSoon('.notes__undo-action');
    announce(`Note supprimée : ${getDisplayTitle(result.removed)}. Annulation possible pendant ${UNDO_DELAY_MS / 1000} secondes.`);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setUndo(null);
      // Le bouton « Annuler » disparaît : si le focus y était, il passe à l'onglet actif.
      if (root.current?.querySelector('.notes__undo-action') === document.activeElement) {
        /** @type {HTMLElement | null} */ (root.current?.querySelector('[role="tab"][aria-selected="true"]') ?? root.current?.querySelector('.notes__add') ?? null)?.focus();
      }
    }, UNDO_DELAY_MS);
  };

  const undoRemove = () => {
    if (undo === null) return;
    const { removed, index } = undo;
    clearTimeout(undoTimer.current);
    setUndo(null);
    updateData((d) => ({ ...d, notes: restoreNote(d.notes, removed, index), activeId: removed.id }));
    focusSoon(`[data-note-id="${removed.id}"]`);
    announce(`Note restaurée : ${getDisplayTitle(removed)}`);
  };

  /** @param {KeyboardEvent} event @param {number} index */
  const onTabKeyDown = (event, index) => {
    const next = nextTabIndex(event.key, index, notes.length);
    if (next === -1) return;
    event.preventDefault();
    const target = notes[next];
    updateData((d) => ({ ...d, activeId: target.id }));
    focusSoon(`[data-note-id="${target.id}"]`);
  };

  const { fontSize, monospace, spellcheck } = settings;
  const length = active?.content.length ?? 0;

  if (active === null) {
    return html`
      <div class="notes notes--empty" ref=${root} data-instance=${instanceId}>
        <p class="notes__empty-title">Aucune note</p>
        <p class="notes__empty-text">Crée une note pour écrire ici. Plusieurs notes s'organisent en onglets, et tout reste sur cet appareil.</p>
        <button type="button" class="notes__create" onClick=${create}>
          <${Icon} name="plus" size=${18} />
          Créer une note
        </button>
        <p class="visually-hidden" role="status" aria-live="polite" data-testid="notes-live">${announcement}</p>
      </div>
    `;
  }

  const tabId = (/** @type {string} */ id) => `notes-tab-${instanceId}-${id}`;
  const panelId = `notes-panel-${instanceId}`;
  const title = getDisplayTitle(active);

  return html`
    <div class="notes" ref=${root} data-instance=${instanceId}>
      <div class="notes__tabs-row">
        <div class="notes__tablist" role="tablist" aria-label="Notes" ref=${tablist}>
          ${notes.map((note, index) => {
            const selected = note.id === active.id;
            if (renamingId === note.id) {
              return html`<${TitleEditor}
                key=${note.id}
                value=${getDisplayTitle(note)}
                onCommit=${(/** @type {string} */ value) => commitRename(note.id, value)}
                onCancel=${() => cancelRename(note.id)}
              />`;
            }
            return html`<button
              type="button"
              role="tab"
              class="notes__tab"
              key=${note.id}
              id=${tabId(note.id)}
              data-note-id=${note.id}
              aria-selected=${selected ? 'true' : 'false'}
              aria-controls=${panelId}
              tabindex=${selected ? 0 : -1}
              title=${getDisplayTitle(note)}
              onClick=${() => select(note.id)}
              onDblClick=${() => {
                select(note.id);
                setRenamingId(note.id);
              }}
              onKeyDown=${(/** @type {KeyboardEvent} */ event) => onTabKeyDown(event, index)}
            >
              <span class="notes__tab-label">${getDisplayTitle(note)}</span>
            </button>`;
          })}
        </div>
        <button type="button" class="notes__icon notes__add" aria-label="Nouvelle note" title="Nouvelle note" onClick=${create}>
          <${Icon} name="plus" size=${20} />
        </button>
      </div>

      <div class="notes__panel" role="tabpanel" id=${panelId} aria-labelledby=${tabId(active.id)}>
        <textarea
          key=${active.id}
          class=${`notes__textarea notes__textarea--${fontSize} ${monospace ? 'notes__textarea--mono' : ''}`.trim()}
          aria-label=${`Contenu de la note ${title}`}
          placeholder="Écris ici…"
          spellcheck=${spellcheck}
          maxlength=${MAX_CONTENT_LENGTH}
          value=${active.content}
          onInput=${(/** @type {Event} */ event) => type(/** @type {HTMLTextAreaElement} */ (event.currentTarget).value)}
        ></textarea>
      </div>

      ${undo !== null &&
      html`<div class="notes__undo">
        <span>Note supprimée</span>
        <button type="button" class="notes__undo-action" onClick=${undoRemove}>Annuler</button>
      </div>`}

      <div class="notes__footer">
        <span class="notes__meta" data-testid="notes-modified">${formatModified(active.updatedAt)}</span>
        ${shouldShowCounter(length) &&
        html`<span class="notes__counter" data-testid="notes-counter">${length.toLocaleString('fr-FR')} / ${MAX_CONTENT_LENGTH.toLocaleString('fr-FR')}</span>`}
        <span class="notes__actions">
          <button type="button" class="notes__icon notes__rename-button" aria-label="Renommer" title="Renommer la note" onClick=${() => setRenamingId(active.id)}>
            <${Icon} name="pencil" size=${18} />
          </button>
          <button type="button" class="notes__icon notes__delete" aria-label="Supprimer la note" title="Supprimer la note" onClick=${remove}>
            <${Icon} name="trash-2" size=${18} />
          </button>
        </span>
      </div>

      <p class="visually-hidden" role="status" aria-live="polite" data-testid="notes-live">${announcement}</p>
    </div>
  `;
}
