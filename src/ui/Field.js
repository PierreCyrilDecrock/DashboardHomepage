// Champ de formulaire : libellé, aide et message d'erreur reliés au contrôle (for, aria-describedby).

import { html, useRef } from '../lib/vendor.js';

let counter = 0;

/**
 * @param {{
 *   label: string, help?: string, error?: string,
 *   children: (control: { id: string, 'aria-describedby': string | undefined, 'aria-invalid': 'true' | undefined }) => any
 * }} props
 * `children` reçoit les attributs à poser sur le contrôle : <input ...${control} />.
 */
export function Field({ label, help, error, children }) {
  const base = useRef(`field-${++counter}`);
  const id = base.current;
  const describedBy = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return html`
    <div class="field">
      <label class="field__label" for=${id}>${label}</label>
      ${children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? 'true' : undefined })}
      ${help && html`<p class="field__help" id=${`${id}-help`}>${help}</p>`}
      ${error && html`<p class="field__error" id=${`${id}-error`} role="alert">${error}</p>`}
    </div>
  `;
}
