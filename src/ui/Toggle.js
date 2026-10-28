// Interrupteur : une case à cocher native présentée comme un interrupteur (role="switch").

import { html } from '../lib/vendor.js';

/**
 * @param {{ checked: boolean, onChange: (checked: boolean) => void, label: string, help?: string, disabled?: boolean }} props
 */
export function Toggle({ checked, onChange, label, help, disabled = false }) {
  return html`
    <label class=${`toggle ${disabled ? 'toggle--disabled' : ''}`.trim()}>
      <input
        class="toggle__input"
        type="checkbox"
        role="switch"
        checked=${checked}
        disabled=${disabled}
        onChange=${(/** @type {Event} */ e) => onChange(/** @type {HTMLInputElement} */ (e.currentTarget).checked)}
      />
      <span class="toggle__track" aria-hidden="true"><span class="toggle__thumb"></span></span>
      <span class="toggle__text">
        <span class="toggle__label">${label}</span>
        ${help && html`<span class="toggle__help">${help}</span>`}
      </span>
    </label>
  `;
}
