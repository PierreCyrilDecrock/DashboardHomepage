// Formulaire d'ajout et de modification d'un raccourci, dans un Dialog de src/ui.
//
// Adresse (obligatoire, focus automatique) et titre (facultatif). Entrée valide. Une adresse refusée
// affiche son message dans le texte, relié au champ par aria-describedby (via Field) ; un doublon
// d'adresse prévient sans bloquer.

import { html, useRef, useState } from '../../lib/vendor.js';
import { normalizeUrl } from '../../lib/url.js';
import { Button } from '../../ui/Button.js';
import { Field } from '../../ui/Field.js';
import { Dialog } from '../../ui/Modal.js';
import { MAX_TITLE_LENGTH, getErrorMessage, hasDuplicate } from './shortcutsLogic.js';

let counter = 0;

/**
 * @param {{
 *   mode: 'add' | 'edit',
 *   initial: { url: string, title: string },
 *   links: import('./shortcutsLogic.js').Link[],
 *   editingId?: string,
 *   onSubmit: (input: { url: string, title: string }) => { ok: true } | { ok: false, reason: import('./shortcutsLogic.js').LinkErrorReason },
 *   onClose: () => void,
 * }} props
 */
export function ShortcutForm({ mode, initial, links, editingId, onSubmit, onClose }) {
  const formId = useRef(`shortcut-form-${++counter}`);
  const urlInput = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [url, setUrl] = useState(initial.url);
  const [title, setTitle] = useState(initial.title);
  const [error, setError] = useState('');

  const parsed = normalizeUrl(url);
  const duplicate = parsed.ok && hasDuplicate(links, parsed.url, editingId);

  /** @param {Event} event */
  const submit = (event) => {
    event.preventDefault();
    const result = onSubmit({ url, title });
    if (!result.ok) {
      setError(getErrorMessage(result.reason));
      urlInput.current?.focus();
    }
  };

  return html`
    <${Dialog}
      title=${mode === 'add' ? 'Ajouter un raccourci' : 'Modifier le raccourci'}
      onClose=${onClose}
      footer=${html`
        <${Button} variant="secondary" onClick=${onClose}>Annuler<//>
        <${Button} variant="primary" type="submit" form=${formId.current}>${mode === 'add' ? 'Ajouter' : 'Enregistrer'}<//>
      `}
    >
      <form id=${formId.current} class="settings-form" onSubmit=${submit} noValidate>
        <${Field}
          label="Adresse"
          error=${error || undefined}
          help=${error ? undefined : duplicate ? 'Cette adresse existe déjà dans ce widget. Tu peux quand même l\'ajouter.' : 'Par exemple : github.com ou localhost:3000'}
        >
          ${(/** @type {any} */ control) => html`
            <input
              ...${control}
              ref=${urlInput}
              class="input"
              type="text"
              inputmode="url"
              autocomplete="off"
              autocapitalize="none"
              spellcheck=${false}
              data-autofocus
              value=${url}
              onInput=${(/** @type {Event} */ e) => {
                setUrl(/** @type {HTMLInputElement} */ (e.currentTarget).value);
                setError('');
              }}
            />
          `}
        <//>
        <${Field} label="Titre (facultatif)" help="Sans titre, le nom de domaine est utilisé.">
          ${(/** @type {any} */ control) => html`
            <input
              ...${control}
              class="input"
              type="text"
              autocomplete="off"
              maxlength=${MAX_TITLE_LENGTH}
              value=${title}
              onInput=${(/** @type {Event} */ e) => setTitle(/** @type {HTMLInputElement} */ (e.currentTarget).value)}
            />
          `}
        <//>
      </form>
    <//>
  `;
}
