// Panneau de réglages du widget Minuteur : libellé, durées prédéfinies, son, notifications.
//
// La permission de notification n'est demandée que par un clic sur « Activer les notifications » :
// jamais à l'ouverture du panneau, ni en activant l'interrupteur.

import { html, useEffect, useState } from '../../lib/vendor.js';
import { getAlarmService } from '../../lib/platform/alarmService.js';
import { Button } from '../../ui/Button.js';
import { Field } from '../../ui/Field.js';
import { Toggle } from '../../ui/Toggle.js';
import { MAX_LABEL_LENGTH, MAX_PRESETS, MAX_PRESET_MINUTES, MIN_PRESET_MINUTES, addPreset, parsePresetMinutes, permissionHelp, permissionLabel, removePreset, updatePreset } from './timerLogic.js';

/**
 * Une durée prédéfinie : on garde le texte tapé tant qu'il est invalide, on n'enregistre que les valeurs valides.
 * @param {{ index: number, value: number, canRemove: boolean, onCommit: (minutes: string) => void, onRemove: () => void }} props
 */
function PresetRow({ index, value, canRemove, onCommit, onRemove }) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState('');
  // Une valeur modifiée de l'extérieur (réinitialisation) remplace le texte, sauf si c'est celle qu'on vient de taper.
  useEffect(() => {
    if (parsePresetMinutes(text) !== value) setText(String(value));
  }, [value]);

  return html`
    <div class="timer-settings__preset">
      <${Field} label=${`Durée ${index + 1} (minutes)`} error=${error || undefined}>
        ${(/** @type {any} */ control) => html`
          <input
            ...${control}
            class="input"
            type="number"
            inputmode="numeric"
            min=${MIN_PRESET_MINUTES}
            max=${MAX_PRESET_MINUTES}
            step="1"
            value=${text}
            onInput=${(/** @type {Event} */ e) => {
              const next = /** @type {HTMLInputElement} */ (e.currentTarget).value;
              setText(next);
              if (parsePresetMinutes(next) === null) {
                setError(`Entre un nombre entier de minutes, de ${MIN_PRESET_MINUTES} à ${MAX_PRESET_MINUTES}.`);
              } else {
                setError('');
                onCommit(next);
              }
            }}
          />
        `}
      <//>
      <${Button} variant="ghost" icon="x" aria-label=${`Retirer la durée ${index + 1}`} disabled=${!canRemove} onClick=${onRemove} />
    </div>
  `;
}

/**
 * @param {import('../types.js').WidgetSettingsProps<typeof import('./schema.js').defaultSettings>} props
 */
export function TimerSettings({ settings, onChange }) {
  const alarm = getAlarmService();
  const [permission, setPermission] = useState(() => alarm.getPermissionState());

  // L'état peut changer dans les réglages du navigateur : on le relit au retour sur la page.
  useEffect(() => {
    const refresh = () => setPermission(getAlarmService().getPermissionState());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const presets = settings.presetsMinutes;

  const activate = async () => {
    // Clic explicite de l'utilisateur : le seul endroit où la permission est demandée.
    const result = await getAlarmService().requestPermission();
    setPermission(result);
    if (result === 'granted') onChange({ notify: true });
  };

  return html`
    <div class="settings-form">
      <${Field} label="Libellé" help="Affiché au-dessus du temps et dans le titre de l'onglet. Facultatif.">
        ${(/** @type {any} */ control) => html`
          <input
            ...${control}
            class="input"
            type="text"
            maxlength=${MAX_LABEL_LENGTH}
            autocomplete="off"
            value=${settings.label}
            onInput=${(/** @type {Event} */ e) => onChange({ label: /** @type {HTMLInputElement} */ (e.currentTarget).value })}
          />
        `}
      <//>

      <fieldset class="timer-settings__group">
        <legend class="field__label">Durées prédéfinies</legend>
        ${presets.map(
          (minutes, index) => html`<${PresetRow}
            key=${index}
            index=${index}
            value=${minutes}
            canRemove=${presets.length > 1}
            onCommit=${(/** @type {string} */ next) => onChange({ presetsMinutes: updatePreset(presets, index, next) })}
            onRemove=${() => onChange({ presetsMinutes: removePreset(presets, index) })}
          />`,
        )}
        <${Button} variant="secondary" icon="plus" disabled=${presets.length >= MAX_PRESETS} onClick=${() => onChange({ presetsMinutes: addPreset(presets) })}>Ajouter une durée<//>
        <p class="field__help">De 1 à ${MAX_PRESETS} durées, entre ${MIN_PRESET_MINUTES} et ${MAX_PRESET_MINUTES} minutes. Elles ne se changent que lorsque le minuteur est arrêté.</p>
      </fieldset>

      <${Toggle}
        label="Son à la fin"
        help="Trois bips. Le son est préparé quand tu cliques sur « Démarrer » : les navigateurs le bloquent avant."
        checked=${settings.sound}
        onChange=${(/** @type {boolean} */ on) => onChange({ sound: on })}
      />

      <${Toggle}
        label="Notification à la fin"
        help="Un message du système, même si l'onglet est en arrière-plan."
        checked=${settings.notify}
        disabled=${permission === 'unsupported'}
        onChange=${(/** @type {boolean} */ on) => onChange({ notify: on })}
      />
      <div class="timer-settings__permission">
        <p class="timer-settings__status" data-testid="timer-permission" data-state=${permission}>Notifications : <strong>${permissionLabel(permission)}</strong></p>
        <p class="field__help">${permissionHelp(permission)}</p>
        ${permission === 'default' && html`<${Button} variant="primary" onClick=${activate}>Activer les notifications<//>`}
      </div>
    </div>
  `;
}
