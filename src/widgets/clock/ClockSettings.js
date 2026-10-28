// Panneau de réglages du widget Heure : interrupteurs, prénom et fuseaux secondaires.

import { html, useMemo, useState } from '../../lib/vendor.js';
import { Button } from '../../ui/Button.js';
import { Field } from '../../ui/Field.js';
import { Toggle } from '../../ui/Toggle.js';
import { cityFromTimeZone, getTimeZoneChoices, isValidTimeZone } from './clockLogic.js';
import { MAX_NAME_LENGTH, MAX_SECONDARY_ZONES } from './schema.js';

/**
 * Retrouve le fuseau désigné par un texte saisi : identifiant exact (sans tenir compte de la casse),
 * sinon nom de ville unique (« new york »). Renvoie null si rien ne correspond.
 * @param {string} input
 * @param {string[]} choices
 * @returns {string | null}
 */
export function resolveTimeZone(input, choices) {
  const text = input.trim();
  if (text === '') return null;
  const lower = text.toLowerCase();
  const exact = choices.find((zone) => zone.toLowerCase() === lower);
  if (exact) return exact;
  const byCity = choices.filter((zone) => cityFromTimeZone(zone).toLowerCase() === lower.replaceAll('_', ' '));
  if (byCity.length === 1) return byCity[0];
  return null;
}

let listCounter = 0;

/**
 * @param {import('../types.js').WidgetSettingsProps<typeof import('./schema.js').defaultSettings>} props
 */
export function ClockSettings({ settings, onChange }) {
  const choices = useMemo(() => getTimeZoneChoices(), []);
  const [listId] = useState(() => `clock-zones-${++listCounter}`);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const zones = settings.secondaryZones;
  const full = zones.length >= MAX_SECONDARY_ZONES;

  const addZone = () => {
    if (full) return;
    const timeZone = resolveTimeZone(query, choices);
    if (timeZone === null || !isValidTimeZone(timeZone)) {
      setError(query.trim() === '' ? 'Saisis un fuseau horaire, par exemple « Europe/Paris ».' : `« ${query.trim()} » n'est pas un fuseau horaire valide. Essaie par exemple « America/New_York ».`);
      return;
    }
    if (zones.some((zone) => zone.timeZone === timeZone)) {
      setError(`« ${timeZone} » est déjà dans la liste.`);
      return;
    }
    onChange({ secondaryZones: [...zones, { timeZone, label: '' }] });
    setQuery('');
    setError('');
  };

  /** @param {number} index @param {string} label */
  const rename = (index, label) => onChange({ secondaryZones: zones.map((zone, i) => (i === index ? { ...zone, label } : zone)) });
  /** @param {number} index */
  const remove = (index) => onChange({ secondaryZones: zones.filter((_, i) => i !== index) });

  return html`
    <div class="settings-form">
      <${Toggle} label="Format 12 heures" help="Affiche AM / PM au lieu de 24 heures." checked=${settings.timeFormat === '12h'} onChange=${(/** @type {boolean} */ on) => onChange({ timeFormat: on ? '12h' : '24h' })} />
      <${Toggle} label="Afficher les secondes" checked=${settings.showSeconds} onChange=${(/** @type {boolean} */ on) => onChange({ showSeconds: on })} />
      <${Toggle} label="Afficher la date" checked=${settings.showDate} onChange=${(/** @type {boolean} */ on) => onChange({ showDate: on })} />
      <${Toggle} label="Afficher la salutation" help="« Bonjour » ou « Bonsoir » selon l'heure." checked=${settings.showGreeting} onChange=${(/** @type {boolean} */ on) => onChange({ showGreeting: on })} />
      ${settings.showGreeting &&
      html`<${Field} label="Prénom" help="Facultatif (${MAX_NAME_LENGTH} caractères au plus).">
        ${(/** @type {any} */ control) => html`<input ...${control} class="input" type="text" maxlength=${MAX_NAME_LENGTH} autocomplete="given-name" value=${settings.userName} onInput=${(/** @type {Event} */ e) => onChange({ userName: /** @type {HTMLInputElement} */ (e.currentTarget).value })} />`}
      <//>`}

      <fieldset class="clock-zones">
        <legend class="field__label">Fuseaux horaires secondaires (${zones.length} sur ${MAX_SECONDARY_ZONES})</legend>
        ${zones.length === 0 && html`<p class="field__help">Aucun fuseau pour l'instant. Ils s'affichent sous l'heure quand le widget fait au moins ${3} lignes de haut.</p>`}
        <ul class="clock-zones__list">
          ${zones.map(
            (zone, index) => html`<li class="clock-zones__item" key=${zone.timeZone}>
              <${Field} label=${`Nom pour ${zone.timeZone}`} help=${`Laisse vide pour afficher « ${cityFromTimeZone(zone.timeZone)} ».`}>
                ${(/** @type {any} */ control) => html`<input ...${control} class="input" type="text" maxlength=${MAX_NAME_LENGTH} placeholder=${cityFromTimeZone(zone.timeZone)} value=${zone.label} onInput=${(/** @type {Event} */ e) => rename(index, /** @type {HTMLInputElement} */ (e.currentTarget).value)} />`}
              <//>
              <${Button} variant="ghost" aria-label=${`Retirer ${zone.label.trim() || cityFromTimeZone(zone.timeZone)}`} onClick=${() => remove(index)}>Retirer<//>
            </li>`,
          )}
        </ul>

        <form
          class="clock-zones__add"
          onSubmit=${(/** @type {Event} */ e) => {
            e.preventDefault();
            addZone();
          }}
        >
          <${Field} label="Ajouter un fuseau" help=${full ? `Maximum atteint (${MAX_SECONDARY_ZONES}). Retire un fuseau pour en ajouter un autre.` : 'Commence à taper : « Paris », « New York », « Tokyo »…'} error=${error}>
            ${(/** @type {any} */ control) => html`
              <input
                ...${control}
                class="input"
                type="text"
                list=${listId}
                autocomplete="off"
                disabled=${full}
                value=${query}
                onInput=${(/** @type {Event} */ e) => {
                  setQuery(/** @type {HTMLInputElement} */ (e.currentTarget).value);
                  setError('');
                }}
              />
              <datalist id=${listId}>${choices.map((zone) => html`<option value=${zone} key=${zone}></option>`)}</datalist>
            `}
          <//>
          <${Button} type="submit" variant="secondary" disabled=${full}>Ajouter<//>
        </form>
      </fieldset>
    </div>
  `;
}
